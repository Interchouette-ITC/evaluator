//! `evaluator` — Rust CLI that spawns the shared Node entry (`evaluate` | `batch`).

use clap::{CommandFactory, Parser, Subcommand};
use evaluator::node_entry::{spawn_batch, spawn_evaluate};
use evaluator::output::{
    hit_filter_from, normalize_site, print_node_json_line, site_from_json_line,
};
use rustyline::error::ReadlineError;
use rustyline::DefaultEditor;
use std::io::{self, Write};
use std::path::Path;

#[derive(Parser, Debug)]
#[command(
    name = "evaluator",
    about = "Evaluate JS hooks on live pages (spawns shared Node engine)",
    after_help = "\
Modes:
  evaluator                         Interactive prompt
  evaluator evaluate --url …        One URL → Node evaluate → exit
  evaluator batch -p FILE …         CSV batch → one Node process / one browser
  evaluator -p FILE …               Shorthand for batch

Needs: npm run build (dist/evaluator/server/server.js) + Chromium
  (PUPPETEER_EXECUTABLE_PATH). Override entry with EVALUATOR_NODE_ENTRY.

Interactive: help for overview; quit to leave.",
    subcommand_required = false,
    arg_required_else_help = false
)]
struct Cli {
    #[command(subcommand)]
    command: Option<Commands>,
}

#[derive(Subcommand, Debug)]
enum Commands {
    /// One-shot evaluate a single URL
    Evaluate(EvaluateArgs),
    /// Batch evaluate domains from a CSV file
    Batch(BatchArgs),
}

#[derive(Parser, Debug)]
struct EvaluateArgs {
    /// Target page URL (http/https)
    #[arg(long = "url", short = 'u')]
    url: String,
    /// Function expression (e.g. window.eval, JSON.stringify)
    #[arg(long = "fn", short = 'f', default_value_t = String::from(""))]
    function: String,
    /// Comma-separated keywords; keep payloads matching any (case-sensitive)
    #[arg(long = "search", short = 's', default_value_t = String::from(""))]
    search_pattern: String,
    /// Keep payloads matching this Rust regex
    #[arg(long = "regex", default_value_t = String::from(""))]
    regex: String,
    /// Path to frontend.txt-style malware rules
    #[arg(long = "rules", default_value_t = String::from(""))]
    rules: String,
    /// Print only a snippet around each match (CHARS of context each side; default 80 if flag alone)
    #[arg(long = "excerpt", num_args = 0..=1, default_missing_value = "80")]
    excerpt: Option<usize>,
}

#[derive(Parser, Debug)]
struct BatchArgs {
    /// Path to the CSV file (`Domain` column, or first column)
    #[arg(short = 'p', long = "path")]
    path: String,
    /// Function to hook (e.g. window.eval, JSON.stringify)
    #[arg(short = 'f', long = "function", default_value_t = String::from(""))]
    function: String,
    /// Reserved (Node batch uses one browser sequentially)
    #[arg(short = 'n', long = "nb_threads", default_value_t = 1)]
    nb_threads: u8,
    /// Comma-separated keywords
    #[arg(long = "search", short = 's', default_value_t = String::from(""))]
    search_pattern: String,
    /// Keep payloads matching this Rust regex
    #[arg(long = "regex", default_value_t = String::from(""))]
    regex: String,
    /// Path to frontend.txt-style malware rules
    #[arg(long = "rules", default_value_t = String::from(""))]
    rules: String,
    /// Print only a snippet around each match
    #[arg(long = "excerpt", num_args = 0..=1, default_missing_value = "80")]
    excerpt: Option<usize>,
}

/// Insert `batch` when flat `-p`/`--path` is used without a subcommand.
fn with_batch_compat(mut args: Vec<String>) -> Vec<String> {
    if args.is_empty() {
        return args;
    }
    let rest = &args[1..];
    let has_subcommand = rest
        .first()
        .map(|s| matches!(s.as_str(), "evaluate" | "batch" | "help"))
        .unwrap_or(false);
    let looks_like_batch = rest.iter().any(|s| {
        s == "-p"
            || s == "--path"
            || s.starts_with("--path=")
            || (s.starts_with("-p") && s.len() > 2 && !s.starts_with("--"))
    });
    if !has_subcommand && looks_like_batch {
        args.insert(1, "batch".to_string());
    }
    args
}

fn argv_with_batch_compat() -> Vec<String> {
    with_batch_compat(std::env::args().collect())
}

fn run_evaluate(args: EvaluateArgs) {
    let site = normalize_site(&args.url).unwrap_or_else(|| args.url.clone());
    let filter = hit_filter_from(&args.search_pattern, &args.regex, &args.rules);
    match spawn_evaluate(&site, &args.function) {
        Ok(body) => print_node_json_line(&site, &body, &filter, args.excerpt),
        Err(e) => eprintln!("site: {site} error: {e:#}"),
    }
}

fn run_batch(args: BatchArgs) {
    let filter = hit_filter_from(&args.search_pattern, &args.regex, &args.rules);
    let path = Path::new(&args.path);
    let excerpt = args.excerpt;
    match spawn_batch(path, &args.function, args.nb_threads.max(1), |line| {
        let site = site_from_json_line(line, "");
        print_node_json_line(&site, line, &filter, excerpt);
    }) {
        Ok(()) => eprintln!("done {}", args.path),
        Err(e) => eprintln!("batch error: {e:#}"),
    }
}

fn run_command(command: Commands) {
    match command {
        Commands::Evaluate(args) => run_evaluate(args),
        Commands::Batch(args) => run_batch(args),
    }
}

fn print_modes_help() {
    eprintln!(
        "\
evaluator — modes

  Spawns the shared Node entry (evaluate | batch). One Chromium per command.
  Needs: npm run build + Chromium (PUPPETEER_EXECUTABLE_PATH).
  Override: EVALUATOR_NODE_ENTRY=/path/to/server.js

Commands:
  evaluate --url URL [--fn F] [-s KWS] [--regex RE] [--rules PATH] [--excerpt [N]]
  batch -p CSV [-f F] [-n N] [-s KWS] [--regex RE] [--rules PATH] [--excerpt [N]]

  help [evaluate|batch]   This overview, or clap flags for a subcommand
  quit | exit | q         Leave interactive mode

Examples:
  evaluate --url http://127.0.0.1:8765/demo1shop.html --fn window.eval
  batch -p archive/test.csv -f window.eval -n 1

Tips:
  • Shorthand: leading -p without `batch` is treated as batch."
    );
}

fn print_interactive_banner() {
    let mut stdout = io::stdout();
    let _ = writeln!(
        stdout,
        "evaluator interactive — Node evaluate/batch\n  tip: help | ↑ history | evaluate / batch | quit"
    );
    let _ = stdout.flush();
}

fn dirs_history_path() -> Option<std::path::PathBuf> {
    let home = std::env::var_os("HOME")?;
    Some(std::path::PathBuf::from(home).join(".evaluator_history"))
}

fn run_interactive() {
    let mut stdout = io::stdout();
    print_interactive_banner();

    let mut rl = match DefaultEditor::new() {
        Ok(ed) => ed,
        Err(e) => {
            eprintln!("readline init failed: {e}");
            return;
        }
    };
    let history_path = dirs_history_path();
    if let Some(ref path) = history_path {
        let _ = rl.load_history(path);
    }

    loop {
        let line = match rl.readline("evaluator> ") {
            Ok(l) => l,
            Err(ReadlineError::Interrupted) => continue,
            Err(ReadlineError::Eof) => {
                let _ = writeln!(stdout);
                break;
            }
            Err(e) => {
                eprintln!("stdin error: {e}");
                break;
            }
        };
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        let _ = rl.add_history_entry(trimmed);
        let lower = trimmed.to_ascii_lowercase();
        if matches!(lower.as_str(), "quit" | "exit" | "q") {
            break;
        }

        let parts: Vec<&str> = trimmed.split_whitespace().collect();
        let head = parts.first().copied().unwrap_or("").to_ascii_lowercase();
        if matches!(head.as_str(), "help" | "--help" | "-h") {
            match parts.get(1).map(|s| s.to_ascii_lowercase()) {
                Some(sub) if sub == "evaluate" || sub == "batch" => {
                    let mut cmd = Cli::command();
                    if let Some(sub_cmd) = cmd.find_subcommand_mut(sub.as_str()) {
                        let _ = sub_cmd.print_long_help();
                        let _ = writeln!(stdout);
                    } else {
                        eprintln!("unknown subcommand for help: {sub}");
                    }
                }
                Some(_) => {
                    eprintln!("usage: help [evaluate|batch]");
                    print_modes_help();
                }
                None => print_modes_help(),
            }
            continue;
        }

        let mut argv = vec!["evaluator".to_string()];
        argv.extend(parts.iter().map(|s| (*s).to_string()));
        if argv.len() > 1 {
            let rest = &argv[1..];
            let has_subcommand = rest
                .first()
                .map(|s| matches!(s.as_str(), "evaluate" | "batch" | "help"))
                .unwrap_or(false);
            let looks_like_batch = rest
                .iter()
                .any(|s| s == "-p" || s == "--path" || s.starts_with("--path="));
            if !has_subcommand && looks_like_batch {
                argv.insert(1, "batch".to_string());
            }
        }

        match Cli::try_parse_from(&argv) {
            Ok(parsed) => match parsed.command {
                Some(command) => run_command(command),
                None => {
                    eprintln!("enter evaluate / batch, help, or quit");
                }
            },
            Err(err) => {
                eprint!("{err}");
            }
        }
    }

    if let Some(ref path) = history_path {
        let _ = rl.save_history(path);
    }
}

fn main() {
    let cli = Cli::parse_from(argv_with_batch_compat());
    match cli.command {
        Some(command) => run_command(command),
        None => run_interactive(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_evaluate() {
        let cli = Cli::try_parse_from([
            "evaluator",
            "evaluate",
            "--url",
            "https://example.com",
            "--fn",
            "window.eval",
        ])
        .expect("parse");
        match cli.command {
            Some(Commands::Evaluate(a)) => {
                assert_eq!(a.url, "https://example.com");
                assert_eq!(a.function, "window.eval");
            }
            _ => panic!("expected evaluate"),
        }
    }

    #[test]
    fn parse_batch() {
        let cli = Cli::try_parse_from(["evaluator", "batch", "-p", "sites.csv", "-n", "2"])
            .expect("parse");
        match cli.command {
            Some(Commands::Batch(a)) => {
                assert_eq!(a.path, "sites.csv");
                assert_eq!(a.nb_threads, 2);
            }
            _ => panic!("expected batch"),
        }
    }

    #[test]
    fn no_subcommand_is_interactive() {
        let cli = Cli::try_parse_from(["evaluator"]).expect("parse");
        assert!(cli.command.is_none());
    }

    #[test]
    fn dash_p_routes_to_batch() {
        let argv = with_batch_compat(
            ["evaluator", "-p", "sites.csv", "-n", "1"]
                .into_iter()
                .map(String::from)
                .collect(),
        );
        assert_eq!(argv[1], "batch");
        let cli = Cli::try_parse_from(&argv).expect("parse");
        match cli.command {
            Some(Commands::Batch(a)) => assert_eq!(a.path, "sites.csv"),
            _ => panic!("expected batch"),
        }
    }

    #[test]
    fn no_legacy_flag() {
        let err = Cli::try_parse_from(["evaluator", "--legacy"]).expect_err("legacy removed");
        let msg = err.to_string();
        assert!(
            msg.contains("unexpected") || msg.contains("legacy") || msg.contains("help"),
            "unexpected clap error: {msg}"
        );
    }

    #[test]
    fn normalize_https() {
        assert_eq!(
            normalize_site("example.com"),
            Some("https://example.com".into())
        );
        assert_eq!(
            normalize_site("https://x.test/a"),
            Some("https://x.test/a".into())
        );
    }
}
