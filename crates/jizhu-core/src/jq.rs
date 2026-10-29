//! 内置 jq 引擎（jaq），只做纯计算，不做 IO。
//!
//! 真正的执行隔离在 `src-tauri` 的 worker 子进程里；这里只负责解析、编译与求值。

use jaq_core::load::{Arena, File, Loader};
use jaq_core::{data, unwrap_valr, Compiler, Ctx, Vars};
use jaq_json::write::{write, Pp};
use jaq_json::{read, Val};

/// 与 Cargo.toml 中的 jaq-core / jaq-std 版本保持一致。
pub const JAQ_VERSION: &str = "3.1";

#[derive(Debug, Clone)]
pub struct JqError {
    pub message: String,
}

impl JqError {
    fn new(message: impl Into<String>) -> Self {
        Self {
            message: message.into(),
        }
    }
}

/// 对每个输出调用 `emit`（紧凑 JSON 一行），返回 false 可提前停止。
pub fn eval(input: &str, program: &str, emit: impl FnMut(&str) -> bool) -> Result<(), JqError> {
    eval_mode(input, program, false, emit)
}

/// 同 `eval`；`raw` 为 true 时字符串输出不带 JSON 引号（等价 jq -r）。
pub fn eval_raw(
    input: &str,
    program: &str,
    raw: bool,
    emit: impl FnMut(&str) -> bool,
) -> Result<(), JqError> {
    eval_mode(input, program, raw, emit)
}

fn eval_mode(
    input: &str,
    program: &str,
    raw: bool,
    mut emit: impl FnMut(&str) -> bool,
) -> Result<(), JqError> {
    if program.trim().is_empty() {
        return Err(JqError::new("请输入 jq 表达式"));
    }

    let defs = jaq_core::defs()
        .chain(jaq_std::defs())
        .chain(jaq_json::defs());
    let funs = jaq_core::funs()
        .chain(jaq_std::funs())
        .chain(jaq_json::funs());

    let arena = Arena::default();
    let loader = Loader::new(defs);
    let modules = loader
        .load(
            &arena,
            File {
                code: program,
                path: (),
            },
        )
        .map_err(|errors| JqError::new(format_load_errors(errors)))?;

    let filter = Compiler::default()
        .with_funs(funs)
        .compile(modules)
        .map_err(|errors| JqError::new(format_compile_errors(errors)))?;

    let pp = Pp::<String> {
        indent: None,
        sep_space: false,
        ..Pp::default()
    };

    // jq 的输入是 JSON 值流：既支持单个文档，也支持 JSON Lines。
    'inputs: for parsed in read::parse_many(input.as_bytes()) {
        let value = parsed.map_err(|error| JqError::new(format!("输入不是有效 JSON：{error}")))?;
        let ctx = Ctx::<data::JustLut<Val>>::new(&filter.lut, Vars::new([]));
        for item in filter.id.run((ctx, value)) {
            match unwrap_valr(item) {
                Ok(value) => {
                    if raw {
                        if let Val::TStr(text) | Val::BStr(text) = &value {
                            let line = String::from_utf8_lossy(text);
                            if !emit(&line) {
                                break 'inputs;
                            }
                            continue;
                        }
                    }
                    let mut buffer = Vec::new();
                    write(&mut buffer, &pp, 0, &value)
                        .map_err(|error| JqError::new(format!("输出序列化失败：{error}")))?;
                    let line = String::from_utf8_lossy(&buffer);
                    if !emit(&line) {
                        break 'inputs;
                    }
                }
                Err(error) => return Err(JqError::new(error.to_string())),
            }
        }
    }

    Ok(())
}

/// 测试与简单调用用：收集所有输出。
pub fn eval_to_lines(input: &str, program: &str) -> Result<Vec<String>, JqError> {
    let mut lines = Vec::new();
    eval(input, program, |line| {
        lines.push(line.to_string());
        true
    })?;
    Ok(lines)
}

fn format_load_errors(errors: Vec<(File<&str, ()>, jaq_core::load::Error<&str>)>) -> String {
    let mut parts = Vec::new();
    for (_file, error) in errors {
        match error {
            jaq_core::load::Error::Io(items) => {
                for (_path, message) in items {
                    parts.push(message);
                }
            }
            jaq_core::load::Error::Lex(items) => {
                for (expect, token) in items {
                    parts.push(format!("无法识别 `{token}`，期望 {}", expect.as_str()));
                }
            }
            jaq_core::load::Error::Parse(items) => {
                for (expect, _token) in items {
                    parts.push(format!("语法错误，期望 {}", expect.as_str()));
                }
            }
        }
    }
    if parts.is_empty() {
        "jq 表达式解析失败".to_string()
    } else {
        parts.join("；")
    }
}

type CompileError<'a> = (
    File<&'a str, ()>,
    Vec<(&'a str, jaq_core::compile::Undefined)>,
);

fn format_compile_errors(errors: Vec<CompileError<'_>>) -> String {
    let mut parts = Vec::new();
    for (_file, items) in errors {
        for (name, undefined) in items {
            parts.push(format!("未定义的{} `{name}`", undefined.as_str()));
        }
    }
    if parts.is_empty() {
        "jq 表达式编译失败".to_string()
    } else {
        parts.join("；")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const DOC: &str = r#"{
      "users": [
        { "id": 1, "name": "Ada", "age": 32 },
        { "id": 2, "name": "Bob", "age": 17 },
        { "id": 3, "name": "Coco", "age": 25 }
      ],
      "version": "1.4.0"
    }"#;

    #[test]
    fn filters_users() {
        let lines = eval_to_lines(DOC, ".users[] | select(.age >= 18)").expect("eval");
        assert_eq!(lines.len(), 2);
        assert!(lines[0].contains("\"name\":\"Ada\""));
        assert!(lines[1].contains("\"name\":\"Coco\""));
    }

    #[test]
    fn maps_and_lengths() {
        let lines = eval_to_lines(DOC, "[.users[].name] | length").expect("eval");
        assert_eq!(lines, vec!["3"]);
    }

    #[test]
    fn supports_std_functions() {
        let lines = eval_to_lines(r#"{"b":1,"a":2}"#, "keys").expect("eval");
        assert_eq!(lines, vec![r#"["a","b"]"#]);
    }

    #[test]
    fn keeps_large_integers() {
        let lines = eval_to_lines(r#"{"id":5334966637011395588}"#, ".id").expect("eval");
        assert_eq!(lines, vec!["5334966637011395588"]);
    }

    #[test]
    fn reports_compile_error() {
        let error = eval_to_lines(DOC, "select(").expect_err("should fail");
        assert!(!error.message.is_empty());
        assert!(error.message.contains("语法") || error.message.contains("期望"));
    }

    #[test]
    fn reports_runtime_error() {
        let error = eval_to_lines("null", r#"error("boom")"#).expect_err("should fail");
        assert!(error.message.contains("boom"));
    }

    #[test]
    fn evaluates_json_lines() {
        let lines = eval_to_lines("{\"a\":1}\n{\"a\":2}\n{\"a\":3}", ".a").expect("eval");
        assert_eq!(lines, vec!["1", "2", "3"]);
    }

    #[test]
    fn evaluates_selected_json_lines() {
        let input = "{\"user\":\"ada\",\"score\":91}\n{\"user\":\"bob\",\"score\":72}\n";
        let lines = eval_to_lines(input, "select(.score > 80) | .user").expect("eval");
        assert_eq!(lines, vec![r#""ada""#]);
    }

    #[test]
    fn raw_mode_unquotes_strings() {
        let input = "{\"payload\":\"abc\"}\n{\"payload\":\"def\"}\n";
        let mut lines = Vec::new();
        eval_raw(input, ".payload", true, |line| {
            lines.push(line.to_string());
            true
        })
        .expect("raw eval");
        assert_eq!(lines, vec!["abc", "def"]);
    }

    #[test]
    fn raw_mode_keeps_non_strings_as_json() {
        let mut lines = Vec::new();
        eval_raw("{\"n\":1}", ".n", true, |line| {
            lines.push(line.to_string());
            true
        })
        .expect("raw eval");
        assert_eq!(lines, vec!["1"]);
    }

    #[test]
    fn empty_input_yields_nothing() {
        let lines = eval_to_lines("   \n", ".").expect("eval");
        assert!(lines.is_empty());
    }

    #[test]
    fn empty_program_is_rejected() {
        let error = eval_to_lines("null", "   ").expect_err("should fail");
        assert!(error.message.contains("请输入"));
    }
}
