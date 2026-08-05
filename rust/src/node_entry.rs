//! Locate and spawn the shared Node entry (`serve` | `evaluate` | `batch`).

use anyhow::{bail, Context, Result};
use std::env;
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

/// Resolve `dist/evaluator/server/server.js` (or `EVALUATOR_NODE_ENTRY`).
pub fn resolve_node_entry() -> Result<PathBuf> {
    if let Ok(p) = env::var("EVALUATOR_NODE_ENTRY") {
        let path = PathBuf::from(p);
        if path.is_file() {
            return Ok(path);
        }
        bail!(
            "EVALUATOR_NODE_ENTRY is set but not a file: {}",
            path.display()
        );
    }

    let mut candidates: Vec<PathBuf> = Vec::new();
    candidates.push(PathBuf::from("/app/dist/evaluator/server/server.js"));
    candidates.push(
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../dist/evaluator/server/server.js"),
    );
    if let Ok(cwd) = env::current_dir() {
        candidates.push(cwd.join("dist/evaluator/server/server.js"));
        // When cwd is evaluator/, walk up once.
        candidates.push(cwd.join("../dist/evaluator/server/server.js"));
    }

    for c in &candidates {
        if c.is_file() {
            return Ok(c.canonicalize().unwrap_or_else(|_| c.clone()));
        }
    }

    bail!(
        "Node entry not found (set EVALUATOR_NODE_ENTRY or run npm run build). Tried: {}",
        candidates
            .iter()
            .map(|p| p.display().to_string())
            .collect::<Vec<_>>()
            .join(", ")
    )
}

fn node_bin() -> String {
    env::var("NODE").unwrap_or_else(|_| "node".to_string())
}

/// Spawn Node `evaluate --url … [--fn …]`; return stdout (stderr inherited).
pub fn spawn_evaluate(url: &str, function: &str) -> Result<String> {
    let entry = resolve_node_entry()?;
    let mut cmd = Command::new(node_bin());
    cmd.arg(&entry)
        .arg("evaluate")
        .arg("--url")
        .arg(url)
        .stdout(Stdio::piped())
        .stderr(Stdio::inherit());
    if !function.is_empty() {
        cmd.arg("--fn").arg(function);
    }
    let out = cmd
        .output()
        .with_context(|| format!("spawn node {} evaluate", entry.display()))?;
    if !out.status.success() {
        let code = out.status.code().unwrap_or(-1);
        bail!("node evaluate exited {code}");
    }
    let raw = String::from_utf8_lossy(&out.stdout);
    if let Some(line) = raw.lines().rev().find(|l| l.trim().starts_with('{')) {
        return Ok(line.trim().to_string());
    }
    Ok(raw.into_owned())
}

/// Spawn Node `batch -p … [--fn …] [-n …]` once; invoke `on_line` per stdout line.
pub fn spawn_batch<F>(path: &Path, function: &str, concurrency: u8, mut on_line: F) -> Result<()>
where
    F: FnMut(&str),
{
    let entry = resolve_node_entry()?;
    let mut cmd = Command::new(node_bin());
    cmd.arg(&entry)
        .arg("batch")
        .arg("-p")
        .arg(path)
        .arg("-n")
        .arg(concurrency.to_string())
        .stdout(Stdio::piped())
        .stderr(Stdio::inherit());
    if !function.is_empty() {
        cmd.arg("--fn").arg(function);
    }
    let mut child = cmd
        .spawn()
        .with_context(|| format!("spawn node {} batch", entry.display()))?;
    let stdout = child
        .stdout
        .take()
        .context("node batch missing stdout pipe")?;
    for line in BufReader::new(stdout).lines() {
        let line = line.context("read node batch stdout")?;
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        // Node diagnostics go to stderr; only JSON result lines belong on stdout.
        if !trimmed.starts_with('{') {
            eprintln!("{line}");
            continue;
        }
        on_line(trimmed);
    }
    let status = child.wait().context("wait node batch")?;
    if !status.success() {
        bail!("node batch exited {}", status.code().unwrap_or(-1));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolve_returns_ok_or_clear_err() {
        if env::var_os("EVALUATOR_NODE_ENTRY").is_some() {
            return;
        }
        let _ = resolve_node_entry();
    }
}
