//! `evaluator-mcp` — MCP server (stdio by default, optional Streamable HTTP).
//!
//! ```bash
//! evaluator-mcp
//! evaluator-mcp --http
//! evaluator-mcp --http --listen 0.0.0.0:9790
//! EVALUATOR_MCP_HTTP=1 evaluator-mcp
//! ```

use anyhow::Result;
use clap::Parser;
use evaluator::mcp::server::{run, run_http, DEFAULT_HTTP_LISTEN};

#[derive(Debug, Parser)]
#[command(
    name = "evaluator-mcp",
    about = "Evaluator MCP server (stdio or Streamable HTTP)",
    version
)]
struct Cli {
    /// Serve Streamable HTTP instead of stdio (also: `EVALUATOR_MCP_HTTP=1`).
    #[arg(long, env = "EVALUATOR_MCP_HTTP")]
    http: bool,

    /// HTTP bind address when `--http` is set (also: `EVALUATOR_MCP_ADDR`).
    #[arg(long, env = "EVALUATOR_MCP_ADDR", default_value = DEFAULT_HTTP_LISTEN)]
    listen: String,
}

fn init_logging() {
    // Keep stdio MCP quiet: clients surface stderr as errors.
    let filter = tracing_subscriber::EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("warn"));
    tracing_subscriber::fmt()
        .with_env_filter(filter)
        .with_ansi(false)
        .with_writer(std::io::stderr)
        .init();
}

#[tokio::main]
async fn main() -> Result<()> {
    init_logging();
    let cli = Cli::parse();

    if cli.http {
        tracing::info!(addr = %cli.listen, "evaluator-mcp starting (HTTP)");
        run_http(&cli.listen)
            .await
            .map_err(|err| anyhow::anyhow!("{err}"))?;
    } else {
        tracing::info!("evaluator-mcp starting (stdio)");
        run().await.map_err(|err| anyhow::anyhow!("{err}"))?;
    }
    Ok(())
}
