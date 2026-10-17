#![cfg_attr(target_os = "windows", windows_subsystem = "windows")]
mod backend;
mod browser_security;
mod browser_manage;
mod browser_tools;
mod cancellation;
mod computer;
mod control_indicator;
mod models;
use portable_pty::{native_pty_system, Child, CommandBuilder, MasterPty, PtySize};
use serde::Serialize;
use std::{
    collections::HashMap,
    io::{Read, Write},
    path::PathBuf,
    sync::{Arc, Mutex},
};
use tauri::{
    LogicalPosition, LogicalSize, Manager, State, Webview, WebviewUrl,
};
use uuid::Uuid;
#[derive(Default)]
struct Desktop {
    download_prompt: std::sync::atomic::AtomicBool,
    browser_passwords: Mutex<Option<bool>>,
    browser_data: Mutex<browser_manage::BrowserData>,
    workspaces: Mutex<HashMap<String, PathBuf>>,
    terminals: Mutex<HashMap<String, Terminal>>,
    browser: Mutex<Option<String>>,
    browser_tabs: Mutex<Vec<String>>,
    browser_bounds: Mutex<Option<(f64,f64,f64,f64)>>,
    browser_loaded: Mutex<HashMap<String,bool>>,
}
struct Terminal {
    master: Option<Box<dyn MasterPty + Send>>,
    writer: Arc<Mutex<Box<dyn Write + Send>>>,
    child: Box<dyn Child + Send + Sync>,
    output: Arc<Mutex<Output>>,
}
#[derive(Default)]
struct Output {
    text: String,
    base: usize,
    drained: bool,
}
impl Drop for Terminal {
    fn drop(&mut self) {
        let _ = self.stop();
    }
}
impl Terminal {
    fn stop(&mut self) -> Result<(), String> {
        if self.child.try_wait().map_err(|e| e.to_string())?.is_some() {
            return Ok(());
        }
        if let Some(id) = self.child.process_id() {
            use std::os::windows::process::CommandExt;
            let result = std::process::Command::new("taskkill.exe")
                .args(["/PID", &id.to_string(), "/T", "/F"])
                .creation_flags(0x08000000)
                .output();
            if result.is_ok_and(|output| output.status.success()) {
                return Ok(());
            }
        }
        self.child.kill().map_err(|e| e.to_string())
    }
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Workspace {
    id: String,
    name: String,
    path: String,
}
#[tauri::command]
fn workspace_status(view: Webview, state: State<'_, Desktop>, id: String) -> Result<bool, String> {
    trusted(&view)?;
    Ok(state.workspaces.lock().unwrap().contains_key(&id))
}
fn trusted(view: &Webview) -> Result<(), String> {
    if view.label() != "main" {
        return Err("Native commands are reserved for the application interface".into());
    }
    let url = view.url().map_err(|e| e.to_string())?;
    if url.scheme() != "http"
        || url.host_str() != Some("127.0.0.1")
        || !matches!(url.port(), Some(3001 | 5173))
    {
        return Err("Native commands require the trusted local interface".into());
    }
    Ok(())
}
#[tauri::command]
fn workspace_current(view: Webview,state: State<'_, Desktop>,scope:Option<String>) -> Result<Workspace,String>{
    trusted(&view)?;
    let scope=scope.unwrap_or_else(||"default".into());
    if scope.is_empty()||scope.len()>150||!scope.chars().all(|value|value.is_ascii_alphanumeric()||"-_".contains(value)){return Err("Invalid workspace scope".into());}
    let mut root=std::env::var_os("OPENCLAUDE_WORKSPACE_ROOT").map(PathBuf::from).unwrap_or(std::env::current_dir().map_err(|error|error.to_string())?);
    if root.file_name().and_then(|value|value.to_str())==Some("src-tauri")&&root.join("Cargo.toml").exists(){root=root.parent().ok_or("Workspace parent is unavailable")?.to_path_buf();}
    let path=if scope=="default"{root}else{root.join(".local").join("workspaces").join(&scope)};
    std::fs::create_dir_all(&path).map_err(|error|error.to_string())?;
    let path=path.canonicalize().map_err(|error|error.to_string())?;
    let id=format!("current-{}",scope);
    state.workspaces.lock().unwrap().insert(id.clone(),path.clone());
    Ok(Workspace{id,name:path.file_name().unwrap_or_default().to_string_lossy().into(),path:path.to_string_lossy().into()})
}
#[tauri::command]
async fn workspace_choose(
    view: Webview,
    state: State<'_, Desktop>,
) -> Result<Option<Workspace>, String> {
    trusted(&view)?;
    let selected = tauri::async_runtime::spawn_blocking(|| {
        rfd::FileDialog::new()
            .set_title("Choose native terminal workspace")
            .pick_folder()
    })
    .await
    .map_err(|e| e.to_string())?;
    let Some(path) = selected else {
        return Ok(None);
    };
    let path = path.canonicalize().map_err(|e| e.to_string())?;
    let id = Uuid::new_v4().to_string();
    let item = Workspace {
        id: id.clone(),
        name: path
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .into(),
        path: path.to_string_lossy().into(),
    };
    state.workspaces.lock().unwrap().insert(id, path);
    Ok(Some(item))
}
#[tauri::command]
fn terminal_open(
    view: Webview,
    state: State<'_, Desktop>,
    workspace_id: String,
    cwd: Option<String>,
    encoded_command: Option<String>,
) -> Result<serde_json::Value, String> {
    trusted(&view)?;
    let path = state
        .workspaces
        .lock()
        .unwrap()
        .get(&workspace_id)
        .cloned()
        .ok_or("Choose a workspace first")?;
    let directory = path
        .join(cwd.unwrap_or_else(|| ".".into()))
        .canonicalize()
        .map_err(|e| e.to_string())?;
    if !directory.starts_with(&path) {
        return Err("Terminal directory is outside the granted workspace".into());
    }
    let path = directory;
    let pair = native_pty_system()
        .openpty(PtySize {
            rows: 24,
            cols: 80,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| e.to_string())?;
    let mut command = CommandBuilder::new("powershell.exe");
    command.args(["-NoLogo", "-NoProfile"]);
    if let Some(script)=encoded_command {command.args(["-NonInteractive","-EncodedCommand",&script]);}
    command.cwd(path);
    let child = pair
        .slave
        .spawn_command(command)
        .map_err(|e| e.to_string())?;
    let mut reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;
    let writer = Arc::new(Mutex::new(pair.master.take_writer().map_err(|e| e.to_string())?));
    let cursor_writer=writer.clone();
    let output = Arc::new(Mutex::new(Output::default()));
    let log = output.clone();
    std::thread::spawn(move || {
        let mut buffer = [0u8; 8192];
        let mut pending = Vec::new();
        let mut cursor_answered=false;
        while let Ok(count) = reader.read(&mut buffer) {
            if count == 0 {
                break;
            }
            pending.extend_from_slice(&buffer[..count]);
            if !cursor_answered {
                if let Some(index)=pending.windows(4).position(|bytes|bytes==b"\x1b[6n"){
                    pending.drain(index..index+4);cursor_answered=true;
                    if let Ok(mut writer)=cursor_writer.lock(){let _=writer.write_all(b"\x1b[1;1R");let _=writer.flush();}
                }else if [b"\x1b".as_slice(),b"\x1b[".as_slice(),b"\x1b[6".as_slice()].iter().any(|prefix|pending.ends_with(prefix)){continue;}
            }
            loop {
                let (length, invalid) = match std::str::from_utf8(&pending) {
                    Ok(_) => (pending.len(), None),
                    Err(error) => (error.valid_up_to(), error.error_len()),
                };
                let mut output = log.lock().unwrap();
                if length > 0 {
                    output
                        .text
                        .push_str(std::str::from_utf8(&pending[..length]).unwrap());
                    pending.drain(..length);
                }
                if let Some(length) = invalid {
                    output.text.push('�');
                    pending.drain(..length);
                }
                if output.text.len() > 1048576 {
                    let mut removed = output.text.len() - 1048576;
                    while !output.text.is_char_boundary(removed) {
                        removed += 1;
                    }
                    output.text.drain(..removed);
                    output.base += removed;
                }
                if invalid.is_none() {
                    break;
                }
            }
        }
        log.lock().unwrap().drained=true;
    });
    let id = Uuid::new_v4().to_string();
    state.terminals.lock().unwrap().insert(
        id.clone(),
        Terminal {
            master: Some(pair.master),
            writer,
            child,
            output,
        },
    );
    Ok(
        serde_json::json!({"id":id,"workspaceId":workspace_id,"shell":"PowerShell","status":"running"}),
    )
}
#[tauri::command]
fn terminal_read(
    view: Webview,
    state: State<'_, Desktop>,
    id: String,
    offset: usize,
) -> Result<serde_json::Value, String> {
    trusted(&view)?;
    let mut sessions = state.terminals.lock().unwrap();
    let terminal = sessions.get_mut(&id).ok_or("Terminal session not found")?;
    let exit = terminal.child.try_wait().map_err(|e| e.to_string())?;
    // Closing ConPTY after process exit flushes its final output and releases
    // the reader. Do not report completion until that reader reaches EOF.
    if exit.is_some(){terminal.master.take();}
    let output = terminal.output.lock().unwrap();
    let text = &output.text;
    let mut start = offset.saturating_sub(output.base).min(text.len());
    while start < text.len() && !text.is_char_boundary(start) {
        start += 1;
    }
    Ok(
        serde_json::json!({"output":&text[start..],"nextOffset":output.base+text.len(),"truncated":offset<output.base,"status":if exit.is_some()&&output.drained{"exited"}else{"running"},"exitCode":exit.map(|status|status.exit_code())}),
    )
}
#[tauri::command]
fn terminal_write(
    view: Webview,
    state: State<'_, Desktop>,
    id: String,
    text: String,
) -> Result<(), String> {
    trusted(&view)?;
    if text.len() > 65536 {
        return Err("Terminal input exceeds limit".into());
    }
    let mut sessions = state.terminals.lock().unwrap();
    let terminal = sessions.get_mut(&id).ok_or("Terminal session not found")?;
    if terminal.child.try_wait().map_err(|e| e.to_string())?.is_some() {
        return Err("TERMINAL_EXITED: This process has finished; read its final output or start a new session.".into());
    }
    let mut writer=terminal.writer.lock().unwrap();
    writer.write_all(text.as_bytes()).and_then(|_|writer.flush()).map_err(|e| {
        if matches!(e.raw_os_error(),Some(109|232|233)) {
            "TERMINAL_EXITED: The terminal input pipe is closed; start a new session.".into()
        } else {e.to_string()}
    })
}
#[tauri::command]
fn terminal_resize(
    view: Webview,
    state: State<'_, Desktop>,
    id: String,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    trusted(&view)?;
    if cols < 2 || cols > 500 || rows < 2 || rows > 200 {
        return Err("Invalid terminal dimensions".into());
    }
    let mut sessions=state.terminals.lock().unwrap();
    let terminal=sessions.get_mut(&id).ok_or("Terminal not found")?;
    // ResizeObserver may run after the command exited. Output remains readable;
    // resizing that finished session is a harmless no-op.
    if terminal.master.is_none()||terminal.child.try_wait().map_err(|e|e.to_string())?.is_some(){return Ok(());}
    let result=terminal.master.as_ref().unwrap().resize(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        });
    match result {
        Ok(())=>Ok(()),
        Err(error)=>{
            if terminal.child.try_wait().map_err(|e|e.to_string())?.is_some(){Ok(())}
            else{Err(error.to_string())}
        }
    }
}
#[tauri::command]
fn terminal_close(view: Webview, state: State<'_, Desktop>, id: String) -> Result<(), String> {
    trusted(&view)?;
    if let Some(mut terminal) = state.terminals.lock().unwrap().remove(&id) {
        terminal.stop()?;
    }
    Ok(())
}
fn embedded_browser(app:&tauri::AppHandle,state:&Desktop,id:&str,url:tauri::Url)->Result<Webview,String>{
    let parent=app.get_window("main").ok_or("Main application window is unavailable")?;
    let bounds=state.browser_bounds.lock().unwrap().filter(|b|b.2>0.0&&b.3>0.0).unwrap_or((0.0,0.0,1280.0,800.0));
    state.browser_loaded.lock().unwrap().insert(id.into(),false);
    let handle=app.clone();let label=id.to_string();
    let loading_handle=app.clone();let loading_label=id.to_string();
    let builder=tauri::webview::WebviewBuilder::new(id,WebviewUrl::External(url))
        .data_directory(app.path().app_local_data_dir().map_err(|error|error.to_string())?)
        .browser_extensions_enabled(true)
        .on_download(browser_security::download)
        .on_page_load(move |_,payload|{let finished=matches!(payload.event(),tauri::webview::PageLoadEvent::Finished);loading_handle.state::<Desktop>().browser_loaded.lock().unwrap().insert(loading_label.clone(),finished);if finished{browser_manage::visit(&loading_handle,payload.url());}})
        .on_new_window(move |url,_|{
            if matches!(url.scheme(),"http"|"https")&&url.username().is_empty()&&url.password().is_none(){if let Some(view)=handle.get_webview(&label){let _=view.navigate(url);}}
            tauri::webview::NewWindowResponse::Deny
        });
    let child=parent.add_child(builder,LogicalPosition::new(bounds.0,bounds.1),LogicalSize::new(bounds.2.max(1.0),bounds.3.max(1.0))).map_err(|error|error.to_string())?;
    browser_security::configure(&child)?;
    if state.browser_bounds.lock().unwrap().map(|b|b.2<=0.0||b.3<=0.0).unwrap_or(true){child.hide().map_err(|error|error.to_string())?;}
    Ok(child)
}
fn browser_state(app: &tauri::AppHandle, state: &Desktop) -> serde_json::Value {
    let id = state.browser.lock().unwrap().clone();
    let tabs:Vec<serde_json::Value>=state.browser_tabs.lock().unwrap().iter().filter_map(|label|app.get_webview(label).map(|window|serde_json::json!({"id":label,"url":window.url().ok().map(|url|url.to_string()),"title":window.url().ok().and_then(|url|url.host_str().map(str::to_string)).unwrap_or_default()}))).collect();
    let url = id
        .as_ref()
        .and_then(|id| tabs.iter().find(|tab| tab["id"].as_str() == Some(id)))
        .map(|tab| tab["url"].clone());
    serde_json::json!({"activeId":id,"tabs":tabs,"url":url,"canGoBack":false,"canGoForward":false,"security":{"persistentProfile":true,"downloadConfirmation":true,"passwordSavePrompts":*state.browser_passwords.lock().unwrap()}})
}
#[tauri::command]
fn browser_select(
    view: Webview,
    app: tauri::AppHandle,
    state: State<'_, Desktop>,
    id: String,
) -> Result<serde_json::Value, String> {
    trusted(&view)?;
    if !state.browser_tabs.lock().unwrap().contains(&id) {
        return Err("Browser tab was not found".into());
    }
    if let Some(previous) = state.browser.lock().unwrap().clone() {
        if let Some(window) = app.get_webview(&previous) {
            let _ = window.hide();
        }
    }
    let window = app
        .get_webview(&id)
        .ok_or("Browser tab was closed")?;
    window.show().map_err(|e| e.to_string())?;
    *state.browser.lock().unwrap() = Some(id);
    Ok(browser_state(&app, &state))
}
#[tauri::command]
async fn browser_open(
    view: Webview,
    app: tauri::AppHandle,
    state: State<'_, Desktop>,
    tools:State<'_, browser_tools::BrowserTools>,
    owner:Option<String>,
    url: String,
) -> Result<serde_json::Value, String> {
    trusted(&view)?;
    let address = tauri::Url::parse(&url).map_err(|e| e.to_string())?;
    if !matches!(address.scheme(), "http" | "https")
        || !address.username().is_empty()
        || address.password().is_some()
    {
        return Err("Use HTTP(S) browser URLs".into());
    }
    if let Some(id) = state.browser.lock().unwrap().take() {
        if let Some(old) = app.get_webview(&id) {
            let _ = old.hide();
        }
    }
    let id = Uuid::new_v4().to_string();
    embedded_browser(&app,&state,&id,address)?;
    tools.own(&id,owner.as_deref().unwrap_or("manual-workspace"));
    state.browser_tabs.lock().unwrap().push(id.clone());
    *state.browser.lock().unwrap() = Some(id);
    Ok(browser_state(&app, &state))
}
#[tauri::command]
async fn browser_status(
    view: Webview,
    app: tauri::AppHandle,
    state: State<'_, Desktop>,
) -> Result<serde_json::Value, String> {
    trusted(&view)?;
    let mut value = browser_state(&app, &state);
    let id = state.browser.lock().unwrap().clone();
    if let Some(window) = id.and_then(|id| app.get_webview(&id)) {
        let (sender, receiver) = std::sync::mpsc::channel();
        window
            .with_webview(move |platform| {
                let result = unsafe {
                    platform.controller().CoreWebView2().and_then(|core| {
                        let mut back = Default::default();
                        let mut forward = Default::default();
                        core.CanGoBack(&mut back)?;
                        core.CanGoForward(&mut forward)?;
                        let mut zoom=1.0;platform.controller().ZoomFactor(&mut zoom)?;
                        Ok((back.as_bool(), forward.as_bool(),zoom))
                    })
                };
                let _ = sender.send(result.map_err(|e| e.to_string()));
            })
            .map_err(|e| e.to_string())?;
        let flags = tauri::async_runtime::spawn_blocking(move || {
            receiver.recv_timeout(std::time::Duration::from_secs(2))
        })
        .await
        .map_err(|e| e.to_string())?
        .map_err(|_| "Browser history query timed out")??;
        value["canGoBack"] = serde_json::json!(flags.0);
        value["canGoForward"] = serde_json::json!(flags.1);
        value["zoom"] = serde_json::json!(flags.2);
    }
    Ok(value)
}
#[tauri::command]
async fn browser_navigate(
    view: Webview,
    app: tauri::AppHandle,
    state: State<'_, Desktop>,
    tools:State<'_, browser_tools::BrowserTools>,
    owner:Option<String>,
    url: String,
) -> Result<serde_json::Value, String> {
    trusted(&view)?;
    if state.browser.lock().unwrap().is_none() {
        return browser_open(view, app, state, tools,owner,url).await;
    }
    let address = tauri::Url::parse(&url).map_err(|e| e.to_string())?;
    if !matches!(address.scheme(), "http" | "https")
        || !address.username().is_empty()
        || address.password().is_some()
    {
        return Err("Use HTTP(S) browser URLs".into());
    }
    let id = state.browser.lock().unwrap().clone().unwrap();
    state.browser_loaded.lock().unwrap().insert(id.clone(),false);
    app.get_webview(&id)
        .ok_or("Browser was closed")?
        .navigate(address)
        .map_err(|e| e.to_string())?;
    Ok(browser_state(&app, &state))
}
#[tauri::command]
fn browser_action(
    view: Webview,
    app: tauri::AppHandle,
    state: State<'_, Desktop>,
    action: String,
) -> Result<serde_json::Value, String> {
    trusted(&view)?;
    let id = state
        .browser
        .lock()
        .unwrap()
        .clone()
        .ok_or("Open a browser tab first")?;
    let window = app.get_webview(&id).ok_or("Browser was closed")?;
    let script = match action.as_str() {
        "back" => "history.back()",
        "forward" => "history.forward()",
        "reload" => "location.reload()",
        _ => return Err("Unsupported browser action".into()),
    };
    window.eval(script).map_err(|e| e.to_string())?;
    Ok(browser_state(&app, &state))
}
#[tauri::command]
fn browser_bounds(
    view: Webview,
    app: tauri::AppHandle,
    state: State<'_, Desktop>,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
) -> Result<(), String> {
    trusted(&view)?;
    *state.browser_bounds.lock().unwrap()=Some((x,y,width,height));
    if let Some(id) = state.browser.lock().unwrap().clone() {
        if let Some(window) = app.get_webview(&id) {
            if width <= 0.0 || height <= 0.0 {
                window.hide().map_err(|e| e.to_string())?;
            } else {
                window
                    .set_position(LogicalPosition::new(x,y))
                    .map_err(|e| e.to_string())?;
                window
                    .set_size(LogicalSize::new(width, height))
                    .map_err(|e| e.to_string())?;
                window.show().map_err(|e| e.to_string())?;
            }
        }
    }
    Ok(())
}
#[tauri::command]
fn browser_close(
    view: Webview,
    app: tauri::AppHandle,
    state: State<'_, Desktop>,
    id: String,
) -> Result<serde_json::Value, String> {
    trusted(&view)?;
    if !state.browser_tabs.lock().unwrap().contains(&id) {
        return Err("Browser tab was not found".into());
    }
    if let Some(window) = app.get_webview(&id) {
        window.close().map_err(|e| e.to_string())?;
    }
    state.browser_tabs.lock().unwrap().retain(|tab| tab != &id);
    if state.browser.lock().unwrap().as_ref() == Some(&id) {
        *state.browser.lock().unwrap() = None;
    }
    Ok(browser_state(&app, &state))
}
#[tauri::command]
fn open_external(view:Webview,url:String)->Result<(),String>{
    trusted(&view)?;
    let address=tauri::Url::parse(&url).map_err(|error|error.to_string())?;
    if !matches!(address.scheme(),"http"|"https")||!address.username().is_empty()||address.password().is_some(){return Err("Use an HTTP(S) publisher URL".into());}
    use std::os::windows::process::CommandExt;
    std::process::Command::new("rundll32.exe").args(["url.dll,FileProtocolHandler",address.as_str()]).creation_flags(0x08000000).spawn().map_err(|error|error.to_string())?;
    Ok(())
}
fn main() {
    let backend=match backend::Backend::start(){Ok(backend)=>backend,Err(error)=>{rfd::MessageDialog::new().set_title("OpenClaude could not start").set_description(&error).set_level(rfd::MessageLevel::Error).show();return;}};
    let app=tauri::Builder::default()
        .manage(backend)
        .manage(Desktop::default())
        .manage(browser_tools::BrowserTools::default())
        .manage(computer::Computer::default())
        .setup(|app| { if let Err(error) = control_indicator::prepare(app.handle()) { eprintln!("Computer control indicator could not initialize: {error}"); } Ok(()) })
        .manage(cancellation::Cancellation::default())
        .invoke_handler(tauri::generate_handler![
            cancellation::native_cancel,
            computer::computer_status,
            computer::computer_grant,
            computer::computer_tool,
            models::model_pick,
            open_external,
            models::model_configuration_pick,
            browser_tools::browser_tool,
            browser_manage::browser_manage,
            workspace_status,
            workspace_current,
            workspace_choose,
            terminal_open,
            terminal_read,
            terminal_write,
            terminal_resize,
            terminal_close,
            browser_select,
            browser_open,
            browser_status,
            browser_navigate,
            browser_action,
            browser_bounds,
            browser_close
        ])
        .build(tauri::generate_context!())
        .expect("Native desktop runtime failed");
    app.run(|app,event|{if let tauri::RunEvent::WindowEvent { label, event: tauri::WindowEvent::CloseRequested { .. }, .. } = &event { if label == "main" { app.exit(0); } } if matches!(event,tauri::RunEvent::Exit){app.state::<backend::Backend>().stop();}});
}



