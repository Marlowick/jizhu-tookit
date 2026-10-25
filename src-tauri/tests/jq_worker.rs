use std::io::Write;
use std::process::{Command, Stdio};

fn run_worker(request: &str) -> (Option<i32>, String, String) {
    let mut child = Command::new(env!("CARGO_BIN_EXE_jizhu"))
        .arg("--worker")
        .arg("jaq")
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
fn worker_runs_jq_filter() {
    let request = serde_json::json!({
        "input": "{\"users\":[{\"age\":17},{\"age\":30}]}",
        "program": ".users[] | select(.age > 18)"
    })
    .to_string();
    let (code, stdout, stderr) = run_worker(&request);
    assert_eq!(code, Some(0), "stderr: {stderr}");
    assert_eq!(stdout.trim(), r#"{"age":30}"#);
    assert!(stderr.is_empty());
}

#[test]
fn worker_streams_multiple_outputs() {
    let request = serde_json::json!({
        "input": "{\"users\":[1,2,3]}",
        "program": ".users[]"
    })
    .to_string();
    let (code, stdout, _) = run_worker(&request);
    assert_eq!(code, Some(0));
    assert_eq!(stdout.lines().count(), 3);
}

#[test]
fn worker_handles_json_lines() {
    let request = serde_json::json!({
        "input": "{\"user\":\"ada\",\"score\":91}\n{\"user\":\"bob\",\"score\":72}\n",
        "program": "select(.score > 80) | .user"
    })
    .to_string();
    let (code, stdout, stderr) = run_worker(&request);
    assert_eq!(code, Some(0), "stderr: {stderr}");
    assert_eq!(stdout.trim(), r#""ada""#);
}

#[test]
fn worker_reports_compile_error() {
    let request = serde_json::json!({
        "input": "null",
        "program": "select("
    })
    .to_string();
    let (code, _, stderr) = run_worker(&request);
    assert_ne!(code, Some(0));
    assert!(stderr.contains("[jizhu-jq]"), "stderr: {stderr}");
}
