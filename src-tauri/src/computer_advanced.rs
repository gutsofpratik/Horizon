use super::*;
use std::{
    io::{Read, Write},
    os::windows::process::CommandExt,
    process::{Command, Stdio},
};
pub(super) struct Observation {
    id: String,
    time: Instant,
    handle: isize,
    pid: u32,
    elements: Vec<String>,
}
fn run(args: Value, request: &crate::cancellation::Request<'_>) -> Result<Value, String> {
    request.check()?;
    let mut child = Command::new("powershell.exe")
        .args([
            "-NoProfile",
            "-NonInteractive",
            if args["operation"].as_str().is_some_and(|name| name.starts_with("computer_clipboard_")) { "-STA" } else { "-MTA" },
            "-Command",
            include_str!("computer_advanced.ps1"),
        ])
        .creation_flags(0x08000000)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| e.to_string())?;
    if let Err(error) = child
        .stdin
        .take()
        .ok_or("Missing adapter input")?
        .write_all(args.to_string().as_bytes())
    {
        let _ = child.kill();
        let _ = child.wait();
        return Err(error.to_string());
    }
    let mut output = child.stdout.take().ok_or("Missing adapter output")?;
    let mut errors = child.stderr.take().ok_or("Missing adapter errors")?;
    let reader = std::thread::spawn(move || {
        let mut data = String::new();
        let _ = output.read_to_string(&mut data);
        data
    });
    let error_reader = std::thread::spawn(move || {
        let mut data = String::new();
        let _ = errors.read_to_string(&mut data);
        data
    });
    let start = Instant::now();
    let status = loop {
        if request.check().is_err() {
            let _ = child.kill();
            let _ = child.wait();
            return Err("Desktop action cancelled; inspect its effects before retrying".into());
        }
        if let Some(status) = child.try_wait().map_err(|e| e.to_string())? {
            break status;
        }
        if start.elapsed() > Duration::from_secs(15) {
            let _ = child.kill();
            let _ = child.wait();
            return Err("Native accessibility adapter timed out; inspect current state before retrying an action".into());
        }
        std::thread::sleep(Duration::from_millis(30));
    };
    let output = reader.join().map_err(|_| "Adapter output failed")?;
    let errors = error_reader
        .join()
        .map_err(|_| "Adapter error reader failed")?;
    if !status.success() {
        return Err(errors.chars().take(2000).collect());
    }
    serde_json::from_str(output.trim_start_matches('\u{feff}')).map_err(|e| e.to_string())
}
pub(super) fn execute(
    state: &Computer,
    name: &str,
    args: &Value,
    owner: &str,
    request: &crate::cancellation::Request<'_>,
) -> Result<Value, String> {
    let _desktop = DESKTOP_INPUT
        .lock()
        .map_err(|_| "Desktop control lock unavailable")?;
    request.check()?;
    let mut input = args.clone();
    input["operation"] = json!(name);
    if name.starts_with("computer_clipboard_") {
        if name == "computer_clipboard_write"
            && args["text"].as_str().map_or(true, |s| s.len() > 400000)
        {
            return Err("Invalid clipboard text".into());
        }
        return run(input, request);
    }
    let (handle, pid) = if name == "computer_ui_element_action" {
        let observation = state
            .accessibility
            .lock()
            .unwrap()
            .remove(owner)
            .ok_or("Inspect an accessibility tree before acting")?;
        if observation.time.elapsed() > Duration::from_secs(60)
            || args["snapshot_id"].as_str() != Some(observation.id.as_str())
            || !observation
                .elements
                .iter()
                .any(|id| Some(id.as_str()) == args["element_id"].as_str())
        {
            return Err("Accessibility snapshot is stale or element is not observed".into());
        }
        (observation.handle, observation.pid)
    } else {
        let windows = state.windows.lock().unwrap();
        let reference = windows
            .get(owner)
            .and_then(|items| args["window_id"].as_str().and_then(|id| items.get(id)))
            .ok_or("List windows before choosing a window ID")?;
        if reference.time.elapsed() > Duration::from_secs(60) {
            return Err("Window observation is stale".into());
        }
        (reference.handle, reference.pid)
    };
    let hwnd = handle as windows_sys::Win32::Foundation::HWND;
    unsafe {
        let mut current = 0;
        GetWindowThreadProcessId(hwnd, &mut current);
        if current != pid || IsWindowVisible(hwnd) == 0 {
            return Err("Observed window changed; list windows again".into());
        }
        // Never manipulate the privileged application UI through accessibility/window tools.
        if current == std::process::id() {
            return Err("The Horizon application window is not an automation target".into());
        }
        if name == "computer_window_close" {
            if PostMessageW(hwnd, WM_CLOSE, 0, 0) == 0 {
                return Err("Windows rejected the close request".into());
            }
            return Ok(json!({"close_requested":true}));
        }
        if name == "computer_window_move" || name == "computer_window_resize" {
            let integer = |key: &str, min: i64, max: i64| {
                args[key]
                    .as_i64()
                    .filter(|n| *n >= min && *n <= max)
                    .map(|n| n as i32)
                    .ok_or_else(|| format!("Invalid {}", key))
            };
            let (x, y, w, h, flag) = if name == "computer_window_move" {
                (
                    integer("x", -32768, 32767)?,
                    integer("y", -32768, 32767)?,
                    0,
                    0,
                    SWP_NOSIZE,
                )
            } else {
                (
                    0,
                    0,
                    integer("width", 100, 16384)?,
                    integer("height", 100, 16384)?,
                    SWP_NOMOVE,
                )
            };
            if SetWindowPos(
                hwnd,
                std::ptr::null_mut(),
                x,
                y,
                w,
                h,
                flag | SWP_NOZORDER | SWP_NOACTIVATE,
            ) == 0
            {
                return Err("Windows rejected window geometry".into());
            }
            return Ok(json!({"updated":true}));
        }
    }
    input["handle"] = json!(handle);
    input["pid"] = json!(pid);
    let mut result = run(input, request)?;
    if name == "computer_ui_tree" {
        let id = Uuid::new_v4().to_string();
        let elements = result["nodes"]
            .as_array()
            .ok_or("Invalid accessibility tree")?
            .iter()
            .filter_map(|n| n["element_id"].as_str().map(str::to_owned))
            .collect();
        state.accessibility.lock().unwrap().insert(
            owner.into(),
            Observation {
                id: id.clone(),
                time: Instant::now(),
                handle,
                pid,
                elements,
            },
        );
        result["snapshot_id"] = json!(id);
    }
    Ok(result)
}
