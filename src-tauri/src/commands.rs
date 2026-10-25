use crate::jq;
use jizhu_core::diff::{self, DiffError, DiffOptions, DiffResult, UrlDiffResult};
use jizhu_core::json::{self, Analysis, JsonError};
use jizhu_core::regex::{RegexFlags, RegexOutcome};
use serde::Serialize;
use std::path::{Path, PathBuf};
use tauri::AppHandle;
use tauri_plugin_clipboard_manager::ClipboardExt;
use tauri_plugin_dialog::DialogExt;

const MAX_FILE_BYTES: u64 = 100 * 1024 * 1024;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenedFile {
    pub name: String,
    pub content: String,
    pub bytes: usize,
}

/// 前端挂载完成后握手一次。MVP 里用于在 dev 日志确认 WebView 已加载。
#[tauri::command]
pub fn ui_ready() {
    #[cfg(debug_assertions)]
    eprintln!("[jizhu] webview ready");
}

#[tauri::command]
pub fn json_analyze(text: String, max_nodes: Option<usize>) -> Analysis {
    let limit = max_nodes.unwrap_or(jizhu_core::json::DEFAULT_MAX_NODES);
    json::analyze_with_limit(&text, limit)
}

#[tauri::command]
pub fn json_format(text: String, indent: u8, sort_keys: bool) -> Result<String, JsonError> {
    json::format(&text, indent, sort_keys)
}

#[tauri::command]
pub fn json_minify(text: String) -> Result<String, JsonError> {
    json::minify(&text)
}

fn file_name(path: &Path) -> String {
    path.file_name()
        .and_then(|name| name.to_str())
        .map(str::to_string)
        .unwrap_or_else(|| "未命名.json".to_string())
}

fn validate_size(bytes: u64) -> Result<(), String> {
    if bytes > MAX_FILE_BYTES {
        return Err("文件超过 100MB，暂不支持".to_string());
    }
    Ok(())
}

#[tauri::command]
pub async fn open_text_file(app: AppHandle) -> Result<Option<OpenedFile>, String> {
    let picked = tauri::async_runtime::spawn_blocking(move || {
        app.dialog()
            .file()
            .add_filter("JSON / 文本", &["json", "txt", "log"])
            .blocking_pick_file()
    })
    .await
    .map_err(|error| error.to_string())?;

    let Some(file_path) = picked else {
        return Ok(None);
    };
    let path = file_path.into_path().map_err(|error| error.to_string())?;
    let metadata =
        std::fs::metadata(&path).map_err(|error| format!("无法读取文件信息：{error}"))?;
    if !metadata.is_file() {
        return Err("请选择文件，而不是目录".to_string());
    }
    validate_size(metadata.len())?;

    let content = std::fs::read_to_string(&path)
        .map_err(|_| "无法读取文件：目前只支持 UTF-8 文本".to_string())?;
    Ok(Some(OpenedFile {
        name: file_name(&path),
        content,
        bytes: metadata.len() as usize,
    }))
}

#[tauri::command]
pub async fn save_binary_file(
    app: AppHandle,
    suggested_name: String,
    bytes: Vec<u8>,
) -> Result<Option<String>, String> {
    if bytes.len() as u64 > MAX_FILE_BYTES {
        return Err("文件超过 100MB 上限".to_string());
    }
    let extension = std::path::Path::new(&suggested_name)
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();

    let picked = tauri::async_runtime::spawn_blocking(move || {
        let mut dialog = app.dialog().file().set_file_name(&suggested_name);
        if extension == "svg" {
            dialog = dialog.add_filter("SVG", &["svg"]);
        } else {
            dialog = dialog.add_filter("PNG", &["png"]);
        }
        dialog.blocking_save_file()
    })
    .await
    .map_err(|error| error.to_string())?;

    let Some(file_path) = picked else {
        return Ok(None);
    };
    let path = file_path.into_path().map_err(|error| error.to_string())?;
    atomic_write(&path, &bytes)?;
    Ok(Some(file_name(&path)))
}

#[tauri::command]
pub async fn save_text_file(
    app: AppHandle,
    suggested_name: String,
    content: String,
) -> Result<Option<String>, String> {
    validate_size(content.len() as u64)?;

    let picked = tauri::async_runtime::spawn_blocking(move || {
        app.dialog()
            .file()
            .set_file_name(&suggested_name)
            .add_filter("JSON", &["json"])
            .add_filter("文本", &["txt"])
            .blocking_save_file()
    })
    .await
    .map_err(|error| error.to_string())?;

    let Some(file_path) = picked else {
        return Ok(None);
    };
    let path = file_path.into_path().map_err(|error| error.to_string())?;
    atomic_write(&path, content.as_bytes())?;
    Ok(Some(file_name(&path)))
}

fn atomic_write(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let parent = path.parent().ok_or_else(|| "无效的保存路径".to_string())?;
    let temp: PathBuf = parent.join(format!(
        ".{}.jizhu-tmp",
        path.file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("jizhu")
    ));
    std::fs::write(&temp, bytes).map_err(|error| format!("写入失败：{error}"))?;
    std::fs::rename(&temp, path).map_err(|error| {
        let _ = std::fs::remove_file(&temp);
        format!("保存失败：{error}")
    })
}

#[tauri::command]
pub fn diff_text(a: String, b: String, options: DiffOptions) -> DiffResult {
    diff::diff_text(&a, &b, &options)
}

#[tauri::command]
pub fn diff_json(a: String, b: String, options: DiffOptions) -> Result<DiffResult, DiffError> {
    diff::diff_json(&a, &b, &options)
}

#[tauri::command]
pub fn diff_url(a: String, b: String, options: DiffOptions) -> Result<UrlDiffResult, DiffError> {
    diff::diff_url(&a, &b, &options)
}

#[tauri::command]
pub async fn regex_run(text: String, pattern: String, flags: RegexFlags) -> RegexOutcome {
    match tauri::async_runtime::spawn_blocking(move || crate::regex::run(text, pattern, flags))
        .await
    {
        Ok(outcome) => outcome,
        Err(error) => RegexOutcome {
            matches: Vec::new(),
            count: 0,
            unique: 0,
            duration_ms: 0,
            error: Some(jizhu_core::regex::RegexError {
                message: error.to_string(),
                kind: "worker".to_string(),
            }),
            truncated: false,
        },
    }
}

#[tauri::command]
pub fn jq_engines() -> jq::EngineInfo {
    jq::engines()
}

#[tauri::command]
pub async fn jq_run(
    input: String,
    program: String,
    engine: Option<String>,
    raw: Option<bool>,
) -> Result<jq::JqOutcome, String> {
    tauri::async_runtime::spawn_blocking(move || {
        jq::run(input, program, engine, raw.unwrap_or(false))
    })
    .await
    .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn copy_text(app: AppHandle, text: String) -> Result<(), String> {
    app.clipboard()
        .write_text(text)
        .map_err(|error| error.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use jizhu_core::diff::DiffOptions;

    #[test]
    fn diff_commands_roundtrip() {
        let options = DiffOptions::default();
        let text = diff_text("a\nb".to_string(), "a\nc".to_string(), options.clone());
        assert_eq!(text.stats.differences, 1);

        let json = diff_json(
            r#"{"a":1}"#.to_string(),
            r#"{"a":2}"#.to_string(),
            options.clone(),
        )
        .expect("json diff");
        assert_eq!(json.stats.differences, 1);

        let url = diff_url(
            "https://example.com/?a=1".to_string(),
            "https://example.com/?a=2".to_string(),
            options,
        )
        .expect("url diff");
        assert_eq!(url.stats.differences, 1);
    }
}
