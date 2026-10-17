//! A display-only overlay. It has no capability entry and cannot invoke native commands.
use tauri::{AppHandle, Manager, PhysicalPosition, PhysicalSize, WebviewUrl, WebviewWindow, WebviewWindowBuilder};
use windows_sys::Win32::UI::WindowsAndMessaging::{GetSystemMetrics, SetWindowPos, ShowWindow, HWND_TOPMOST, SM_CXVIRTUALSCREEN, SM_CYVIRTUALSCREEN, SM_XVIRTUALSCREEN, SM_YVIRTUALSCREEN, SW_HIDE, SWP_NOACTIVATE, SWP_SHOWWINDOW};

const LABEL: &str = "computer-control-indicator";
const URL: &str = "http://127.0.0.1:3001/desktop/control-indicator";

#[link(name = "dwmapi")]
extern "system" { fn DwmFlush() -> i32; }

/// Warm the webview while hidden so even the first short input has rendered UI.
pub fn prepare(app: &AppHandle) -> Result<WebviewWindow, String> {
    if let Some(window) = app.get_webview_window(LABEL) { return Ok(window); }
    let window = WebviewWindowBuilder::new(app, LABEL, WebviewUrl::External(tauri::Url::parse(URL).map_err(|error|error.to_string())?))
        .title("OpenClaude computer control")
        .transparent(true).background_color(tauri::window::Color(0, 0, 0, 0))
        .decorations(false).shadow(false).resizable(false)
        .always_on_top(true).skip_taskbar(true).focused(false).focusable(false).visible(false)
        .disable_drag_drop_handler()
        .on_navigation(|url| url.as_str() == URL)
        .on_new_window(|_, _| tauri::webview::NewWindowResponse::Deny)
        .build().map_err(|error| error.to_string())?;
    // Configure pass-through while still hidden: no frame can intercept input.
    if let Err(error) = window.set_ignore_cursor_events(true) {
        let _ = window.destroy();
        return Err(error.to_string());
    }
    Ok(window)
}

pub struct ActiveIndicator(WebviewWindow);
impl ActiveIndicator {
    pub fn show(app: &AppHandle) -> Result<Self, String> {
        let window = prepare(app)?;
        unsafe {
            let x = GetSystemMetrics(SM_XVIRTUALSCREEN);
            let y = GetSystemMetrics(SM_YVIRTUALSCREEN);
            let width = GetSystemMetrics(SM_CXVIRTUALSCREEN);
            let height = GetSystemMetrics(SM_CYVIRTUALSCREEN);
            if width <= 0 || height <= 0 { return Err("Windows display is unavailable".into()); }
            // Physical coordinates cover all monitors, including negative origins.
            window.set_position(PhysicalPosition::new(x, y)).map_err(|error|error.to_string())?;
            window.set_size(PhysicalSize::new(width as u32, height as u32)).map_err(|error|error.to_string())?;
            let hwnd = window.hwnd().map_err(|error|error.to_string())?.0 as _;
            if SetWindowPos(hwnd, HWND_TOPMOST, x, y, width, height, SWP_NOACTIVATE | SWP_SHOWWINDOW) == 0 {
                ShowWindow(hwnd, SW_HIDE);
                return Err("Windows could not show the computer control indicator".into());
            }
            DwmFlush();
        }
        Ok(Self(window))
    }
}
impl Drop for ActiveIndicator {
    fn drop(&mut self) {
        if let Ok(hwnd) = self.0.hwnd() {
            unsafe {
                // Hide synchronously, then let the compositor finish before any capture.
                ShowWindow(hwnd.0 as _, SW_HIDE);
                DwmFlush();
            }
        }
    }
}
