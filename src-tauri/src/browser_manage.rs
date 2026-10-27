use serde_json::{json,Value};
use std::{path::{Path,PathBuf},sync::mpsc,time::{Duration,SystemTime,UNIX_EPOCH}};
use tauri::{Manager,State,Webview};
use windows_core::{Interface,PCWSTR};
use webview2_com::{Microsoft::Web::WebView2::Win32::*,CallDevToolsProtocolMethodCompletedHandler,ProfileGetBrowserExtensionsCompletedHandler,ProfileAddBrowserExtensionCompletedHandler,BrowserExtensionRemoveCompletedHandler,ClearBrowsingDataCompletedHandler,take_pwstr};

#[derive(Default)]pub struct BrowserData{loaded:bool,value:Value}
fn timestamp()->u64{SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_secs()}
fn data_file(app:&tauri::AppHandle)->Result<PathBuf,String>{Ok(app.path().app_local_data_dir().map_err(|e|e.to_string())?.join("browser-data.json"))}
fn access<T>(app:&tauri::AppHandle,edit:bool,f:impl FnOnce(&mut Value)->T)->Result<T,String>{
 let state=app.state::<super::Desktop>();let mut data=state.browser_data.lock().unwrap();let path=data_file(app)?;
 access_data(&mut data,&path,edit,f)
}
fn access_data<T>(data:&mut BrowserData,path:&Path,edit:bool,f:impl FnOnce(&mut Value)->T)->Result<T,String>{
 if !data.loaded{data.value=std::fs::read(&path).ok().and_then(|bytes|serde_json::from_slice(&bytes).ok()).unwrap_or_else(||json!({"history":[],"downloads":[],"preferences":{"passwords":true,"autofill":true}}));if !data.value.is_object(){data.value=json!({});}for key in ["history","downloads"]{if !data.value[key].is_array(){data.value[key]=json!([]);}}if !data.value["preferences"].is_object(){data.value["preferences"]=json!({"passwords":true,"autofill":true});}data.loaded=true;}
 let result=f(&mut data.value);
 if edit{std::fs::create_dir_all(path.parent().unwrap()).map_err(|e|e.to_string())?;let temporary=path.with_extension("tmp");std::fs::write(&temporary,serde_json::to_vec(&data.value).map_err(|e|e.to_string())?).map_err(|e|e.to_string())?;std::fs::rename(temporary,path).map_err(|e|e.to_string())?;}
 Ok(result)
}
pub fn preferences(app:&tauri::AppHandle)->Value{access(app,false,|data|data["preferences"].clone()).unwrap_or_else(|_|json!({"passwords":true,"autofill":true}))}
pub fn visit(app:&tauri::AppHandle,url:&tauri::Url){if matches!(url.scheme(),"http"|"https") {let _=access(app,true,|data|{let items=data["history"].as_array_mut().unwrap();if items.last().and_then(|v|v["url"].as_str())!=Some(url.as_str()){items.push(json!({"url":url.as_str(),"time":timestamp()}));}});}}
pub fn downloaded(app:&tauri::AppHandle,tab:&str,url:&tauri::Url,path:Option<&std::path::Path>,status:&str){let _=access(app,true,|data|{
 let items=data["downloads"].as_array_mut().unwrap();
 if status=="failed"&&items.last().is_some_and(|item|item["tab_id"]==tab&&item["url"]==url.as_str()&&item["status"]=="cancelled"){return;}
 if status!="downloading"{if let Some(item)=items.iter_mut().rev().find(|item|item["tab_id"]==tab&&item["url"]==url.as_str()&&item["status"]=="downloading"){item["status"]=json!(status);if let Some(path)=path{item["path"]=json!(path);}return;}}
 items.push(json!({"tab_id":tab,"url":url.as_str(),"path":path,"status":status,"time":timestamp()}));
});}
pub fn downloads_for(app:&tauri::AppHandle,tab:&str)->Value{access(app,false,|data|json!({"downloads":data["downloads"].as_array().unwrap().iter().rev().filter(|item|item["tab_id"]==tab).take(30).map(|item|json!({"url":item["url"],"status":item["status"],"time":item["time"],"name":item["path"].as_str().and_then(|path|std::path::Path::new(path).file_name()).map(|name|name.to_string_lossy().into_owned())})).collect::<Vec<Value>>()})).unwrap_or_else(|error|json!({"error":error}))}

async fn receive(receiver:mpsc::Receiver<Result<Value,String>>)->Result<Value,String>{tauri::async_runtime::spawn_blocking(move||receiver.recv_timeout(Duration::from_secs(20))).await.map_err(|e|e.to_string())?.map_err(|_|"Browser operation timed out".to_string())?}
pub async fn protocol(view:Webview,method:&str,parameters:Value)->Result<Value,String>{
 let method=method.to_string();let parameters=parameters.to_string();let(sender,receiver)=mpsc::channel();
 view.with_webview(move|platform|{let callback_sender=sender.clone();let method:Vec<u16>=method.encode_utf16().chain(Some(0)).collect();let parameters:Vec<u16>=parameters.encode_utf16().chain(Some(0)).collect();
  let result=unsafe{platform.controller().CoreWebView2().and_then(|core|core.CallDevToolsProtocolMethod(PCWSTR(method.as_ptr()),PCWSTR(parameters.as_ptr()),&CallDevToolsProtocolMethodCompletedHandler::create(Box::new(move|status,response|{let result=status.map_err(|e|e.to_string()).and_then(|_|serde_json::from_str(&response).map_err(|e|e.to_string()));let _=callback_sender.send(result);Ok(())}))))};
  if let Err(error)=result{let _=sender.send(Err(error.to_string()));}
 }).map_err(|e|e.to_string())?;receive(receiver).await
}
async fn zoom(view:Webview,factor:f64)->Result<Value,String>{
 if !factor.is_finite()||!(0.25..=5.0).contains(&factor){return Err("Zoom must be between 25% and 500%".into());}
 let(sender,receiver)=mpsc::channel();view.with_webview(move|platform|{let result=unsafe{platform.controller().SetZoomFactor(factor)};let _=sender.send(result.map(|_|json!({"zoom":factor})).map_err(|e|e.to_string()));}).map_err(|e|e.to_string())?;receive(receiver).await
}
pub async fn page_action(view:Webview,action:&str,args:Value)->Result<Value,String>{match action{
 "find"=>{let text=args["text"].as_str().ok_or("Find text is required")?;if text.len()>1000{return Err("Find text is too long".into());}super::browser_tools::evaluate(view,format!("({{found:window.find({},false,{},true,false,false,false)}})",serde_json::to_string(text).unwrap(),args["backwards"].as_bool().unwrap_or(false))).await},
 "print"=>{let(sender,receiver)=mpsc::channel();view.with_webview(move|platform|{let result=unsafe{platform.controller().CoreWebView2().and_then(|core|core.cast::<ICoreWebView2_16>()?.ShowPrintUI(COREWEBVIEW2_PRINT_DIALOG_KIND_SYSTEM))};let _=sender.send(result.map(|_|json!({"status":"print_dialog_requested","summary":"System print dialog requested; printing requires the user choice"})).map_err(|e|e.to_string()));}).map_err(|e|e.to_string())?;receive(receiver).await},
 "zoom"=>zoom(view,args["factor"].as_f64().ok_or("Zoom factor is required")?).await,
 "device"=>{if args["enabled"]==false {protocol(view.clone(),"Emulation.clearDeviceMetricsOverride",json!({})).await?;protocol(view,"Emulation.setTouchEmulationEnabled",json!({"enabled":false})).await}else{let width=args["width"].as_u64().unwrap_or(390);let height=args["height"].as_u64().unwrap_or(844);if !(240..=3840).contains(&width)||!(240..=3840).contains(&height){return Err("Device dimensions must be 240–3840 pixels".into());}protocol(view.clone(),"Emulation.setDeviceMetricsOverride",json!({"width":width,"height":height,"deviceScaleFactor":1,"mobile":true})).await?;protocol(view,"Emulation.setTouchEmulationEnabled",json!({"enabled":true})).await}},
 _=>Err("Unknown browser page operation".into())}}

async fn extensions(view:Webview,action:String,path:Option<PathBuf>,id:String)->Result<Value,String>{
 let(sender,receiver)=mpsc::channel();
 view.with_webview(move|platform|{
  let result=(||unsafe{
   let profile=platform.controller().CoreWebView2()?.cast::<ICoreWebView2_13>()?.Profile()?.cast::<ICoreWebView2Profile7>()?;
   if action=="extension_add"{
    let path:Vec<u16>=path.unwrap().to_string_lossy().encode_utf16().chain(Some(0)).collect();let tx=sender.clone();
    profile.AddBrowserExtension(PCWSTR(path.as_ptr()),&ProfileAddBrowserExtensionCompletedHandler::create(Box::new(move|status,_|{let _=tx.send(status.map(|_|json!({"installed":true})).map_err(|e|e.to_string()));Ok(())})))?;
   }else{let tx=sender.clone();profile.GetBrowserExtensions(&ProfileGetBrowserExtensionsCompletedHandler::create(Box::new(move|status,list|{
    let result=(||{status?;let list=list.ok_or_else(||windows_core::Error::from_hresult(windows_core::HRESULT(0x80004005u32 as i32)))?;let mut count=0;list.Count(&mut count)?;let mut items=Vec::new();
     for index in 0..count{let extension=list.GetValueAtIndex(index)?;let mut key=windows_core::PWSTR::null();let mut name=windows_core::PWSTR::null();let mut enabled=Default::default();extension.Id(&mut key)?;extension.Name(&mut name)?;extension.IsEnabled(&mut enabled)?;let key=take_pwstr(key);let name=take_pwstr(name);
      if action=="extension_remove"&&key==id{let done=tx.clone();extension.Remove(&BrowserExtensionRemoveCompletedHandler::create(Box::new(move|status|{let _=done.send(status.map(|_|json!({"removed":true})).map_err(|e|e.to_string()));Ok(())})))?;return Ok(None);}
      items.push(json!({"id":key,"name":name,"enabled":enabled.as_bool()}));}
     if action=="extension_remove"{return Err(windows_core::Error::from_hresult(windows_core::HRESULT(0x80070490u32 as i32)));}Ok(Some(json!({"extensions":items})))})();
    match result{Ok(Some(value))=>{let _=tx.send(Ok(value));},Ok(None)=>{},Err(error)=>{let _=tx.send(Err(error.to_string()));}}Ok(())})))?;}Ok::<(),windows_core::Error>(())})();
  if let Err(error)=result{let _=sender.send(Err(format!("Extension operation unavailable: {error}")));}
 }).map_err(|e|e.to_string())?;receive(receiver).await
}

async fn clear_profile(view:Webview)->Result<Value,String>{
 let(sender,receiver)=mpsc::channel();view.with_webview(move|platform|{let tx=sender.clone();let result=unsafe{platform.controller().CoreWebView2().and_then(|core|core.cast::<ICoreWebView2_13>()?.Profile()?.cast::<ICoreWebView2Profile2>()?.ClearBrowsingDataAll(&ClearBrowsingDataCompletedHandler::create(Box::new(move|status|{let _=tx.send(status.map(|_|json!({"cleared":true})).map_err(|e|e.to_string()));Ok(())}))))};if let Err(error)=result{let _=sender.send(Err(error.to_string()));}}).map_err(|e|e.to_string())?;receive(receiver).await
}

#[tauri::command]
pub async fn browser_manage(view:Webview,app:tauri::AppHandle,state:State<'_,super::Desktop>,action:String,args:Value)->Result<Value,String>{
 super::trusted(&view)?;
 if action=="data"{return access(&app,false,|data|{let query=args["query"].as_str().unwrap_or("").to_lowercase();let history:Vec<Value>=data["history"].as_array().unwrap().iter().rev().filter(|v|v["url"].as_str().unwrap_or("").to_lowercase().contains(&query)).take(200).cloned().collect();let downloads:Vec<Value>=data["downloads"].as_array().unwrap().iter().rev().take(200).cloned().collect();json!({"history":history,"downloads":downloads,"preferences":data["preferences"]})});}
 let id=state.browser.lock().unwrap().clone().ok_or("Open a browser tab first")?;let target=app.get_webview(&id).ok_or("Browser tab closed")?;
 if ["find","print","zoom","device"].contains(&action.as_str()){return page_action(target,&action,args).await;}
 if action=="preferences"{let passwords=args["passwords"].as_bool().ok_or("Password setting is required")?;let autofill=args["autofill"].as_bool().ok_or("Autofill setting is required")?;access(&app,true,|data|data["preferences"]=json!({"passwords":passwords,"autofill":autofill}))?;for tab in state.browser_tabs.lock().unwrap().iter(){if let Some(view)=app.get_webview(tab){super::browser_security::configure(&view)?;}}return Ok(json!({"updated":true}));}
 if action=="extensions"||action=="extension_remove"{return extensions(target,action,None,args["id"].as_str().unwrap_or("").into()).await;}
 if action=="extension_add"{let folder=tauri::async_runtime::spawn_blocking(||rfd::FileDialog::new().set_title("Load a trusted unpacked browser extension").pick_folder()).await.map_err(|e|e.to_string())?;let Some(folder)=folder else{return Ok(json!({"cancelled":true}));};if !folder.join("manifest.json").is_file(){return Err("Choose an unpacked extension folder containing manifest.json".into());}return extensions(target,action,Some(folder),String::new()).await;}
 if action=="import_cookies"{
  let chosen=tauri::async_runtime::spawn_blocking(||rfd::FileDialog::new().set_title("Import cookies from a trusted JSON export").add_filter("Cookie JSON",&["json"]).pick_file()).await.map_err(|e|e.to_string())?;let Some(path)=chosen else{return Ok(json!({"cancelled":true}));};if std::fs::metadata(&path).map_err(|e|e.to_string())?.len()>5_000_000{return Err("Cookie file is too large".into());}
  let cookies:Value=serde_json::from_slice(&std::fs::read(path).map_err(|e|e.to_string())?).map_err(|e|e.to_string())?;let cookies=cookies.as_array().ok_or("Expected an array of cookies")?;if cookies.len()>1000{return Err("Import at most 1000 cookies at once".into());}
  let mut clean=Vec::new();for cookie in cookies{let name=cookie["name"].as_str().ok_or("Cookie name missing")?;let value=cookie["value"].as_str().ok_or("Cookie value missing")?;let domain=cookie["domain"].as_str().ok_or("Cookie domain missing")?;if name.len()>4096||value.len()>16384||domain.contains(['/',':','\\'])||domain.trim_matches('.').is_empty(){return Err("Invalid cookie fields".into());}let mut item=json!({"name":name,"value":value,"domain":domain,"path":cookie["path"].as_str().unwrap_or("/"),"secure":cookie["secure"].as_bool().unwrap_or(true),"httpOnly":cookie["httpOnly"].as_bool().unwrap_or(false)});if let Some(expiry)=cookie["expirationDate"].as_f64().or_else(||cookie["expires"].as_f64()).filter(|n|*n>0.0){item["expires"]=json!(expiry);}if let Some(same)=cookie["sameSite"].as_str(){let same=match same.to_lowercase().as_str(){"strict"=>"Strict","lax"=>"Lax","none"|"no_restriction"=>"None",_=>""};if !same.is_empty(){item["sameSite"]=json!(same);}}clean.push(item);}
  let count=clean.len();protocol(target,"Network.setCookies",json!({"cookies":clean})).await?;return Ok(json!({"imported":count}));
 }
 if action=="clear"{
  let kind=args["kind"].as_str().unwrap_or("cache").to_string();if !["history","downloads","cookies","cache","all"].contains(&kind.as_str()){return Err("Choose a browsing-data category".into());}
  let prompt=format!("Clear {kind}? Clearing cookies or all data signs you out. All data also removes saved browser passwords and autofill. Downloaded files on disk are not deleted.");
  let confirmed=tauri::async_runtime::spawn_blocking(move||rfd::MessageDialog::new().set_title("Clear browsing data?").set_description(prompt).set_buttons(rfd::MessageButtons::YesNo).show()==rfd::MessageDialogResult::Yes).await.map_err(|e|e.to_string())?;if !confirmed{return Ok(json!({"cancelled":true}));}
  match kind.as_str(){"cookies"=>{protocol(target,"Network.clearBrowserCookies",json!({})).await?;},"cache"=>{protocol(target,"Network.clearBrowserCache",json!({})).await?;},"all"=>{clear_profile(target).await?;},_=>{}}
  access(&app,true,|data|{if kind=="history"||kind=="all"{data["history"]=json!([]);}if kind=="downloads"||kind=="all"{data["downloads"]=json!([]);}})?;return Ok(json!({"cleared":kind}));
 }
 Err("Unsupported browser management action".into())
}

#[cfg(test)]mod browser_data_contract_tests {
 use super::*;
 #[test]fn preferences_history_and_downloads_persist_and_clear_in_their_own_profile(){
  let root=std::env::temp_dir().join(format!("horizon-browser-state-{}",uuid::Uuid::new_v4()));let path=root.join("one/browser-data.json");let other=root.join("two/browser-data.json");
  let mut first=BrowserData::default();access_data(&mut first,&path,true,|data|{data["preferences"]=json!({"passwords":false,"autofill":true});data["history"]=json!([{"url":"https://example.invalid/fixture"}]);data["downloads"]=json!([{"status":"cancelled","url":"https://example.invalid/file"}]);}).unwrap();
  let mut reopened=BrowserData::default();let saved=access_data(&mut reopened,&path,false,|data|data.clone()).unwrap();assert_eq!(saved["history"].as_array().unwrap().len(),1);assert_eq!(saved["downloads"][0]["status"],"cancelled");assert_eq!(saved["preferences"]["passwords"],false);
  let mut separate=BrowserData::default();assert_eq!(access_data(&mut separate,&other,false,|data|data["history"].as_array().unwrap().len()).unwrap(),0);
  access_data(&mut reopened,&path,true,|data|data["history"]=json!([])).unwrap();let mut last=BrowserData::default();let cleared=access_data(&mut last,&path,false,|data|data.clone()).unwrap();assert!(cleared["history"].as_array().unwrap().is_empty());assert_eq!(cleared["downloads"].as_array().unwrap().len(),1);assert_eq!(cleared["preferences"]["passwords"],false);
  std::fs::remove_dir_all(root).unwrap();
 }
}
