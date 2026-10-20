//! Native macOS and Linux/X11 capture/input. No browser panel or Python process is required.
use base64::{engine::general_purpose::STANDARD,Engine};
use enigo::{Enigo,Settings,Mouse,Keyboard,Key,Button,Coordinate,Direction,Axis};
use serde_json::{json,Value};
use std::{sync::Mutex,time::{Instant,Duration},io::Cursor};
use tauri::{Webview,State,Manager};
use uuid::Uuid;

struct Screen{id:String,owner:String,at:Instant,width:u32,height:u32,logical_width:i32,logical_height:i32}
#[derive(Default)]pub struct Computer{enabled:Mutex<Option<bool>>,screen:Mutex<Option<Screen>>,operations:Mutex<()>}
fn supported()->Result<(),String>{
 #[cfg(target_os="linux")]{if std::env::var_os("DISPLAY").is_none()||std::env::var("XDG_SESSION_TYPE").as_deref()==Ok("wayland"){return Err("Native input currently requires a Linux X11 session. Wayland remote-desktop portal input is not enabled; browser and terminal remain available.".into());}}
 Ok(())
}
fn input()->Result<Enigo,String>{supported()?;Enigo::new(&Settings{open_prompt_to_get_permissions:false,..Settings::default()}).map_err(|error|format!("Native input permission unavailable: {error}. On macOS enable OpenClaude in System Settings → Privacy & Security → Accessibility."))}
fn key(name:&str)->Result<Key,String>{Ok(match name.to_lowercase().as_str(){"ctrl"|"control"=>Key::Control,"alt"|"option"=>Key::Alt,"shift"=>Key::Shift,"meta"|"cmd"|"command"|"super"=>Key::Meta,"enter"|"return"=>Key::Return,"tab"=>Key::Tab,"escape"|"esc"=>Key::Escape,"backspace"=>Key::Backspace,"delete"=>Key::Delete,"up"|"arrowup"=>Key::UpArrow,"down"|"arrowdown"=>Key::DownArrow,"left"|"arrowleft"=>Key::LeftArrow,"right"|"arrowright"=>Key::RightArrow,"home"=>Key::Home,"end"=>Key::End,"pageup"=>Key::PageUp,"pagedown"=>Key::PageDown,"space"=>Key::Space,_=>{let mut chars=name.chars();let c=chars.next().ok_or("Empty key")?;if chars.next().is_some(){return Err("Unsupported key name".into());}Key::Unicode(c)}})}
fn capture(state:&Computer,owner:&str)->Result<Value,String>{
 supported()?;let monitors=xcap::Monitor::all().map_err(|error|format!("Screen recording is unavailable: {error}. Grant OpenClaude Screen Recording permission in macOS System Settings if required."))?;
 let monitor=monitors.iter().find(|monitor|monitor.is_primary().unwrap_or(false)).ok_or("Primary monitor is unavailable")?;
 let image=monitor.capture_image().map_err(|error|format!("Screen capture failed: {error}. Screen Recording permission may be required."))?;
 let mut input=input()?;let (logical_width,logical_height)=input.main_display().map_err(|error|error.to_string())?;
 let image=image::DynamicImage::ImageRgba8(image).thumbnail(1280,800);let(width,height)=(image.width(),image.height());let mut bytes=Cursor::new(Vec::new());image.write_to(&mut bytes,image::ImageFormat::Png).map_err(|error|error.to_string())?;
 let id=Uuid::new_v4().to_string();*state.screen.lock().map_err(|_|"Screen state unavailable")?=Some(Screen{id:id.clone(),owner:owner.into(),at:Instant::now(),width,height,logical_width,logical_height});
 Ok(json!({"screen_id":id,"screenshot":{"image":STANDARD.encode(bytes.into_inner()),"width":width,"height":height},"platform":std::env::consts::OS,"note":"Primary monitor only. Coordinates refer to this scaled screenshot; observe again after each action."}))
}
#[tauri::command]pub fn computer_status(view:Webview,_state:State<Computer>)->Result<bool,String>{super::trusted(&view)?;Ok(*_state.enabled.lock().map_err(|_|"Permission state unavailable")?!=Some(false)&&supported().is_ok()&&input().is_ok())}
#[tauri::command]pub async fn computer_grant(view:Webview,state:State<'_,Computer>,enabled:bool)->Result<bool,String>{super::trusted(&view)?;if enabled{input()?;}*state.enabled.lock().map_err(|_|"Permission state unavailable")?=Some(enabled);if !enabled{*state.screen.lock().map_err(|_|"Screen state unavailable")?=None;}Ok(enabled)}
#[tauri::command]pub async fn computer_tool(view:Webview,app:tauri::AppHandle,state:State<'_,Computer>,name:String,args:Value,owner:String,request_id:String,cancellations:State<'_,super::cancellation::Cancellation>)->Result<Value,String>{
 super::trusted(&view)?;let request=cancellations.begin(&request_id);request.check()?;
 if name=="computer_capabilities"{return Ok(json!({"platform":std::env::consts::OS,"tools":["computer_screenshot","computer_click","computer_move","computer_drag","computer_scroll","computer_type","computer_key","computer_wait"],"scope":"primary-monitor","wayland_input":false,"permission_note":"macOS requires Accessibility and Screen Recording. Linux input requires X11."}));}
 if owner.is_empty()||owner.len()>200{return Err("A conversation owner is required".into());}
 if *state.enabled.lock().map_err(|_|"Permission state unavailable")?==Some(false){return Err("Computer control was disabled by the user".into());}let _operation=state.operations.try_lock().map_err(|_|"Another computer operation is in progress")?;supported()?;
 if name=="computer_screenshot"{return capture(&state,&owner);}
 if name=="computer_wait"{let ms=args["duration_ms"].as_u64().unwrap_or(500).min(5000);for _ in 0..ms.div_ceil(50){request.check()?;std::thread::sleep(Duration::from_millis(50));}return capture(&state,&owner);}
 let screen=state.screen.lock().map_err(|_|"Screen state unavailable")?.take().ok_or("Screenshot is stale; capture the screen before input")?;
 if screen.owner!=owner||args["screen_id"].as_str()!=Some(screen.id.as_str())||screen.at.elapsed()>Duration::from_secs(20){return Err("Screenshot is stale or belongs to another conversation; capture it again".into());}
 let point=|x:&Value,y:&Value|->Result<(i32,i32),String>{let x=x.as_f64().ok_or("x coordinate required")?;let y=y.as_f64().ok_or("y coordinate required")?;if !x.is_finite()||!y.is_finite()||x<0.0||y<0.0||x>=screen.width as f64||y>=screen.height as f64{return Err("Coordinates must be inside the observed screenshot".into());}Ok(((x/screen.width as f64*screen.logical_width as f64) as i32,(y/screen.height as f64*screen.logical_height as f64) as i32))};
 let mut input=input()?;let _indicator=super::control_indicator::ActiveIndicator::show(&app)?;request.check()?;
 match name.as_str(){
 "computer_click"|"computer_move"=>{let(x,y)=point(&args["x"],&args["y"])?;input.move_mouse(x,y,Coordinate::Abs).map_err(|e|e.to_string())?;if name=="computer_click"{let button=match args["button"].as_str().unwrap_or("left"){"left"=>Button::Left,"right"=>Button::Right,"middle"=>Button::Middle,_=>return Err("Unsupported mouse button".into())};let clicks=args["click_count"].as_u64().unwrap_or(1);if !(1..=3).contains(&clicks){return Err("Use 1–3 clicks".into());}for _ in 0..clicks{request.check()?;input.button(button,Direction::Click).map_err(|e|e.to_string())?;}}},
 "computer_drag"=>{let(from_x,from_y)=point(&args["start_x"],&args["start_y"])?;let(to_x,to_y)=point(&args["end_x"],&args["end_y"])?;input.move_mouse(from_x,from_y,Coordinate::Abs).map_err(|e|e.to_string())?;input.button(Button::Left,Direction::Press).map_err(|e|e.to_string())?;let moved=input.move_mouse(to_x,to_y,Coordinate::Abs);let released=input.button(Button::Left,Direction::Release);moved.map_err(|e|e.to_string())?;released.map_err(|e|e.to_string())?;},
 "computer_scroll"=>{let amount=args["amount"].as_i64().ok_or("Scroll amount required")?;if !(-20..=20).contains(&amount){return Err("Scroll amount must be -20 to 20".into());}let(direction,axis)=(-(amount as i32),Axis::Vertical);input.scroll(direction,axis).map_err(|e|e.to_string())?;},
 "computer_type"=>{let text=args["text"].as_str().ok_or("Text is required")?;if text.len()>20000{return Err("Text exceeds 20000 bytes".into());}input.text(text).map_err(|e|e.to_string())?;},
 "computer_key"=>{let raw=args["keys"].as_array().ok_or("Keys array is required")?;let keys=raw.iter().map(|value|key(value.as_str().ok_or("Key must be a string")?)).collect::<Result<Vec<_>,_>>()?;if keys.is_empty()||keys.len()>5{return Err("Use 1–5 keys".into());}let mut held=Vec::new();let pressed=(||{for key in &keys{request.check()?;input.key(*key,Direction::Press).map_err(|e|e.to_string())?;held.push(*key);}Ok::<(),String>(())})();for key in held.into_iter().rev(){let _=input.key(key,Direction::Release);}pressed?;},
 _=>return Err(format!("Native computer operation is unavailable on this platform: {name}"))
 }
 drop(_indicator);std::thread::sleep(Duration::from_millis(60));request.check()?;capture(&state,&owner)
}
