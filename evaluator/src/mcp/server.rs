//! MCP server (`mcpkit`) for `evaluator-mcp` (stdio or Streamable HTTP).

#![allow(clippy::unused_async)]

use crate::node_entry::{spawn_batch, spawn_evaluate};
use mcpkit::prelude::*;
use mcpkit::transport::stdio::StdioTransport;
use mcpkit_axum::McpRouter;
use std::env;
use std::fs;
use std::io::Write;
use std::path::PathBuf;

/// MCP server handle — tools spawn the shared Node entry.
pub struct EvaluatorMcp;

// Keep in sync with Cargo.toml `version`.
#[mcp_server(name = "evaluator", version = "1.0.0")]
impl EvaluatorMcp {
    #[tool(description = "Evaluate a JS hook on one URL (spawns Node evaluate; one Chromium)")]
    async fn evaluate(&self, url: String, function: Option<String>) -> ToolOutput {
        let fn_expr = function.unwrap_or_default();
        match tokio::task::spawn_blocking(move || spawn_evaluate(&url, &fn_expr)).await {
            Ok(Ok(body)) => ToolOutput::text(body),
            Ok(Err(err)) => ToolOutput::error(err.to_string()),
            Err(err) => ToolOutput::error(err.to_string()),
        }
    }

    #[tool(
        description = "Batch-evaluate pages via one Node process / one browser. Provide urls[] and/or a local CSV path (`Domain` column). Max 50 URLs per call."
    )]
    async fn batch(
        &self,
        urls: Option<Vec<String>>,
        path: Option<String>,
        function: Option<String>,
    ) -> ToolOutput {
        let fn_expr = function.unwrap_or_default();
        match tokio::task::spawn_blocking(move || run_batch_tool(urls, path, fn_expr)).await {
            Ok(Ok(text)) => ToolOutput::text(text),
            Ok(Err(err)) => ToolOutput::error(err),
            Err(err) => ToolOutput::error(err.to_string()),
        }
    }

    #[tool(
        description = "List known evaluate function groups from FUNCTIONS_PATH / packaged functions.json (no web server required)"
    )]
    async fn list_functions(&self) -> ToolOutput {
        match tokio::task::spawn_blocking(read_functions_catalog).await {
            Ok(Ok(text)) => ToolOutput::text(text),
            Ok(Err(err)) => ToolOutput::error(err),
            Err(err) => ToolOutput::error(err.to_string()),
        }
    }
}

fn run_batch_tool(
    urls: Option<Vec<String>>,
    path: Option<String>,
    function: String,
) -> Result<String, String> {
    let mut sites: Vec<String> = Vec::new();
    if let Some(p) = path.as_deref().map(str::trim).filter(|s| !s.is_empty()) {
        let text = fs::read_to_string(p).map_err(|e| format!("read CSV {p}: {e}"))?;
        sites.extend(csv_domains(&text));
    }
    if let Some(list) = urls {
        for u in list {
            let t = u.trim();
            if !t.is_empty() {
                sites.push(t.to_string());
            }
        }
    }
    sites.truncate(50);
    if sites.is_empty() {
        return Err("batch: provide urls[] and/or path".into());
    }

    // One Node child / one browser for the whole batch.
    let tmp = env::temp_dir().join(format!("evaluator-mcp-batch-{}.csv", std::process::id()));
    {
        let mut f = fs::File::create(&tmp).map_err(|e| e.to_string())?;
        writeln!(f, "Domain").map_err(|e| e.to_string())?;
        for s in &sites {
            writeln!(f, "{s}").map_err(|e| e.to_string())?;
        }
    }
    let mut collected: Vec<String> = Vec::new();
    let result = spawn_batch(&tmp, &function, 1, |line| {
        collected.push(line.to_string());
    });
    let _ = fs::remove_file(&tmp);
    result.map_err(|e| e.to_string())?;
    Ok(collected.join("\n"))
}

fn csv_domains(text: &str) -> Vec<String> {
    let mut lines = text.lines().filter(|l| !l.trim().is_empty());
    let Some(header) = lines.next() else {
        return Vec::new();
    };
    let cols: Vec<&str> = header.split(',').map(|c| c.trim().trim_matches('"')).collect();
    let col = cols
        .iter()
        .position(|h| {
            let h = h.to_ascii_lowercase();
            h == "domain" || h == "url"
        })
        .unwrap_or(0);
    if cols.len() == 1 && col == 0 {
        // header might be a bare domain; include it
        let h = cols[0];
        if !h.eq_ignore_ascii_case("domain") && !h.eq_ignore_ascii_case("url") {
            return std::iter::once(h.to_string())
                .chain(lines.filter_map(|line| {
                    line.split(',').next().map(|c| c.trim().trim_matches('"').to_string())
                }))
                .filter(|s| !s.is_empty())
                .collect();
        }
    }
    lines
        .filter_map(|line| {
            let parts: Vec<&str> = line.split(',').collect();
            parts
                .get(col)
                .map(|c| c.trim().trim_matches('"').to_string())
                .filter(|s| !s.is_empty())
        })
        .collect()
}

fn functions_candidates() -> Vec<PathBuf> {
    let mut out = Vec::new();
    if let Ok(p) = env::var("FUNCTIONS_PATH") {
        let t = p.trim();
        if !t.is_empty() {
            out.push(PathBuf::from(t));
        }
    }
    out.push(PathBuf::from("/app/db/functions.json"));
    if let Ok(cwd) = env::current_dir() {
        out.push(cwd.join("db/functions.json"));
        out.push(cwd.join("../db/functions.json"));
    }
    out.push(PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../db/functions.json"));
    out
}

fn read_functions_catalog() -> Result<String, String> {
    for path in functions_candidates() {
        if path.is_file() {
            return fs::read_to_string(&path)
                .map_err(|e| format!("read {}: {e}", path.display()));
        }
    }
    // Fallback: empty catalog message (Nest generates on first /api/functions).
    Ok(r#"{"note":"functions.json not found; start web once or set FUNCTIONS_PATH"}"#.into())
}

/// Serves MCP over stdio until the client disconnects.
pub async fn run() -> Result<(), McpError> {
    let transport = StdioTransport::new();
    let server = ServerBuilder::new(EvaluatorMcp)
        .with_tools(EvaluatorMcp)
        .build();
    server.serve(transport).await
}

/// Default HTTP bind address for Streamable MCP.
pub const DEFAULT_HTTP_LISTEN: &str = "0.0.0.0:9790";

/// Serves MCP over Streamable HTTP until the process is stopped.
pub async fn run_http(addr: &str) -> std::io::Result<()> {
    McpRouter::new(EvaluatorMcp).serve(addr).await
}

impl ResourceHandler for EvaluatorMcp {
    async fn list_resources(&self, _ctx: &Context<'_>) -> Result<Vec<Resource>, McpError> {
        Ok(Vec::new())
    }

    async fn read_resource(
        &self,
        uri: &str,
        _ctx: &Context<'_>,
    ) -> Result<Vec<ResourceContents>, McpError> {
        Err(McpError::invalid_params(
            "resources/read",
            format!("unknown resource: {uri}"),
        ))
    }
}

impl PromptHandler for EvaluatorMcp {
    async fn list_prompts(&self, _ctx: &Context<'_>) -> Result<Vec<Prompt>, McpError> {
        Ok(Vec::new())
    }

    async fn get_prompt(
        &self,
        name: &str,
        _args: Option<serde_json::Map<String, serde_json::Value>>,
        _ctx: &Context<'_>,
    ) -> Result<GetPromptResult, McpError> {
        Err(McpError::invalid_params(
            "prompts/get",
            format!("unknown prompt: {name}"),
        ))
    }
}

#[cfg(test)]
mod tests {
    #[test]
    fn mcp_server_version_matches_crate() {
        assert_eq!(
            env!("CARGO_PKG_VERSION"),
            "1.0.0",
            "bump #[mcp_server(version = …)] when changing Cargo.toml version"
        );
    }
}
