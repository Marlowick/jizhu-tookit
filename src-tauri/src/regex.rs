use jizhu_core::regex::{self, RegexFlags, RegexOutcome};
use serde::{Deserialize, Serialize};
use std::fs;
use std::process::Command;
use std::time::{Duration, Instant};

const MAX_TEXT: usize = 4 * 1024 * 1024;
const MAX_OUTPUT: usize = 8 * 1024 * 1024;
const TIMEOUT: Duration = Duration::from_millis(300);

#[derive(Serialize, Deserialize)]
struct WorkerRequest {
    text: String,
    pattern: String,
    flags: RegexFlags,
}

fn failure(message: impl Into<String>, kind: &str, started: Instant) -> RegexOutcome {
    RegexOutcome {
        matches: Vec::new(),
        count: 0,
        unique: 0,
        duration_ms: started.elapsed().as_millis() as u64,
        error: Some(regex::RegexError {
            message: message.into(),
            kind: kind.to_string(),
        }),
        truncated: false,
    }
}

pub fn run(text: String, pattern: String, flags: RegexFlags) -> RegexOutcome {
    let started = Instant::now();
    if text.len() > MAX_TEXT {
        return failure("文本超过 4MB，正则面板暂不处理", "limit", started);
    }
    if pattern.trim().is_empty() {
        return failure("请输入正则表达式", "input", started);
    }
    if pattern.len() > 8 * 1024 {
        return failure("正则表达式过长", "limit", started);
    }

    let dir = match crate::jq::make_temp_dir() {
        Ok(dir) => dir,
        Err(error) => return failure(format!("无法创建临时目录：{error}"), "io", started),
    };
    let executable = match std::env::current_exe() {
        Ok(path) => path,
        Err(error) => {
            let _ = fs::remove_dir_all(&dir);
            return failure(format!("无法定位可执行文件：{error}"), "io", started);
        }
    };
    let request = match serde_json::to_vec(&WorkerRequest {
        text,
        pattern,
        flags,
    }) {
        Ok(request) => request,
        Err(error) => {
            let _ = fs::remove_dir_all(&dir);
            return failure(format!("请求序列化失败：{error}"), "io", started);
        }
    };

    let mut command = Command::new(executable);
    command.arg("--worker").arg("regex");
    let result = crate::jq::run_limited(command, &request, TIMEOUT, MAX_OUTPUT, &dir);
    let _ = fs::remove_dir_all(&dir);

    let output = match result {
        Ok(output) => output,
        Err(error) => {
            return failure(format!("无法启动 regex worker：{error}"), "io", started);
        }
    };
    if output.timed_out {
        return failure(
            "正则执行超过 300ms，已终止；可能存在灾难性回溯（ReDoS）",
            "timeout",
            started,
        );
    }
    if output.output_limit {
        return failure("正则结果超过输出上限", "limit", started);
    }
    if !output
        .status
        .map(|status| status.success())
        .unwrap_or(false)
    {
        let message = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return failure(
            if message.is_empty() {
                "regex worker 异常退出".to_string()
            } else {
                message
            },
            "worker",
            started,
        );
    }
    match serde_json::from_slice::<RegexOutcome>(&output.stdout) {
        Ok(mut outcome) => {
            outcome.duration_ms = started.elapsed().as_millis() as u64;
            outcome
        }
        Err(error) => failure(
            format!("无法解析 regex worker 输出：{error}"),
            "worker",
            started,
        ),
    }
}
