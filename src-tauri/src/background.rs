use std::sync::atomic::{AtomicBool,Ordering};
use tauri::{Manager,menu::{Menu,MenuItem},tray::TrayIconBuilder};
pub struct Background{pub enabled:AtomicBool,pub ready:AtomicBool}
impl Default for Background{fn default()->Self{Self{enabled:AtomicBool::new(true),ready:AtomicBool::new(false)}}}
pub fn prepare(app:&tauri::AppHandle)->Result<(),String>{
 if let Ok(root)=app.path().app_local_data_dir(){if let Ok(bytes)=std::fs::read(root.join("background-mode.json")){if let Ok(enabled)=serde_json::from_slice::<bool>(&bytes){app.state::<Background>().enabled.store(enabled,Ordering::SeqCst);}}}
 let show=MenuItem::with_id(app,"openclaude-show","Open Horizon",true,None::<&str>).map_err(|e|e.to_string())?;
 let quit=MenuItem::with_id(app,"openclaude-quit","Quit Horizon",true,None::<&str>).map_err(|e|e.to_string())?;
 let menu=Menu::with_items(app,&[&show,&quit]).map_err(|e|e.to_string())?;
 let mut tray=TrayIconBuilder::new().tooltip("Horizon").menu(&menu).on_menu_event(|app,event|match event.id.as_ref(){"openclaude-show"=>{if let Some(window)=app.get_webview_window("main"){let _=window.show();let _=window.set_focus();}},"openclaude-quit"=>app.exit(0),_=>{}});
 let icon=app.default_window_icon().ok_or("A tray icon is required before the window can safely run hidden")?;
 tray=tray.icon(icon.clone());
 tray.build(app).map_err(|e|e.to_string())?;app.state::<Background>().ready.store(true,Ordering::SeqCst);Ok(())
}
#[tauri::command]pub fn background_mode(view:tauri::Webview,app:tauri::AppHandle,enabled:Option<bool>)->Result<serde_json::Value,String>{super::trusted(&view)?;let state=app.state::<Background>();if let Some(value)=enabled{if value&&!state.ready.load(Ordering::SeqCst){return Err("The system tray is unavailable; background operation cannot be enabled".into());}let root=app.path().app_local_data_dir().map_err(|error|error.to_string())?;std::fs::create_dir_all(&root).map_err(|error|error.to_string())?;std::fs::write(root.join("background-mode.json"),serde_json::to_vec(&value).map_err(|error|error.to_string())?).map_err(|error|error.to_string())?;state.enabled.store(value,Ordering::SeqCst);}Ok(serde_json::json!({"enabled":state.enabled.load(Ordering::SeqCst),"available":state.ready.load(Ordering::SeqCst),"quitStopsAutomation":true}))}
