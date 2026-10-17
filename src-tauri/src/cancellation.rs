use std::{
    collections::HashMap,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
};
use tauri::{State, Webview};
#[derive(Default)]
pub struct Cancellation {
    requests: Mutex<HashMap<String, Arc<AtomicBool>>>,
}
impl Cancellation {
    pub fn flag(&self, id: &str) -> Arc<AtomicBool> {
        self.requests
            .lock()
            .unwrap()
            .entry(id.into())
            .or_default()
            .clone()
    }
    pub fn finish(&self, id: &str) {
        self.requests.lock().unwrap().remove(id);
    }
}
pub struct Request<'a> {
    state: &'a Cancellation,
    id: String,
    pub flag: Arc<AtomicBool>,
}
impl Request<'_> {
    pub fn check(&self) -> Result<(), String> {
        if self.flag.load(Ordering::SeqCst) {
            Err("Desktop command cancelled".into())
        } else {
            Ok(())
        }
    }
}
impl Drop for Request<'_> {
    fn drop(&mut self) {
        self.state.finish(&self.id);
    }
}
impl Cancellation {
    pub fn begin(&self, id: &str) -> Request<'_> {
        Request {
            state: self,
            id: id.into(),
            flag: self.flag(id),
        }
    }
}
#[tauri::command]
pub fn native_cancel(
    view: Webview,
    state: State<Cancellation>,
    request_id: String,
) -> Result<(), String> {
    super::trusted(&view)?;
    state.flag(&request_id).store(true, Ordering::SeqCst);
    Ok(())
}
