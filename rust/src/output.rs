//! Human-readable evaluate/batch printing (filters applied in Rust).

use crate::filter::{extract_gateway_payloads, HitFilter};

/// Normalize a CSV / CLI site string to an http(s) URL.
pub fn normalize_site(raw: &str) -> Option<String> {
    let site = raw.trim().trim_matches('"');
    if site.is_empty() {
        return None;
    }
    if site.starts_with("http://") || site.starts_with("https://") {
        return Some(site.to_string());
    }
    if site.contains('.') || site.starts_with("localhost") || site.starts_with("127.") {
        return Some(format!("https://{site}"));
    }
    None
}

pub fn hit_filter_from(search: &str, regex: &str, rules: &str) -> HitFilter {
    let regex = if regex.trim().is_empty() {
        None
    } else {
        Some(regex.trim())
    };
    let rules = if rules.trim().is_empty() {
        None
    } else {
        Some(rules.trim())
    };
    HitFilter::try_new(search, regex, rules).unwrap_or_else(|e| {
        eprintln!("filter error: {e}");
        HitFilter::try_new("", None, None).expect("empty filter")
    })
}

pub fn print_site_results(
    site: &str,
    results: &[String],
    filter: &HitFilter,
    excerpt: Option<usize>,
) {
    println!("site: {site}");
    let kept: Vec<(Vec<String>, &String)> = results
        .iter()
        .filter_map(|line| filter.match_labels(line).map(|labels| (labels, line)))
        .collect();
    if kept.is_empty() {
        println!("results: none");
    } else if filter.is_active() {
        for (_labels, line) in kept {
            let hits = filter.match_hits(line);
            if let Some(radius) = excerpt {
                for (label, start, end) in hits {
                    println!("match: {label}");
                    println!("  {}", filter.excerpt_span(line, start, end, radius));
                }
            } else {
                for (label, _, _) in &hits {
                    println!("match: {label}");
                }
                println!("  {line}");
            }
        }
    } else {
        println!("results:");
        for (_, line) in kept {
            let shown = match excerpt {
                Some(radius) => truncate_head(line, radius.saturating_mul(2).max(40)),
                None => line.clone(),
            };
            println!("  {shown}");
        }
    }
    println!();
}

fn truncate_head(s: &str, max: usize) -> String {
    let mut chars = s.chars();
    let head: String = chars.by_ref().take(max).collect();
    if chars.next().is_some() {
        format!("{head}…")
    } else {
        head
    }
}

/// Print one Node evaluate/batch JSON line for a site.
pub fn print_node_json_line(site: &str, body: &str, filter: &HitFilter, excerpt: Option<usize>) {
    let payloads = extract_gateway_payloads(body);
    if payloads.is_empty() {
        if filter.is_active() {
            print_site_results(site, &[body.to_string()], filter, excerpt);
        } else {
            println!("site: {site}");
            println!("{body}");
            println!();
        }
    } else {
        print_site_results(site, &payloads, filter, excerpt);
    }
}

/// Prefer `url` from JSON; fall back to `fallback`.
pub fn site_from_json_line(line: &str, fallback: &str) -> String {
    if let Some(rel) = line.find("\"url\"") {
        let after = &line[rel + 5..];
        if let Some(q0) = after.find('"') {
            let rest = &after[q0 + 1..];
            if let Some(q1) = rest.find('"') {
                return rest[..q1].to_string();
            }
        }
    }
    fallback.to_string()
}
