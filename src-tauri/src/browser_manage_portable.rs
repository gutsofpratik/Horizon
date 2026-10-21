use serde_json::{json,Value};
use std::{path::PathBuf,time::{SystemTime,UNIX_EPOCH}};
use tauri::{Manager,State,Webview};
#[derive(Default)]pub struct BrowserData{loaded:bool,value:Value}
fn timestamp()->u64{SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_secs()}
fn data_file(app:&tauri::AppHandle)->Result<PathBuf,String>{Ok(app.path().app_local_data_dir().map_err(|e|e.to_string())?.join("browser-data.json"))}
fn access<T>(app:&tauri::AppHandle,edit:bool,f:impl FnOnce(&mut Value)->T)->Result<T,String>{
 let state=app.state::<super::Desktop>();let mut data=state.browser_data.lock().unwrap();let path=data_file(app)?;
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

pub async fn protocol(_view:Webview,_method:&str,_parameters:Value)->Result<Value,String>{Err("CDP is not available on this native WebKit browser. Use DOM browser actions or the backend Chromium browser; computer screenshots require vision.".into())}
pub async fn page_action(view:Webview,action:&str,args:Value)->Result<Value,String>{match action{
 "find"=>{let text=args["text"].as_str().ok_or("Find text required")?;if text.len()>1000{return Err("Find text exceeds its limit".into());}super::browser_tools::evaluate(view,format!("({{found:window.find({},false,{},true,false,false,false)}})",json!(text),args["backwards"].as_bool().unwrap_or(false))).await},
 "zoom"=>{let factor=args["factor"].as_f64().ok_or("Zoom factor required")?;if !factor.is_finite()||!(0.25..=5.0).contains(&factor){return Err("Zoom must be 25-500%".into());}super::browser_tools::evaluate(view,format!("(()=>{{document.documentElement.style.zoom={};return {{zoom:{}}};}})()",factor,factor)).await},
 "print"=>{view.eval("window.print()").map_err(|e|e.to_string())?;Ok(json!({"status":"print_dialog_requested","summary":"Print requested; completion requires user confirmation."}))},
 _=>Err("This WebKit browser operation is unavailable on this platform".into())}}
#[tauri::command]pub async fn browser_manage(view:Webview,app:tauri::AppHandle,state:State<'_,super::Desktop>,action:String,args:Value)->Result<Value,String>{super::trusted(&view)?;
 if action=="data"{return access(&app,false,|data|json!({"history":data["history"].as_array().unwrap().iter().rev().take(200).collect::<Vec<_>>(),"downloads":data["downloads"].as_array().unwrap().iter().rev().take(200).collect::<Vec<_>>(),"preferences":data["preferences"],"limitations":["Chromium extensions and password-import APIs are not available on WebKit."]}));}
 let id=state.browser.lock().unwrap().clone().ok_or("Open a browser tab first")?;let target=app.get_webview(&id).ok_or("Browser tab closed")?;
 if ["find","print","zoom"].contains(&action.as_str()){return page_action(target,&action,args).await;}
 if action=="clear"{let kind=args["kind"].as_str().unwrap_or("history");if !["history","downloads"].contains(&kind){return Err("Clearing native WebKit cookies/cache is not implemented. Data was retained; use the platform browser data controls.".into());}access(&app,true,|data|data[kind]=json!([]))?;return Ok(json!({"cleared":kind}));}
 Err("This browser management operation is unavailable on native WebKit; no change was made".into())}
