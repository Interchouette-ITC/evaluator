//! Filter hooked-function payloads by keywords, a regex, or malware-scanner rules.

use regex::Regex;
use std::fs;
use std::path::Path;

/// One named rule from a `frontend.txt`-style file.
#[derive(Clone, Debug)]
struct Rule {
    name: String,
    literals: Vec<String>,
    regexes: Vec<Regex>,
}

/// Combined payload filter for evaluate/batch output.
#[derive(Clone, Debug)]
pub struct HitFilter {
    keywords: Vec<String>,
    regex: Option<Regex>,
    rules: Vec<Rule>,
}

impl HitFilter {
    /// Build from CLI args. Empty search + no regex + no rules path → inactive filter.
    pub fn try_new(
        search: &str,
        regex: Option<&str>,
        rules_path: Option<&str>,
    ) -> Result<Self, String> {
        let keywords: Vec<String> = search
            .split(',')
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .collect();

        let regex = match regex.map(str::trim).filter(|s| !s.is_empty()) {
            Some(pat) => Some(Regex::new(pat).map_err(|e| format!("invalid --regex: {e}"))?),
            None => None,
        };

        let rules = match rules_path.map(str::trim).filter(|s| !s.is_empty()) {
            Some(path) => load_rules_file(Path::new(path))?,
            None => Vec::new(),
        };

        Ok(Self {
            keywords,
            regex,
            rules,
        })
    }

    /// True when any keyword, --regex, or --rules is configured.
    pub fn is_active(&self) -> bool {
        !self.keywords.is_empty() || self.regex.is_some() || !self.rules.is_empty()
    }

    /// Keep payload? `Some(labels)` to print (labels empty when filter inactive);
    /// `None` when active and nothing matched.
    pub fn match_labels(&self, payload: &str) -> Option<Vec<String>> {
        let hits = self.match_hits(payload);
        if !self.is_active() {
            return Some(Vec::new());
        }
        if hits.is_empty() {
            None
        } else {
            Some(hits.into_iter().map(|(label, _, _)| label).collect())
        }
    }

    /// Each hit: (label, byte start, byte end) of the matched needle/span.
    pub fn match_hits(&self, payload: &str) -> Vec<(String, usize, usize)> {
        if !self.is_active() {
            return Vec::new();
        }
        let mut hits = Vec::new();
        for kw in &self.keywords {
            if let Some(i) = payload.find(kw.as_str()) {
                hits.push((format!("keyword:{kw}"), i, i + kw.len()));
            }
        }
        if let Some(re) = &self.regex {
            if let Some(m) = re.find(payload) {
                hits.push(("regex".to_string(), m.start(), m.end()));
            }
        }
        for rule in &self.rules {
            let mut rule_hit: Option<(usize, usize)> = None;
            for lit in &rule.literals {
                if let Some(i) = payload.find(lit.as_str()) {
                    let span = (i, i + lit.len());
                    if rule_hit.is_none_or(|r| span.0 < r.0) {
                        rule_hit = Some(span);
                    }
                }
            }
            for re in &rule.regexes {
                if let Some(m) = re.find(payload) {
                    let span = (m.start(), m.end());
                    if rule_hit.is_none_or(|r| span.0 < r.0) {
                        rule_hit = Some(span);
                    }
                }
            }
            if let Some((s, e)) = rule_hit {
                hits.push((rule.name.clone(), s, e));
            }
        }
        hits
    }

    /// Snippet around an explicit byte span (`…` when truncated).
    pub fn excerpt_span(&self, payload: &str, start: usize, end: usize, radius: usize) -> String {
        let radius = radius.max(16);
        let from = floor_char_boundary(payload, start.saturating_sub(radius));
        let to = ceil_char_boundary(payload, (end + radius).min(payload.len()));
        let mut out = String::new();
        if from > 0 {
            out.push('…');
        }
        out.push_str(&payload[from..to]);
        if to < payload.len() {
            out.push('…');
        }
        out
    }
}

fn floor_char_boundary(s: &str, mut i: usize) -> usize {
    if i >= s.len() {
        return s.len();
    }
    while i > 0 && !s.is_char_boundary(i) {
        i -= 1;
    }
    i
}

fn ceil_char_boundary(s: &str, mut i: usize) -> usize {
    if i >= s.len() {
        return s.len();
    }
    while i < s.len() && !s.is_char_boundary(i) {
        i += 1;
    }
    i
}

fn load_rules_file(path: &Path) -> Result<Vec<Rule>, String> {
    let text =
        fs::read_to_string(path).map_err(|e| format!("read --rules {}: {e}", path.display()))?;
    parse_frontend_rules(&text)
}

/// Parse Willem de Groot magento-malware-scanner rule files (`frontend.txt` format):
/// https://github.com/gwillem/magento-malware-scanner/blob/master/rules/frontend.txt
/// `# name` starts a rule; following non-empty, non-`#` lines are `/regex/` or literals.
fn parse_frontend_rules(text: &str) -> Result<Vec<Rule>, String> {
    let mut rules = Vec::new();
    let mut current: Option<(String, Vec<String>, Vec<String>)> = None;

    let flush = |current: &mut Option<(String, Vec<String>, Vec<String>)>,
                 rules: &mut Vec<Rule>|
     -> Result<(), String> {
        if let Some((name, lit_raw, re_raw)) = current.take() {
            let mut literals = Vec::new();
            for lit in lit_raw {
                literals.push(decode_hex_escapes(&lit));
            }
            let mut regexes = Vec::new();
            for pat in re_raw {
                let rust_pat = yara_quantifiers_to_rust(&pat);
                match Regex::new(&rust_pat) {
                    Ok(re) => regexes.push(re),
                    Err(e) => {
                        eprintln!("warning: skip regex in rule {name:?}: {e} (pattern {pat:?})");
                    }
                }
            }
            if !literals.is_empty() || !regexes.is_empty() {
                rules.push(Rule {
                    name,
                    literals,
                    regexes,
                });
            }
        }
        Ok(())
    };

    for line in text.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        if let Some(rest) = trimmed.strip_prefix('#') {
            let name = rest.trim();
            // Skip pure commentary headers (long prose / empty).
            if name.is_empty()
                || name.starts_with("Copyright")
                || name.starts_with("https://github.com/gwillem")
                || name.starts_with("Copied from:")
                || name.starts_with("Snapshot date:")
                || name.starts_with("Local adaptations")
                || name.starts_with("Do not redistribute")
                || name.starts_with("This file")
                || name.starts_with("NB:")
                || name.starts_with('-')
                || name.starts_with("Content from")
                || name.starts_with("Vendored from")
                || name.starts_with("Source:")
            {
                continue;
            }
            flush(&mut current, &mut rules)?;
            current = Some((name.to_string(), Vec::new(), Vec::new()));
            continue;
        }
        let Some((_, lits, res)) = current.as_mut() else {
            continue;
        };
        if trimmed.starts_with('/') && trimmed.ends_with('/') && trimmed.len() >= 2 {
            res.push(trimmed[1..trimmed.len() - 1].to_string());
        } else {
            lits.push(trimmed.to_string());
        }
    }
    flush(&mut current, &mut rules)?;
    Ok(rules)
}

/// Decode `\xHH` sequences in malware-scanner literals to their bytes/UTF-8 chars.
fn decode_hex_escapes(s: &str) -> String {
    let bytes = s.as_bytes();
    let mut out = String::with_capacity(s.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'\\'
            && i + 3 < bytes.len()
            && (bytes[i + 1] == b'x' || bytes[i + 1] == b'X')
        {
            let h1 = bytes[i + 2];
            let h2 = bytes[i + 3];
            if let (Some(a), Some(b)) = (from_hex(h1), from_hex(h2)) {
                out.push((a << 4 | b) as char);
                i += 4;
                continue;
            }
        }
        out.push(bytes[i] as char);
        i += 1;
    }
    out
}

fn from_hex(c: u8) -> Option<u8> {
    match c {
        b'0'..=b'9' => Some(c - b'0'),
        b'a'..=b'f' => Some(c - b'a' + 10),
        b'A'..=b'F' => Some(c - b'A' + 10),
        _ => None,
    }
}

/// `{,N}` (YARA/PCRE-ish) → `{0,N}` for the `regex` crate.
fn yara_quantifiers_to_rust(pat: &str) -> String {
    let mut out = String::with_capacity(pat.len() + 8);
    let bytes = pat.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'{' && i + 2 < bytes.len() && bytes[i + 1] == b',' {
            out.push_str("{0,");
            i += 2;
            continue;
        }
        out.push(bytes[i] as char);
        i += 1;
    }
    out
}

/// Pull string entries from gateway `/evaluate` body (`"result":[…]` arrays).
pub fn extract_gateway_payloads(body: &str) -> Vec<String> {
    let mut payloads = Vec::new();
    let mut search_from = 0;
    while let Some(rel) = body[search_from..].find("\"result\"") {
        let start = search_from + rel;
        let after_key = start + "\"result\"".len();
        let rest = &body[after_key..];
        let Some(bracket_rel) = rest.find('[') else {
            search_from = after_key;
            continue;
        };
        let arr_start = after_key + bracket_rel;
        if let Some(arr_end) = find_matching_bracket(body, arr_start) {
            let inner = &body[arr_start + 1..arr_end];
            payloads.extend(extract_json_strings(inner));
            search_from = arr_end + 1;
        } else {
            search_from = arr_start + 1;
        }
    }
    payloads
}

fn find_matching_bracket(s: &str, open_idx: usize) -> Option<usize> {
    let bytes = s.as_bytes();
    if open_idx >= bytes.len() || bytes[open_idx] != b'[' {
        return None;
    }
    let mut depth = 0i32;
    let mut in_str = false;
    let mut escape = false;
    for (i, &c) in bytes.iter().enumerate().skip(open_idx) {
        if in_str {
            if escape {
                escape = false;
            } else if c == b'\\' {
                escape = true;
            } else if c == b'"' {
                in_str = false;
            }
            continue;
        }
        match c {
            b'"' => in_str = true,
            b'[' => depth += 1,
            b']' => {
                depth -= 1;
                if depth == 0 {
                    return Some(i);
                }
            }
            _ => {}
        }
    }
    None
}

fn extract_json_strings(inner: &str) -> Vec<String> {
    let mut out = Vec::new();
    let bytes = inner.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'"' {
            i += 1;
            let mut s = String::new();
            while i < bytes.len() {
                let c = bytes[i];
                if c == b'\\' && i + 1 < bytes.len() {
                    let n = bytes[i + 1];
                    match n {
                        b'"' | b'\\' | b'/' => {
                            s.push(n as char);
                            i += 2;
                        }
                        b'n' => {
                            s.push('\n');
                            i += 2;
                        }
                        b'r' => {
                            s.push('\r');
                            i += 2;
                        }
                        b't' => {
                            s.push('\t');
                            i += 2;
                        }
                        b'u' if i + 5 < bytes.len() => {
                            // skip \uXXXX roughly
                            s.push('?');
                            i += 6;
                        }
                        _ => {
                            s.push(n as char);
                            i += 2;
                        }
                    }
                    continue;
                }
                if c == b'"' {
                    i += 1;
                    break;
                }
                s.push(c as char);
                i += 1;
            }
            if !s.is_empty() {
                out.push(s);
            }
            continue;
        }
        i += 1;
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn keywords_or() {
        let f = HitFilter::try_new("checkout,grelos_v", None, None).unwrap();
        assert!(f.is_active());
        let labels = f.match_labels("var grelos_v = 1").unwrap();
        assert!(labels.iter().any(|l| l == "keyword:grelos_v"));
        assert!(f.match_labels("harmless").is_none());
    }

    #[test]
    fn inactive_keeps_all() {
        let f = HitFilter::try_new("", None, None).unwrap();
        assert!(!f.is_active());
        assert_eq!(f.match_labels("anything"), Some(vec![]));
    }

    #[test]
    fn parse_grelos_and_hex_literal() {
        let text = r#"
# grelos_v
var grelos_v
grelos_v.send

# onepage_or_checkout
\x6F\x6E\x65\x70\x61\x67\x65\x7C\x63\x68\x65\x63\x6B\x6F\x75\x74
"#;
        let rules = parse_frontend_rules(text).unwrap();
        assert_eq!(rules.len(), 2);
        let f = HitFilter {
            keywords: vec![],
            regex: None,
            rules,
        };
        let labels = f.match_labels("var grelos_v = null").unwrap();
        assert!(labels.contains(&"grelos_v".to_string()));
        let labels2 = f.match_labels("onepage|checkout").unwrap();
        assert!(labels2.contains(&"onepage_or_checkout".to_string()));
    }

    #[test]
    fn regex_quantifier_fix() {
        assert_eq!(yara_quantifiers_to_rust(r"a.{,10}b"), r"a.{0,10}b");
    }

    #[test]
    fn extract_result_strings() {
        let body = r#"[{"sha256":"abc","result":["hello","world"],"caller":""}]"#;
        let p = extract_gateway_payloads(body);
        assert_eq!(p, vec!["hello".to_string(), "world".to_string()]);
    }

    #[test]
    fn excerpt_around_keyword() {
        let f = HitFilter::try_new("grelos_v", None, None).unwrap();
        let payload = format!("{}var grelos_v = null;{}", "x".repeat(200), "y".repeat(200));
        let hits = f.match_hits(&payload);
        assert_eq!(hits.len(), 1);
        let (label, s, e) = &hits[0];
        assert_eq!(label, "keyword:grelos_v");
        let ex = f.excerpt_span(&payload, *s, *e, 20);
        assert!(ex.contains("grelos_v"));
        assert!(ex.starts_with('…'));
        assert!(ex.ends_with('…'));
        assert!(ex.len() < payload.len());
    }
}
