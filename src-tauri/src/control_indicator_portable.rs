use tauri::{AppHandle,Manager,WebviewWindow,WebviewWindowBuilder,WebviewUrl};
pub fn prepare(app:&AppHandle)->Result<WebviewWindow,String>{
 if let Some(window)=app.get_webview_window("control-indicator"){return Ok(window);}
 let url="http://127.0.0.1:3001/desktop/control-indicator".parse::<tauri::Url>().map_err(|error|error.to_string())?;
 let window=WebviewWindowBuilder::new(app,"control-indicator",WebviewUrl::External(url)).title("OpenClaude computer control").transparent(true).decorations(false).always_on_top(true).skip_taskbar(true).focused(false).focusable(false).visible(false).on_navigation(|url|url.as_str()=="http://127.0.0.1:3001/desktop/control-indicator").on_new_window(|_,_|tauri::webview::NewWindowResponse::Deny).build().map_err(|error|error.to_string())?;
 window.set_ignore_cursor_events(true).map_err(|error|error.to_string())?;Ok(window)
}
pub struct ActiveIndicator(WebviewWindow);
impl ActiveIndicator{pub fn show(app:&AppHandle)->Result<Self,String>{let window=prepare(app)?;let monitor=window.primary_monitor().map_err(|error|error.to_string())?.ok_or("Primary monitor unavailable")?;window.set_position(*monitor.position()).map_err(|error|error.to_string())?;window.set_size(*monitor.size()).map_err(|error|error.to_string())?;window.show().map_err(|error|error.to_string())?;Ok(Self(window))}}
impl Drop for ActiveIndicator{fn drop(&mut self){let _=self.0.hide();}}
