use serde::{Deserialize, Serialize};
use std::fs;
use std::io::{self, Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, ExitStatus, Stdio};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::mpsc;
use std::sync::Arc;
use std::thread;
use std::time::{Duration, Instant};

const MAX_INPUT: usize = 32 * 1024 * 1024;
const MAX_OUTPUT: usize = 64 * 1024 * 1024;
const MAX_WORKER_REQUEST: usize = 64 * 1024 * 1024;
const MAX_STDERR: usize = 64 * 1024;
const MAX_PROGRAM: usize = 1024 * 1024;
const RUN_TIMEOUT: Duration = Duration::from_secs(6);

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

pub fn run(input: String, program: String, raw: bool) -> JqOutcome {
    let started = Instant::now();

    if input.len() > MAX_INPUT {
        return failure(
            "jaq",
            "内置 jaq",
            "",
            "输入超过 32MB，jq 面板暂不处理这么大的文档",
            "limit",
            started,
        );
    }
    if program.len() > MAX_PROGRAM {
        return failure("jaq", "内置 jaq", "", "表达式过长", "limit", started);
    }
    if program.trim().is_empty() {
        return failure("jaq", "内置 jaq", "", "请输入 jq 表达式", "input", started);
    }

    run_jaq(&input, &program, raw, started)
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
    static SEQ: AtomicU64 = AtomicU64::new(0);
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or(0);
    let seq = SEQ.fetch_add(1, Ordering::Relaxed);
    let path = std::env::temp_dir().join(format!("jizhu-jq-{}-{nanos}-{seq}", std::process::id()));
    fs::create_dir(&path)?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(&path, fs::Permissions::from_mode(0o700))?;
    }
    Ok(path)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_oversized_input() {
        let outcome = run("x".repeat(MAX_INPUT + 1), ".".to_string(), false);
        assert_eq!(outcome.error.expect("error").kind, "limit");
    }

    #[test]
    fn empty_program_is_rejected() {
        let outcome = run("{}".to_string(), "   ".to_string(), false);
        assert_eq!(outcome.error.expect("error").kind, "input");
    }

    #[test]
    fn pretty_lines_counts_output_values_not_rendered_lines() {
        // worker 每个输出值是一行紧凑 JSON；pretty 展开成多行后计数仍应为值的数量
        let stdout = b"{\"user\":\"ada\",\"score\":91}\n{\"user\":\"coco\",\"score\":88}\n";
        let (pretty, count) = pretty_lines(stdout);
        assert_eq!(count, 2);
        assert!(pretty.lines().count() > 2);
    }

    #[test]
    fn pretty_lines_passes_through_raw_text() {
        let (pretty, count) = pretty_lines(b"hello\nworld\n");
        assert_eq!(count, 2);
        assert_eq!(pretty, "hello\nworld");
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
