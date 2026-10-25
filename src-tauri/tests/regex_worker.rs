use std::io::Write;
use std::process::{Command, Stdio};

fn run_worker(request: &str) -> (Option<i32>, String, String) {
    let mut child = Command::new(env!("CARGO_BIN_EXE_jizhu"))
        .arg("--worker")
        .arg("regex")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .expect("spawn worker");
    child
        .stdin
        .as_mut()
        .expect("stdin")
        .write_all(request.as_bytes())
        .expect("write request");
    let output = child.wait_with_output().expect("wait worker");
    (
        output.status.code(),
        String::from_utf8_lossy(&output.stdout).to_string(),
        String::from_utf8_lossy(&output.stderr).to_string(),
    )
}

#[test]
fn worker_returns_matches_and_groups() {
    let request = serde_json::json!({
        "text": "ada@example.com bob@example.com",
        "pattern": r"(\w+)@([\w.-]+)",
        "flags": { "global": true, "ignoreCase": false, "multiLine": false }
    })
    .to_string();
    let (code, stdout, stderr) = run_worker(&request);
    assert_eq!(code, Some(0), "stderr: {stderr}");
    let value: serde_json::Value = serde_json::from_str(stdout.trim()).expect("json");
    assert_eq!(value["count"], 2);
    assert_eq!(value["unique"], 2);
    assert_eq!(value["matches"][0]["text"], "ada@example.com");
    assert_eq!(value["matches"][0]["groups"][0], "ada");
}

#[test]
fn worker_reports_syntax_error_as_outcome() {
    let request = serde_json::json!({
        "text": "abc",
        "pattern": "(",
        "flags": { "global": true, "ignoreCase": false, "multiLine": false }
    })
    .to_string();
    let (code, stdout, stderr) = run_worker(&request);
    assert_eq!(code, Some(0), "stderr: {stderr}");
    let value: serde_json::Value = serde_json::from_str(stdout.trim()).expect("json");
    assert_eq!(value["error"]["kind"], "syntax");
}

#[test]
fn worker_stops_catastrophic_backtracking() {
    let request = serde_json::json!({
        "text": format!("{}!", "a".repeat(40)),
        "pattern": "^(a+)+\\1$",
        "flags": { "global": true, "ignoreCase": false, "multiLine": false }
    })
    .to_string();
    let (code, stdout, stderr) = run_worker(&request);
    assert_eq!(code, Some(0), "stderr: {stderr}");
    let value: serde_json::Value = serde_json::from_str(stdout.trim()).expect("json");
    assert!(value["error"]["message"]
        .as_str()
        .unwrap_or("")
        .to_lowercase()
        .contains("backtrack"));
}
