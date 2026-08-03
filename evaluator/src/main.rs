use async_process::{Child, ChildStdout, Command, Stdio};
use async_std::fs::File;
use async_std::io::prelude::{BufReadExt, SeekExt};
use async_std::io::{BufReader, ReadExt};
use async_std::stream::StreamExt as AsyncStreamExt;
use clap::Parser;
use csv_async::AsyncReaderBuilder;
use futures::stream::{self, StreamExt as FuturesStreamExt};
use std::collections::HashMap;
use std::io::SeekFrom;
use urlencoding::encode;

#[derive(Parser, Debug)]
#[command(about = "Batch evaluate sites via the evaluator web gateway (or legacy pupet.js)")]
struct Cli {
    /// The path to the CSV file to read (Domain column)
    #[arg(short = 'p', long = "path")]
    path: String,
    /// The function to evaluate
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
    /// Web gateway base URL (HTTP mode)
    #[arg(
        long = "gateway",
        env = "EVALUATOR_URL",
        default_value = "http://127.0.0.1:4000"
    )]
    gateway: String,
    /// Deprecated: spawn local node pupet.js instead of calling the gateway
    #[arg(long = "legacy-pupet", default_value_t = false)]
    legacy_pupet: bool,
}

#[derive(Debug)]
struct Evaluator {
    args: Cli,
}

impl Evaluator {
    fn new(args: Cli) -> Self {
        Self { args }
    }

    async fn set_inputs(&mut self) {
        if self.args.legacy_pupet {
            self.set_inputs_legacy().await;
        } else {
            self.set_inputs_http().await;
        }
    }

    async fn set_inputs_http(&mut self) {
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
        let gateway = self.args.gateway.trim_end_matches('/').to_string();
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

    async fn set_inputs_legacy(&mut self) {
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

#[async_std::main]
async fn main() {
    let args = Cli::parse();
    let file = args.path.clone();
    eprintln!(
        "CSV={} gateway={} legacy={}",
        file, args.gateway, args.legacy_pupet
    );
    Evaluator::new(args).set_inputs().await;
    eprintln!("done {}", file);
}
