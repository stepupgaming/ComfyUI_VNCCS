use serde::Serialize;
use std::collections::VecDeque;
use std::io::{BufRead, BufReader, Read};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::thread;

const LOG_LINES: usize = 400;

// The webview origin ComfyUI must trust: the Next dev server under `tauri dev`,
// the Tauri custom protocol host in release builds on Windows.
#[cfg(debug_assertions)]
const APP_ORIGIN: &str = "http://localhost:1420";
#[cfg(not(debug_assertions))]
const APP_ORIGIN: &str = "http://tauri.localhost";

#[derive(Default)]
pub struct RuntimeState {
  child: Mutex<Option<Child>>,
  logs: Arc<Mutex<VecDeque<String>>>,
}

#[derive(Serialize)]
pub struct RuntimeStatus {
  running: bool,
  pid: Option<u32>,
  origin: &'static str,
}

fn python_for(root: &Path) -> PathBuf {
  if cfg!(windows) {
    root.join(".venv").join("Scripts").join("python.exe")
  } else {
    root.join(".venv").join("bin").join("python")
  }
}

fn validate_root(root: &str) -> Result<PathBuf, String> {
  let root = PathBuf::from(root);
  if !root.join("main.py").is_file() {
    return Err(format!(
      "{} does not contain ComfyUI's main.py",
      root.display()
    ));
  }
  if !python_for(&root).is_file() {
    return Err(format!(
      "{} has no .venv Python; run runtime/setup-comfyui.ps1",
      root.display()
    ));
  }
  Ok(root)
}

fn pump<R: Read + Send + 'static>(reader: R, logs: Arc<Mutex<VecDeque<String>>>) {
  thread::spawn(move || {
    for line in BufReader::new(reader).lines().map_while(Result::ok) {
      let mut logs = logs.lock().unwrap();
      if logs.len() == LOG_LINES {
        logs.pop_front();
      }
      logs.push_back(line);
    }
  });
}

fn refresh(child: &mut Option<Child>) {
  if let Some(process) = child {
    if !matches!(process.try_wait(), Ok(None)) {
      *child = None;
    }
  }
}

fn kill_tree(process: &mut Child) {
  // The venv python.exe on Windows is a launcher that spawns the real
  // interpreter, so killing only the direct child would orphan ComfyUI.
  #[cfg(windows)]
  {
    use std::os::windows::process::CommandExt;
    let _ = Command::new("taskkill")
      .args(["/PID", &process.id().to_string(), "/T", "/F"])
      .creation_flags(0x0800_0000)
      .status();
  }
  let _ = process.kill();
  let _ = process.wait();
}

/// Put the app in a job Windows terminates when the app's last handle closes,
/// so a runtime it started (and the interpreter the venv launcher spawns)
/// cannot outlive a crash or a forced kill and keep models loaded. Every
/// process the app starts afterwards joins the job too and ends with the app.
#[cfg(windows)]
fn end_children_with_app() {
  use std::sync::Once;
  use windows_sys::Win32::System::JobObjects::{
    AssignProcessToJobObject, CreateJobObjectW, JobObjectExtendedLimitInformation,
    SetInformationJobObject, JOBOBJECT_EXTENDED_LIMIT_INFORMATION,
    JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
  };
  use windows_sys::Win32::System::Threading::GetCurrentProcess;

  static JOB: Once = Once::new();
  JOB.call_once(|| unsafe {
    let job = CreateJobObjectW(std::ptr::null(), std::ptr::null());
    if job.is_null() {
      return;
    }
    let mut limits: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = std::mem::zeroed();
    limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
    let configured = SetInformationJobObject(
      job,
      JobObjectExtendedLimitInformation,
      &limits as *const JOBOBJECT_EXTENDED_LIMIT_INFORMATION as *const std::ffi::c_void,
      std::mem::size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
    );
    // The job handle is never closed: it must live exactly as long as the app.
    if configured != 0 {
      AssignProcessToJobObject(job, GetCurrentProcess());
    }
  });
}

#[tauri::command]
pub fn runtime_status(state: tauri::State<'_, RuntimeState>) -> RuntimeStatus {
  let mut child = state.child.lock().unwrap();
  refresh(&mut child);
  RuntimeStatus {
    running: child.is_some(),
    pid: child.as_ref().map(Child::id),
    origin: APP_ORIGIN,
  }
}

#[tauri::command]
pub fn runtime_start(
  state: tauri::State<'_, RuntimeState>,
  root: String,
  port: u16,
) -> Result<RuntimeStatus, String> {
  let root = validate_root(&root)?;
  let mut child = state.child.lock().unwrap();
  refresh(&mut child);
  if child.is_none() {
    #[cfg(windows)]
    end_children_with_app();
    let mut command = Command::new(python_for(&root));
    command
      .current_dir(&root)
      .args(["main.py", "--listen", "127.0.0.1", "--port"])
      .arg(port.to_string())
      .args([
        "--enable-cors-header",
        APP_ORIGIN,
        "--preview-method",
        "auto",
      ])
      .env("PYTHONUNBUFFERED", "1")
      .env("PYTHONIOENCODING", "utf-8")
      .stdin(Stdio::null())
      .stdout(Stdio::piped())
      .stderr(Stdio::piped());
    #[cfg(windows)]
    {
      use std::os::windows::process::CommandExt;
      command.creation_flags(0x0800_0000);
    }
    let mut process = command.spawn().map_err(|error| error.to_string())?;
    state.logs.lock().unwrap().clear();
    if let Some(stdout) = process.stdout.take() {
      pump(stdout, state.logs.clone());
    }
    if let Some(stderr) = process.stderr.take() {
      pump(stderr, state.logs.clone());
    }
    *child = Some(process);
  }
  Ok(RuntimeStatus {
    running: true,
    pid: child.as_ref().map(Child::id),
    origin: APP_ORIGIN,
  })
}

#[tauri::command]
pub fn runtime_stop(state: tauri::State<'_, RuntimeState>) -> RuntimeStatus {
  stop(&state);
  RuntimeStatus {
    running: false,
    pid: None,
    origin: APP_ORIGIN,
  }
}

#[tauri::command]
pub fn runtime_logs(state: tauri::State<'_, RuntimeState>) -> Vec<String> {
  state.logs.lock().unwrap().iter().cloned().collect()
}

pub fn stop(state: &RuntimeState) {
  if let Some(mut process) = state.child.lock().unwrap().take() {
    kill_tree(&mut process);
  }
}
