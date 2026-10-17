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
pub struct Computer {
    enabled: AtomicBool,
    screens: Mutex<HashMap<String, Screen>>,
}
impl Default for Computer {
    fn default()->Self{Self{enabled:AtomicBool::new(true),screens:Mutex::new(HashMap::new())}}
}
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
fn pointer(screen: &Screen, x: f64, y: f64) -> Result<(), String> {
    if !(0.0..1280.0).contains(&x) || !(0.0..800.0).contains(&y) {
        return Err("Coordinates must refer to the returned 1280x800 screenshot".into());
    }
    unsafe {
        if SetCursorPos(
            screen.x + (x * screen.width as f64 / 1280.0) as i32,
            screen.y + (y * screen.height as f64 / 800.0) as i32,
        ) == 0
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
    let request = cancellations.begin(&request_id);
    request.check()?;
    if name!="computer_screenshot"&&view.state::<super::Desktop>().download_prompt.load(Ordering::Acquire){return Err("User download approval is pending. The agent cannot approve or interact with this save dialog.".into());}
    if !state.enabled.load(Ordering::SeqCst) {
        return Err("Enable Windows computer control in the desktop panel first".into());
    }
    if owner.is_empty() {
        return Err("Computer tools require a conversation owner".into());
    }
    if name == "computer_screenshot" {
        return capture(&state, &owner);
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
        return capture(&state, &owner);
    }
    let screen = state
        .screens
        .lock()
        .unwrap()
        .remove(&owner)
        .ok_or("Capture a fresh screenshot before using computer input")?;
    if args["screen_id"].as_str() != Some(&screen.id)
        || screen.time.elapsed() > Duration::from_secs(60)
    {
        return Err("Screenshot is stale; capture the screen again".into());
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
    capture(&state, &owner)
}
