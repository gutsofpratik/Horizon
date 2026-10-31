use std::{path::{Path,PathBuf},sync::atomic::{AtomicBool,Ordering}};
use tauri::{Manager,Webview};

fn interface_origin(value:&str)->bool{
    tauri::Url::parse(value).is_ok_and(|url|{
        let path=url.path().strip_prefix("/desktop").unwrap_or(url.path());
        url.scheme()=="http"&&url.host_str()==Some("127.0.0.1")&&url.port()==Some(3001)
            &&(matches!(path,"/"|"/new"|"/skills"|"/projects"|"/artifacts"|"/settings")||path.starts_with("/chat/"))
    })
}
#[cfg(test)]mod interface_permission_tests{
    use super::interface_origin;
    #[test]fn only_trusted_app_documents_receive_automatic_permissions(){
        assert!(interface_origin("http://127.0.0.1:3001/desktop/new"));
        assert!(interface_origin("http://127.0.0.1:3001/chat/fixture"));
        for value in ["https://example.com/","http://127.0.0.1:3001/api/files/id/preview","http://127.0.0.1:3001/browser-preview/ticket","http://127.0.0.1:5174/new","file:///private.html"]{assert!(!interface_origin(value),"{value}");}
    }
}
/// Grant only app-interface clipboard/microphone prompts, never website frames.
#[cfg(windows)]
pub fn configure_interface(view:&Webview)->Result<(),String>{
    if view.label()!="main"{return Err("Interface permissions require the main view".into());}
    view.with_webview(move|platform|{
        use webview2_com::{PermissionRequestedEventHandler,take_pwstr,Microsoft::Web::WebView2::Win32::*};
        let result=unsafe{platform.controller().CoreWebView2().and_then(|core|{
            let mut token=0;
            core.add_PermissionRequested(&PermissionRequestedEventHandler::create(Box::new(|_,args|{
                let Some(args)=args else{return Ok(())};
                let mut uri=windows_core::PWSTR::null();args.Uri(&mut uri)?;let uri=take_pwstr(uri);
                let mut kind=COREWEBVIEW2_PERMISSION_KIND::default();args.PermissionKind(&mut kind)?;
                if interface_origin(&uri)&&matches!(kind,COREWEBVIEW2_PERMISSION_KIND_MICROPHONE|COREWEBVIEW2_PERMISSION_KIND_CLIPBOARD_READ){args.SetState(COREWEBVIEW2_PERMISSION_STATE_ALLOW)?;}
                Ok(())
            })),&mut token)
        })};if let Err(error)=result{eprintln!("Interface permissions unavailable: {error}");}
    }).map_err(|error|error.to_string())
}
#[cfg(not(windows))]
pub fn configure_interface(_view:&Webview)->Result<(),String>{Ok(())}

pub fn allowed_navigation(url:&tauri::Url)->bool{
    let local=matches!(url.host_str(),Some("127.0.0.1"|"localhost"|"[::1]"|"::1"|"0.0.0.0"));
    if local&&matches!(url.port_or_known_default(),Some(3001|5173|5174)){
        let ticket=url.path().strip_prefix("/browser-preview/").is_some_and(|value|value.len()==64&&value.chars().all(|c|c.is_ascii_hexdigit()));
        return ticket||url.path()=="/api/connectors/oauth/callback";
    }
    matches!(url.scheme(),"http"|"https"|"about")&&url.username().is_empty()&&url.password().is_none()
}

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
        // This callback runs on the WebView thread. A synchronous view.url() getter
        // re-enters that thread and can deadlock before the save dialog appears.
        // set_parent(&view.window()) also performs a synchronous window-handle
        // getter; keep this modal independent of the WebView event dispatcher.
        let origin=url.host_str().unwrap_or("this website");
        let selected=rfd::FileDialog::new().set_title(format!("Download from {origin} — choose where to save")).set_file_name(download_name(destination)).save_file();
        let approved=approved_path(selected,destination);
        super::browser_manage::downloaded(view.app_handle(),view.label(),&url,if approved{Some(destination.as_path())}else{None},if approved{"downloading"}else{"cancelled"});
        return approved;
    }
    if let tauri::webview::DownloadEvent::Finished{url,path,success}=event{super::browser_manage::downloaded(view.app_handle(),view.label(),&url,path.as_deref(),if success{"completed"}else{"failed"});}
    true
}

#[cfg(windows)]
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

#[cfg(not(windows))]
pub fn configure(view:&Webview)->Result<(),String>{*view.app_handle().state::<super::Desktop>().browser_passwords.lock().map_err(|_|"Browser preferences unavailable")?=Some(false);Ok(())}

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

#[cfg(test)]mod navigation_contract_tests {
    use super::*;
    #[test]fn agent_browser_rejects_every_application_interface_port(){
        for port in [3001,5173,5174]{let url=tauri::Url::parse(&format!("http://127.0.0.1:{port}/desktop/new")).unwrap();assert!(!allowed_navigation(&url),"Privileged interface admitted: {url}");}
        let preview=tauri::Url::parse(&format!("http://127.0.0.1:3001/browser-preview/{}","a".repeat(64))).unwrap();assert!(allowed_navigation(&preview));
        assert!(allowed_navigation(&tauri::Url::parse("https://example.com/").unwrap()));assert!(!allowed_navigation(&tauri::Url::parse("file:///C:/private.txt").unwrap()));
    }
}
