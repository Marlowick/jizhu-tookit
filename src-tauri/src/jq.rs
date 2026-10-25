use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs;
use std::io::{self, Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, ExitStatus, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc;
use std::sync::Arc;
use std::thread;
use std::time::{Duration, Instant};

const MAX_INPUT: usize = 32 * 1024 * 1024;
const MAX_OUTPUT: usize = 64 * 1024 * 1024;
const MAX_WORKER_REQUEST: usize = 64 * 1024 * 1024;
const MAX_STDERR: usize = 64 * 1024;
const MAX_PROGRAM: usize = 1024 * 1024;
const MAX_SYSTEM_JQ_BYTES: u64 = 50 * 1024 * 1024;
const RUN_TIMEOUT: Duration = Duration::from_secs(6);
const VERSION_TIMEOUT: Duration = Duration::from_secs(2);

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemJq {
    pub path: String,
    pub version: String,
    pub sha256: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JaqEngine {
    pub version: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EngineInfo {
    pub system: Option<SystemJq>,
    pub jaq: JaqEngine,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JqErrorInfo {
    pub message: String,
    pub kind: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JqOutcome {
    pub engine: String,
    pub engine_label: String,
    pub version: String,
    pub output: String,
    pub count: usize,
    pub duration_ms: u64,
    pub error: Option<JqErrorInfo>,
    pub truncated: bool,
}

#[derive(Deserialize, Serialize)]
struct WorkerRequest {
    input: String,
    program: String,
    raw: bool,
}

pub(crate) struct LimitedOutput {
    pub(crate) stdout: Vec<u8>,
    pub(crate) stderr: Vec<u8>,
    pub(crate) status: Option<ExitStatus>,
    pub(crate) timed_out: bool,
    pub(crate) output_limit: bool,
}

pub fn engines() -> EngineInfo {
    EngineInfo {
        system: detect_system_jq(),
        jaq: JaqEngine {
            version: jizhu_core::jq::JAQ_VERSION.to_string(),
        },
    }
}

pub fn run(input: String, program: String, engine: Option<String>, raw: bool) -> JqOutcome {
    let started = Instant::now();
    let choice = engine.unwrap_or_else(|| "auto".to_string());

    if input.len() > MAX_INPUT {
        return failure(
            "auto",
            "限制",
            "",
            "输入超过 32MB，jq 面板暂不处理这么大的文档",
            "limit",
            started,
        );
    }
    if program.len() > MAX_PROGRAM {
        return failure("auto", "限制", "", "表达式过长", "limit", started);
    }
    if program.trim().is_empty() {
        return failure("auto", "输入", "", "请输入 jq 表达式", "input", started);
    }

    let system = detect_system_jq();

    if choice == "system" {
        let Some(jq) = system else {
            return failure(
                "system",
                "系统 jq",
                "",
                "未检测到可用的系统 jq。可以安装 jq（brew install jq），或切换到内置 jaq。",
                "engine",
                started,
            );
        };
        return run_system(&jq, &input, &program, raw, started);
    }

    if choice == "jaq" {
        return run_jaq(&input, &program, raw, started);
    }

    match system {
        Some(jq) => run_system(&jq, &input, &program, raw, started),
        None => run_jaq(&input, &program, raw, started),
    }
}

fn failure(
    engine: &str,
    label: &str,
    version: &str,
    message: &str,
    kind: &str,
    started: Instant,
) -> JqOutcome {
    JqOutcome {
        engine: engine.to_string(),
        engine_label: label.to_string(),
        version: version.to_string(),
        output: String::new(),
        count: 0,
        duration_ms: started.elapsed().as_millis() as u64,
        error: Some(JqErrorInfo {
            message: message.to_string(),
            kind: kind.to_string(),
        }),
        truncated: false,
    }
}

fn run_system(jq: &SystemJq, input: &str, program: &str, raw: bool, started: Instant) -> JqOutcome {
    let label = format!("系统 jq {}", jq.version.trim_start_matches("jq-"));
    let dir = match make_temp_dir() {
        Ok(dir) => dir,
        Err(error) => {
            return failure(
                "system",
                &label,
                &jq.version,
                &format!("无法创建临时目录：{error}"),
                "io",
                started,
            )
        }
    };
    let modules = dir.join("modules");
    if let Err(error) = fs::create_dir(&modules) {
        let _ = fs::remove_dir_all(&dir);
        return failure(
            "system",
            &label,
            &jq.version,
            &format!("无法创建临时目录：{error}"),
            "io",
            started,
        );
    }
    let filter_path = dir.join("filter");
    if let Err(error) = fs::write(&filter_path, program) {
        let _ = fs::remove_dir_all(&dir);
        return failure(
            "system",
            &label,
            &jq.version,
            &format!("无法写入表达式：{error}"),
            "io",
            started,
        );
    }

    let mut command = Command::new(&jq.path);
    command.arg("--compact-output");
    if raw {
        command.arg("-r");
    }
    command.arg("-L").arg(&modules).arg("-f").arg(&filter_path);

    let result = run_limited(command, input.as_bytes(), RUN_TIMEOUT, MAX_OUTPUT, &dir);
    let _ = fs::remove_dir_all(&dir);

    let output = match result {
        Ok(output) => output,
        Err(error) => {
            return failure(
                "system",
                &label,
                &jq.version,
                &format!("无法启动 jq：{error}"),
                "io",
                started,
            )
        }
    };

    finish_outcome("system", &label, &jq.version, output, started)
}

fn run_jaq(input: &str, program: &str, raw: bool, started: Instant) -> JqOutcome {
    let label = format!("内置 jaq {}", jizhu_core::jq::JAQ_VERSION);
    let dir = match make_temp_dir() {
        Ok(dir) => dir,
        Err(error) => {
            return failure(
                "jaq",
                &label,
                jizhu_core::jq::JAQ_VERSION,
                &format!("无法创建临时目录：{error}"),
                "io",
                started,
            )
        }
    };
    let executable = match std::env::current_exe() {
        Ok(path) => path,
        Err(error) => {
            let _ = fs::remove_dir_all(&dir);
            return failure(
                "jaq",
                &label,
                jizhu_core::jq::JAQ_VERSION,
                &format!("无法定位可执行文件：{error}"),
                "io",
                started,
            );
        }
    };
    let request = serde_json::to_vec(&WorkerRequest {
        input: input.to_string(),
        program: program.to_string(),
        raw,
    });
    let request = match request {
        Ok(request) => request,
        Err(error) => {
            let _ = fs::remove_dir_all(&dir);
            return failure(
                "jaq",
                &label,
                jizhu_core::jq::JAQ_VERSION,
                &format!("请求序列化失败：{error}"),
                "io",
                started,
            );
        }
    };
    if request.len() > MAX_WORKER_REQUEST {
        let _ = fs::remove_dir_all(&dir);
        return failure(
            "jaq",
            &label,
            jizhu_core::jq::JAQ_VERSION,
            "输入过大（JSON 转义后超过 64MB）",
            "limit",
            started,
        );
    }

    let mut command = Command::new(executable);
    command.arg("--worker").arg("jaq");
    let result = run_limited(command, &request, RUN_TIMEOUT, MAX_OUTPUT, &dir);
    let _ = fs::remove_dir_all(&dir);

    let output = match result {
        Ok(output) => output,
        Err(error) => {
            return failure(
                "jaq",
                &label,
                jizhu_core::jq::JAQ_VERSION,
                &format!("无法启动 worker：{error}"),
                "io",
                started,
            )
        }
    };

    finish_outcome("jaq", &label, jizhu_core::jq::JAQ_VERSION, output, started)
}

fn finish_outcome(
    engine: &str,
    label: &str,
    version: &str,
    output: LimitedOutput,
    started: Instant,
) -> JqOutcome {
    let (pretty, count) = pretty_lines(&output.stdout);
    let mut error = None;

    if output.timed_out {
        error = Some(JqErrorInfo {
            message: "执行超过 6 秒，已终止".to_string(),
            kind: "timeout".to_string(),
        });
    } else if output.output_limit {
        error = Some(JqErrorInfo {
            message: "输出超过 64MB，已终止".to_string(),
            kind: "limit".to_string(),
        });
    } else if !output
        .status
        .map(|status| status.success())
        .unwrap_or(false)
    {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        let message = stderr
            .strip_prefix("[jizhu-jq] ")
            .unwrap_or(&stderr)
            .trim()
            .to_string();
        error = Some(JqErrorInfo {
            message: if message.is_empty() {
                "jq 执行失败".to_string()
            } else {
                message
            },
            kind: "jq".to_string(),
        });
    }

    JqOutcome {
        engine: engine.to_string(),
        engine_label: label.to_string(),
        version: version.to_string(),
        output: pretty,
        count,
        duration_ms: started.elapsed().as_millis() as u64,
        error,
        truncated: output.output_limit,
    }
}

fn pretty_lines(bytes: &[u8]) -> (String, usize) {
    let text = String::from_utf8_lossy(bytes);
    let mut lines = Vec::new();
    for raw in text.lines() {
        let line = raw.trim();
        if line.is_empty() {
            continue;
        }
        match serde_json::from_str::<serde_json::Value>(line) {
            Ok(value) => lines
                .push(serde_json::to_string_pretty(&value).unwrap_or_else(|_| line.to_string())),
            Err(_) => lines.push(line.to_string()),
        }
    }
    (lines.join("\n"), lines.len())
}

pub(crate) fn run_limited(
    mut command: Command,
    input: &[u8],
    timeout: Duration,
    max_stdout: usize,
    cwd: &Path,
) -> io::Result<LimitedOutput> {
    command
        .env_clear()
        .env("LC_ALL", "C")
        .current_dir(cwd)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        unsafe {
            command.pre_exec(|| {
                libc::setsid();
                apply_rlimits();
                Ok(())
            });
        }
    }

    let mut child = command.spawn()?;
    let mut stdin = child.stdin.take().expect("stdin");
    let stdout = child.stdout.take().expect("stdout");
    let stderr = child.stderr.take().expect("stderr");

    let payload = input.to_vec();
    let writer = thread::spawn(move || {
        let _ = stdin.write_all(&payload);
    });

    let (out_tx, out_rx) = mpsc::channel();
    let (err_tx, err_rx) = mpsc::channel();
    let overflow = Arc::new(AtomicBool::new(false));
    let overflow_flag = Arc::clone(&overflow);
    thread::spawn(move || {
        let (bytes, limited) = read_capped(stdout, max_stdout);
        if limited {
            overflow_flag.store(true, Ordering::Relaxed);
        }
        let _ = out_tx.send((bytes, limited));
    });
    thread::spawn(move || {
        let _ = err_tx.send(read_capped(stderr, MAX_STDERR));
    });

    let deadline = Instant::now() + timeout;
    let mut timed_out = false;
    let mut output_limit = false;
    let mut status = None;

    loop {
        if overflow.load(Ordering::Relaxed) {
            output_limit = true;
            kill_tree(&mut child);
            let _ = child.wait();
            break;
        }
        match child.try_wait()? {
            Some(exit) => {
                status = Some(exit);
                break;
            }
            None if Instant::now() >= deadline => {
                timed_out = true;
                kill_tree(&mut child);
                let _ = child.wait();
                break;
            }
            None => thread::sleep(Duration::from_millis(5)),
        }
    }

    let (stdout, limited) = out_rx
        .recv_timeout(Duration::from_secs(2))
        .unwrap_or_default();
    output_limit = output_limit || limited;
    let (stderr, _) = err_rx
        .recv_timeout(Duration::from_secs(2))
        .unwrap_or_default();
    let _ = writer.join();

    Ok(LimitedOutput {
        stdout,
        stderr,
        status,
        timed_out,
        output_limit,
    })
}

fn read_capped(mut reader: impl Read, cap: usize) -> (Vec<u8>, bool) {
    let mut buffer = Vec::new();
    let mut chunk = [0u8; 16 * 1024];
    loop {
        match reader.read(&mut chunk) {
            Ok(0) => break,
            Ok(count) => {
                if buffer.len() + count > cap {
                    let take = cap.saturating_sub(buffer.len());
                    buffer.extend_from_slice(&chunk[..take]);
                    return (buffer, true);
                }
                buffer.extend_from_slice(&chunk[..count]);
            }
            Err(_) => break,
        }
    }
    (buffer, false)
}

fn kill_tree(child: &mut Child) {
    #[cfg(unix)]
    unsafe {
        libc::kill(-(child.id() as i32), libc::SIGKILL);
    }
    let _ = child.kill();
}

#[cfg(unix)]
unsafe fn apply_rlimits() {
    use libc::{rlimit, setrlimit, RLIMIT_AS, RLIMIT_CPU, RLIMIT_FSIZE};

    let cpu = rlimit {
        rlim_cur: 10,
        rlim_max: 12,
    };
    setrlimit(RLIMIT_CPU, &cpu);

    let fsize = rlimit {
        rlim_cur: 0,
        rlim_max: 0,
    };
    setrlimit(RLIMIT_FSIZE, &fsize);

    let memory = rlimit {
        rlim_cur: 512 * 1024 * 1024,
        rlim_max: 512 * 1024 * 1024,
    };
    setrlimit(RLIMIT_AS, &memory);
}

pub(crate) fn make_temp_dir() -> io::Result<PathBuf> {
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or(0);
    let path = std::env::temp_dir().join(format!("jizhu-jq-{}-{nanos}", std::process::id()));
    fs::create_dir(&path)?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(&path, fs::Permissions::from_mode(0o700))?;
    }
    Ok(path)
}

fn detect_system_jq() -> Option<SystemJq> {
    let candidates = [
        PathBuf::from("/usr/bin/jq"),
        PathBuf::from("/opt/homebrew/bin/jq"),
        PathBuf::from("/usr/local/bin/jq"),
    ];
    for candidate in candidates {
        if let Some(found) = inspect_jq(&candidate) {
            return Some(found);
        }
    }
    None
}

fn inspect_jq(path: &Path) -> Option<SystemJq> {
    let metadata = fs::metadata(path).ok()?;
    if !metadata.is_file() || metadata.len() == 0 || metadata.len() > MAX_SYSTEM_JQ_BYTES {
        return None;
    }

    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt;
        let mode = metadata.mode();
        if mode & 0o111 == 0 || mode & 0o002 != 0 {
            return None;
        }
        let euid = unsafe { libc::geteuid() };
        if metadata.uid() != 0 && metadata.uid() != euid {
            return None;
        }
    }

    let path = fs::canonicalize(path).ok()?;
    let version = read_version(&path)?;
    let sha256 = hash_file(&path)?;
    Some(SystemJq {
        path: path.display().to_string(),
        version,
        sha256,
    })
}

fn read_version(path: &Path) -> Option<String> {
    let dir = make_temp_dir().ok()?;
    let mut command = Command::new(path);
    command.arg("--version");
    let result = run_limited(command, b"", VERSION_TIMEOUT, 4096, &dir);
    let _ = fs::remove_dir_all(&dir);
    let output = result.ok()?;
    if !output.status?.success() {
        return None;
    }
    let version = String::from_utf8_lossy(&output.stdout).trim().to_string();
    version.starts_with("jq-").then_some(version)
}

fn hash_file(path: &Path) -> Option<String> {
    let mut file = fs::File::open(path).ok()?;
    let mut hasher = Sha256::new();
    let mut buffer = [0u8; 64 * 1024];
    loop {
        let count = file.read(&mut buffer).ok()?;
        if count == 0 {
            break;
        }
        hasher.update(&buffer[..count]);
    }
    Some(format!("{:x}", hasher.finalize()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detects_system_jq_on_macos() {
        if !Path::new("/usr/bin/jq").exists() && !Path::new("/opt/homebrew/bin/jq").exists() {
            return;
        }
        let info = detect_system_jq().expect("jq should be detected");
        assert!(info.version.starts_with("jq-"));
        assert_eq!(info.sha256.len(), 64);
    }

    #[test]
    fn system_jq_runs_filter() {
        if detect_system_jq().is_none() {
            return;
        }
        let outcome = run(
            r#"{"users":[{"age":17},{"age":30}]}"#.to_string(),
            ".users[] | select(.age > 18)".to_string(),
            Some("system".to_string()),
            false,
        );
        assert!(outcome.error.is_none(), "{:?}", outcome.error);
        assert_eq!(outcome.count, 1);
        assert!(outcome.output.contains("\"age\": 30"));
    }

    #[test]
    fn system_jq_handles_json_lines() {
        if detect_system_jq().is_none() {
            return;
        }
        let outcome = run(
            "{\"user\":\"ada\"}\n{\"user\":\"bob\"}".to_string(),
            ".user".to_string(),
            Some("system".to_string()),
            false,
        );
        assert!(outcome.error.is_none(), "{:?}", outcome.error);
        assert_eq!(outcome.count, 2);
        assert!(outcome.output.contains("ada"));
        assert!(outcome.output.contains("bob"));
    }

    #[test]
    fn system_jq_raw_unquotes_strings() {
        if detect_system_jq().is_none() {
            return;
        }
        let outcome = run(
            r#"{"payload":"abc"}"#.to_string(),
            ".payload".to_string(),
            Some("system".to_string()),
            true,
        );
        assert!(outcome.error.is_none(), "{:?}", outcome.error);
        assert_eq!(outcome.output, "abc");
    }

    #[test]
    fn rejects_oversized_input() {
        let outcome = run("x".repeat(MAX_INPUT + 1), ".".to_string(), None, false);
        assert_eq!(outcome.error.expect("error").kind, "limit");
    }

    #[test]
    fn empty_program_is_rejected() {
        let outcome = run("{}".to_string(), "   ".to_string(), None, false);
        assert_eq!(outcome.error.expect("error").kind, "input");
    }

    #[test]
    fn output_limit_stops_endless_writer() {
        let dir = make_temp_dir().expect("temp dir");
        let mut command = Command::new("/bin/sh");
        command.arg("-c").arg("yes");
        let started = Instant::now();
        let output = run_limited(command, b"", Duration::from_secs(5), 1024, &dir).expect("run");
        let _ = fs::remove_dir_all(&dir);
        assert!(output.output_limit);
        assert!(started.elapsed() < Duration::from_secs(3));
    }

    #[test]
    fn timeout_kills_runaway_process() {
        let dir = make_temp_dir().expect("temp dir");
        let mut command = Command::new("/bin/sh");
        command.arg("-c").arg("sleep 10");
        let started = Instant::now();
        let output =
            run_limited(command, b"", Duration::from_millis(150), 1024, &dir).expect("run");
        let _ = fs::remove_dir_all(&dir);
        assert!(output.timed_out);
        assert!(started.elapsed() < Duration::from_secs(3));
    }
}
