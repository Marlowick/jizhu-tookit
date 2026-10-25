use serde::Deserialize;
use std::io::{self, Read, Write};

#[derive(Deserialize)]
struct Request {
    input: String,
    program: String,
    #[serde(default)]
    raw: bool,
}

#[derive(Deserialize)]
struct RegexRequest {
    text: String,
    pattern: String,
    flags: jizhu_core::regex::RegexFlags,
}

pub fn run(args: &[String]) -> i32 {
    match args.first().map(String::as_str) {
        Some("jaq") => run_jaq(),
        Some("regex") => run_regex(),
        Some(other) => {
            eprintln!("[jizhu-jq] 未知 worker：{other}");
            2
        }
        None => {
            eprintln!("[jizhu-jq] 缺少 worker 类型");
            2
        }
    }
}

fn run_jaq() -> i32 {
    let mut raw = String::new();
    if let Err(error) = io::stdin().take(65 * 1024 * 1024).read_to_string(&mut raw) {
        eprintln!("[jizhu-jq] 读取请求失败：{error}");
        return 2;
    }
    let request: Request = match serde_json::from_str(&raw) {
        Ok(request) => request,
        Err(error) => {
            eprintln!("[jizhu-jq] 请求解析失败：{error}");
            return 2;
        }
    };

    let stdout = io::stdout();
    let mut out = io::BufWriter::new(stdout.lock());
    let result = jizhu_core::jq::eval_raw(&request.input, &request.program, request.raw, |line| {
        writeln!(out, "{line}").is_ok()
    });
    let _ = out.flush();

    match result {
        Ok(()) => 0,
        Err(error) => {
            eprintln!("[jizhu-jq] {}", error.message);
            1
        }
    }
}

fn run_regex() -> i32 {
    let mut raw = String::new();
    if let Err(error) = io::stdin().take(16 * 1024 * 1024).read_to_string(&mut raw) {
        eprintln!("[jizhu-regex] 读取请求失败：{error}");
        return 2;
    }
    let request: RegexRequest = match serde_json::from_str(&raw) {
        Ok(request) => request,
        Err(error) => {
            eprintln!("[jizhu-regex] 请求解析失败：{error}");
            return 2;
        }
    };
    let outcome = jizhu_core::regex::search(&request.text, &request.pattern, &request.flags);
    let stdout = io::stdout();
    let mut out = stdout.lock();
    if let Err(error) = serde_json::to_writer(&mut out, &outcome) {
        eprintln!("[jizhu-regex] 输出失败：{error}");
        return 2;
    }
    let _ = writeln!(out);
    0
}
