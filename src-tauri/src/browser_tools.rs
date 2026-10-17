use serde_json::{json, Value};
use std::{collections::HashMap, sync::Mutex, time::Duration};
use tauri::{Manager, State, Webview};
use uuid::Uuid;
#[derive(Default)]
pub struct BrowserTools {
    tabs: Mutex<HashMap<String, String>>,
}
impl BrowserTools {pub fn own(&self,id:&str,owner:&str){self.tabs.lock().unwrap().insert(id.into(),owner.into());}}
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
    if owner.is_empty() {
        return Err("Browser tools require a conversation owner".into());
    }
    if name == "browser_tabs" {
        let action = args["action"].as_str().unwrap_or("list");
        let id = args["tab_id"].as_str().unwrap_or("");
        if action != "list" {
            if state.tabs.lock().unwrap().get(id) != Some(&owner) {
                return Err("Browser tab is not owned by this conversation".into());
            }
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
            if state.tabs.lock().unwrap().get(id) != Some(&owner) {
                return Err("Browser tab is not owned by this conversation".into());
            }
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
    if state.tabs.lock().unwrap().get(&id) != Some(&owner) {
        return Err("Browser tab is not owned by this conversation".into());
    }
    if let Some(previous)=desktop.browser.lock().unwrap().clone(){if previous!=id{if let Some(old)=app.get_webview(&previous){let _=old.hide();}}}
    *desktop.browser.lock().unwrap() = Some(id.clone());
    let window = app
        .get_webview(&id)
        .ok_or("Browser tab was closed")?;
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

