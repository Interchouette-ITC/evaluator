use async_process::{Child, Command, Stdio};
use async_std::fs::File;
use async_std::io::prelude::BufReadExt;
use async_std::io::BufReader;
use async_std::stream::StreamExt as AsyncStreamExt;
use clap::{CommandFactory, Parser, Subcommand};
use csv_async::AsyncReaderBuilder;
use futures::stream::{self, StreamExt as FuturesStreamExt};
use std::collections::HashMap;
use std::io::{self, Write};
use urlencoding::encode;

#[derive(Parser, Debug)]
#[command(
    name = "evaluator",
    about = "Evaluate JS hooks on live pages (gateway by default; optional --legacy Puppeteer)",
    after_help = "\
Modes:
  evaluator                         Interactive prompt (gateway)
  evaluator --legacy                Interactive prompt (local Puppeteer)
  evaluator evaluate --url …        One-shot via gateway GET /evaluate → exit
  evaluator --legacy evaluate --url …
                                    One-shot via legacy/evaluate.js
  evaluator batch -p FILE …         CSV batch via gateway (needs :4000 / EVALUATOR_URL)
  evaluator batch -p FILE … --legacy
                                    Same CSV, local Node Puppeteer (no gateway)
  evaluator -p FILE …               Shorthand for batch

Interactive: help for overview; legacy / gateway to switch session mode; quit to leave.
Gateway: --gateway / EVALUATOR_URL (default http://127.0.0.1:4000).",
    subcommand_required = false,
    arg_required_else_help = false
)]
struct Cli {
    /// Web gateway base URL
    #[arg(
        long = "gateway",
        env = "EVALUATOR_URL",
        default_value = "http://127.0.0.1:4000",
        global = true
    )]
    gateway: String,

    /// Use local Node Puppeteer (`legacy/evaluate.js`) instead of the gateway
    #[arg(long = "legacy", default_value_t = false, global = true)]
    legacy: bool,

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
    /// Only print the body when it contains this substring
    #[arg(long = "search", short = 's', default_value_t = String::from(""))]
    search_pattern: String,
}

#[derive(Parser, Debug)]
struct BatchArgs {
    /// Path to the CSV file (`Domain` column, or first column)
    #[arg(short = 'p', long = "path")]
    path: String,
    /// Function to evaluate
    #[arg(short = 'f', long = "function", default_value_t = String::from(""))]
    function: String,
    /// Max concurrent evaluations
    #[arg(short = 'n', long = "nb_threads", default_value_t = 1)]
    nb_threads: u8,
    /// Navigation timeout (legacy script only; 0 → script default)
    #[arg(short = 't', long = "timeout", default_value_t = 0)]
    timeout: u32,
    /// Pattern to search (legacy filters console hits; HTTP mode filters body)
    #[arg(short = 's', long = "search_pattern", default_value_t = String::from(""))]
    search_pattern: String,
}

#[derive(Debug)]
struct BatchRunner {
    gateway: String,
    legacy: bool,
    args: BatchArgs,
}

impl BatchRunner {
    fn new(gateway: String, legacy: bool, args: BatchArgs) -> Self {
        Self {
            gateway,
            legacy,
            args,
        }
    }

    async fn run(&mut self) {
        if self.legacy {
            self.run_legacy().await;
        } else {
            self.run_http().await;
        }
    }

    async fn run_http(&mut self) {
        let file = File::open(&self.args.path).await.expect("open CSV");
        let mut reader = AsyncReaderBuilder::new()
            .delimiter(b',')
            .has_headers(true)
            .create_reader(file);
        let headers = reader.headers().await.expect("CSV headers").clone();
        let col = domain_column_index(headers.iter());
        let mut records = reader.into_records();

        let mut sites = Vec::new();
        while let Some(result) = AsyncStreamExt::next(&mut records).await {
            match result {
                Ok(res) => {
                    if let Some(site) = normalize_site(res.get(col).unwrap_or("")) {
                        sites.push(site);
                    }
                }
                Err(e) => eprintln!("CSV error: {:?}", e),
            }
        }

        let concurrency = self.args.nb_threads.max(1) as usize;
        let gateway = self.gateway.trim_end_matches('/').to_string();
        let function = self.args.function.clone();
        let search = self.args.search_pattern.clone();

        let jobs = stream::iter(sites.into_iter().map(|site| {
            let gateway = gateway.clone();
            let function = function.clone();
            let search = search.clone();
            async move {
                async_std::task::spawn_blocking(move || {
                    evaluate_http(&gateway, &site, &function, &search)
                })
                .await
            }
        }));
        FuturesStreamExt::collect::<Vec<_>>(FuturesStreamExt::buffer_unordered(jobs, concurrency))
            .await;
    }

    async fn run_legacy(&mut self) {
        let file = File::open(&self.args.path).await.unwrap();
        let mut reader = AsyncReaderBuilder::new()
            .delimiter(b',')
            .has_headers(true)
            .create_reader(file);
        let headers = reader.headers().await.expect("CSV headers").clone();
        let col = domain_column_index(headers.iter());
        let mut records = reader.into_records();
        let mut children: HashMap<String, Child> = HashMap::new();
        let mut i = 0u8;
        while let Some(result) = AsyncStreamExt::next(&mut records).await {
            match result {
                Ok(res) => {
                    let site = match normalize_site(res.get(col).unwrap_or("")) {
                        Some(s) => s,
                        None => continue,
                    };
                    children.insert(site.clone(), self.send_command(site).await);
                    i += 1;
                }
                Err(e) => println!("Error {:?}", e),
            }
            if i != self.args.nb_threads {
                continue;
            }
            self.print_results(children).await;
            i = 0;
            children = HashMap::new();
        }
        if !children.is_empty() {
            self.print_results(children).await;
        }
    }

    async fn send_command(&mut self, site: String) -> Child {
        let script = legacy_script_path();
        Command::new("node")
            .arg(&script)
            .arg(&site)
            .arg(&self.args.function)
            .arg(self.args.timeout.to_string())
            .arg(&self.args.search_pattern)
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .spawn()
            .expect("spawn node legacy/evaluate.js (need repo-root npm install + Chromium)")
    }

    async fn print_results(&mut self, mut children: HashMap<String, Child>) {
        for (site, mut child) in children.drain() {
            let mut results = Vec::new();
            if let Some(stdoutin) = child.stdout.as_mut() {
                let mut lines = BufReader::new(stdoutin).lines();
                while let Some(line) = AsyncStreamExt::next(&mut lines).await {
                    let line = line.unwrap_or_default();
                    if !line.is_empty() {
                        results.push(line);
                    }
                }
            }
            let _ = child.status().await;
            print_site_results(&site, &results);
        }
    }
}

fn print_site_results(site: &str, results: &[String]) {
    println!("site: {}", site);
    if results.is_empty() {
        println!("results: none");
    } else {
        println!("results:");
        for line in results {
            println!("  {}", line);
        }
    }
}

fn domain_column_index<'a>(headers: impl Iterator<Item = &'a str>) -> usize {
    headers
        .enumerate()
        .find(|(_, h)| {
            let h = h.trim().to_ascii_lowercase();
            h == "domain" || h == "url"
        })
        .map(|(i, _)| i)
        .unwrap_or(0)
}

fn normalize_site(raw: &str) -> Option<String> {
    let site = raw.trim().trim_matches('"');
    if site.is_empty() || !site.contains('.') {
        return None;
    }
    if site.starts_with("http://") || site.starts_with("https://") {
        Some(site.to_string())
    } else {
        Some(format!("https://{}", site))
    }
}

fn evaluate_http(gateway: &str, site: &str, function: &str, search: &str) {
    let mut url = format!("{}/evaluate?url={}", gateway, encode(site));
    if !function.is_empty() {
        url.push_str("&function=");
        url.push_str(&encode(function));
    }
    eprintln!("GET {}", url);
    match ureq::get(&url).call() {
        Ok(resp) => match resp.into_string() {
            Ok(body) => {
                if !search.is_empty() && !body.contains(search) {
                    eprintln!("site: {} (no search_pattern match)", site);
                    return;
                }
                println!("site: {}", site);
                println!("{}", body);
            }
            Err(e) => eprintln!("site: {} read error: {:?}", site, e),
        },
        Err(e) => eprintln!("site: {} error: {:?}", site, e),
    }
}

fn legacy_script_path() -> String {
    format!("{}/legacy/evaluate.js", env!("CARGO_MANIFEST_DIR"))
}

async fn evaluate_legacy_one(site: &str, function: &str, timeout: u32, search: &str) {
    let script = legacy_script_path();
    let mut child = Command::new("node")
        .arg(&script)
        .arg(site)
        .arg(function)
        .arg(timeout.to_string())
        .arg(search)
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .expect("spawn node legacy/evaluate.js (need repo-root npm install + Chromium)");
    let mut results = Vec::new();
    if let Some(stdoutin) = child.stdout.as_mut() {
        let mut lines = BufReader::new(stdoutin).lines();
        while let Some(line) = AsyncStreamExt::next(&mut lines).await {
            let line = line.unwrap_or_default();
            if !line.is_empty() {
                results.push(line);
            }
        }
    }
    let _ = child.status().await;
    print_site_results(site, &results);
}

/// Insert `batch` when legacy flat `-p`/`--path` is used without a subcommand.
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

async fn run_command(gateway: &str, legacy: bool, command: Commands) {
    match command {
        Commands::Evaluate(args) => {
            let site = normalize_site(&args.url).unwrap_or_else(|| args.url.clone());
            if legacy {
                evaluate_legacy_one(&site, &args.function, 0, &args.search_pattern).await;
            } else {
                let gateway = gateway.trim_end_matches('/').to_string();
                async_std::task::spawn_blocking({
                    let function = args.function.clone();
                    let search = args.search_pattern.clone();
                    move || evaluate_http(&gateway, &site, &function, &search)
                })
                .await;
            }
        }
        Commands::Batch(args) => {
            let path = args.path.clone();
            BatchRunner::new(gateway.to_string(), legacy, args)
                .run()
                .await;
            eprintln!("done {}", path);
        }
    }
}

fn print_modes_help(gateway: &str, session_legacy: bool) {
    let mode = if session_legacy {
        "LEGACY (local Puppeteer)"
    } else {
        "gateway"
    };
    eprintln!(
        "\
evaluator — modes (this shell: {mode})

  Default path = HTTP gateway  ({gateway})
  Needs a running stack on that URL (make docker-run, or local :4000).
  Engine there: Playwright (default) or Puppeteer (USE_PUPPETEER=1).

  --legacy / session legacy = local Node script evaluator/legacy/evaluate.js
  No gateway. Needs npm ci at repo root + Chromium
  (PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium).

Start:
  evaluator                 interactive gateway
  evaluator --legacy        interactive legacy

Session switches (interactive only):
  legacy | legacy on        switch this shell to legacy
  gateway | legacy off      switch this shell to gateway

Commands:
  evaluate --url URL [--fn F] [--search S]
      One URL. Uses session/global --legacy when set.

  batch -p CSV [-f F] [-n N] [-s S] [-t MS]
      CSV with Domain column (or first column).
      Use session legacy, or pass --legacy (global) on the line / argv.
      -t/--timeout only applies with legacy.

  help [evaluate|batch]   This overview, or clap flags for a subcommand
  quit | exit | q         Leave interactive mode

Examples:
  evaluate --url https://www.w3schools.com/jsref/tryit.asp?filename=tryjsref_eval --fn window.eval
  batch -p archive/test.csv -f window.eval -n 1
  --legacy batch -p archive/test.csv -f window.eval -n 1

Tips:
  • Global --gateway / EVALUATOR_URL overrides the default URL.
  • Shorthand: leading -p without `batch` is treated as batch."
    );
}

fn print_interactive_banner(gateway: &str, legacy: bool) {
    let mut stdout = io::stdout();
    if legacy {
        let _ = writeln!(
            stdout,
            "evaluator interactive — LEGACY mode (local Puppeteer, no gateway)\n  tip: help | evaluate / batch use legacy | `gateway` to switch | quit"
        );
    } else {
        let _ = writeln!(
            stdout,
            "evaluator interactive — gateway mode\n  gateway: {gateway}\n  tip: help | evaluate / batch | `legacy` to switch | quit"
        );
    }
    let _ = stdout.flush();
}

async fn run_interactive(gateway: String, mut session_legacy: bool) {
    let mut stdout = io::stdout();
    print_interactive_banner(&gateway, session_legacy);

    loop {
        let prompt = if session_legacy {
            "evaluator[legacy]> "
        } else {
            "evaluator> "
        };
        let _ = write!(stdout, "{prompt}");
        let _ = stdout.flush();
        let mut line = String::new();
        let n = match io::stdin().read_line(&mut line) {
            Ok(n) => n,
            Err(e) => {
                eprintln!("stdin error: {e}");
                break;
            }
        };
        if n == 0 {
            let _ = writeln!(stdout);
            break;
        }
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        let lower = trimmed.to_ascii_lowercase();
        if matches!(lower.as_str(), "quit" | "exit" | "q") {
            break;
        }
        if matches!(lower.as_str(), "legacy" | "legacy on") {
            session_legacy = true;
            print_interactive_banner(&gateway, true);
            continue;
        }
        if matches!(lower.as_str(), "gateway" | "legacy off") {
            session_legacy = false;
            print_interactive_banner(&gateway, false);
            continue;
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
                    print_modes_help(&gateway, session_legacy);
                }
                None => print_modes_help(&gateway, session_legacy),
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
                Some(command) => {
                    let line_sets_gateway = argv
                        .iter()
                        .any(|s| s == "--gateway" || s.starts_with("--gateway="));
                    let gw = if line_sets_gateway {
                        parsed.gateway
                    } else {
                        gateway.clone()
                    };
                    let line_legacy = parsed.legacy;
                    let use_legacy = session_legacy || line_legacy;
                    run_command(&gw, use_legacy, command).await;
                }
                None => {
                    eprintln!(
                        "enter evaluate / batch, help, legacy, gateway, or quit"
                    );
                }
            },
            Err(err) => {
                eprint!("{err}");
            }
        }
    }
}

#[async_std::main]
async fn main() {
    let cli = Cli::parse_from(argv_with_batch_compat());
    match cli.command {
        Some(command) => {
            run_command(&cli.gateway, cli.legacy, command).await;
        }
        None => run_interactive(cli.gateway, cli.legacy).await,
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
    fn legacy_dash_p_routes_to_batch() {
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
    fn global_legacy_flag() {
        let cli = Cli::try_parse_from(["evaluator", "--legacy"]).expect("parse");
        assert!(cli.legacy);
        assert!(cli.command.is_none());
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
