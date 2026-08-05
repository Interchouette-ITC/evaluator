//! Shared library for the evaluator CLI and MCP surfaces.

pub mod filter;

#[cfg(feature = "cli")]
pub mod node_entry;

#[cfg(feature = "cli")]
pub mod output;

#[cfg(feature = "mcp")]
pub mod mcp;

pub use filter::{extract_gateway_payloads, HitFilter};
