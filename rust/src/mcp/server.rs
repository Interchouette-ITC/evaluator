//! MCP server (`rmcp`) for `evaluator-mcp` (stdio or Streamable HTTP).

#![allow(clippy::unused_async)]

use std::env;
use std::fs;
use std::io::Write;
use std::path::PathBuf;
use std::sync::Arc;

use rmcp::{
    handler::server::wrapper::Parameters,
    model::{CallToolResult, ContentBlock, ServerCapabilities, ServerInfo},
    tool, tool_handler, tool_router,
    transport::stdio,
    ErrorData as McpError, ServerHandler, ServiceExt,
};

use crate::mcp::tool_args::{BatchArgs, EvaluateArgs};
use crate::node_entry::{spawn_batch, spawn_evaluate};

/// MCP server handle - tools spawn the shared Node entry.
#[derive(Clone, Default)]
pub struct EvaluatorMcp;

/// Default HTTP bind address for Streamable MCP.
pub const DEFAULT_HTTP_LISTEN: &str = "0.0.0.0:9790";

fn text_ok(text: impl Into<String>) -> CallToolResult {
    CallToolResult::success(vec![ContentBlock::text(text.into())])
}

fn text_err(err: impl Into<String>) -> CallToolResult {
    CallToolResult::error(vec![ContentBlock::text(err.into())])
}

#[tool_router]
impl EvaluatorMcp {
    #[tool(description = "Evaluate a JS hook on one URL (spawns Node evaluate; one Chromium)")]
    async fn evaluate(
        &self,
        Parameters(EvaluateArgs { url, function }): Parameters<EvaluateArgs>,
    ) -> Result<CallToolResult, McpError> {
        let fn_expr = function.unwrap_or_default();
        Ok(
            match tokio::task::spawn_blocking(move || spawn_evaluate(&url, &fn_expr)).await {
                Ok(Ok(body)) => text_ok(body),
                Ok(Err(err)) => text_err(err.to_string()),
                Err(err) => text_err(err.to_string()),
            },
        )
    }

    #[tool(
        description = "Batch-evaluate pages via one Node process / one browser. Provide urls[] and/or a local CSV path (`Domain` column). Max 50 URLs per call."
    )]
    async fn batch(
        &self,
        Parameters(BatchArgs {
            urls,
            path,
            function,
        }): Parameters<BatchArgs>,
    ) -> Result<CallToolResult, McpError> {
        let fn_expr = function.unwrap_or_default();
        Ok(
            match tokio::task::spawn_blocking(move || run_batch_tool(urls, path, fn_expr)).await {
                Ok(Ok(text)) => text_ok(text),
                Ok(Err(err)) => text_err(err),
                Err(err) => text_err(err.to_string()),
            },
        )
    }

    #[tool(
        description = "List known evaluate function groups from FUNCTIONS_PATH / packaged functions.json (no web server required)"
    )]
    async fn list_functions(&self) -> Result<CallToolResult, McpError> {
        Ok(
            match tokio::task::spawn_blocking(read_functions_catalog).await {
                Ok(Ok(text)) => text_ok(text),
                Ok(Err(err)) => text_err(err),
                Err(err) => text_err(err.to_string()),
            },
        )
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
    let cols: Vec<&str> = header
        .split(',')
        .map(|c| c.trim().trim_matches('"'))
        .collect();
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
                    line.split(',')
                        .next()
                        .map(|c| c.trim().trim_matches('"').to_string())
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
            return fs::read_to_string(&path).map_err(|e| format!("read {}: {e}", path.display()));
        }
    }
    // Fallback: empty catalog message (Nest generates on first /api/functions).
    Ok(r#"{"note":"functions.json not found; start web once or set FUNCTIONS_PATH"}"#.into())
}

/// Serves MCP over stdio until the client disconnects.
pub async fn run() -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let server = EvaluatorMcp;
    let service = server.serve(stdio()).await?;
    service.waiting().await?;
    Ok(())
}

/// Serves MCP over Streamable HTTP until the process is stopped.
pub async fn run_http(addr: &str) -> std::io::Result<()> {
    let config =
        rmcp::transport::streamable_http_server::tower::StreamableHttpServerConfig::default();
    let service = rmcp::transport::streamable_http_server::tower::StreamableHttpService::new(
        || Ok(EvaluatorMcp),
        Arc::new(
            rmcp::transport::streamable_http_server::session::local::LocalSessionManager::default(),
        ),
        config,
    );
    let method_router = axum::routing::any_service(service);
    let app = axum::Router::new()
        .route("/mcp", method_router.clone())
        .route("/mcp/", method_router);
    let listener = tokio::net::TcpListener::bind(addr).await?;
    tracing::info!(%addr, "evaluator-mcp HTTP listening");
    axum::serve(listener, app).await?;
    Ok(())
}

#[tool_handler]
impl ServerHandler for EvaluatorMcp {
    fn get_info(&self) -> ServerInfo {
        ServerInfo::new(ServerCapabilities::builder().enable_tools().build())
            .with_server_info(rmcp::model::Implementation::new(
                "evaluator",
                env!("CARGO_PKG_VERSION"),
            ))
            .with_instructions(
                "MCP tools for evaluator: evaluate one URL, batch up to 50 URLs (urls[] and/or CSV path), list_functions from FUNCTIONS_PATH / functions.json. Spawns the shared Node engine; no web server required.",
            )
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mcp_server_version_matches_crate() {
        let info = EvaluatorMcp.get_info();
        assert_eq!(info.server_info.version, env!("CARGO_PKG_VERSION"));
        assert_eq!(info.server_info.name.as_str(), "evaluator");
    }
}
