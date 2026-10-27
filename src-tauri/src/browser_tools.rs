use serde_json::{json, Value};
use std::{collections::HashMap, sync::Mutex, time::Duration};
use tauri::{Manager, State, Webview};
use uuid::Uuid;
use base64::{engine::general_purpose::STANDARD,Engine};
#[derive(Default)]
pub struct BrowserTools {
    tabs: Mutex<HashMap<String, String>>,
}
impl BrowserTools {pub fn own(&self,id:&str,owner:&str){self.tabs.lock().unwrap().insert(id.into(),owner.into());}
fn require_owner(&self,id:&str,owner:&str)->Result<(),String>{if self.tabs.lock().unwrap().get(id).map(String::as_str)!=Some(owner){return Err("Browser tab is not owned by this conversation".into());}Ok(())}}
pub(super) async fn evaluate(window: tauri::Webview, script: String) -> Result<Value, String> {
    let (sender, receiver) = std::sync::mpsc::channel();
    window
        .eval_with_callback(script, move |result| {
            let _ = sender.send(result);
        })
        .map_err(|e| e.to_string())?;
    let result = tauri::async_runtime::spawn_blocking(move || {
        receiver.recv_timeout(Duration::from_secs(15))
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|_| "Browser observation timed out")?;
    let parsed: Value = serde_json::from_str(&result).map_err(|e| e.to_string())?;
    if let Some(error) = parsed.get("error").and_then(Value::as_str) {
        return Err(error.into());
    }
    Ok(parsed)
}
async fn snapshot(window: tauri::Webview, id: &str) -> Result<Value, String> {
    window.eval(include_str!("../../runtime/worker/page-diagnostics.js")).map_err(|e|e.to_string())?;
    let nonce = Uuid::new_v4().to_string();
    let key = format!("__oc_{}", id.replace('-', ""));
    let script = format!(
        r#"(()=>{{try{{const key={key},nonce={nonce};const elements=new Map();const items=[];for(const element of document.querySelectorAll('a,button,input,textarea,select,[role="button"],[contenteditable="true"]')){{const rect=element.getBoundingClientRect();if(!rect.width||!rect.height||getComputedStyle(element).visibility==='hidden')continue;const ref=String(items.length+1);elements.set(ref,element);items.push({{ref,tag:element.tagName.toLowerCase(),text:(element.innerText||element.getAttribute('aria-label')||element.getAttribute('placeholder')||'').slice(0,240),type:element.type||'',href:element.href||'',disabled:!!element.disabled}});if(items.length>=250)break;}}Object.defineProperty(window,key,{{value:{{nonce,elements}},configurable:true}});return {{url:location.href,title:document.title,snapshot_id:nonce,text:(document.body?.innerText||'').slice(0,18000),elements:items}};}}catch(error){{return {{error:String(error)}}}}}})()"#,
        key = serde_json::to_string(&key).unwrap(),
        nonce = serde_json::to_string(&nonce).unwrap()
    );
    let mut result = evaluate(window, script).await?;
    result["tab_id"] = json!(id);
    Ok(result)
}
#[tauri::command]
pub async fn browser_tool(
    view: Webview,
    app: tauri::AppHandle,
    state: State<'_, BrowserTools>,
    desktop: State<'_, super::Desktop>,
    name: String,
    args: Value,
    owner: String,
    request_id: String,
    cancellations: State<'_, super::cancellation::Cancellation>,
) -> Result<Value, String> {
    super::trusted(&view)?;
    let request = cancellations.begin(&request_id);
    request.check()?;
    #[cfg(not(windows))]if name=="browser_capabilities"{return Ok(json!({"platform":std::env::consts::OS,"engine":"webkit","tools":["browser_open","browser_snapshot","browser_click","browser_fill","browser_scroll","browser_tabs","browser_press","browser_find","browser_print","browser_zoom","browser_back","browser_forward","browser_reload","browser_select_option","browser_check","browser_inspect_element","browser_wait_for_element","browser_downloads"],"limitations":["No WebView2 CDP on this platform; use DOM actions or backend Chromium."]}));}
    if name == "browser_capabilities" {
        return Ok(json!({"tools":["browser_scroll_to","browser_wait_for","browser_read_page_scoped","browser_click_at","browser_drag_path","browser_hold_keys","browser_hover_at","browser_read_diagnostics","browser_run_script","browser_crop","browser_site_tools","browser_site_call","browser_open","browser_snapshot","browser_click","browser_fill","browser_scroll","browser_tabs","browser_press","browser_find","browser_print","browser_zoom","browser_emulate_device","browser_back","browser_forward","browser_reload","browser_select_option","browser_check","browser_inspect_element","browser_wait_for_element","browser_hover","browser_double_click","browser_upload","browser_screenshot","browser_download","browser_downloads"]}));
    }
    if owner.is_empty() {
        return Err("Browser tools require a conversation owner".into());
    }
    if name == "browser_tabs" {
        let action = args["action"].as_str().unwrap_or("list");
        let id = args["tab_id"].as_str().unwrap_or("");
        if action != "list" {
            state.require_owner(id,&owner)?;
            let window = app.get_webview(id).ok_or("Browser tab was closed")?;
            match action {
                "close" => {
                    window.close().map_err(|e| e.to_string())?;
                    state.tabs.lock().unwrap().remove(id);
                    desktop.browser_tabs.lock().unwrap().retain(|tab|tab!=id);
                    desktop.browser_loaded.lock().unwrap().remove(id);
                    let mut active=desktop.browser.lock().unwrap();
                    if active.as_deref()==Some(id){*active=None;}
                }
                "select" => {
                    window.show().map_err(|e| e.to_string())?;
                    window.set_focus().map_err(|e| e.to_string())?;
                    *desktop.browser.lock().unwrap() = Some(id.into());
                }
                _ => return Err("Unsupported browser action".into()),
            }
        }
        let tabs:Vec<Value>=state.tabs.lock().unwrap().iter().filter(|(_,value)|*value==&owner).filter_map(|(id,_)|app.get_webview(id).map(|window|json!({"tab_id":id,"url":window.url().ok().map(|url|url.to_string()),"title":window.url().ok().and_then(|url|url.host_str().map(str::to_string))}))).collect();
        return Ok(json!({"tabs":tabs}));
    }
    let id = if name == "browser_open" {
        let url = tauri::Url::parse(args["url"].as_str().ok_or("Browser URL is required")?)
            .map_err(|e| e.to_string())?;
        if !matches!(url.scheme(), "http" | "https")
            || !url.username().is_empty()
            || url.password().is_some()
        {
            return Err("Use HTTP(S) URLs without credentials".into());
        }
        if let Some(id) = args["tab_id"].as_str() {
            state.require_owner(id,&owner)?;
            desktop.browser_loaded.lock().unwrap().insert(id.into(),false);
            app.get_webview(id)
                .ok_or("Browser tab was closed")?
                .navigate(url)
                .map_err(|e| e.to_string())?;
            id.to_string()
        } else {
            let id = Uuid::new_v4().to_string();
            super::embedded_browser(&app,&desktop,&id,url)?;
            state.tabs.lock().unwrap().insert(id.clone(), owner.clone());
            desktop.browser_tabs.lock().unwrap().push(id.clone());
            id
        }
    } else {
        args["tab_id"]
            .as_str()
            .ok_or("Browser tab ID is required")?
            .to_string()
    };
    state.require_owner(&id,&owner)?;
    if let Some(previous)=desktop.browser.lock().unwrap().clone(){if previous!=id{if let Some(old)=app.get_webview(&previous){let _=old.hide();}}}
    *desktop.browser.lock().unwrap() = Some(id.clone());
    let window = app
        .get_webview(&id)
        .ok_or("Browser tab was closed")?;
    if name == "browser_downloads" {return Ok(super::browser_manage::downloads_for(&app,&id));}
    if name=="browser_crop" {
        let x=args["left"].as_f64().ok_or("left required")?;let y=args["top"].as_f64().ok_or("top required")?;let width=args["right"].as_f64().ok_or("right required")?-x;let height=args["bottom"].as_f64().ok_or("bottom required")?-y;
        if x<0.0||y<0.0||width<=0.0||height<=0.0||width*height>8_000_000.0{return Err("Invalid screenshot crop".into());}
        let result=super::browser_manage::protocol(window,"Page.captureScreenshot",json!({"format":"png","captureBeyondViewport":false,"clip":{"x":x,"y":y,"width":width,"height":height,"scale":1}})).await?;request.check()?;
        return Ok(json!({"screenshot":{"width":width,"height":height,"image":result["data"]}}));
    }
    if matches!(name.as_str(),"browser_click_at"|"browser_hover_at"|"browser_drag_path") {
        let modifiers=args["modifiers"].as_array().map(|keys|keys.iter().fold(0,|bits,key|bits|match key.as_str().unwrap_or(""){"Alt"=>1,"Control"=>2,"Meta"=>4,"Shift"=>8,_=>0})).unwrap_or(0);
        let button=args["button"].as_str().unwrap_or("left");let mut points=vec![];
        if name=="browser_drag_path"{points=args["path"].as_array().ok_or("path required")?.clone();}else{points.push(json!({"x":args["x"],"y":args["y"]}));}
        if points.is_empty()||points.len()>100{return Err("Invalid pointer path".into());}for point in &points{let x=point["x"].as_f64().ok_or("x required")?;let y=point["y"].as_f64().ok_or("y required")?;if !(0.0..=10000.0).contains(&x)||!(0.0..=10000.0).contains(&y){return Err("Invalid pointer coordinates".into());}}
        let first=&points[0];super::browser_manage::protocol(window.clone(),"Input.dispatchMouseEvent",json!({"type":"mouseMoved","x":first["x"],"y":first["y"],"modifiers":modifiers})).await?;
        if name!="browser_hover_at" {let count=args["click_count"].as_u64().unwrap_or(1).min(3);for click in 1..=count{request.check()?;super::browser_manage::protocol(window.clone(),"Input.dispatchMouseEvent",json!({"type":"mousePressed","x":first["x"],"y":first["y"],"button":button,"clickCount":click,"modifiers":modifiers})).await?;
            let dragged=async {for point in points.iter().skip(1){request.check()?;super::browser_manage::protocol(window.clone(),"Input.dispatchMouseEvent",json!({"type":"mouseMoved","x":point["x"],"y":point["y"],"button":button,"buttons":if button=="right"{2}else if button=="middle"{4}else{1},"modifiers":modifiers})).await?;}Ok::<(),String>(())}.await;
            let last=points.last().unwrap();let released=super::browser_manage::protocol(window.clone(),"Input.dispatchMouseEvent",json!({"type":"mouseReleased","x":last["x"],"y":last["y"],"button":button,"clickCount":click,"modifiers":modifiers})).await;dragged?;released?;
        }}return snapshot(window,&id).await;
    }
    if name=="browser_hold_keys" {
        let keys=args["keys"].as_array().ok_or("keys required")?;if keys.is_empty()||keys.len()>5{return Err("Invalid held keys".into());}let mut held=vec![];
        let result=async {for key in keys{request.check()?;let key=key.as_str().ok_or("Invalid key")?;super::browser_manage::protocol(window.clone(),"Input.dispatchKeyEvent",json!({"type":"keyDown","key":key})).await?;held.push(key.to_string());}let duration=args["duration_ms"].as_u64().unwrap_or(100).min(3000);tauri::async_runtime::spawn_blocking(move||std::thread::sleep(Duration::from_millis(duration))).await.map_err(|e|e.to_string())?;Ok::<(),String>(())}.await;
        for key in held.iter().rev(){let _=super::browser_manage::protocol(window.clone(),"Input.dispatchKeyEvent",json!({"type":"keyUp","key":key})).await;}result?;request.check()?;return snapshot(window,&id).await;
    }
    if matches!(name.as_str(),"browser_scroll_to"|"browser_wait_for"|"browser_read_page_scoped"|"browser_read_diagnostics"|"browser_run_script"|"browser_site_tools"|"browser_site_call") {
        let script=include_str!("../../runtime/worker/page-advanced.js").replace("__NAME__",&json!(name).to_string()).replace("__KEY__",&json!(format!("__oc_{}",id.replace('-',""))).to_string()).replace("__ARGS__",&args.to_string());
        let result=super::browser_manage::protocol(window.clone(),"Runtime.evaluate",json!({"expression":script,"awaitPromise":true,"returnByValue":true,"timeout":args["timeout_ms"].as_u64().unwrap_or(10000)+1000})).await?;request.check()?;
        if result.get("exceptionDetails").is_some(){return Err(result["exceptionDetails"]["exception"]["description"].as_str().unwrap_or("Browser script failed").into());}let value=result["result"]["value"].clone();if value["updated"]==true{return snapshot(window,&id).await;}return Ok(value);
    }
    if name == "browser_screenshot" {
        let mut parameters=json!({"format":"png","captureBeyondViewport":false});
        if args["full_page"]==true {let metrics=super::browser_manage::protocol(window.clone(),"Page.getLayoutMetrics",json!({})).await?;let size=metrics.get("cssContentSize").unwrap_or(&metrics["contentSize"]);let width=size["width"].as_f64().ok_or("Page width unavailable")?;let height=size["height"].as_f64().ok_or("Page height unavailable")?;if width<=0.0||height<=0.0||width*height>8_000_000.0{return Err("Full-page screenshot exceeds eight million pixels; use a viewport screenshot".into());}parameters=json!({"format":"png","captureBeyondViewport":true,"clip":{"x":0,"y":0,"width":width,"height":height,"scale":1}});}
        let result=super::browser_manage::protocol(window,"Page.captureScreenshot",parameters).await?;request.check()?;let data=result["data"].as_str().ok_or("Browser screenshot data unavailable")?;if data.len()>10_000_000{return Err("Browser screenshot exceeds transport limit".into());}let bytes=STANDARD.decode(data).map_err(|e|e.to_string())?;let image=image::load_from_memory(&bytes).map_err(|e|e.to_string())?;return Ok(json!({"screenshot":{"width":image.width(),"height":image.height(),"image":data}}));
    }
    if matches!(name.as_str(),"browser_hover"|"browser_double_click"|"browser_upload"|"browser_download") {
        let key=format!("__oc_{}",id.replace('-',""));let marker=Uuid::new_v4().to_string();
        let observed=evaluate(window.clone(),format!(r#"(()=>{{try{{const args={args},store=window[{key}];if(!store||store.nonce!==args.snapshot_id)throw Error('Snapshot is stale; inspect the page again');const element=store.elements.get(args.ref);if(!element||!element.isConnected)throw Error('Element is stale; inspect the page again');element.scrollIntoView({{block:'center',inline:'center'}});const box=element.getBoundingClientRect();if(!box.width||!box.height)throw Error('Element is not visible');element.setAttribute('data-oc-target',{marker});return {{x:box.x+box.width/2,y:box.y+box.height/2,file_input:element.tagName==='INPUT'&&element.type==='file'}};}}catch(error){{return {{error:String(error)}};}}}})()"#,args=args,key=json!(key),marker=json!(marker))).await?;
        request.check()?;
        if name=="browser_upload" {if observed["file_input"]!=true{return Err("Choose an observed file input".into());}let path=std::path::PathBuf::from(args["file_path"].as_str().ok_or("Scoped upload file is required")?);let metadata=std::fs::metadata(&path).map_err(|e|e.to_string())?;if !path.is_absolute()||!metadata.is_file()||metadata.len()>10_000_000{return Err("Upload a scoped regular file under 10 MB".into());}let root=super::browser_manage::protocol(window.clone(),"DOM.getDocument",json!({})).await?;let node=super::browser_manage::protocol(window.clone(),"DOM.querySelector",json!({"nodeId":root["root"]["nodeId"],"selector":format!("[data-oc-target='{}']",marker)})).await?;if node["nodeId"].as_u64().unwrap_or(0)==0{return Err("File input changed; inspect the page again".into());}request.check()?;super::browser_manage::protocol(window.clone(),"DOM.setFileInputFiles",json!({"nodeId":node["nodeId"],"files":[path]})).await?;}
        else {let x=observed["x"].as_f64().ok_or("Element coordinate missing")?;let y=observed["y"].as_f64().ok_or("Element coordinate missing")?;super::browser_manage::protocol(window.clone(),"Input.dispatchMouseEvent",json!({"type":"mouseMoved","x":x,"y":y})).await?;if name=="browser_double_click"||name=="browser_download" {let clicks=if name=="browser_double_click"{2}else{1};for count in 1..=clicks {request.check()?;super::browser_manage::protocol(window.clone(),"Input.dispatchMouseEvent",json!({"type":"mousePressed","x":x,"y":y,"button":"left","clickCount":count})).await?;super::browser_manage::protocol(window.clone(),"Input.dispatchMouseEvent",json!({"type":"mouseReleased","x":x,"y":y,"button":"left","clickCount":count})).await?;}}}
        request.check()?;if name=="browser_download"{return Ok(json!({"download_requested":true,"downloads":super::browser_manage::downloads_for(&app,&id),"summary":"Download requested. The user must confirm the native save dialog; inspect downloads before claiming completion."}));}return snapshot(window,&id).await;
    }
    if matches!(name.as_str(), "browser_back" | "browser_forward" | "browser_reload") {
        let script = match name.as_str() {"browser_back"=>"history.back()","browser_forward"=>"history.forward()",_=>"location.reload()"};
        window.eval(script).map_err(|e|e.to_string())?;
        tauri::async_runtime::spawn_blocking(||std::thread::sleep(Duration::from_millis(250))).await.map_err(|e|e.to_string())?;
        for _ in 0..40 {request.check()?;let ready={desktop.browser_loaded.lock().unwrap().get(&id)!=Some(&false)};if ready{return snapshot(window,&id).await;}tauri::async_runtime::spawn_blocking(||std::thread::sleep(Duration::from_millis(250))).await.map_err(|e|e.to_string())?;}
        return Err(format!("Navigation is still loading; inspect browser_snapshot for tab {}",id));
    }
    if name == "browser_wait_for_element" {
        let selector=args["selector"].as_str().ok_or("CSS selector is required")?;
        let timeout=args["timeout_ms"].as_u64().unwrap_or(5000).min(10000);
        let started=std::time::Instant::now();
        loop {request.check()?;let found=evaluate(window.clone(),format!("(()=>{{try{{const element=document.querySelector({});if(!element)return {{visible:false}};const box=element.getBoundingClientRect();return {{visible:!!(box.width&&box.height&&getComputedStyle(element).visibility!=='hidden')}};}}catch(error){{return {{error:String(error)}};}}}})()",json!(selector))).await?;
            if found["visible"]==true {return snapshot(window,&id).await;}
            if started.elapsed().as_millis()>=timeout as u128{return Err("Timed out waiting for a visible browser element".into());}
            tauri::async_runtime::spawn_blocking(||std::thread::sleep(Duration::from_millis(200))).await.map_err(|e|e.to_string())?;
        }
    }
    if matches!(name.as_str(),"browser_select_option"|"browser_check"|"browser_inspect_element") {
        let key=format!("__oc_{}",id.replace('-',""));
        let script=format!(r#"(()=>{{try{{const args={args},name={name},store=window[{key}];if(!store||store.nonce!==args.snapshot_id)throw Error('Snapshot is stale; inspect the page again');const element=store.elements.get(args.ref);if(!element||!element.isConnected)throw Error('Element is stale; inspect the page again');if(name==='browser_inspect_element')return {{element:{{tag:element.tagName.toLowerCase(),text:(element.textContent||'').slice(0,2000),role:element.getAttribute('role'),type:element.type||null,value:element.type==='password'?'[redacted]':String(element.value||'').slice(0,2000),checked:element.checked??null,disabled:!!element.disabled,options:element.tagName==='SELECT'?Array.from(element.options).slice(0,100).map(option=>({{value:option.value,text:option.text,selected:option.selected}})):undefined}}}};if(element.disabled)throw Error('Element is disabled');if(name==='browser_select_option'){{if(element.tagName!=='SELECT')throw Error('Expected a select element');if(!Array.from(element.options).some(option=>option.value===args.value))throw Error('Option value not found');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(element,args.value);element.dispatchEvent(new Event('input',{{bubbles:true}}));element.dispatchEvent(new Event('change',{{bubbles:true}}));}}else{{if(element.tagName!=='INPUT'||!['checkbox','radio'].includes(element.type))throw Error('Expected a checkbox or radio input');if(element.type==='radio'&&!args.checked)throw Error('Radio inputs cannot be unchecked directly');if(element.checked!==args.checked)element.click();if(element.checked!==args.checked)throw Error('Checked state did not change');}}return {{ok:true}};}}catch(error){{return {{error:String(error)}};}}}})()"#,args=args,name=json!(name),key=json!(key));
        let result=evaluate(window.clone(),script).await?;
        request.check()?;
        if name=="browser_inspect_element" {return Ok(result);}
        return snapshot(window,&id).await;
    }
    if let Some(action)=match name.as_str(){"browser_find"=>Some("find"),"browser_print"=>Some("print"),"browser_zoom"=>Some("zoom"),"browser_emulate_device"=>Some("device"),_=>None}{return super::browser_manage::page_action(window,action,args).await;}
    if name == "browser_open" {
        let mut ready=false;
        for _ in 0..120 {
            request.check()?;
            if desktop.browser_loaded.lock().unwrap().get(&id)==Some(&true){ready=true;break;}
            tauri::async_runtime::spawn_blocking(||std::thread::sleep(Duration::from_millis(250))).await.map_err(|error|error.to_string())?;
        }
        if !ready{return Err(format!("Browser navigation is still loading; call browser_snapshot with tab_id {} to inspect it",id));}
    } else if name != "browser_snapshot" {
        if !matches!(
            name.as_str(),
            "browser_click" | "browser_fill" | "browser_press" | "browser_scroll"
        ) {
            return Err(format!("Native browser tool is unavailable: {}", name));
        }
        let key = format!("__oc_{}", id.replace('-', ""));
        let script = format!(
            r#"(()=>{{try{{const name={name},args={args},store=window[{key}];let element;if(name==='browser_click'||name==='browser_fill'||(name==='browser_press'&&args.ref)){{if(!store||store.nonce!==args.snapshot_id)throw Error('Snapshot is stale; inspect the page again');element=store.elements.get(args.ref);if(!element||!element.isConnected)throw Error('Element is stale; inspect the page again');}}if(name==='browser_click')element.click();else if(name==='browser_fill'){{element.focus();if(element.isContentEditable)element.textContent=args.value;else{{const prototype=element.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:element.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(prototype,'value').set.call(element,args.value);}}element.dispatchEvent(new Event('input',{{bubbles:true}}));element.dispatchEvent(new Event('change',{{bubbles:true}}));}}else if(name==='browser_press'){{element=element||document.activeElement||document.body;const parts=args.key.split('+');const rawKey=parts.pop();const key=rawKey==='Space'?' ':rawKey;const options={{key,bubbles:true,cancelable:true,ctrlKey:parts.includes('Control')||parts.includes('Ctrl'),shiftKey:parts.includes('Shift'),altKey:parts.includes('Alt'),metaKey:parts.includes('Meta')}};const accepted=element.dispatchEvent(new KeyboardEvent('keydown',options));if(accepted){{if(key==='Enter'){{if(element.form)element.form.requestSubmit();else if(element.matches('button,a[href],[role=button]'))element.click();}}else if(key==='Escape')element.blur();else if(['ArrowDown','ArrowUp','PageDown','PageUp','Home','End',' '].includes(key)&&!element.matches('input,textarea,[contenteditable=true]')){{if(key==='Home')window.scrollTo(0,0);else if(key==='End')window.scrollTo(0,document.documentElement.scrollHeight);else window.scrollBy(0,(key==='ArrowUp'||key==='PageUp'||(key===' '&&options.shiftKey)?-1:1)*(key.startsWith('Arrow')?80:window.innerHeight*.8));}}}}element.dispatchEvent(new KeyboardEvent('keyup',options));}}else{{const amount=args.amount||800;window.scrollBy(args.direction==='left'?-amount:args.direction==='right'?amount:0,args.direction==='up'?-amount:args.direction==='down'?amount:0);}}return {{ok:true}};}}catch(error){{return {{error:String(error)}}}}}})()"#,
            name = json!(name),
            args = args,
            key = json!(key)
        );
        evaluate(window.clone(), script).await?;
    }
    request.check()?;
    let result = snapshot(window, &id).await?;
    request.check()?;
    Ok(result)
}


#[cfg(test)]mod browser_contract_tests{use super::*;#[test]fn tabs_are_rejected_before_access_when_foreign_or_closed(){let state=BrowserTools::default();state.own("tab-a","owner-a");state.own("tab-b","owner-b");assert!(state.require_owner("tab-a","owner-a").is_ok());assert!(state.require_owner("tab-a","owner-b").is_err());assert!(state.require_owner("main","owner-a").is_err());state.tabs.lock().unwrap().remove("tab-a");assert!(state.require_owner("tab-a","owner-a").is_err());assert!(state.require_owner("tab-b","owner-b").is_ok());}}
