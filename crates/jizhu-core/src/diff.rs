//! Diff 核心：文本行对比、JSON 规范化对比、URL 结构化对比。
//! 纯计算，不做 IO。

use crate::json;
use percent_encoding::percent_decode_str;
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use similar::{capture_diff_slices, Algorithm, DiffOp};
use std::collections::HashMap;
use std::fmt::Write as _;
use url::Url;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiffLine {
    pub number: usize,
    pub text: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiffRow {
    pub kind: String,
    pub a: Option<DiffLine>,
    pub b: Option<DiffLine>,
}

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiffStats {
    pub added: usize,
    pub removed: usize,
    pub changed: usize,
    pub differences: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiffResult {
    pub rows: Vec<DiffRow>,
    pub stats: DiffStats,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiffError {
    pub message: String,
    pub line: Option<usize>,
    pub column: Option<usize>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UrlDiffRow {
    pub section: String,
    pub name: String,
    pub a: String,
    pub b: String,
    pub kind: String,
    pub depth: u8,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UrlDiffResult {
    pub rows: Vec<UrlDiffRow>,
    pub stats: DiffStats,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct DiffOptions {
    pub ignore_whitespace: bool,
    pub ignore_case: bool,
    pub ignore_trailing: bool,
    pub sort_keys: bool,
    pub ensure_ascii: bool,
    pub indent: u8,
    pub decode_params: bool,
    pub parse_json_params: bool,
    pub sort_params: bool,
    pub ignore_default_port: bool,
}

impl Default for DiffOptions {
    fn default() -> Self {
        Self {
            ignore_whitespace: false,
            ignore_case: false,
            ignore_trailing: false,
            sort_keys: false,
            ensure_ascii: false,
            indent: 2,
            decode_params: true,
            parse_json_params: true,
            sort_params: false,
            ignore_default_port: true,
        }
    }
}

fn json_error(error: serde_json::Error) -> DiffError {
    DiffError {
        message: error.to_string(),
        line: Some(error.line()),
        column: Some(error.column()),
    }
}

// ---------------------------------------------------------------------------
// 文本
// ---------------------------------------------------------------------------

fn normalize_line(line: &str, options: &DiffOptions) -> String {
    let mut out = line.to_string();
    if options.ignore_trailing {
        out = out.trim_end().to_string();
    }
    if options.ignore_whitespace {
        out = out.split_whitespace().collect::<Vec<_>>().join(" ");
    }
    if options.ignore_case {
        out = out.to_lowercase();
    }
    out
}

fn diff_lines(a: &str, b: &str, options: &DiffOptions) -> DiffResult {
    let a_lines: Vec<&str> = a.lines().collect();
    let b_lines: Vec<&str> = b.lines().collect();
    let a_norm: Vec<String> = a_lines
        .iter()
        .map(|line| normalize_line(line, options))
        .collect();
    let b_norm: Vec<String> = b_lines
        .iter()
        .map(|line| normalize_line(line, options))
        .collect();
    build_rows(&a_lines, &b_lines, &a_norm, &b_norm)
}

fn build_rows(
    a_lines: &[&str],
    b_lines: &[&str],
    a_norm: &[String],
    b_norm: &[String],
) -> DiffResult {
    let ops = capture_diff_slices(Algorithm::Patience, a_norm, b_norm);
    let mut rows = Vec::new();
    let mut stats = DiffStats::default();

    let mut push = |kind: &str, a: Option<(usize, &str)>, b: Option<(usize, &str)>| {
        let a = a.map(|(index, text)| DiffLine {
            number: index + 1,
            text: text.to_string(),
        });
        let b = b.map(|(index, text)| DiffLine {
            number: index + 1,
            text: text.to_string(),
        });
        rows.push(DiffRow {
            kind: kind.to_string(),
            a,
            b,
        });
    };

    for op in ops {
        match op {
            DiffOp::Equal {
                old_index,
                new_index,
                len,
            } => {
                for offset in 0..len {
                    push(
                        "equal",
                        Some((old_index + offset, a_lines[old_index + offset])),
                        Some((new_index + offset, b_lines[new_index + offset])),
                    );
                }
            }
            DiffOp::Delete {
                old_index, old_len, ..
            } => {
                for offset in 0..old_len {
                    push(
                        "remove",
                        Some((old_index + offset, a_lines[old_index + offset])),
                        None,
                    );
                    stats.removed += 1;
                    stats.differences += 1;
                }
            }
            DiffOp::Insert {
                new_index, new_len, ..
            } => {
                for offset in 0..new_len {
                    push(
                        "add",
                        None,
                        Some((new_index + offset, b_lines[new_index + offset])),
                    );
                    stats.added += 1;
                    stats.differences += 1;
                }
            }
            DiffOp::Replace {
                old_index,
                old_len,
                new_index,
                new_len,
            } => {
                let paired = old_len.min(new_len);
                for offset in 0..paired {
                    push(
                        "change",
                        Some((old_index + offset, a_lines[old_index + offset])),
                        Some((new_index + offset, b_lines[new_index + offset])),
                    );
                    stats.changed += 1;
                    stats.removed += 1;
                    stats.added += 1;
                    stats.differences += 1;
                }
                for offset in paired..old_len {
                    push(
                        "remove",
                        Some((old_index + offset, a_lines[old_index + offset])),
                        None,
                    );
                    stats.removed += 1;
                    stats.differences += 1;
                }
                for offset in paired..new_len {
                    push(
                        "add",
                        None,
                        Some((new_index + offset, b_lines[new_index + offset])),
                    );
                    stats.added += 1;
                    stats.differences += 1;
                }
            }
        }
    }

    DiffResult { rows, stats }
}

pub fn diff_text(a: &str, b: &str, options: &DiffOptions) -> DiffResult {
    diff_lines(a, b, options)
}

fn sort_value(value: &mut Value) {
    match value {
        Value::Object(map) => {
            let mut entries: Vec<(String, Value)> = std::mem::take(map).into_iter().collect();
            entries.sort_by(|left, right| left.0.cmp(&right.0));
            let mut sorted = Map::new();
            for (key, mut child) in entries {
                sort_value(&mut child);
                sorted.insert(key, child);
            }
            *map = sorted;
        }
        Value::Array(items) => {
            for item in items {
                sort_value(item);
            }
        }
        _ => {}
    }
}

fn escape_non_ascii(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    for ch in input.chars() {
        if ch.is_ascii() {
            out.push(ch);
            continue;
        }
        let code = ch as u32;
        if code <= 0xFFFF {
            let _ = write!(out, "\\u{code:04x}");
        } else {
            let value = code - 0x10000;
            let high = 0xD800 + ((value >> 10) & 0x3FF);
            let low = 0xDC00 + (value & 0x3FF);
            let _ = write!(out, "\\u{high:04x}\\u{low:04x}");
        }
    }
    out
}

// ---------------------------------------------------------------------------
// JSON（路径级结构对齐 + 数组 LCS）
// ---------------------------------------------------------------------------

const MAX_JSON_DIFF_ROWS: usize = 50_000;
const MAX_LCS_CELLS: usize = 250_000;
const MAX_VALUE_CHARS: usize = 400;

struct LineMap {
    lines: HashMap<String, usize>,
}

impl LineMap {
    fn new(text: &str) -> Self {
        let analysis = json::analyze(text);
        let mut starts = vec![0usize];
        let mut units = 0usize;
        for ch in text.chars() {
            units += ch.len_utf16();
            if ch == '\n' {
                starts.push(units);
            }
        }
        let mut lines = HashMap::new();
        for node in analysis.nodes {
            let line = starts.partition_point(|start| *start <= node.start).max(1);
            lines.insert(node.path, line);
        }
        Self { lines }
    }

    fn line(&self, path: &str) -> usize {
        *self.lines.get(path).unwrap_or(&1)
    }
}

fn pointer_escape(input: &str) -> String {
    input.replace('~', "~0").replace('/', "~1")
}

fn key_label(key: &str, ensure_ascii: bool) -> String {
    let label = serde_json::to_string(key).unwrap_or_else(|_| "\"\"".to_string());
    if ensure_ascii {
        escape_non_ascii(&label)
    } else {
        label
    }
}

fn truncate_chars(input: &str, max: usize) -> String {
    if input.chars().count() <= max {
        return input.to_string();
    }
    let mut out: String = input.chars().take(max.saturating_sub(1)).collect();
    out.push('…');
    out
}

fn canonical(value: &Value) -> String {
    let mut sorted = value.clone();
    sort_value(&mut sorted);
    serde_json::to_string(&sorted).unwrap_or_default()
}

fn value_text(value: &Value, ensure_ascii: bool) -> String {
    let text = serde_json::to_string(value).unwrap_or_else(|_| "null".to_string());
    let text = if ensure_ascii {
        escape_non_ascii(&text)
    } else {
        text
    };
    truncate_chars(&text, MAX_VALUE_CHARS)
}

fn summary(value: &Value, ensure_ascii: bool) -> String {
    match value {
        Value::Object(map) => {
            if map.is_empty() {
                "{}".to_string()
            } else {
                format!("{{{} keys}}", map.len())
            }
        }
        Value::Array(items) => {
            if items.is_empty() {
                "[]".to_string()
            } else {
                format!("[{} items]", items.len())
            }
        }
        _ => value_text(value, ensure_ascii),
    }
}

fn ordered_keys(a: &Map<String, Value>, b: &Map<String, Value>, sort: bool) -> Vec<String> {
    let mut keys: Vec<String> = a.keys().cloned().collect();
    for key in b.keys() {
        if !a.contains_key(key) {
            keys.push(key.clone());
        }
    }
    if sort {
        keys.sort();
    }
    keys
}

struct JsonDiffer<'a> {
    options: &'a DiffOptions,
    lines_a: LineMap,
    lines_b: LineMap,
    rows: Vec<DiffRow>,
    stats: DiffStats,
}

impl<'a> JsonDiffer<'a> {
    fn new(a: &str, b: &str, options: &'a DiffOptions) -> Self {
        Self {
            options,
            lines_a: LineMap::new(a),
            lines_b: LineMap::new(b),
            rows: Vec::new(),
            stats: DiffStats::default(),
        }
    }

    fn text(&self, value: &Value, label: &str, depth: usize) -> String {
        let unit = match self.options.indent {
            0 => "\t",
            4 => "    ",
            _ => "  ",
        };
        let indent = unit.repeat(depth);
        let body = summary(value, self.options.ensure_ascii);
        if label.is_empty() {
            format!("{indent}{body}")
        } else {
            format!("{indent}{label}: {body}")
        }
    }

    fn make_line(
        &self,
        side_a: bool,
        path: &str,
        value: &Value,
        label: &str,
        depth: usize,
    ) -> DiffLine {
        DiffLine {
            number: if side_a {
                self.lines_a.line(path)
            } else {
                self.lines_b.line(path)
            },
            text: self.text(value, label, depth),
        }
    }

    fn push(&mut self, kind: &str, a: Option<DiffLine>, b: Option<DiffLine>) {
        if self.rows.len() >= MAX_JSON_DIFF_ROWS {
            return;
        }
        match kind {
            "change" => {
                self.stats.changed += 1;
                self.stats.removed += 1;
                self.stats.added += 1;
                self.stats.differences += 1;
            }
            "add" => {
                self.stats.added += 1;
                self.stats.differences += 1;
            }
            "remove" => {
                self.stats.removed += 1;
                self.stats.differences += 1;
            }
            _ => {}
        }
        self.rows.push(DiffRow {
            kind: kind.to_string(),
            a,
            b,
        });
    }

    #[allow(clippy::too_many_arguments)]
    fn pair(
        &mut self,
        a: &Value,
        b: &Value,
        path_a: &str,
        path_b: &str,
        label_a: &str,
        label_b: &str,
        depth: usize,
    ) {
        if self.rows.len() >= MAX_JSON_DIFF_ROWS {
            return;
        }
        match (a, b) {
            (Value::Object(map_a), Value::Object(map_b)) => {
                let line_a = self.make_line(true, path_a, a, label_a, depth);
                let line_b = self.make_line(false, path_b, b, label_b, depth);
                self.push("equal", Some(line_a), Some(line_b));
                for key in ordered_keys(map_a, map_b, self.options.sort_keys) {
                    let path_child_a = format!("{path_a}/{}", pointer_escape(&key));
                    let path_child_b = format!("{path_b}/{}", pointer_escape(&key));
                    let label = key_label(&key, self.options.ensure_ascii);
                    match (map_a.get(&key), map_b.get(&key)) {
                        (Some(child_a), Some(child_b)) => self.pair(
                            child_a,
                            child_b,
                            &path_child_a,
                            &path_child_b,
                            &label,
                            &label,
                            depth + 1,
                        ),
                        (Some(child_a), None) => {
                            self.subtree(child_a, &path_child_a, &label, depth + 1, "remove")
                        }
                        (None, Some(child_b)) => {
                            self.subtree(child_b, &path_child_b, &label, depth + 1, "add")
                        }
                        (None, None) => {}
                    }
                }
            }
            (Value::Array(items_a), Value::Array(items_b)) => {
                let line_a = self.make_line(true, path_a, a, label_a, depth);
                let line_b = self.make_line(false, path_b, b, label_b, depth);
                self.push("equal", Some(line_a), Some(line_b));

                let matches = if items_a.len().saturating_mul(items_b.len()) <= MAX_LCS_CELLS {
                    let canon_a: Vec<String> = items_a.iter().map(canonical).collect();
                    let canon_b: Vec<String> = items_b.iter().map(canonical).collect();
                    lcs_pairs(&canon_a, &canon_b)
                } else {
                    Vec::new()
                };

                let mut cursor_a = 0usize;
                let mut cursor_b = 0usize;
                for (index_a, index_b) in matches {
                    self.pair_segment(
                        items_a, items_b, cursor_a, index_a, cursor_b, index_b, path_a, path_b,
                        depth,
                    );
                    let label_a = format!("[{index_a}]");
                    let label_b = format!("[{index_b}]");
                    self.pair(
                        &items_a[index_a],
                        &items_b[index_b],
                        &format!("{path_a}/{index_a}"),
                        &format!("{path_b}/{index_b}"),
                        &label_a,
                        &label_b,
                        depth + 1,
                    );
                    cursor_a = index_a + 1;
                    cursor_b = index_b + 1;
                }
                self.pair_segment(
                    items_a,
                    items_b,
                    cursor_a,
                    items_a.len(),
                    cursor_b,
                    items_b.len(),
                    path_a,
                    path_b,
                    depth,
                );
            }
            _ => {
                let kind = if canonical(a) == canonical(b) {
                    "equal"
                } else {
                    "change"
                };
                let line_a = self.make_line(true, path_a, a, label_a, depth);
                let line_b = self.make_line(false, path_b, b, label_b, depth);
                self.push(kind, Some(line_a), Some(line_b));
            }
        }
    }

    #[allow(clippy::too_many_arguments)]
    fn pair_segment(
        &mut self,
        items_a: &[Value],
        items_b: &[Value],
        start_a: usize,
        end_a: usize,
        start_b: usize,
        end_b: usize,
        path_a: &str,
        path_b: &str,
        depth: usize,
    ) {
        let len_a = end_a.saturating_sub(start_a);
        let len_b = end_b.saturating_sub(start_b);
        let common = len_a.min(len_b);
        for offset in 0..common {
            let index_a = start_a + offset;
            let index_b = start_b + offset;
            self.pair(
                &items_a[index_a],
                &items_b[index_b],
                &format!("{path_a}/{index_a}"),
                &format!("{path_b}/{index_b}"),
                &format!("[{index_a}]"),
                &format!("[{index_b}]"),
                depth + 1,
            );
        }
        for (offset, item) in items_a[(start_a + common)..end_a].iter().enumerate() {
            let index_a = start_a + common + offset;
            self.subtree(
                item,
                &format!("{path_a}/{index_a}"),
                &format!("[{index_a}]"),
                depth + 1,
                "remove",
            );
        }
        for (offset, item) in items_b[(start_b + common)..end_b].iter().enumerate() {
            let index_b = start_b + common + offset;
            self.subtree(
                item,
                &format!("{path_b}/{index_b}"),
                &format!("[{index_b}]"),
                depth + 1,
                "add",
            );
        }
    }

    fn subtree(&mut self, value: &Value, path: &str, label: &str, depth: usize, kind: &str) {
        if self.rows.len() >= MAX_JSON_DIFF_ROWS {
            return;
        }
        let line = self.make_line(kind == "remove", path, value, label, depth);
        if kind == "remove" {
            self.push(kind, Some(line), None);
        } else {
            self.push(kind, None, Some(line));
        }
        match value {
            Value::Object(map) => {
                let mut keys: Vec<&String> = map.keys().collect();
                if self.options.sort_keys {
                    keys.sort();
                }
                for key in keys {
                    let child = &map[key];
                    let path_child = format!("{path}/{}", pointer_escape(key));
                    let label_child = key_label(key, self.options.ensure_ascii);
                    self.subtree(child, &path_child, &label_child, depth + 1, kind);
                }
            }
            Value::Array(items) => {
                for (index, child) in items.iter().enumerate() {
                    let path_child = format!("{path}/{index}");
                    let label_child = format!("[{index}]");
                    self.subtree(child, &path_child, &label_child, depth + 1, kind);
                }
            }
            _ => {}
        }
    }
}

fn lcs_pairs(a: &[String], b: &[String]) -> Vec<(usize, usize)> {
    if a.is_empty() || b.is_empty() {
        return Vec::new();
    }
    let mut table = vec![vec![0usize; b.len() + 1]; a.len() + 1];
    for index_a in (0..a.len()).rev() {
        for index_b in (0..b.len()).rev() {
            table[index_a][index_b] = if a[index_a] == b[index_b] {
                table[index_a + 1][index_b + 1] + 1
            } else {
                table[index_a + 1][index_b].max(table[index_a][index_b + 1])
            };
        }
    }
    let mut pairs = Vec::new();
    let mut index_a = 0usize;
    let mut index_b = 0usize;
    while index_a < a.len() && index_b < b.len() {
        if a[index_a] == b[index_b] {
            pairs.push((index_a, index_b));
            index_a += 1;
            index_b += 1;
        } else if table[index_a + 1][index_b] >= table[index_a][index_b + 1] {
            index_a += 1;
        } else {
            index_b += 1;
        }
    }
    pairs
}

pub fn diff_json(a: &str, b: &str, options: &DiffOptions) -> Result<DiffResult, DiffError> {
    let value_a: Value = serde_json::from_str(a).map_err(json_error)?;
    let value_b: Value = serde_json::from_str(b).map_err(json_error)?;
    let mut differ = JsonDiffer::new(a, b, options);
    differ.pair(&value_a, &value_b, "", "", "", "", 0);
    Ok(DiffResult {
        rows: differ.rows,
        stats: differ.stats,
    })
}

// ---------------------------------------------------------------------------
// URL
// ---------------------------------------------------------------------------

#[derive(Debug, Clone)]
struct Param {
    key: String,
    value: String,
    raw_value: String,
    occurrence: usize,
}

#[derive(Debug, Clone)]
struct ParsedUrl {
    scheme: String,
    username: String,
    host: String,
    port: String,
    effective_port: Option<u16>,
    path: String,
    fragment: String,
    params: Vec<Param>,
}

const MAX_URL_NESTED_ROWS: usize = 10_000;

fn decode_component(input: &str) -> String {
    let replaced = input.replace('+', " ");
    percent_decode_str(&replaced)
        .decode_utf8_lossy()
        .to_string()
}

fn parse_url(input: &str) -> Result<ParsedUrl, DiffError> {
    let url = Url::parse(input).map_err(|error| DiffError {
        message: format!("URL 解析失败：{error}"),
        line: None,
        column: None,
    })?;
    let raw_query = url.query().unwrap_or("");
    let mut params = Vec::new();
    let mut counts: HashMap<String, usize> = HashMap::new();
    for pair in raw_query.split('&') {
        if pair.is_empty() {
            continue;
        }
        let (raw_key, raw_value) = pair.split_once('=').unwrap_or((pair, ""));
        let key = decode_component(raw_key);
        let value = decode_component(raw_value);
        let occurrence = *counts.get(&key).unwrap_or(&0);
        counts.insert(key.clone(), occurrence + 1);
        params.push(Param {
            key,
            value,
            raw_value: raw_value.to_string(),
            occurrence,
        });
    }

    Ok(ParsedUrl {
        scheme: url.scheme().to_string(),
        username: url.username().to_string(),
        host: url.host_str().unwrap_or("").to_string(),
        port: url
            .port()
            .map(|port| port.to_string())
            .unwrap_or_else(|| "—".to_string()),
        effective_port: url.port_or_known_default(),
        path: url.path().to_string(),
        fragment: url.fragment().unwrap_or("").to_string(),
        params,
    })
}

fn display_param_value(param: &Param, decode: bool) -> String {
    let value = if decode {
        &param.value
    } else {
        &param.raw_value
    };
    if value.is_empty() {
        "（空）".to_string()
    } else {
        value.clone()
    }
}

fn param_label(param: &Param) -> String {
    if param.occurrence == 0 {
        param.key.clone()
    } else {
        format!("{}[{}]", param.key, param.occurrence + 1)
    }
}

fn row_for_fixed(section: &str, name: &str, a: &str, b: &str) -> UrlDiffRow {
    let kind = if a == b { "equal" } else { "change" };
    UrlDiffRow {
        section: section.to_string(),
        name: name.to_string(),
        a: a.to_string(),
        b: b.to_string(),
        kind: kind.to_string(),
        depth: 0,
    }
}

fn nested_container(value: &Value) -> bool {
    matches!(value, Value::Object(_) | Value::Array(_))
}

fn nested_summary(value: &Value) -> String {
    match value {
        Value::Object(map) => format!("JSON · {} keys", map.len()),
        Value::Array(items) => format!("JSON · {} items", items.len()),
        _ => value_text(value, false),
    }
}

fn nested_display(value: &Value) -> String {
    match value {
        Value::Object(map) => {
            if map.is_empty() {
                "{}".to_string()
            } else {
                format!("{{{} keys}}", map.len())
            }
        }
        Value::Array(items) => {
            if items.is_empty() {
                "[]".to_string()
            } else {
                format!("[{} items]", items.len())
            }
        }
        _ => value_text(value, false),
    }
}

fn parse_nested(value: &str) -> Option<Value> {
    let parsed: Value = serde_json::from_str(value).ok()?;
    if nested_container(&parsed) {
        Some(parsed)
    } else {
        None
    }
}

fn nested_row(name: &str, a: String, b: String, kind: &str, depth: u8) -> UrlDiffRow {
    UrlDiffRow {
        section: "参数".to_string(),
        name: name.to_string(),
        a,
        b,
        kind: kind.to_string(),
        depth,
    }
}

fn nested_subtree(rows: &mut Vec<UrlDiffRow>, name: &str, value: &Value, depth: u8, kind: &str) {
    if rows.len() >= MAX_URL_NESTED_ROWS {
        return;
    }
    let display = nested_display(value);
    let (a, b) = if kind == "remove" {
        (display, "— 已删除".to_string())
    } else {
        ("— 新增".to_string(), display)
    };
    rows.push(nested_row(name, a, b, kind, depth));
    match value {
        Value::Object(map) => {
            let mut keys: Vec<&String> = map.keys().collect();
            keys.sort();
            for key in keys {
                nested_subtree(
                    rows,
                    &format!("{name}.{key}"),
                    &map[key],
                    depth.saturating_add(1),
                    kind,
                );
            }
        }
        Value::Array(items) => {
            for (index, child) in items.iter().enumerate() {
                nested_subtree(
                    rows,
                    &format!("{name}[{index}]"),
                    child,
                    depth.saturating_add(1),
                    kind,
                );
            }
        }
        _ => {}
    }
}

fn nested_array_label(name: &str, index_a: usize, index_b: usize) -> String {
    if index_a == index_b {
        format!("{name}[{index_a}]")
    } else {
        format!("{name}[{index_a}→{index_b}]")
    }
}

fn nested_add_label(name: &str, index: usize) -> String {
    format!("{name}[+{index}]")
}

fn nested_remove_label(name: &str, index: usize) -> String {
    format!("{name}[-{index}]")
}

#[allow(clippy::too_many_arguments)]
fn nested_segment(
    rows: &mut Vec<UrlDiffRow>,
    name: &str,
    items_a: &[Value],
    items_b: &[Value],
    start_a: usize,
    end_a: usize,
    start_b: usize,
    end_b: usize,
    depth: u8,
) {
    let len_a = end_a.saturating_sub(start_a);
    let len_b = end_b.saturating_sub(start_b);
    let common = len_a.min(len_b);
    for offset in 0..common {
        let index_a = start_a + offset;
        let index_b = start_b + offset;
        nested_pair(
            rows,
            &nested_array_label(name, index_a, index_b),
            &items_a[index_a],
            &items_b[index_b],
            depth.saturating_add(1),
            true,
        );
    }
    for (offset, item) in items_a[(start_a + common)..end_a].iter().enumerate() {
        let index_a = start_a + common + offset;
        nested_subtree(
            rows,
            &nested_remove_label(name, index_a),
            item,
            depth.saturating_add(1),
            "remove",
        );
    }
    for (offset, item) in items_b[(start_b + common)..end_b].iter().enumerate() {
        let index_b = start_b + common + offset;
        nested_subtree(
            rows,
            &nested_add_label(name, index_b),
            item,
            depth.saturating_add(1),
            "add",
        );
    }
}

fn nested_pair(
    rows: &mut Vec<UrlDiffRow>,
    name: &str,
    a: &Value,
    b: &Value,
    depth: u8,
    emit_self: bool,
) {
    if rows.len() >= MAX_URL_NESTED_ROWS {
        return;
    }
    match (a, b) {
        (Value::Object(map_a), Value::Object(map_b)) => {
            if emit_self {
                rows.push(nested_row(
                    name,
                    nested_display(a),
                    nested_display(b),
                    "equal",
                    depth,
                ));
            }
            let mut keys: Vec<String> = map_a.keys().cloned().collect();
            for key in map_b.keys() {
                if !map_a.contains_key(key) {
                    keys.push(key.clone());
                }
            }
            keys.sort();
            for key in keys {
                let child_name = format!("{name}.{key}");
                match (map_a.get(&key), map_b.get(&key)) {
                    (Some(child_a), Some(child_b)) => nested_pair(
                        rows,
                        &child_name,
                        child_a,
                        child_b,
                        depth.saturating_add(1),
                        true,
                    ),
                    (Some(child_a), None) => nested_subtree(
                        rows,
                        &child_name,
                        child_a,
                        depth.saturating_add(1),
                        "remove",
                    ),
                    (None, Some(child_b)) => {
                        nested_subtree(rows, &child_name, child_b, depth.saturating_add(1), "add")
                    }
                    (None, None) => {}
                }
            }
        }
        (Value::Array(items_a), Value::Array(items_b)) => {
            if emit_self {
                rows.push(nested_row(
                    name,
                    nested_display(a),
                    nested_display(b),
                    "equal",
                    depth,
                ));
            }
            let matches = if items_a.len().saturating_mul(items_b.len()) <= MAX_LCS_CELLS {
                let canon_a: Vec<String> = items_a.iter().map(canonical).collect();
                let canon_b: Vec<String> = items_b.iter().map(canonical).collect();
                lcs_pairs(&canon_a, &canon_b)
            } else {
                Vec::new()
            };
            let mut cursor_a = 0usize;
            let mut cursor_b = 0usize;
            for (index_a, index_b) in matches {
                nested_segment(
                    rows, name, items_a, items_b, cursor_a, index_a, cursor_b, index_b, depth,
                );
                nested_pair(
                    rows,
                    &nested_array_label(name, index_a, index_b),
                    &items_a[index_a],
                    &items_b[index_b],
                    depth.saturating_add(1),
                    true,
                );
                cursor_a = index_a + 1;
                cursor_b = index_b + 1;
            }
            nested_segment(
                rows,
                name,
                items_a,
                items_b,
                cursor_a,
                items_a.len(),
                cursor_b,
                items_b.len(),
                depth,
            );
        }
        _ => {
            let kind = if canonical(a) == canonical(b) {
                "equal"
            } else {
                "change"
            };
            rows.push(nested_row(
                name,
                nested_display(a),
                nested_display(b),
                kind,
                depth,
            ));
        }
    }
}

fn push_nested_param(rows: &mut Vec<UrlDiffRow>, name: &str, a: &Value, b: &Value) {
    let same_kind = matches!(
        (a, b),
        (Value::Object(_), Value::Object(_)) | (Value::Array(_), Value::Array(_))
    );
    rows.push(nested_row(
        name,
        nested_summary(a),
        nested_summary(b),
        if same_kind { "equal" } else { "change" },
        0,
    ));
    if same_kind {
        nested_pair(rows, name, a, b, 0, false);
    }
}

fn add_stats(rows: &[UrlDiffRow]) -> DiffStats {
    let mut stats = DiffStats::default();
    for row in rows {
        match row.kind.as_str() {
            "change" => {
                stats.changed += 1;
                stats.removed += 1;
                stats.added += 1;
                stats.differences += 1;
            }
            "add" => {
                stats.added += 1;
                stats.differences += 1;
            }
            "remove" => {
                stats.removed += 1;
                stats.differences += 1;
            }
            _ => {}
        }
    }
    stats
}

pub fn diff_url(a: &str, b: &str, options: &DiffOptions) -> Result<UrlDiffResult, DiffError> {
    let left = parse_url(a)?;
    let right = parse_url(b)?;
    let mut rows = Vec::new();

    rows.push(row_for_fixed("协议", "scheme", &left.scheme, &right.scheme));
    rows.push(row_for_fixed(
        "认证",
        "username",
        if left.username.is_empty() {
            "—"
        } else {
            &left.username
        },
        if right.username.is_empty() {
            "—"
        } else {
            &right.username
        },
    ));
    rows.push(row_for_fixed(
        "域名",
        "host",
        if left.host.is_empty() {
            "—"
        } else {
            &left.host
        },
        if right.host.is_empty() {
            "—"
        } else {
            &right.host
        },
    ));
    let ports_equal = if options.ignore_default_port {
        left.effective_port == right.effective_port
    } else {
        left.port == right.port
    };
    rows.push(UrlDiffRow {
        section: "端口".to_string(),
        name: "port".to_string(),
        a: left.port.clone(),
        b: right.port.clone(),
        kind: if ports_equal { "equal" } else { "change" }.to_string(),
        depth: 0,
    });
    rows.push(row_for_fixed("路径", "path", &left.path, &right.path));
    rows.push(row_for_fixed(
        "Fragment",
        "fragment",
        if left.fragment.is_empty() {
            "—"
        } else {
            &left.fragment
        },
        if right.fragment.is_empty() {
            "—"
        } else {
            &right.fragment
        },
    ));

    let right_map: HashMap<(String, usize), usize> = right
        .params
        .iter()
        .enumerate()
        .map(|(index, param)| ((param.key.clone(), param.occurrence), index))
        .collect();
    let mut matched_right = vec![false; right.params.len()];

    let mut groups: Vec<Vec<UrlDiffRow>> = Vec::new();
    for left_param in &left.params {
        let right_index = right_map
            .get(&(left_param.key.clone(), left_param.occurrence))
            .copied();
        let name = param_label(left_param);
        if let Some(index) = right_index {
            matched_right[index] = true;
            let right_param = &right.params[index];
            let mut group = Vec::new();
            let nested_a = if options.decode_params && options.parse_json_params {
                parse_nested(&left_param.value)
            } else {
                None
            };
            let nested_b = if options.decode_params && options.parse_json_params {
                parse_nested(&right_param.value)
            } else {
                None
            };
            if let (Some(value_a), Some(value_b)) = (nested_a, nested_b) {
                push_nested_param(&mut group, &name, &value_a, &value_b);
            } else {
                let a_value = display_param_value(left_param, options.decode_params);
                let b_value = display_param_value(right_param, options.decode_params);
                let equal = if options.decode_params {
                    left_param.value == right_param.value
                } else {
                    left_param.raw_value == right_param.raw_value
                };
                group.push(nested_row(
                    &name,
                    a_value,
                    b_value,
                    if equal { "equal" } else { "change" },
                    0,
                ));
            }
            groups.push(group);
        } else {
            groups.push(vec![nested_row(
                &name,
                display_param_value(left_param, options.decode_params),
                "— 已删除".to_string(),
                "remove",
                0,
            )]);
        }
    }
    for (index, right_param) in right.params.iter().enumerate() {
        if matched_right[index] {
            continue;
        }
        groups.push(vec![nested_row(
            &param_label(right_param),
            "— 新增".to_string(),
            display_param_value(right_param, options.decode_params),
            "add",
            0,
        )]);
    }

    if options.sort_params {
        groups.sort_by(|left, right| left[0].name.cmp(&right[0].name));
    }
    rows.extend(groups.into_iter().flatten());

    let stats = add_stats(&rows);
    Ok(UrlDiffResult { rows, stats })
}
#[cfg(test)]
mod tests {
    use super::*;

    const A: &str = "{\n  \"debug\": true,\n  \"tags\": [\"a\", \"b\"]\n}";
    const B: &str = "{\n  \"debug\": false,\n  \"tags\": [\"a\", \"c\"]\n}";

    #[test]
    fn text_diff_counts() {
        let result = diff_text(A, B, &DiffOptions::default());
        assert_eq!(result.stats.changed, 2);
        assert_eq!(result.stats.added, 2);
        assert_eq!(result.stats.removed, 2);
        assert_eq!(result.stats.differences, 2);
        assert!(result.rows.iter().any(|row| row.kind == "change"));
    }

    #[test]
    fn text_diff_ignores_case_and_whitespace() {
        let options = DiffOptions {
            ignore_case: true,
            ignore_whitespace: true,
            ..DiffOptions::default()
        };
        let result = diff_text("Hello   World", "hello world", &options);
        assert_eq!(result.stats.differences, 0);
    }

    #[test]
    fn text_diff_ignore_trailing() {
        let options = DiffOptions {
            ignore_trailing: true,
            ..DiffOptions::default()
        };
        let result = diff_text("a  \nb", "a\nb", &options);
        assert_eq!(result.stats.differences, 0);
    }

    #[test]
    fn json_diff_normalizes_key_order() {
        let options = DiffOptions {
            sort_keys: true,
            ..DiffOptions::default()
        };
        let result = diff_json(r#"{"b":1,"a":2}"#, r#"{"a":2,"b":1}"#, &options).expect("diff");
        assert_eq!(result.stats.differences, 0);
    }

    #[test]
    fn json_diff_detects_value_change() {
        let result = diff_json(A, B, &DiffOptions::default()).expect("diff");
        assert_eq!(result.stats.changed, 2);
        assert!(result.rows.iter().any(|row| row.kind == "change"));
    }

    #[test]
    fn json_array_insertion_uses_lcs() {
        let a = r#"[{"id":1},{"id":2}]"#;
        let b = r#"[{"id":1},{"id":9},{"id":2}]"#;
        let result = diff_json(a, b, &DiffOptions::default()).expect("diff");
        assert_eq!(result.stats.changed, 0);
        assert_eq!(result.stats.removed, 0);
        assert_eq!(result.stats.added, 2);
        assert_eq!(
            result.rows.iter().filter(|row| row.kind == "add").count(),
            2
        );
    }

    #[test]
    fn json_added_key_has_source_line() {
        let a = "{\n  \"a\": 1\n}";
        let b = "{\n  \"a\": 1,\n  \"b\": 2\n}";
        let result = diff_json(a, b, &DiffOptions::default()).expect("diff");
        let added = result
            .rows
            .iter()
            .find(|row| {
                row.kind == "add"
                    && row
                        .b
                        .as_ref()
                        .is_some_and(|line| line.text.contains("\"b\""))
            })
            .expect("added b");
        assert_eq!(added.b.as_ref().unwrap().number, 3);
        assert!(added.b.as_ref().unwrap().text.contains("\"b\": 2"));
    }

    #[test]
    fn json_diff_keeps_object_key_order_insensitive() {
        let result = diff_json(
            r#"{"b":1,"a":2}"#,
            r#"{"a":2,"b":1}"#,
            &DiffOptions::default(),
        )
        .expect("diff");
        assert_eq!(result.stats.differences, 0);
    }

    #[test]
    fn json_diff_reports_parse_error() {
        let error = diff_json("{", "{}", &DiffOptions::default()).expect_err("error");
        assert!(error.message.contains("EOF") || error.message.contains("line"));
    }

    #[test]
    fn json_ensure_ascii_escapes() {
        let options = DiffOptions {
            ensure_ascii: true,
            ..DiffOptions::default()
        };
        let result = diff_json(r#"{"name":"你好"}"#, r#"{"name":"你好"}"#, &options).expect("diff");
        assert!(result.rows.iter().any(|row| row
            .a
            .as_ref()
            .is_some_and(|line| line.text.contains("\\u4f60"))));
    }

    #[test]
    fn url_diff_params() {
        let result = diff_url(
            "https://example.com/a?x=1&y=2",
            "https://example.com/a?x=1&y=3&z=4",
            &DiffOptions::default(),
        )
        .expect("diff");
        assert!(result
            .rows
            .iter()
            .any(|row| row.name == "y" && row.kind == "change"));
        assert!(result
            .rows
            .iter()
            .any(|row| row.name == "z" && row.kind == "add"));
        assert_eq!(result.stats.changed, 1);
        assert_eq!(result.stats.removed, 1);
        assert_eq!(result.stats.added, 2);
        assert_eq!(result.stats.differences, 2);
    }

    #[test]
    fn url_diff_decodes_params() {
        let result = diff_url(
            "https://example.com/?q=%E4%BD%A0%E5%A5%BD",
            "https://example.com/?q=你好",
            &DiffOptions::default(),
        )
        .expect("diff");
        assert_eq!(result.stats.differences, 0);
    }

    #[test]
    fn url_diff_respects_sort_param_order() {
        let options = DiffOptions {
            sort_params: true,
            ..DiffOptions::default()
        };
        let result = diff_url(
            "https://example.com/?a=1&b=2",
            "https://example.com/?b=2&a=1",
            &options,
        )
        .expect("diff");
        assert_eq!(result.stats.differences, 0);
    }

    #[test]
    fn url_nested_json_params() {
        let a = "https://example.com/?filter=%7B%22status%22%3A%22active%22%2C%22tags%22%3A%5B%22a%22%2C%22b%22%5D%7D";
        let b = "https://example.com/?filter=%7B%22status%22%3A%22inactive%22%2C%22tags%22%3A%5B%22a%22%2C%22c%22%5D%7D";
        let result = diff_url(a, b, &DiffOptions::default()).expect("diff");
        assert!(result
            .rows
            .iter()
            .any(|row| row.name == "filter" && row.a.contains("JSON") && row.depth == 0));
        assert!(result
            .rows
            .iter()
            .any(|row| row.name == "filter.status" && row.kind == "change" && row.depth == 1));
        assert!(result
            .rows
            .iter()
            .any(|row| row.name == "filter.tags[1]" && row.kind == "change" && row.depth == 2));
        assert_eq!(result.stats.changed, 2);
    }

    #[test]
    fn url_nested_json_array_insertion() {
        let a = "https://example.com/?tags=%5B%22a%22%2C%22b%22%5D";
        let b = "https://example.com/?tags=%5B%22a%22%2C%22x%22%2C%22b%22%5D";
        let result = diff_url(a, b, &DiffOptions::default()).expect("diff");
        assert!(result
            .rows
            .iter()
            .any(|row| row.name == "tags[+1]" && row.kind == "add" && row.b.contains("x")));
        assert_eq!(result.stats.added, 1);
        assert_eq!(result.stats.removed, 0);
        assert_eq!(result.stats.changed, 0);
    }

    #[test]
    fn url_nested_json_can_be_disabled() {
        let a = "https://example.com/?filter=%7B%22a%22%3A1%7D";
        let b = "https://example.com/?filter=%7B%22a%22%3A2%7D";
        let options = DiffOptions {
            parse_json_params: false,
            ..DiffOptions::default()
        };
        let result = diff_url(a, b, &options).expect("diff");
        assert!(!result.rows.iter().any(|row| row.name == "filter.a"));
        assert!(result
            .rows
            .iter()
            .any(|row| row.name == "filter" && row.kind == "change"));
    }

    #[test]
    fn url_nested_json_respects_decode_option() {
        let a = "https://example.com/?filter=%7B%22a%22%3A1%7D";
        let b = "https://example.com/?filter=%7B%22a%22%3A2%7D";
        let options = DiffOptions {
            decode_params: false,
            ..DiffOptions::default()
        };
        let result = diff_url(a, b, &options).expect("diff");
        assert!(!result.rows.iter().any(|row| row.name == "filter.a"));
        assert!(result
            .rows
            .iter()
            .any(|row| row.name == "filter" && row.kind == "change"));
    }

    #[test]
    fn url_diff_rejects_invalid_url() {
        let error = diff_url("not a url", "https://example.com", &DiffOptions::default())
            .expect_err("error");
        assert!(error.message.contains("URL"));
    }
}
