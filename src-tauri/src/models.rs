use tauri::Webview;
#[tauri::command]
pub async fn model_pick(view: Webview, format: String) -> Result<Option<String>, String> {
    super::trusted(&view)?;
    let path = tauri::async_runtime::spawn_blocking(move || match format.as_str() {
        "gguf" => rfd::FileDialog::new()
            .set_title("Choose GGUF model")
            .add_filter("GGUF model", &["gguf"])
            .pick_file(),
        "safetensors" => rfd::FileDialog::new()
            .set_title("Choose complete safetensors model folder")
            .pick_folder(),
        _ => None,
    })
    .await
    .map_err(|e| e.to_string())?;
    Ok(path.map(|path| path.to_string_lossy().into()))
}
#[tauri::command]
pub async fn model_configuration_pick(view: Webview) -> Result<Option<serde_json::Value>, String> {
    super::trusted(&view)?;
    let path = tauri::async_runtime::spawn_blocking(|| {
        rfd::FileDialog::new()
            .set_title("Choose model configuration JSON")
            .add_filter("JSON", &["json"])
            .pick_file()
    })
    .await
    .map_err(|e| e.to_string())?;
    let Some(path) = path else { return Ok(None) };
    if std::fs::metadata(&path).map_err(|e| e.to_string())?.len() > 262144 {
        return Err("Model configuration JSON exceeds 256 KiB".into());
    }
    let source = std::fs::read_to_string(path).map_err(|e| e.to_string())?;
    Ok(Some(
        serde_json::from_str(&source).map_err(|e| e.to_string())?,
    ))
}
