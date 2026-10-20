use std::sync::atomic::{AtomicBool,Ordering};
use tauri::{Manager,menu::{Menu,MenuItem},tray::TrayIconBuilder};
#[derive(Default)]pub struct Background{pub enabled:AtomicBool,pub ready:AtomicBool}
pub fn prepare(app:&tauri::AppHandle)->Result<(),String>{
 let show=MenuItem::with_id(app,"openclaude-show","Open OpenClaude",true,None::<&str>).map_err(|e|e.to_string())?;
 let quit=MenuItem::with_id(app,"openclaude-quit","Quit OpenClaude and stop automation",true,None::<&str>).map_err(|e|e.to_string())?;
 let menu=Menu::with_items(app,&[&show,&quit]).map_err(|e|e.to_string())?;
 let mut tray=TrayIconBuilder::new().tooltip("OpenClaude — local automation runs while this app is open").menu(&menu).on_menu_event(|app,event|match event.id.as_ref(){"openclaude-show"=>{if let Some(window)=app.get_webview_window("main"){let _=window.show();let _=window.set_focus();}},"openclaude-quit"=>app.exit(0),_=>{}});
 let icon=app.default_window_icon().ok_or("A tray icon is required before the window can safely run hidden")?;
 tray=tray.icon(icon.clone());
 tray.build(app).map_err(|e|e.to_string())?;app.state::<Background>().ready.store(true,Ordering::SeqCst);Ok(())
}
#[tauri::command]pub fn background_mode(view:tauri::Webview,app:tauri::AppHandle,enabled:Option<bool>)->Result<serde_json::Value,String>{super::trusted(&view)?;let state=app.state::<Background>();if let Some(value)=enabled{if value&&!state.ready.load(Ordering::SeqCst){return Err("The system tray is unavailable; background operation cannot be enabled".into());}state.enabled.store(value,Ordering::SeqCst);}Ok(serde_json::json!({"enabled":state.enabled.load(Ordering::SeqCst),"available":state.ready.load(Ordering::SeqCst),"quitStopsAutomation":true}))}
