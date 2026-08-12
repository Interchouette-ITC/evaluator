//! JSON-schema parameter structs for rmcp `Parameters<T>` tool handlers.

use schemars::JsonSchema;
use serde::Deserialize;

#[derive(Debug, Deserialize, JsonSchema)]
pub struct EvaluateArgs {
    pub url: String,
    #[serde(default)]
    pub function: Option<String>,
}

#[derive(Debug, Default, Deserialize, JsonSchema)]
pub struct BatchArgs {
    #[serde(default)]
    pub urls: Option<Vec<String>>,
    #[serde(default)]
    pub path: Option<String>,
    #[serde(default)]
    pub function: Option<String>,
}
