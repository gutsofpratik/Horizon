#[path = "computer_advanced.rs"]
mod advanced;
use base64::{engine::general_purpose::STANDARD, Engine};
use serde_json::{json, Value};
use std::{
    collections::HashMap,
    io::Cursor,
    sync::{
        atomic::{AtomicBool, Ordering},
        Mutex,
    },
    time::{Duration, Instant},
};
use tauri::{Manager, State, Webview};
use uuid::Uuid;
#[tauri::command]
pub fn computer_status(view: Webview, state: State<Computer>) -> Result<bool, String> {
    super::trusted(&view)?;
    Ok(state.enabled.load(Ordering::SeqCst))
}
use windows_sys::Win32::{
    Graphics::Gdi::*,
    UI::{Input::KeyboardAndMouse::*, WindowsAndMessaging::*},
};
#[derive(Clone)]
struct Screen {
    id: String,
    time: Instant,
    x: i32,
    y: i32,
    width: i32,
    height: i32,
}
// Desktop input and captures share one lock, keeping the overlay out of screenshots.
static DESKTOP_INPUT: Mutex<()> = Mutex::new(());
pub struct Computer {
    enabled: AtomicBool,
    accessibility: Mutex<HashMap<String,advanced::Observation>>,
    screens: Mutex<HashMap<String, Screen>>,
    windows: Mutex<HashMap<String,HashMap<String,WindowRef>>>,
}
struct WindowRef {handle:isize,pid:u32,time:Instant}
impl Default for Computer {
    fn default()->Self{Self{accessibility:Mutex::new(HashMap::new()),enabled:AtomicBool::new(true),screens:Mutex::new(HashMap::new()),windows:Mutex::new(HashMap::new())}}
}
unsafe extern "system" fn collect_window(handle:windows_sys::Win32::Foundation::HWND,data:isize)->i32 {if IsWindowVisible(handle)==0{return 1;}let length=GetWindowTextLengthW(handle);if length<=0{return 1;}let mut text=vec![0u16;(length as usize+1).min(1024)];let read=GetWindowTextW(handle,text.as_mut_ptr(),text.len() as i32);if read<=0{return 1;}let mut pid=0;GetWindowThreadProcessId(handle,&mut pid);let entries=&mut *(data as *mut Vec<(isize,u32,String)>);if entries.len()<200{entries.push((handle as isize,pid,String::from_utf16_lossy(&text[..read as usize])));}1}
fn list_windows(state:&Computer,owner:&str)->Result<Value,String>{let mut entries:Vec<(isize,u32,String)>=Vec::new();unsafe{if EnumWindows(Some(collect_window),&mut entries as *mut _ as isize)==0{return Err("Cannot enumerate visible Windows applications".into());}}let mut references=HashMap::new();let mut items=Vec::new();for(handle,pid,title)in entries{let id=Uuid::new_v4().to_string();references.insert(id.clone(),WindowRef{handle,pid,time:Instant::now()});items.push(json!({"window_id":id,"title":title,"process_id":pid}));}state.windows.lock().unwrap().insert(owner.into(),references);Ok(json!({"windows":items}))}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn screenshot_captures_real_windows_pixels_and_owner_geometry() {
        let state = Computer::default();
        let result = capture(&state, "test-owner").expect("Windows capture");
        let png = STANDARD
            .decode(result["screenshot"]["image"].as_str().unwrap())
            .unwrap();
        assert_eq!(&png[..8], b"\x89PNG\r\n\x1a\n");
        let image = image::load_from_memory(&png).unwrap();
        assert_eq!((image.width(), image.height()), (1280, 800));
        let screens = state.screens.lock().unwrap();
        assert!(screens.get("test-owner").unwrap().width > 0);
        assert!(screens.get("other-owner").is_none());
    }
    #[test]
    fn keyboard_names_are_validated_before_input() {
        assert_eq!(virtual_key("Ctrl").unwrap(), VK_CONTROL);
        assert_eq!(virtual_key("A").unwrap(), 65);
        assert!(virtual_key("F13").is_err());
        assert!(virtual_key("unknown").is_err());
    }
}
#[tauri::command]
pub async fn computer_grant(
    view: Webview,
    state: State<'_, Computer>,
    enabled: bool,
) -> Result<bool, String> {
    super::trusted(&view)?;
    let allowed = if enabled {
        tauri::async_runtime::spawn_blocking(||rfd::MessageDialog::new().set_title("Allow Windows computer control?").set_description("OpenClaude can capture your displays and use the mouse and keyboard from this chat. Actions run with your Windows permissions. You can disable access from this panel.").set_buttons(rfd::MessageButtons::YesNo).show()==rfd::MessageDialogResult::Yes).await.map_err(|e|e.to_string())?
    } else {
        false
    };
    state.enabled.store(allowed, Ordering::SeqCst);
    state.screens.lock().unwrap().clear();
    Ok(allowed)
}
fn capture(state: &Computer, owner: &str) -> Result<Value, String> {
    unsafe {
        let x = GetSystemMetrics(SM_XVIRTUALSCREEN);
        let y = GetSystemMetrics(SM_YVIRTUALSCREEN);
        let width = GetSystemMetrics(SM_CXVIRTUALSCREEN);
        let height = GetSystemMetrics(SM_CYVIRTUALSCREEN);
        if width <= 0 || height <= 0 {
            return Err("Windows display is unavailable".into());
        }
        let screen = GetDC(std::ptr::null_mut());
        let memory = CreateCompatibleDC(screen);
        let bitmap = CreateCompatibleBitmap(screen, 1280, 800);
        if screen.is_null() || memory.is_null() || bitmap.is_null() {
            if !bitmap.is_null() {
                DeleteObject(bitmap);
            }
            if !memory.is_null() {
                DeleteDC(memory);
            }
            if !screen.is_null() {
                ReleaseDC(std::ptr::null_mut(), screen);
            }
            return Err("Windows screenshot allocation failed".into());
        }
        let old = SelectObject(memory, bitmap);
        SetStretchBltMode(memory, HALFTONE);
        let copied = StretchBlt(
            memory,
            0,
            0,
            1280,
            800,
            screen,
            x,
            y,
            width,
            height,
            SRCCOPY | CAPTUREBLT,
        );
        SelectObject(memory, old);
        let mut info: BITMAPINFO = std::mem::zeroed();
        info.bmiHeader.biSize = std::mem::size_of::<BITMAPINFOHEADER>() as u32;
        info.bmiHeader.biWidth = 1280;
        info.bmiHeader.biHeight = -800;
        info.bmiHeader.biPlanes = 1;
        info.bmiHeader.biBitCount = 32;
        info.bmiHeader.biCompression = BI_RGB;
        let mut pixels = vec![0u8; 1280 * 800 * 4];
        let rows = GetDIBits(
            memory,
            bitmap,
            0,
            800,
            pixels.as_mut_ptr() as *mut _,
            &mut info,
            DIB_RGB_COLORS,
        );
        DeleteObject(bitmap);
        DeleteDC(memory);
        ReleaseDC(std::ptr::null_mut(), screen);
        if copied == 0 || rows != 800 {
            return Err("Windows screenshot failed; the secure desktop cannot be captured".into());
        }
        for pixel in pixels.chunks_exact_mut(4) {
            pixel.swap(0, 2);
            pixel[3] = 255;
        }
        let image =
            image::RgbaImage::from_raw(1280, 800, pixels).ok_or("Invalid screenshot pixels")?;
        let mut png = Cursor::new(Vec::new());
        image::DynamicImage::ImageRgba8(image)
            .write_to(&mut png, image::ImageFormat::Png)
            .map_err(|e| e.to_string())?;
        let id = Uuid::new_v4().to_string();
        state.screens.lock().unwrap().insert(
            owner.into(),
            Screen {
                id: id.clone(),
                time: Instant::now(),
                x,
                y,
                width,
                height,
            },
        );
        Ok(
            json!({"screenshot":{"screen_id":id,"width":1280,"height":800,"image":STANDARD.encode(png.into_inner()),"native":true,"display":{"x":x,"y":y,"width":width,"height":height},"coordinateSystem":"scaled virtual Windows desktop"}}),
        )
    }
}
fn input(items: &[INPUT]) -> Result<(), String> {
    unsafe {
        if SendInput(
            items.len() as u32,
            items.as_ptr(),
            std::mem::size_of::<INPUT>() as i32,
        ) != items.len() as u32
        {
            return Err(
                "Windows blocked input (the target may be elevated or on the secure desktop)"
                    .into(),
            );
        }
    }
    Ok(())
}
fn mouse(flags: u32, data: i32) -> INPUT {
    INPUT {
        r#type: INPUT_MOUSE,
        Anonymous: INPUT_0 {
            mi: MOUSEINPUT {
                dx: 0,
                dy: 0,
                mouseData: data as u32,
                dwFlags: flags,
                time: 0,
                dwExtraInfo: 0,
            },
        },
    }
}
fn key(code: u16, up: bool) -> INPUT {
    INPUT {
        r#type: INPUT_KEYBOARD,
        Anonymous: INPUT_0 {
            ki: KEYBDINPUT {
                wVk: code,
                wScan: 0,
                dwFlags: if up { KEYEVENTF_KEYUP } else { 0 },
                time: 0,
                dwExtraInfo: 0,
            },
        },
    }
}
fn screen_coordinates(screen: &Screen, x: f64, y: f64) -> Result<(i32,i32), String> {
    if !(0.0..1280.0).contains(&x) || !(0.0..800.0).contains(&y) {
        return Err("Coordinates must refer to the returned 1280x800 screenshot".into());
    }
    Ok((screen.x + (x * screen.width as f64 / 1280.0) as i32,screen.y + (y * screen.height as f64 / 800.0) as i32))
}
fn pointer(screen: &Screen, x: f64, y: f64) -> Result<(), String> {
    let (x,y)=screen_coordinates(screen,x,y)?;
    unsafe {
        if SetCursorPos(x,y) == 0
        {
            return Err("Windows pointer movement failed".into());
        }
    }
    Ok(())
}
fn virtual_key(name: &str) -> Result<u16, String> {
    let lower = name.to_lowercase();
    Ok(match lower.as_str() {
        "ctrl" | "control" => VK_CONTROL,
        "alt" => VK_MENU,
        "shift" => VK_SHIFT,
        "win" | "windows" | "meta" => VK_LWIN,
        "enter" | "return" => VK_RETURN,
        "escape" | "esc" => VK_ESCAPE,
        "tab" => VK_TAB,
        "space" => VK_SPACE,
        "backspace" => VK_BACK,
        "delete" => VK_DELETE,
        "up" => VK_UP,
        "down" => VK_DOWN,
        "left" => VK_LEFT,
        "right" => VK_RIGHT,
        "home" => VK_HOME,
        "end" => VK_END,
        "pageup" => VK_PRIOR,
        "pagedown" => VK_NEXT,
        _ => {
            if lower.len() == 1 && lower.as_bytes()[0].is_ascii_alphanumeric() {
                lower.to_ascii_uppercase().as_bytes()[0] as u16
            } else if lower.starts_with('f') {
                let number = lower[1..]
                    .parse::<u16>()
                    .map_err(|_| "Unsupported keyboard key")?;
                if !(1..=12).contains(&number) {
                    return Err("Unsupported function key".into());
                }
                VK_F1 + number - 1
            } else {
                return Err(format!("Unsupported keyboard key: {}", name));
            }
        }
    })
}
struct PointerRelease { keys:Vec<u16>, button:Option<(u32,i32)> }
unsafe extern "system" fn collect_app_text(handle:windows_sys::Win32::Foundation::HWND,data:isize)->i32 {
    let items=&mut *(data as *mut Vec<String>);if items.len()>=100{return 0;}if IsWindowVisible(handle)==0{return 1;}
    let mut class=[0u16;100];let count=GetClassNameW(handle,class.as_mut_ptr(),100);let class=String::from_utf16_lossy(&class[..count.max(0) as usize]);
    // Standard password edits must never be read into the model context.
    if class.eq_ignore_ascii_case("edit")&&GetWindowLongPtrW(handle,GWL_STYLE)&0x20!=0{return 1;}
    let mut buffer=[0u16;1024];let mut result=0usize;let sent=SendMessageTimeoutW(handle,WM_GETTEXT,buffer.len(),buffer.as_mut_ptr() as isize,SMTO_ABORTIFHUNG,30,&mut result);
    if sent!=0&&result>0{let text=String::from_utf16_lossy(&buffer[..result.min(buffer.len()-1)]).trim().to_string();if !text.is_empty(){items.push(text);}}1
}
impl Drop for PointerRelease {fn drop(&mut self){if let Some((flag,data))=self.button{let _=input(&[mouse(flag,data)]);}for code in self.keys.iter().rev(){let _=input(&[key(*code,true)]);}}}
#[tauri::command]
pub async fn computer_tool(
    view: Webview,
    state: State<'_, Computer>,
    name: String,
    args: Value,
    owner: String,
    request_id: String,
    cancellations: State<'_, super::cancellation::Cancellation>,
) -> Result<Value, String> {
    super::trusted(&view)?;
    if name=="computer_capabilities" {return Ok(json!({"tools":["computer_appshot","computer_pointer","computer_screenshot","computer_click","computer_move","computer_drag","computer_scroll","computer_type","computer_key","computer_wait","computer_windows","computer_focus_window","computer_open_application","computer_clipboard_read","computer_clipboard_write","computer_window_move","computer_window_resize","computer_window_close","computer_ui_tree","computer_ui_element_action"]}));}
    let request = cancellations.begin(&request_id);
    request.check()?;
    if name!="computer_screenshot"&&view.state::<super::Desktop>().download_prompt.load(Ordering::Acquire){return Err("User download approval is pending. The agent cannot approve or interact with this save dialog.".into());}
    state.require_control(&owner)?;
    if matches!(name.as_str(), "computer_clipboard_read"|"computer_clipboard_write"|"computer_window_move"|"computer_window_resize"|"computer_window_close"|"computer_ui_tree"|"computer_ui_element_action") { return advanced::execute(&state,&name,&args,&owner,&request); }
    if name == "computer_screenshot" {
        let _desktop = DESKTOP_INPUT.lock().map_err(|_| "Desktop control lock is unavailable")?;
        return capture(&state, &owner);
    }
    if name=="computer_appshot" {
        let _desktop=DESKTOP_INPUT.lock().map_err(|_|"Desktop control lock is unavailable")?;let mut result=capture(&state,&owner)?;let mut texts:Vec<String>=Vec::new();let mut title=[0u16;1024];let mut rectangle=windows_sys::Win32::Foundation::RECT{left:0,top:0,right:0,bottom:0};
        unsafe{let active=GetForegroundWindow();if !active.is_null(){let count=GetWindowTextW(active,title.as_mut_ptr(),1024);texts.push(String::from_utf16_lossy(&title[..count.max(0) as usize]));GetWindowRect(active,&mut rectangle);EnumChildWindows(active,Some(collect_app_text),&mut texts as *mut _ as isize);}}
        {let mut screens=state.screens.lock().unwrap();if let Some(screen)=screens.get_mut(&owner){let left=rectangle.left.max(screen.x);let top=rectangle.top.max(screen.y);let right=rectangle.right.min(screen.x+screen.width);let bottom=rectangle.bottom.min(screen.y+screen.height);if right>left&&bottom>top{if let Some(encoded)=result["screenshot"]["image"].as_str(){let bytes=STANDARD.decode(encoded).map_err(|e|e.to_string())?;let image=image::load_from_memory(&bytes).map_err(|e|e.to_string())?;let x=((left-screen.x) as f64/screen.width as f64*image.width() as f64).floor() as u32;let y=((top-screen.y) as f64/screen.height as f64*image.height() as f64).floor() as u32;let width=(((right-left) as f64/screen.width as f64*image.width() as f64).ceil() as u32).min(image.width()-x);let height=(((bottom-top) as f64/screen.height as f64*image.height() as f64).ceil() as u32).min(image.height()-y);if width>0&&height>0{let cropped=image.crop_imm(x,y,width,height).resize_exact(1280,800,image::imageops::FilterType::Lanczos3);let mut output=Cursor::new(Vec::new());cropped.write_to(&mut output,image::ImageFormat::Png).map_err(|e|e.to_string())?;result["screenshot"]["image"]=json!(STANDARD.encode(output.into_inner()));screen.x=left;screen.y=top;screen.width=right-left;screen.height=bottom-top;result["screenshot"]["display"]=json!({"x":left,"y":top,"width":right-left,"height":bottom-top});result["screenshot"]["coordinateSystem"]=json!("scaled foreground application region");result["screenshot"]["note"]=json!("Foreground application screenshot, scaled to 1280x800. Current screen_id coordinates map to this application region.");}}}}}
        result["application"]=json!({"text":texts.join("\n").chars().take(16000).collect::<String>(),"bounds":{"left":rectangle.left,"top":rectangle.top,"right":rectangle.right,"bottom":rectangle.bottom},"note":"Actual Windows control text where exposed; custom-rendered application content may require screenshot interpretation."});return Ok(result);
    }
    if name == "computer_wait" {
        let duration = args["duration_ms"].as_u64().unwrap_or(1000).min(5000);
        let flag = request.flag.clone();
        tauri::async_runtime::spawn_blocking(move || {
            for _ in 0..duration.div_ceil(100) {
                if flag.load(Ordering::SeqCst) {
                    break;
                }
                std::thread::sleep(Duration::from_millis(100));
            }
        })
        .await
        .map_err(|e| e.to_string())?;
        request.check()?;
        let _desktop = DESKTOP_INPUT.lock().map_err(|_| "Desktop control lock is unavailable")?;
        return capture(&state, &owner);
    }
    if name=="computer_windows" {return list_windows(&state,&owner);}
    if name=="computer_open_application" {
        let application=args["application"].as_str().ok_or("Application executable is required")?;
        if application.is_empty()||application.len()>1000||application.contains('\0')||(!std::path::Path::new(application).is_absolute()&&!application.chars().all(|c|c.is_ascii_alphanumeric()||"._-".contains(c))){return Err("Use an executable name or absolute executable path; shell command text is not accepted".into());}
        let arguments=args["arguments"].as_array().ok_or("Application arguments must be an array")?;
        if arguments.len()>30{return Err("At most 30 application arguments are allowed".into());}
        let values:Vec<&str>=arguments.iter().map(|value|value.as_str().filter(|text|text.len()<=4000&&!text.contains('\0')).ok_or("Invalid application argument")).collect::<Result<_,_>>()?;
        let child=std::process::Command::new(application).args(values).spawn().map_err(|e|e.to_string())?;
        std::thread::sleep(Duration::from_millis(250));
        let _desktop = DESKTOP_INPUT.lock().map_err(|_| "Desktop control lock is unavailable")?;
        let mut result=capture(&state,&owner)?;result["process_id"]=json!(child.id());return Ok(result);
    }
    if name=="computer_focus_window" {
        let id=args["window_id"].as_str().ok_or("Observed window ID is required")?;
        let windows=state.windows.lock().unwrap();let reference=windows.get(&owner).and_then(|items|items.get(id)).ok_or("List visible windows before choosing an observed window ID")?;
        if reference.time.elapsed()>Duration::from_secs(60){return Err("Window observation is stale; list windows again".into());}
        let handle=reference.handle as windows_sys::Win32::Foundation::HWND;let mut pid=0;unsafe{GetWindowThreadProcessId(handle,&mut pid);if pid!=reference.pid||IsWindowVisible(handle)==0{return Err("Window changed; list windows again".into());}ShowWindow(handle,SW_RESTORE);if SetForegroundWindow(handle)==0{return Err("Windows refused to focus this application; the user may need to bring it forward".into());}}
        drop(windows);let _desktop=DESKTOP_INPUT.lock().map_err(|_|"Desktop control lock is unavailable")?;return capture(&state,&owner);
    }
    let _desktop = DESKTOP_INPUT.lock().map_err(|_| "Desktop control lock is unavailable")?;
    request.check()?;
    let screen = state.take_screen(&owner,args["screen_id"].as_str())?;
    let indicator = super::control_indicator::ActiveIndicator::show(view.app_handle())?;
    if name=="computer_pointer" {
        let codes=args["modifiers"].as_array().map(|items|items.iter().map(|value|virtual_key(value.as_str().unwrap_or(""))).collect::<Result<Vec<_>,_>>()).transpose()?.unwrap_or_default();
        let mut release=PointerRelease{keys:vec![],button:None};for code in codes{input(&[key(code,false)])?;release.keys.push(code);}
        let x=args["x"].as_f64().ok_or("x required")?;let y=args["y"].as_f64().ok_or("y required")?;pointer(&screen,x,y)?;
        let (down,up,data)=match args["button"].as_str().unwrap_or("left"){"left"=>(MOUSEEVENTF_LEFTDOWN,MOUSEEVENTF_LEFTUP,0),"right"=>(MOUSEEVENTF_RIGHTDOWN,MOUSEEVENTF_RIGHTUP,0),"wheel"=>(MOUSEEVENTF_MIDDLEDOWN,MOUSEEVENTF_MIDDLEUP,0),"back"=>(MOUSEEVENTF_XDOWN,MOUSEEVENTF_XUP,1),"forward"=>(MOUSEEVENTF_XDOWN,MOUSEEVENTF_XUP,2),_=>return Err("Invalid pointer button".into())};
        match args["action"].as_str().unwrap_or(""){
            "move"=>{},
            "click"|"double_click"=>{for _ in 0..if args["action"]=="double_click"{2}else{1}{request.check()?;input(&[mouse(down,data)])?;release.button=Some((up,data));input(&[mouse(up,data)])?;release.button=None;}},
            "scroll"=>{let horizontal=args["scroll_x"].as_i64().unwrap_or(0).clamp(-20,20) as i32;let vertical=args["scroll_y"].as_i64().unwrap_or(0).clamp(-20,20) as i32;if horizontal!=0{input(&[mouse(MOUSEEVENTF_HWHEEL,horizontal*120)])?;}if vertical!=0{input(&[mouse(MOUSEEVENTF_WHEEL,vertical*120)])?;}},
            "drag"=>{let points=args["path"].as_array().ok_or("Drag path required")?;if points.len()<2||points.len()>100{return Err("Drag path must contain 2 to 100 points".into());}let duration=args["duration_ms"].as_u64().unwrap_or(500).clamp(100,3000);for (index,point) in points.iter().enumerate(){request.check()?;pointer(&screen,point["x"].as_f64().ok_or("Path x required")?,point["y"].as_f64().ok_or("Path y required")?)?;if index==0{input(&[mouse(down,data)])?;release.button=Some((up,data));}std::thread::sleep(Duration::from_millis(duration/points.len() as u64));}},
            _=>return Err("Unknown pointer operation".into())
        }drop(release);drop(indicator);return capture(&state,&owner);
    }
    match name.as_str() {
        "computer_move" => pointer(
            &screen,
            args["x"].as_f64().ok_or("x required")?,
            args["y"].as_f64().ok_or("y required")?,
        )?,
        "computer_click" => {
            pointer(
                &screen,
                args["x"].as_f64().ok_or("x required")?,
                args["y"].as_f64().ok_or("y required")?,
            )?;
            let (down, up) = match args["button"].as_str().unwrap_or("left") {
                "left" => (MOUSEEVENTF_LEFTDOWN, MOUSEEVENTF_LEFTUP),
                "right" => (MOUSEEVENTF_RIGHTDOWN, MOUSEEVENTF_RIGHTUP),
                "middle" => (MOUSEEVENTF_MIDDLEDOWN, MOUSEEVENTF_MIDDLEUP),
                _ => return Err("Invalid mouse button".into()),
            };
            for _ in 0..args["click_count"].as_u64().unwrap_or(1).clamp(1, 2) {
                input(&[mouse(down, 0), mouse(up, 0)])?;
            }
        }
        "computer_scroll" => input(&[mouse(
            MOUSEEVENTF_WHEEL,
            args["amount"]
                .as_i64()
                .ok_or("Scroll amount required")?
                .clamp(-20, 20) as i32
                * 120,
        )])?,
        "computer_type" => {
            let text = args["text"].as_str().ok_or("Text required")?;
            if text.len() > 80000 {
                return Err("Text exceeds input limit".into());
            }
            for unit in text.encode_utf16() {
                request.check()?;
                if !state.enabled.load(Ordering::SeqCst) {
                    return Err("Windows control was disabled".into());
                }
                input(&[
                    INPUT {
                        r#type: INPUT_KEYBOARD,
                        Anonymous: INPUT_0 {
                            ki: KEYBDINPUT {
                                wVk: 0,
                                wScan: unit,
                                dwFlags: KEYEVENTF_UNICODE,
                                time: 0,
                                dwExtraInfo: 0,
                            },
                        },
                    },
                    INPUT {
                        r#type: INPUT_KEYBOARD,
                        Anonymous: INPUT_0 {
                            ki: KEYBDINPUT {
                                wVk: 0,
                                wScan: unit,
                                dwFlags: KEYEVENTF_UNICODE | KEYEVENTF_KEYUP,
                                time: 0,
                                dwExtraInfo: 0,
                            },
                        },
                    },
                ])?;
            }
        }
        "computer_key" => {
            let names = args["keys"].as_array().ok_or("Keys required")?;
            if names.is_empty() || names.len() > 5 {
                return Err("Use 1 to 5 keyboard keys".into());
            }
            let codes: Vec<u16> = names
                .iter()
                .map(|name| virtual_key(name.as_str().unwrap_or("")))
                .collect::<Result<_, _>>()?;
            let mut events: Vec<INPUT> = codes.iter().map(|code| key(*code, false)).collect();
            events.extend(codes.iter().rev().map(|code| key(*code, true)));
            input(&events)?;
        }
        "computer_drag" => {
            let sx = args["start_x"].as_f64().ok_or("start_x required")?;
            let sy = args["start_y"].as_f64().ok_or("start_y required")?;
            let ex = args["end_x"].as_f64().ok_or("end_x required")?;
            let ey = args["end_y"].as_f64().ok_or("end_y required")?;
            pointer(&screen, sx, sy)?;
            input(&[mouse(MOUSEEVENTF_LEFTDOWN, 0)])?;
            let duration = args["duration"].as_f64().unwrap_or(0.5).clamp(0.1, 3.0);
            let result = (|| {
                for step in 1..=20 {
                    request.check()?;
                    if !state.enabled.load(Ordering::SeqCst) {
                        return Err("Windows control was disabled".into());
                    }
                    let fraction = step as f64 / 20.0;
                    pointer(
                        &screen,
                        sx + (ex - sx) * fraction,
                        sy + (ey - sy) * fraction,
                    )?;
                    std::thread::sleep(Duration::from_secs_f64(duration / 20.0));
                }
                Ok::<(), String>(())
            })();
            let release = input(&[mouse(MOUSEEVENTF_LEFTUP, 0)]);
            result?;
            release?;
        }
        _ => return Err(format!("Native computer tool is unavailable: {}", name)),
    }
    drop(indicator);
    capture(&state, &owner)
}

impl Computer {
    fn require_control(&self,owner:&str)->Result<(),String>{
        if !self.enabled.load(Ordering::SeqCst){return Err("Enable Windows computer control in the desktop panel first".into());}
        if owner.is_empty(){return Err("Computer tools require a conversation owner".into());}Ok(())
    }
    fn take_screen(&self,owner:&str,id:Option<&str>)->Result<Screen,String>{
        let screen=self.screens.lock().unwrap().remove(owner).ok_or("Capture a fresh screenshot before using computer input")?;
        if id!=Some(screen.id.as_str())||screen.time.elapsed()>Duration::from_secs(60){return Err("Screenshot is stale; capture the screen again".into());}Ok(screen)
    }
}
#[cfg(test)]mod computer_contract_tests {
    use super::*;
    fn observed(time:Instant)->Screen{Screen{id:"fixture".into(),time,x:-1920,y:100,width:1920,height:1080}}
    #[test]fn coordinates_validate_before_any_input_and_map_virtual_desktop(){let screen=observed(Instant::now());assert_eq!(screen_coordinates(&screen,0.0,0.0).unwrap(),(-1920,100));assert_eq!(screen_coordinates(&screen,640.0,400.0).unwrap(),(-960,640));for(x,y)in [(-1.0,0.0),(1280.0,0.0),(0.0,800.0),(f64::NAN,0.0),(0.0,f64::INFINITY)]{assert!(screen_coordinates(&screen,x,y).is_err());}}
    #[test]fn observations_are_owner_scoped_fresh_and_single_use(){let state=Computer::default();state.screens.lock().unwrap().insert("owner".into(),observed(Instant::now()));assert!(state.take_screen("foreign",Some("fixture")).is_err());assert!(state.take_screen("owner",Some("fixture")).is_ok());assert!(state.take_screen("owner",Some("fixture")).is_err());state.screens.lock().unwrap().insert("owner".into(),observed(Instant::now()-Duration::from_secs(61)));assert!(state.take_screen("owner",Some("fixture")).err().unwrap().contains("stale"));state.screens.lock().unwrap().insert("owner".into(),observed(Instant::now()));assert!(state.take_screen("owner",Some("different")).is_err());}
    #[test]fn revoked_grant_and_missing_owner_block_input(){let state=Computer::default();assert!(state.require_control("owner").is_ok());assert!(state.require_control("").is_err());state.enabled.store(false,Ordering::SeqCst);assert!(state.require_control("owner").is_err());}
}
