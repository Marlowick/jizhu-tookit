use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Instant;

const MAX_BODY: usize = 5 * 1024 * 1024;
const MAX_HEADERS: usize = 1024 * 1024;
const MAX_ERROR: usize = 64 * 1024;

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CurlRequest {
    pub method: String,
    pub url: String,
    pub headers: BTreeMap<String, String>,
    pub body: Option<String>,
    pub follow_redirects: bool,
    pub insecure: bool,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CurlResponse {
    pub status: u16,
    pub status_text: String,
    pub headers: Vec<(String, String)>,
    pub body: String,
    pub duration_ms: u64,
    pub size: usize,
    pub truncated: bool,
}

struct HeaderBlock {
    status: u16,
    status_text: String,
    headers: Vec<(String, String)>,
}

fn curl_path() -> Option<PathBuf> {
    for candidate in [
        "/usr/bin/curl",
        "/opt/homebrew/bin/curl",
        "/usr/local/bin/curl",
    ] {
        let path = PathBuf::from(candidate);
        if path.is_file() {
            return Some(path);
        }
    }
    None
}

fn make_temp_dir() -> std::io::Result<PathBuf> {
    static SEQ: AtomicU64 = AtomicU64::new(0);
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or(0);
    let seq = SEQ.fetch_add(1, Ordering::Relaxed);
    let path =
        std::env::temp_dir().join(format!("jizhu-curl-{}-{nanos}-{seq}", std::process::id()));
    fs::create_dir(&path)?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(&path, fs::Permissions::from_mode(0o700))?;
    }
    Ok(path)
}

fn parse_headers(path: &Path) -> Result<HeaderBlock, String> {
    let raw = fs::read(path).map_err(|error| format!("读取响应头失败：{error}"))?;
    if raw.len() > MAX_HEADERS {
        return Err("响应头超过 1MB".to_string());
    }
    let text = String::from_utf8_lossy(&raw);
    let mut block = HeaderBlock {
        status: 0,
        status_text: String::new(),
        headers: Vec::new(),
    };
    for line in text.lines() {
        let line = line.trim_end_matches('\r');
        if line.is_empty() {
            continue;
        }
        if line.starts_with("HTTP/") {
            block.headers.clear();
            let mut parts = line.split_whitespace();
            let _version = parts.next();
            block.status = parts
                .next()
                .and_then(|value| value.parse().ok())
                .unwrap_or(0);
            block.status_text = parts.collect::<Vec<_>>().join(" ");
            continue;
        }
        if let Some((name, value)) = line.split_once(':') {
            block
                .headers
                .push((name.trim().to_string(), value.trim().to_string()));
        }
    }
    if block.status == 0 {
        return Err("curl 没有返回 HTTP 状态行".to_string());
    }
    Ok(block)
}

fn read_capped(path: &Path, cap: usize) -> Result<(Vec<u8>, bool), String> {
    let raw = fs::read(path).map_err(|error| format!("读取响应体失败：{error}"))?;
    if raw.len() > cap {
        return Ok((raw[..cap].to_vec(), true));
    }
    Ok((raw, false))
}

fn validate_request(request: &CurlRequest) -> Result<(), String> {
    if !request.url.starts_with("http://") && !request.url.starts_with("https://") {
        return Err("URL 只支持 http:// 或 https://".to_string());
    }
    if request
        .url
        .chars()
        .any(|char| char.is_whitespace() || char.is_control())
    {
        return Err("URL 包含空白或控制字符".to_string());
    }
    if request.method.is_empty()
        || request.method.len() > 32
        || !request
            .method
            .chars()
            .all(|char| char.is_ascii_alphabetic())
    {
        return Err("HTTP method 非法".to_string());
    }
    if request
        .body
        .as_ref()
        .is_some_and(|body| body.len() > 4 * 1024 * 1024)
    {
        return Err("请求体超过 4MB".to_string());
    }
    for (name, value) in &request.headers {
        if name.is_empty()
            || name
                .chars()
                .any(|char| char == '\r' || char == '\n' || char == ':')
            || value.chars().any(|char| char == '\r' || char == '\n')
        {
            return Err("请求头包含非法字符".to_string());
        }
    }
    Ok(())
}

fn execute(request: CurlRequest) -> Result<CurlResponse, String> {
    validate_request(&request)?;
    let curl = curl_path().ok_or_else(|| "未找到可用的系统 curl".to_string())?;
    let dir = make_temp_dir().map_err(|error| format!("无法创建临时目录：{error}"))?;
    let headers_path = dir.join("headers");
    let body_path = dir.join("body");
    let started = Instant::now();

    let mut command = Command::new(&curl);
    command
        .env_clear()
        .env("LC_ALL", "C")
        .arg("-q")
        .arg("--silent")
        .arg("--show-error")
        .arg("--no-progress-meter")
        .arg("--globoff")
        .arg("--proto")
        .arg("=http,https")
        .arg("--connect-timeout")
        .arg("8")
        .arg("--max-time")
        .arg("20")
        .arg("--max-filesize")
        .arg(MAX_BODY.to_string())
        .arg("--max-redirs")
        .arg("5")
        .arg("--request")
        .arg(&request.method)
        .arg("--dump-header")
        .arg(&headers_path)
        .arg("--output")
        .arg(&body_path)
        .arg("--write-out")
        .arg("%{http_code}\\n%{time_total}\\n%{size_download}")
        .arg("--url")
        .arg(&request.url)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    if request.follow_redirects {
        command.arg("--location");
    }
    if request.insecure {
        command.arg("--insecure");
    }
    for (name, value) in &request.headers {
        command.arg("--header").arg(format!("{name}: {value}"));
    }
    if request.body.is_some() {
        command.arg("--data-binary").arg("@-");
    }

    let mut child = command
        .spawn()
        .map_err(|error| format!("无法启动 curl：{error}"))?;
    if let Some(body) = request.body.as_ref() {
        let mut stdin = child
            .stdin
            .take()
            .ok_or_else(|| "curl stdin 不可用".to_string())?;
        stdin
            .write_all(body.as_bytes())
            .map_err(|error| format!("写入请求体失败：{error}"))?;
    }
    drop(child.stdin.take());
    let output = child
        .wait_with_output()
        .map_err(|error| format!("等待 curl 失败：{error}"))?;

    if !output.status.success() {
        let _ = fs::remove_dir_all(&dir);
        let stderr = String::from_utf8_lossy(&output.stderr);
        let message = stderr.trim();
        return Err(if message.is_empty() {
            format!("curl 退出码 {}", output.status.code().unwrap_or(-1))
        } else {
            message.chars().take(MAX_ERROR).collect()
        });
    }

    let header_result = parse_headers(&headers_path);
    let body_result = read_capped(&body_path, MAX_BODY);
    let _ = fs::remove_dir_all(&dir);
    let header_block = header_result?;
    let (body, truncated) = body_result?;
    let meta = String::from_utf8_lossy(&output.stdout);
    let mut lines = meta.lines();
    lines.next();
    let duration = lines
        .next()
        .and_then(|value| value.trim().parse::<f64>().ok())
        .map(|seconds| (seconds * 1000.0).round() as u64)
        .unwrap_or_else(|| started.elapsed().as_millis() as u64);
    let size = lines
        .next()
        .and_then(|value| value.trim().parse::<usize>().ok())
        .unwrap_or(body.len());

    Ok(CurlResponse {
        status: header_block.status,
        status_text: header_block.status_text,
        headers: header_block.headers,
        body: String::from_utf8_lossy(&body).to_string(),
        duration_ms: duration,
        size,
        truncated,
    })
}

pub fn run(request: CurlRequest) -> Result<CurlResponse, String> {
    execute(request)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_non_http_urls() {
        let request = CurlRequest {
            method: "GET".to_string(),
            url: "file:///etc/passwd".to_string(),
            headers: BTreeMap::new(),
            body: None,
            follow_redirects: false,
            insecure: false,
        };
        assert!(validate_request(&request).is_err());
    }

    #[test]
    fn executes_request_against_local_http_server() {
        use std::io::Read;
        use std::net::TcpListener;

        let listener = TcpListener::bind("127.0.0.1:0").expect("bind");
        let port = listener.local_addr().expect("addr").port();
        let server = std::thread::spawn(move || {
            let (mut socket, _) = listener.accept().expect("accept");
            let mut request = [0u8; 4096];
            let _ = socket.read(&mut request);
            let body = "{\"ok\":true}";
            let response = format!(
                "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nX-Test: local\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                body.len(),
                body
            );
            use std::io::Write;
            socket.write_all(response.as_bytes()).expect("write");
        });

        let response = execute(CurlRequest {
            method: "GET".to_string(),
            url: format!("http://127.0.0.1:{port}/"),
            headers: BTreeMap::new(),
            body: None,
            follow_redirects: false,
            insecure: false,
        })
        .expect("request");
        server.join().expect("join");
        assert_eq!(response.status, 200);
        assert_eq!(response.body, "{\"ok\":true}");
        assert!(response
            .headers
            .iter()
            .any(|(name, value)| name == "X-Test" && value == "local"));
    }

    #[test]
    fn parses_last_http_header_block() {
        let dir = make_temp_dir().expect("temp");
        let path = dir.join("headers");
        fs::write(
            &path,
            "HTTP/1.1 302 Found\r\nLocation: https://example.com\r\n\r\nHTTP/1.1 200 OK\r\nContent-Type: application/json\r\nX-Test: 1\r\n\r\n",
        )
        .expect("write");
        let parsed = parse_headers(&path).expect("parse");
        let _ = fs::remove_dir_all(dir);
        assert_eq!(parsed.status, 200);
        assert_eq!(parsed.status_text, "OK");
        assert!(parsed
            .headers
            .iter()
            .any(|(name, value)| name == "Content-Type" && value == "application/json"));
    }
}
