//! 正则匹配核心（纯计算）。由 regex worker 调用。

use fancy_regex::{Captures, RegexBuilder};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::time::Instant;

pub const MAX_MATCHES: usize = 10_000;
pub const BACKTRACK_LIMIT: usize = 2_000_000;

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct RegexFlags {
    pub global: bool,
    pub ignore_case: bool,
    pub multi_line: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RegexMatch {
    pub start: usize,
    pub end: usize,
    pub text: String,
    pub groups: Vec<Option<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RegexError {
    pub message: String,
    pub kind: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RegexOutcome {
    pub matches: Vec<RegexMatch>,
    pub count: usize,
    pub unique: usize,
    pub duration_ms: u64,
    pub error: Option<RegexError>,
    pub truncated: bool,
}

fn utf16_offsets(text: &str) -> Vec<usize> {
    let mut offsets = vec![0usize; text.len() + 1];
    let mut units = 0usize;
    for (byte, ch) in text.char_indices() {
        offsets[byte] = units;
        units += ch.len_utf16();
    }
    offsets[text.len()] = units;
    offsets
}

fn failure(message: impl Into<String>, kind: &str, started: Instant) -> RegexOutcome {
    RegexOutcome {
        matches: Vec::new(),
        count: 0,
        unique: 0,
        duration_ms: started.elapsed().as_millis() as u64,
        error: Some(RegexError {
            message: message.into(),
            kind: kind.to_string(),
        }),
        truncated: false,
    }
}

fn capture_groups(captures: &Captures<'_>) -> Vec<Option<String>> {
    (1..captures.len())
        .map(|index| captures.get(index).map(|group| group.as_str().to_string()))
        .collect()
}

pub fn search(text: &str, pattern: &str, flags: &RegexFlags) -> RegexOutcome {
    let started = Instant::now();
    if pattern.trim().is_empty() {
        return failure("请输入正则表达式", "input", started);
    }
    if pattern.len() > 8 * 1024 {
        return failure("正则表达式过长", "limit", started);
    }

    let full_pattern = if flags.multi_line {
        format!("(?m){pattern}")
    } else {
        pattern.to_string()
    };
    let mut builder = RegexBuilder::new(&full_pattern);
    builder
        .case_insensitive(flags.ignore_case)
        .backtrack_limit(BACKTRACK_LIMIT);
    let regex = match builder.build() {
        Ok(regex) => regex,
        Err(error) => return failure(error.to_string(), "syntax", started),
    };

    let offsets = utf16_offsets(text);
    let mut matches = Vec::new();
    let mut unique = HashSet::new();
    let mut truncated = false;

    for item in regex.captures_iter(text) {
        let captures = match item {
            Ok(captures) => captures,
            Err(error) => return failure(error.to_string(), "runtime", started),
        };
        let Some(whole) = captures.get(0) else {
            continue;
        };
        let matched = whole.as_str().to_string();
        unique.insert(matched.clone());
        matches.push(RegexMatch {
            start: offsets[whole.start()],
            end: offsets[whole.end()],
            text: matched,
            groups: capture_groups(&captures),
        });
        if !flags.global || matches.len() >= MAX_MATCHES {
            truncated = matches.len() >= MAX_MATCHES;
            break;
        }
    }

    RegexOutcome {
        count: matches.len(),
        unique: unique.len(),
        matches,
        duration_ms: started.elapsed().as_millis() as u64,
        error: None,
        truncated,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn global() -> RegexFlags {
        RegexFlags {
            global: true,
            ..RegexFlags::default()
        }
    }

    #[test]
    fn finds_all_matches_with_groups() {
        let outcome = search(
            "ada@example.com bob@example.com",
            r"(\w+)@([\w.-]+)",
            &global(),
        );
        assert!(outcome.error.is_none());
        assert_eq!(outcome.count, 2);
        assert_eq!(outcome.unique, 2);
        assert_eq!(outcome.matches[0].text, "ada@example.com");
        assert_eq!(outcome.matches[0].groups[0].as_deref(), Some("ada"));
        assert_eq!(outcome.matches[0].groups[1].as_deref(), Some("example.com"));
    }

    #[test]
    fn respects_global_flag() {
        let flags = RegexFlags::default();
        let outcome = search("a a a", "a", &flags);
        assert_eq!(outcome.count, 1);
    }

    #[test]
    fn supports_case_insensitive() {
        let flags = RegexFlags {
            global: true,
            ignore_case: true,
            ..RegexFlags::default()
        };
        let outcome = search("Ada ada", "ada", &flags);
        assert_eq!(outcome.count, 2);
    }

    #[test]
    fn supports_multiline_anchors() {
        let flags = RegexFlags {
            global: true,
            multi_line: true,
            ..RegexFlags::default()
        };
        let outcome = search("one\ntwo\nthree", "^\\w+$", &flags);
        assert_eq!(outcome.count, 3);
    }

    #[test]
    fn reports_syntax_error() {
        let outcome = search("x", "(", &global());
        assert!(outcome.error.is_some());
        assert_eq!(outcome.error.unwrap().kind, "syntax");
    }

    #[test]
    fn utf16_offsets_are_correct() {
        let outcome = search("你a😀b", "a", &global());
        assert_eq!(outcome.matches[0].start, 1);
        assert_eq!(outcome.matches[0].end, 2);
        let emoji = search("你a😀b", "😀", &global());
        assert_eq!(emoji.matches[0].start, 2);
        assert_eq!(emoji.matches[0].end, 4);
    }

    #[test]
    fn truncates_many_matches() {
        let text = "a".repeat(MAX_MATCHES + 10);
        let outcome = search(&text, "a", &global());
        assert_eq!(outcome.count, MAX_MATCHES);
        assert!(outcome.truncated);
    }
}
