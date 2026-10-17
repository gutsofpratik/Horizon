use std::{path::{Path,PathBuf},sync::atomic::{AtomicBool,Ordering}};
use tauri::{Manager,Webview};

fn download_name(path:&Path)->String{
    let raw=path.file_name().unwrap_or_default().to_string_lossy();
    let name:String=raw.chars().filter(|c|!c.is_control()&&!matches!(*c,'/'|'\\'|':'|'*'|'?'|'"'|'<'|'>'|'|'|'\u{202a}'..='\u{202e}'|'\u{2066}'..='\u{2069}')).take(180).collect();
    let name=name.trim_matches([' ','.']);if name.is_empty(){"download".into()}else{name.into()}
}

// No path is accepted until the native save dialog returns an explicit choice.
fn approved_path(choice:Option<PathBuf>,destination:&mut PathBuf)->bool{
    if let Some(path)=choice.filter(|path|path.is_absolute()) {*destination=path;true}else{false}
}

pub fn download(view:Webview,event:tauri::webview::DownloadEvent<'_>)->bool{
    if let tauri::webview::DownloadEvent::Requested{url,destination}=event{
        let state=view.state::<super::Desktop>();
        if state.download_prompt.swap(true,Ordering::AcqRel){return false;}
        struct Prompt<'a>(&'a AtomicBool);impl Drop for Prompt<'_>{fn drop(&mut self){self.0.store(false,Ordering::Release);}}
        let _prompt=Prompt(&state.download_prompt);
        let origin=view.url().ok().and_then(|url|url.host_str().map(str::to_owned)).or_else(||url.host_str().map(str::to_owned)).unwrap_or_else(||"this website".into());
        let selected=rfd::FileDialog::new().set_parent(&view.window()).set_title(format!("Download from {origin} — choose where to save")).set_file_name(download_name(destination)).save_file();
        let approved=approved_path(selected,destination);
        super::browser_manage::downloaded(view.app_handle(),&url,if approved{Some(destination.as_path())}else{None},if approved{"downloading"}else{"cancelled"});
        return approved;
    }
    if let tauri::webview::DownloadEvent::Finished{url,path,success}=event{super::browser_manage::downloaded(view.app_handle(),&url,path.as_deref(),if success{"completed"}else{"failed"});}
    true
}

pub fn configure(view:&Webview)->Result<(),String>{
    let app=view.app_handle().clone();
    let preferences=super::browser_manage::preferences(&app);
    view.with_webview(move|platform|{
        use windows_core::Interface;
        use webview2_com::Microsoft::Web::WebView2::Win32::{ICoreWebView2Settings4,ICoreWebView2Settings8};
        let result=unsafe{platform.controller().CoreWebView2().and_then(|core|{
            let settings=core.Settings()?;
            settings.cast::<ICoreWebView2Settings8>()?.SetIsReputationCheckingRequired(true)?;
            let passwords=settings.cast::<ICoreWebView2Settings4>()?;
            passwords.SetIsPasswordAutosaveEnabled(preferences["passwords"].as_bool().unwrap_or(true))?;
            passwords.SetIsGeneralAutofillEnabled(preferences["autofill"].as_bool().unwrap_or(true))?;
            Ok(())
        })};
        *app.state::<super::Desktop>().browser_passwords.lock().unwrap()=Some(result.is_ok());
        if let Err(error)=result{eprintln!("Browser password/reputation settings unavailable: {error}");}
    }).map_err(|error|error.to_string())
}

#[cfg(test)]mod tests{
    use super::*;
    #[test]fn cancelling_or_relative_destination_never_allows_a_download(){
        let original=PathBuf::from("C:\\Downloads\\original.txt");let mut target=original.clone();
        assert!(!approved_path(None,&mut target));assert_eq!(target,original);
        assert!(!approved_path(Some(PathBuf::from("relative.txt")),&mut target));assert_eq!(target,original);
        let allowed=PathBuf::from("C:\\Downloads\\chosen.txt");assert!(approved_path(Some(allowed.clone()),&mut target));assert_eq!(target,allowed);
    }
    #[test]fn website_filename_cannot_disguise_its_extension_with_bidi_controls(){
        assert_eq!(download_name(Path::new("report\u{202e}exe.pdf")),"reportexe.pdf");
        assert_eq!(download_name(Path::new("...")),"download");
    }
}
