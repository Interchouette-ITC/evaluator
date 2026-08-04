use async_process::{Child, ChildStdout, Command, Stdio};
use async_std::fs::File;
use async_std::io::prelude::{BufReadExt, SeekExt};
use async_std::io::{BufReader, ReadExt};
use async_std::stream::StreamExt as AsyncStreamExt;
use clap::{CommandFactory, Parser, Subcommand};
use csv_async::AsyncReaderBuilder;
use futures::stream::{self, StreamExt as FuturesStreamExt};
use std::collections::HashMap;
use std::io::{self, SeekFrom, Write};
use urlencoding::encode;

#[derive(Parser, Debug)]
#[command(
    name = "evaluator",
    about = "Evaluate JS on pages via the evaluator web gateway",
    after_help = "With no subcommand, starts an interactive prompt (type quit or exit to leave).\nLegacy: leading -p/--path without a subcommand is treated as `batch`.",
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
    /// Path to the CSV file (Domain column)
    #[arg(short = 'p', long = "path")]
    path: String,
    /// Function to evaluate
    #[arg(short = 'f', long = "function", default_value_t = String::from(""))]
    function: String,
    /// Max concurrent evaluations
    #[arg(short = 'n', long = "nb_threads", default_value_t = 1)]
    nb_threads: u8,
    /// Navigation timeout (legacy pupet only)
    #[arg(short = 't', long = "timeout", default_value_t = 0)]
    timeout: u32,
    /// Pattern to search (legacy pupet; HTTP mode filters printed body)
    #[arg(short = 's', long = "search_pattern", default_value_t = String::from(""))]
    search_pattern: String,
    /// Deprecated: spawn local node pupet.js instead of calling the gateway
    #[arg(long = "legacy-pupet", default_value_t = false)]
    legacy_pupet: bool,
}

#[derive(Debug)]
struct BatchRunner {
    gateway: String,
    args: BatchArgs,
}

impl BatchRunner {
    fn new(gateway: String, args: BatchArgs) -> Self {
        Self { gateway, args }
    }

    async fn run(&mut self) {
        if self.args.legacy_pupet {
            self.run_legacy().await;
        } else {
            self.run_http().await;
        }
    }

    async fn run_http(&mut self) {
        let mut file = File::open(&self.args.path).await.expect("open CSV");
        let pos: u64 = {
            let mut reader = BufReader::new(file.by_ref());
            reader.read_until(b'\n', &mut Vec::new()).await.unwrap() as u64
        };
        let _ = file.seek(SeekFrom::Start(pos)).await;
        let reader = AsyncReaderBuilder::new()
            .delimiter(b',')
            .has_headers(true)
            .create_reader(file);
        let mut records = reader.into_records();

        let mut sites = Vec::new();
        while let Some(result) = AsyncStreamExt::next(&mut records).await {
            match result {
                Ok(res) => {
                    if let Some(site) = normalize_site(res.get(0).unwrap_or("")) {
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
        eprintln!("warning: --legacy-pupet is deprecated; prefer HTTP mode against EVALUATOR_URL");
        let mut file = File::open(&self.args.path).await.unwrap();
        let pos: u64 = {
            let mut reader = BufReader::new(file.by_ref());
            reader.read_until(b'\n', &mut Vec::new()).await.unwrap() as u64
        };
        let _ = file.seek(SeekFrom::Start(pos)).await;
        let reader = AsyncReaderBuilder::new()
            .delimiter(b',')
            .has_headers(true)
            .create_reader(file);
        let mut records = reader.into_records();
        let mut children: HashMap<String, Child> = HashMap::new();
        let mut i = 0u8;
        while let Some(result) = AsyncStreamExt::next(&mut records).await {
            match result {
                Ok(res) => {
                    let site = match normalize_site(res.get(0).unwrap_or("")) {
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
        eprintln!("legacy pupet: {}", &site);
        Command::new("node")
            .arg("pupet.js")
            .arg(site)
            .arg(&self.args.function)
            .arg(self.args.timeout.to_string())
            .arg(&self.args.search_pattern)
            .stdout(Stdio::piped())
            .spawn()
            .expect("spawn node pupet.js (run from evaluator/ with Node+Puppeteer)")
    }

    async fn print_results(&mut self, mut children: HashMap<String, Child>) {
        for (site, child) in children.iter_mut() {
            if let Some::<&mut ChildStdout>(stdoutin) = child.stdout.as_mut() {
                let mut lines = BufReader::new(stdoutin).lines();
                if let Some(line) = AsyncStreamExt::next(&mut lines).await {
                    let line = line.unwrap();
                    if !line.is_empty() {
                        println!("site: {}", site);
                        println!("{:?}", &line);
                    }
                };
                while let Some(line) = AsyncStreamExt::next(&mut lines).await {
                    println!("{:?}", line.unwrap());
                }
            };
        }
    }
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

async fn run_command(gateway: &str, command: Commands) {
    match command {
        Commands::Evaluate(args) => {
            let gateway = gateway.trim_end_matches('/');
            let site = normalize_site(&args.url).unwrap_or_else(|| args.url.clone());
            async_std::task::spawn_blocking({
                let gateway = gateway.to_string();
                let function = args.function.clone();
                let search = args.search_pattern.clone();
                move || evaluate_http(&gateway, &site, &function, &search)
            })
            .await;
        }
        Commands::Batch(args) => {
            eprintln!(
                "CSV={} gateway={} legacy={}",
                args.path, gateway, args.legacy_pupet
            );
            let path = args.path.clone();
            BatchRunner::new(gateway.to_string(), args).run().await;
            eprintln!("done {}", path);
        }
    }
}

async fn run_interactive(gateway: String) {
    let mut stdout = io::stdout();
    let _ = writeln!(
        stdout,
        "evaluator interactive mode — enter a subcommand (evaluate, batch); quit or exit to leave"
    );
    let _ = stdout.flush();

    loop {
        let _ = write!(stdout, "evaluator> ");
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
        if matches!(trimmed.to_ascii_lowercase().as_str(), "quit" | "exit" | "q") {
            break;
        }
        if matches!(trimmed, "help" | "--help" | "-h") {
            let _ = Cli::command().print_help();
            let _ = writeln!(stdout);
            continue;
        }

        let mut argv = vec!["evaluator".to_string()];
        argv.extend(trimmed.split_whitespace().map(str::to_string));
        // Interactive lines may also use legacy -p without `batch`
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
                    let line_sets_gateway = argv.iter().any(|s| {
                        s == "--gateway" || s.starts_with("--gateway=")
                    });
                    let gw = if line_sets_gateway {
                        parsed.gateway
                    } else {
                        gateway.clone()
                    };
                    run_command(&gw, command).await;
                }
                None => {
                    eprintln!("enter a subcommand (e.g. evaluate --url https://example.com --fn window.eval), or quit");
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
        Some(command) => run_command(&cli.gateway, command).await,
        None => run_interactive(cli.gateway).await,
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
