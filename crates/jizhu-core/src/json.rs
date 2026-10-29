use serde::Serialize;
use serde_json::ser::PrettyFormatter;
use serde_json::{Map, Value};

pub const DEFAULT_MAX_NODES: usize = 200_000;
const MIN_MAX_NODES: usize = 1_000;
const PREVIEW_LIMIT: usize = 64;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Issue {
    pub message: String,
    pub line: usize,
    pub column: usize,
}

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Stats {
    pub bytes: usize,
    pub nodes: usize,
    pub depth: usize,
    pub objects: usize,
    pub arrays: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TreeNode {
    pub id: usize,
    pub parent: Option<usize>,
    pub depth: usize,
    pub key: String,
    pub path: String,
    pub kind: &'static str,
    pub preview: String,
    pub children: Vec<usize>,
    /// 节点在文档中的起始位置，单位是 UTF-16 code unit（与 CodeMirror / JS 字符串一致）。
    pub start: usize,
    /// 节点结束位置（不含），单位同上。
    pub end: usize,
    /// 对象成员的键位置（含引号）；非对象成员为 0。
    pub key_start: usize,
    pub key_end: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Analysis {
    pub valid: bool,
    pub issue: Option<Issue>,
    pub stats: Stats,
    pub nodes: Vec<TreeNode>,
    pub root: Option<usize>,
    pub truncated: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JsonError {
    pub message: String,
    pub line: Option<usize>,
    pub column: Option<usize>,
}

impl JsonError {
    fn from_serde(error: serde_json::Error) -> Self {
        Self {
            message: humanize(&error.to_string()),
            line: Some(error.line()),
            column: Some(error.column()),
        }
    }

    fn plain(message: impl Into<String>) -> Self {
        Self {
            message: message.into(),
            line: None,
            column: None,
        }
    }
}

fn humanize(raw: &str) -> String {
    let base = raw.split(" at line ").next().unwrap_or(raw).trim();
    if base.contains("expected `:`") {
        return "缺少冒号 ':'".to_string();
    }
    if base.contains("key must be a string") {
        return "对象的键必须是字符串".to_string();
    }
    if base.contains("expected value") {
        return "缺少值".to_string();
    }
    if base.contains("EOF while parsing") {
        return "内容意外结束，可能缺少 } 或 ]".to_string();
    }
    if base.contains("trailing characters") {
        return "JSON 结束后还有多余内容".to_string();
    }
    if base.contains("expected `,` or `}`") {
        return "缺少 ',' 或 '}'".to_string();
    }
    if base.contains("expected `,` or `]`") {
        return "缺少 ',' 或 ']'".to_string();
    }
    if base.contains("invalid escape") {
        return "非法的转义字符".to_string();
    }
    if base.contains("control character") {
        return "字符串中包含未转义的控制字符".to_string();
    }
    if base.contains("number out of range") {
        return "数字超出可表示范围".to_string();
    }
    if base.contains("recursion limit exceeded") {
        return "嵌套层级过深".to_string();
    }
    base.to_string()
}

fn truncate(text: &str, limit: usize) -> String {
    if text.chars().count() <= limit {
        return text.to_string();
    }
    let mut out: String = text.chars().take(limit.saturating_sub(1)).collect();
    out.push('…');
    out
}

fn pointer_escape(key: &str) -> String {
    key.replace('~', "~0").replace('/', "~1")
}

// ---------------------------------------------------------------------------
// 带 span 的解析器
// ---------------------------------------------------------------------------

#[derive(Debug, PartialEq, Eq)]
enum Stop {
    Limit,
    Invalid,
}

struct SpanParser<'a> {
    text: &'a str,
    bytes: &'a [u8],
    pos: usize,
    utf16: usize,
    nodes: Vec<TreeNode>,
    stats: Stats,
    truncated: bool,
    max_nodes: usize,
}

impl<'a> SpanParser<'a> {
    fn new(text: &'a str, max_nodes: usize) -> Self {
        Self {
            text,
            bytes: text.as_bytes(),
            pos: 0,
            utf16: 0,
            nodes: Vec::new(),
            stats: Stats {
                bytes: text.len(),
                ..Stats::default()
            },
            truncated: false,
            max_nodes: max_nodes.max(MIN_MAX_NODES),
        }
    }

    fn parse(mut self) -> Result<Analysis, Stop> {
        match self.value("root", "", None, 0) {
            Ok(root) => {
                self.skip_ws();
                if self.pos != self.bytes.len() {
                    return Err(Stop::Invalid);
                }
                Ok(self.finish(Some(root)))
            }
            Err(Stop::Limit) => {
                let root = (!self.nodes.is_empty()).then_some(0);
                Ok(self.finish(root))
            }
            Err(Stop::Invalid) => Err(Stop::Invalid),
        }
    }

    fn finish(self, root: Option<usize>) -> Analysis {
        Analysis {
            valid: true,
            issue: None,
            stats: self.stats,
            nodes: self.nodes,
            root,
            truncated: self.truncated,
        }
    }

    fn peek(&self) -> Option<u8> {
        self.bytes.get(self.pos).copied()
    }

    fn bump(&mut self) {
        let byte = self.bytes[self.pos];
        if byte < 0x80 {
            self.pos += 1;
            self.utf16 += 1;
        } else {
            let ch = self.text[self.pos..]
                .chars()
                .next()
                .expect("input is valid UTF-8");
            self.pos += ch.len_utf8();
            self.utf16 += ch.len_utf16();
        }
    }

    fn skip_ws(&mut self) {
        while matches!(
            self.peek(),
            Some(b' ') | Some(b'\t') | Some(b'\r') | Some(b'\n')
        ) {
            self.bump();
        }
    }

    fn expect(&mut self, byte: u8) -> Result<(), Stop> {
        self.skip_ws();
        if self.peek() == Some(byte) {
            self.bump();
            Ok(())
        } else {
            Err(Stop::Invalid)
        }
    }

    // Parser 内部一次性传入节点元数据，拆成结构体只会增加噪音。
    #[allow(clippy::too_many_arguments)]
    fn push(
        &mut self,
        key: &str,
        path: &str,
        parent: Option<usize>,
        depth: usize,
        kind: &'static str,
        start: usize,
        preview: String,
    ) -> Result<usize, Stop> {
        if self.nodes.len() >= self.max_nodes {
            self.truncated = true;
            return Err(Stop::Limit);
        }
        let id = self.nodes.len();
        self.nodes.push(TreeNode {
            id,
            parent,
            depth,
            key: key.to_string(),
            path: path.to_string(),
            kind,
            preview,
            children: Vec::new(),
            start,
            end: start,
            key_start: 0,
            key_end: 0,
        });
        self.stats.nodes += 1;
        self.stats.depth = self.stats.depth.max(depth);
        match kind {
            "object" => self.stats.objects += 1,
            "array" => self.stats.arrays += 1,
            _ => {}
        }
        Ok(id)
    }

    fn value(
        &mut self,
        key: &str,
        path: &str,
        parent: Option<usize>,
        depth: usize,
    ) -> Result<usize, Stop> {
        self.skip_ws();
        let start = self.utf16;
        match self.peek() {
            Some(b'{') => self.object(key, path, parent, depth, start),
            Some(b'[') => self.array(key, path, parent, depth, start),
            Some(b'"') => {
                let (decoded, _, _) = self.string()?;
                let preview = truncate(
                    &serde_json::to_string(&decoded).unwrap_or_else(|_| "\"\"".to_string()),
                    PREVIEW_LIMIT,
                );
                let id = self.push(key, path, parent, depth, "string", start, preview)?;
                self.nodes[id].end = self.utf16;
                Ok(id)
            }
            Some(b't') => self.literal("true", key, path, parent, depth, start, "boolean"),
            Some(b'f') => self.literal("false", key, path, parent, depth, start, "boolean"),
            Some(b'n') => self.literal("null", key, path, parent, depth, start, "null"),
            Some(b'-') | Some(b'0'..=b'9') => {
                let byte_start = self.pos;
                while matches!(
                    self.peek(),
                    Some(b'-')
                        | Some(b'+')
                        | Some(b'.')
                        | Some(b'e')
                        | Some(b'E')
                        | Some(b'0'..=b'9')
                ) {
                    self.bump();
                }
                let raw = &self.text[byte_start..self.pos];
                let id = self.push(
                    key,
                    path,
                    parent,
                    depth,
                    "number",
                    start,
                    truncate(raw, PREVIEW_LIMIT),
                )?;
                self.nodes[id].end = self.utf16;
                Ok(id)
            }
            _ => Err(Stop::Invalid),
        }
    }

    #[allow(clippy::too_many_arguments)]
    fn literal(
        &mut self,
        literal: &'static str,
        key: &str,
        path: &str,
        parent: Option<usize>,
        depth: usize,
        start: usize,
        kind: &'static str,
    ) -> Result<usize, Stop> {
        if !self.text[self.pos..].starts_with(literal) {
            return Err(Stop::Invalid);
        }
        for _ in 0..literal.len() {
            self.bump();
        }
        let id = self.push(key, path, parent, depth, kind, start, literal.to_string())?;
        self.nodes[id].end = self.utf16;
        Ok(id)
    }

    fn string(&mut self) -> Result<(String, usize, usize), Stop> {
        self.skip_ws();
        if self.peek() != Some(b'"') {
            return Err(Stop::Invalid);
        }
        let start = self.utf16;
        let byte_start = self.pos;
        self.bump();
        loop {
            match self.peek() {
                Some(b'"') => {
                    self.bump();
                    break;
                }
                Some(b'\\') => {
                    self.bump();
                    match self.peek() {
                        Some(b'u') => {
                            self.bump();
                            for _ in 0..4 {
                                let valid =
                                    self.peek().map(|b| b.is_ascii_hexdigit()).unwrap_or(false);
                                if !valid {
                                    return Err(Stop::Invalid);
                                }
                                self.bump();
                            }
                        }
                        Some(b'"') | Some(b'\\') | Some(b'/') | Some(b'b') | Some(b'f')
                        | Some(b'n') | Some(b'r') | Some(b't') => self.bump(),
                        _ => return Err(Stop::Invalid),
                    }
                }
                Some(byte) if byte < 0x20 => return Err(Stop::Invalid),
                Some(_) => self.bump(),
                None => return Err(Stop::Invalid),
            }
        }
        let raw = &self.text[byte_start..self.pos];
        let decoded = serde_json::from_str::<String>(raw).map_err(|_| Stop::Invalid)?;
        Ok((decoded, start, self.utf16))
    }

    fn object(
        &mut self,
        key: &str,
        path: &str,
        parent: Option<usize>,
        depth: usize,
        start: usize,
    ) -> Result<usize, Stop> {
        self.bump(); // {
        let id = self.push(key, path, parent, depth, "object", start, String::new())?;
        let mut count = 0usize;
        self.skip_ws();
        if self.peek() == Some(b'}') {
            self.bump();
        } else {
            loop {
                self.skip_ws();
                let (child_key, key_start, key_end) = self.string()?;
                self.skip_ws();
                self.expect(b':')?;
                let child_path = format!("{path}/{}", pointer_escape(&child_key));
                let child = self.value(&child_key, &child_path, Some(id), depth + 1)?;
                self.nodes[child].key_start = key_start;
                self.nodes[child].key_end = key_end;
                self.nodes[id].children.push(child);
                count += 1;
                self.skip_ws();
                match self.peek() {
                    Some(b',') => self.bump(),
                    Some(b'}') => {
                        self.bump();
                        break;
                    }
                    _ => return Err(Stop::Invalid),
                }
            }
        }
        self.nodes[id].preview = format!("object · {count} keys");
        self.nodes[id].end = self.utf16;
        Ok(id)
    }

    fn array(
        &mut self,
        key: &str,
        path: &str,
        parent: Option<usize>,
        depth: usize,
        start: usize,
    ) -> Result<usize, Stop> {
        self.bump(); // [
        let id = self.push(key, path, parent, depth, "array", start, String::new())?;
        let mut count = 0usize;
        self.skip_ws();
        if self.peek() == Some(b']') {
            self.bump();
        } else {
            loop {
                let child_key = count.to_string();
                let child_path = format!("{path}/{count}");
                let child = self.value(&child_key, &child_path, Some(id), depth + 1)?;
                self.nodes[id].children.push(child);
                count += 1;
                self.skip_ws();
                match self.peek() {
                    Some(b',') => self.bump(),
                    Some(b']') => {
                        self.bump();
                        break;
                    }
                    _ => return Err(Stop::Invalid),
                }
            }
        }
        self.nodes[id].preview = format!("array · {count} items");
        self.nodes[id].end = self.utf16;
        Ok(id)
    }
}

// ---------------------------------------------------------------------------
// 兜底：如果带 span 的解析出现意外（理论上不会，因为 serde_json 已验证），
// 仍用 Value 构建一棵没有 span 的树，保证编辑器可用。
// ---------------------------------------------------------------------------

struct WalkState {
    nodes: Vec<TreeNode>,
    stats: Stats,
    truncated: bool,
    max_nodes: usize,
}

impl WalkState {
    fn visit(
        &mut self,
        value: &Value,
        key: &str,
        path: &str,
        parent: Option<usize>,
        depth: usize,
    ) -> Option<usize> {
        if self.nodes.len() >= self.max_nodes {
            self.truncated = true;
            return None;
        }
        let id = self.nodes.len();
        let kind = kind_of(value);
        self.nodes.push(TreeNode {
            id,
            parent,
            depth,
            key: key.to_string(),
            path: path.to_string(),
            kind,
            preview: preview_of(value),
            children: Vec::new(),
            start: 0,
            end: 0,
            key_start: 0,
            key_end: 0,
        });
        self.stats.nodes += 1;
        self.stats.depth = self.stats.depth.max(depth);

        match value {
            Value::Object(map) => {
                self.stats.objects += 1;
                let keys: Vec<String> = map.keys().cloned().collect();
                for child_key in keys {
                    let Some(child) = map.get(&child_key) else {
                        continue;
                    };
                    let child_path = format!("{path}/{}", pointer_escape(&child_key));
                    if let Some(child_id) =
                        self.visit(child, &child_key, &child_path, Some(id), depth + 1)
                    {
                        if let Some(node) = self.nodes.get_mut(id) {
                            node.children.push(child_id);
                        }
                    }
                }
            }
            Value::Array(items) => {
                self.stats.arrays += 1;
                for (index, child) in items.iter().enumerate() {
                    let child_path = format!("{path}/{index}");
                    if let Some(child_id) =
                        self.visit(child, &index.to_string(), &child_path, Some(id), depth + 1)
                    {
                        if let Some(node) = self.nodes.get_mut(id) {
                            node.children.push(child_id);
                        }
                    }
                }
            }
            _ => {}
        }

        Some(id)
    }
}

fn kind_of(value: &Value) -> &'static str {
    match value {
        Value::Object(_) => "object",
        Value::Array(_) => "array",
        Value::String(_) => "string",
        Value::Number(_) => "number",
        Value::Bool(_) => "boolean",
        Value::Null => "null",
    }
}

fn preview_of(value: &Value) -> String {
    match value {
        Value::Object(map) => format!("object · {} keys", map.len()),
        Value::Array(items) => format!("array · {} items", items.len()),
        Value::String(text) => {
            let quoted = serde_json::to_string(text).unwrap_or_else(|_| "\"\"".to_string());
            truncate(&quoted, PREVIEW_LIMIT)
        }
        Value::Number(number) => truncate(&number.to_string(), PREVIEW_LIMIT),
        Value::Bool(boolean) => boolean.to_string(),
        Value::Null => "null".to_string(),
    }
}

fn analyze_fallback(value: &Value, bytes: usize, max_nodes: usize) -> Analysis {
    let mut state = WalkState {
        nodes: Vec::new(),
        stats: Stats {
            bytes,
            ..Stats::default()
        },
        truncated: false,
        max_nodes: max_nodes.max(MIN_MAX_NODES),
    };
    let root = state.visit(value, "root", "", None, 0);
    Analysis {
        valid: true,
        issue: None,
        stats: state.stats,
        nodes: state.nodes,
        root,
        truncated: state.truncated,
    }
}

pub fn analyze(text: &str) -> Analysis {
    analyze_with_limit(text, DEFAULT_MAX_NODES)
}

pub fn analyze_with_limit(text: &str, max_nodes: usize) -> Analysis {
    let max_nodes = max_nodes.clamp(MIN_MAX_NODES, DEFAULT_MAX_NODES);
    let bytes = text.len();
    if text.trim().is_empty() {
        return Analysis {
            valid: false,
            issue: None,
            stats: Stats {
                bytes,
                ..Stats::default()
            },
            nodes: Vec::new(),
            root: None,
            truncated: false,
        };
    }

    match serde_json::from_str::<Value>(text) {
        Ok(value) => match SpanParser::new(text, max_nodes).parse() {
            Ok(analysis) => analysis,
            Err(_) => analyze_fallback(&value, bytes, max_nodes),
        },
        Err(error) => Analysis {
            valid: false,
            issue: Some(Issue {
                message: humanize(&error.to_string()),
                line: error.line(),
                column: error.column(),
            }),
            stats: Stats {
                bytes,
                ..Stats::default()
            },
            nodes: Vec::new(),
            root: None,
            truncated: false,
        },
    }
}

// ---------------------------------------------------------------------------
// 格式化 / 压缩
// ---------------------------------------------------------------------------

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

pub fn format(text: &str, indent: u8, sort_keys: bool) -> Result<String, JsonError> {
    let mut value: Value = serde_json::from_str(text).map_err(JsonError::from_serde)?;
    if sort_keys {
        sort_value(&mut value);
    }
    let indent_bytes: Vec<u8> = match indent {
        0 => b"\t".to_vec(),
        4 => b"    ".to_vec(),
        _ => b"  ".to_vec(),
    };
    let formatter = PrettyFormatter::with_indent(&indent_bytes);
    let mut buffer = Vec::with_capacity(text.len() + 64);
    {
        let mut serializer = serde_json::Serializer::with_formatter(&mut buffer, formatter);
        value
            .serialize(&mut serializer)
            .map_err(JsonError::from_serde)?;
    }
    String::from_utf8(buffer).map_err(|_| JsonError::plain("输出不是合法的 UTF-8"))
}

pub fn minify(text: &str) -> Result<String, JsonError> {
    let value: Value = serde_json::from_str(text).map_err(JsonError::from_serde)?;
    serde_json::to_string(&value).map_err(JsonError::from_serde)
}

#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE: &str = r#"{
  "users": [
    { "id": 1, "name": "Ada", "age": 32 },
    { "id": 2, "name": "Bob", "age": 17 }
  ],
  "version": "1.4.0",
  "debug": true,
  "paths": { "home": "/usr", "tmp": "/tmp" }
}"#;

    fn node_by_path<'a>(analysis: &'a Analysis, path: &str) -> &'a TreeNode {
        analysis
            .nodes
            .iter()
            .find(|node| node.path == path)
            .unwrap_or_else(|| panic!("missing path {path}"))
    }

    #[test]
    fn analyzes_sample() {
        let analysis = analyze(SAMPLE);
        assert!(analysis.valid);
        assert!(analysis.issue.is_none());
        assert_eq!(analysis.root, Some(0));
        assert_eq!(analysis.nodes[0].key, "root");
        assert_eq!(analysis.nodes[0].kind, "object");
        assert!(analysis.stats.nodes > 10);
        assert_eq!(analysis.stats.depth, 3);
    }

    #[test]
    fn root_span_covers_whole_document() {
        let analysis = analyze(SAMPLE);
        let root = &analysis.nodes[0];
        assert_eq!(root.start, 0);
        assert_eq!(root.end, SAMPLE.encode_utf16().count());
    }

    #[test]
    fn spans_use_utf16_offsets() {
        let text = r#"{"a": "😀", "b": 1}"#;
        let analysis = analyze(text);
        let node = node_by_path(&analysis, "/a");
        assert_eq!(node.start, 6);
        assert_eq!(node.end, 10);
        assert_eq!(node.preview, "\"😀\"");

        let text = r#"{"名": "值"}"#;
        let analysis = analyze(text);
        let node = node_by_path(&analysis, "/名");
        assert_eq!(node.start, 6);
        assert_eq!(node.end, 9);
    }

    #[test]
    fn node_limit_marks_truncated() {
        let text = format!(
            "[{}]",
            (0..2_000)
                .map(|i| i.to_string())
                .collect::<Vec<_>>()
                .join(",")
        );
        let analysis = analyze_with_limit(&text, 1_000);
        assert!(analysis.valid);
        assert!(analysis.truncated);
        assert!(analysis.nodes.len() <= 1_000);
        assert_eq!(analysis.root, Some(0));
    }

    #[test]
    fn key_spans_cover_quoted_key() {
        let analysis = analyze(r#"{"name": 1}"#);
        let node = node_by_path(&analysis, "/name");
        assert_eq!((node.key_start, node.key_end), (1, 7));
        assert_eq!((node.start, node.end), (9, 10));
    }

    #[test]
    fn nested_span_is_inside_parent() {
        let analysis = analyze(SAMPLE);
        let users = node_by_path(&analysis, "/users");
        let first = node_by_path(&analysis, "/users/0");
        let name = node_by_path(&analysis, "/users/0/name");
        assert!(users.start < first.start && first.end < users.end);
        assert!(first.start < name.start && name.end < first.end);
    }

    #[test]
    fn decodes_escaped_keys_for_paths() {
        let text = r#"{"a\"b": 1, "c\/d": 2}"#;
        let analysis = analyze(text);
        assert_eq!(node_by_path(&analysis, "/a\"b").key, "a\"b");
        assert_eq!(node_by_path(&analysis, "/c~1d").key, "c/d");
    }

    #[test]
    fn reports_line_and_column() {
        let analysis = analyze("{\n  \"a\": 1,\n  \"b\" 2\n}");
        assert!(!analysis.valid);
        let issue = analysis.issue.expect("issue");
        assert_eq!(issue.line, 3);
        assert!(!issue.message.is_empty());
    }

    #[test]
    fn empty_text_has_no_issue() {
        let analysis = analyze("   ");
        assert!(!analysis.valid);
        assert!(analysis.issue.is_none());
        assert!(analysis.nodes.is_empty());
    }

    #[test]
    fn keeps_big_numbers() {
        let output = format(r#"{"id": 5334966637011395588}"#, 2, false).expect("format");
        assert!(output.contains("5334966637011395588"));
        assert!(!output.contains("5334966637011395584"));
    }

    #[test]
    fn sorts_keys_recursively() {
        let output = format(r#"{"b": 1, "a": {"d": 2, "c": 3}}"#, 2, true).expect("format");
        assert!(output.find("\"a\"").unwrap() < output.find("\"b\"").unwrap());
        assert!(output.find("\"c\"").unwrap() < output.find("\"d\"").unwrap());
    }

    #[test]
    fn format_is_idempotent() {
        let once = format(SAMPLE, 2, false).expect("format");
        let twice = format(&once, 2, false).expect("format");
        assert_eq!(once, twice);
    }

    #[test]
    fn minify_removes_whitespace() {
        let output = minify(SAMPLE).expect("minify");
        assert!(!output.contains('\n'));
        assert!(output.contains("\"version\":\"1.4.0\""));
    }

    #[test]
    fn format_preserves_key_order() {
        let output = format(r#"{"z": 1, "a": 2}"#, 2, false).expect("format");
        assert!(output.find("\"z\"").unwrap() < output.find("\"a\"").unwrap());
    }

    #[test]
    fn scalar_root_has_span() {
        let analysis = analyze("42");
        assert!(analysis.valid);
        assert_eq!(analysis.nodes[0].kind, "number");
        assert_eq!(analysis.nodes[0].start, 0);
        assert_eq!(analysis.nodes[0].end, 2);
    }
}
