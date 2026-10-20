//! App-owned, windowless backend lifecycle.
use std::{fs::{self,OpenOptions},io::{Read,Write},net::{TcpStream,SocketAddr},path::PathBuf,process::{Child,Command,Stdio},sync::Mutex,time::{Duration,Instant}};

pub struct Backend { child: Mutex<Option<Child>>,token:String,#[cfg(windows)]_job:Option<super::process_job::Job> }

fn ready_at(address:SocketAddr)->bool {
    let Ok(mut stream)=TcpStream::connect_timeout(&address,Duration::from_millis(400)) else{return false};
    let _=stream.set_read_timeout(Some(Duration::from_millis(600)));
    let _=stream.set_write_timeout(Some(Duration::from_millis(600)));
    if stream.write_all(b"GET /api/health HTTP/1.1\r\nHost: 127.0.0.1:3001\r\nConnection: close\r\n\r\n").is_err(){return false;}
    let mut response=String::new();
    if stream.take(32768).read_to_string(&mut response).is_err(){return false;}
    let Some((head,body))=response.split_once("\r\n\r\n") else{return false};
    if !head.starts_with("HTTP/1.1 200 ")&&!head.starts_with("HTTP/1.0 200 "){return false;}
    serde_json::from_str::<serde_json::Value>(body).is_ok_and(|value|value["app"]=="Horizon"&&value["status"]=="ok"&&value["desktopOwned"]==true)
}

fn workspace(resource:Option<PathBuf>)->Result<PathBuf,String>{
    let mut candidates=Vec::new();
    if let Some(root)=resource { candidates.push(root); }
    if let Some(path)=std::env::var_os("OPENCLAUDE_WORKSPACE_ROOT"){candidates.push(PathBuf::from(path));}
    if let Ok(exe)=std::env::current_exe(){if let Some(folder)=exe.parent(){candidates.push(folder.join("backend"));#[cfg(target_os="macos")]if let Some(contents)=folder.parent(){candidates.push(contents.join("Resources/backend"));}}}
    #[cfg(debug_assertions)]candidates.push(PathBuf::from(env!("CARGO_MANIFEST_DIR")).join(".."));
    // resource_dir/current_exe can return a verbatim Windows path. Node's
    // realpath resolver rejects that prefix with EISDIR at the drive root.
    candidates.into_iter().find(|root|root.join("server.mjs").is_file()||root.join("server/index.ts").is_file()&&root.join("node_modules/tsx/dist/cli.mjs").is_file()).map(runtime_path).ok_or_else(||"Horizon backend resources were not found. Restore the application installation.".into())
}

fn runtime_path(root:PathBuf)->PathBuf { dunce::simplified(&root).to_path_buf() }

fn profile_storage(root:&std::path::Path,packaged:bool)->Result<(PathBuf,PathBuf,PathBuf),String>{
    if !packaged {
        let legacy=root.join(".local");
        let profile_root=legacy.join("profiles");
        return Ok((legacy.join("horizon-profiles.json"),profile_root,legacy));
    }
    #[cfg(windows)]let base=PathBuf::from(std::env::var_os("LOCALAPPDATA").ok_or("Application data directory is unavailable")?).join("Horizon");
    #[cfg(target_os="macos")]let base=PathBuf::from(std::env::var_os("HOME").ok_or("Home directory is unavailable")?).join("Library/Application Support/Horizon");
    #[cfg(target_os="linux")]let base=std::env::var_os("XDG_DATA_HOME").map(PathBuf::from).unwrap_or(PathBuf::from(std::env::var_os("HOME").ok_or("Home directory is unavailable")?).join(".local/share")).join("Horizon");
    #[cfg(windows)]let legacy=PathBuf::from(std::env::var_os("LOCALAPPDATA").ok_or("Application data directory is unavailable")?).join("OpenClaude/data");
    #[cfg(target_os="macos")]let legacy=PathBuf::from(std::env::var_os("HOME").ok_or("Home directory is unavailable")?).join("Library/Application Support/OpenClaude");
    #[cfg(target_os="linux")]let legacy=std::env::var_os("XDG_DATA_HOME").map(PathBuf::from).unwrap_or(PathBuf::from(std::env::var_os("HOME").ok_or("Home directory is unavailable")?).join(".local/share")).join("OpenClaude");
    Ok((base.join("profiles.json"),base.join("profiles"),legacy))
}

fn active_profile_data(registry:&std::path::Path,profiles_root:&std::path::Path,legacy:&std::path::Path)->Result<PathBuf,String>{
    if !registry.is_file(){return Ok(legacy.to_path_buf());}
    let source=std::fs::read_to_string(registry).map_err(|_|"Horizon profile registry could not be read")?;
    let value:serde_json::Value=serde_json::from_str(&source).map_err(|_|"Horizon profile registry is invalid; profile data was not opened")?;
    let Some(active)=value.get("activeProfileId").and_then(|item|item.as_str()) else{return Ok(legacy.to_path_buf())};
    if active.is_empty()||!active.chars().all(|character|character.is_ascii_alphanumeric()||character=='-'){return Err("Horizon active profile ID is invalid".into());}
    let record=value.get("profiles").and_then(|item|item.as_array()).and_then(|items|items.iter().find(|item|item.get("id").and_then(|id|id.as_str())==Some(active))).ok_or("Horizon active profile is missing from its registry")?;
    if record.get("legacyData").and_then(|item|item.as_bool()).unwrap_or(false){Ok(legacy.to_path_buf())}else{Ok(profiles_root.join(active).join("data"))}
}

fn node(root:&std::path::Path)->Result<PathBuf,String>{
    if let Some(path)=std::env::var_os("OPENCLAUDE_NODE"){let path=PathBuf::from(path);if path.is_file(){return Ok(path);}return Err("Configured Horizon backend runtime was not found".into());}
    let name=if cfg!(windows){"node.exe"}else{"node"};
    for bundled in [root.join(".local/desktop-runtime").join(name),root.join("node").join(name),root.join("node/bin").join(name)]{if bundled.is_file(){return Ok(bundled);}}
    let paths=std::env::var_os("PATH").unwrap_or_default();std::env::split_paths(&paths).map(|path|path.join(name)).find(|path|path.is_file()).ok_or_else(||"Horizon's Node runtime is missing. Repair the desktop installation.".into())
}

impl Backend {
    pub fn start(resource:Option<PathBuf>)->Result<Self,String>{
        let address:SocketAddr="127.0.0.1:3001".parse().unwrap();
        let root=workspace(resource)?;
        let packaged=root.join("server.mjs").is_file();
        let (registry,profiles_root,legacy_data)=profile_storage(&root,packaged)?;
        let data_directory=active_profile_data(&registry,&profiles_root,&legacy_data)?;
        if ready_at(address){return Err("Horizon Desktop already owns this local backend. Return to its existing window, or fully quit it before starting another instance.".into());}
        let token=format!("{}{}",uuid::Uuid::new_v4().simple(),uuid::Uuid::new_v4().simple());let mut backend=Self{child:Mutex::new(None),token,#[cfg(windows)]_job:None};
        if TcpStream::connect_timeout(&address,Duration::from_millis(200)).is_ok(){return Err("Port 3001 is occupied by a different service. Horizon did not stop or replace it.".into());}
        let executable=node(&root)?;
        let logs=data_directory.clone();fs::create_dir_all(&logs).map_err(|e|e.to_string())?;
        let stdout=OpenOptions::new().create(true).append(true).open(logs.join("desktop-backend.log")).map_err(|e|e.to_string())?;
        let stderr=OpenOptions::new().create(true).append(true).open(logs.join("desktop-backend.err.log")).map_err(|e|e.to_string())?;
        let mut command=Command::new(executable);
        if packaged{command.arg(root.join("server.mjs")).env("OPENCLAUDE_BUNDLED_PYTHON",root.join("python")).env("OPENCLAUDE_PYTHON",root.join(if cfg!(windows){"python/python.exe"}else{"python/bin/python3"}));}else{command.arg(root.join("node_modules/tsx/dist/cli.mjs")).arg(root.join("server/desktop.ts"));}
        command.current_dir(&root).env("OPENCLAUDE_DATA_DIR",&data_directory).env("HORIZON_PROFILE_REGISTRY",&registry).env("HORIZON_PROFILES_ROOT",&profiles_root).env("PORT","3001").env("OPENCLAUDE_DESKTOP_OWNED","1").env("OPENCLAUDE_HOST_TOKEN",&backend.token).stdin(Stdio::null()).stdout(stdout).stderr(stderr);
        #[cfg(windows)]{use std::os::windows::process::CommandExt;command.creation_flags(0x08000000);}
        #[cfg(unix)]{use std::os::unix::process::CommandExt;command.process_group(0);}
        let mut child=command.spawn().map_err(|error|format!("Could not start Horizon backend: {error}"))?;
        #[cfg(windows)]{let job=match super::process_job::Job::new().and_then(|job|{job.assign(&child)?;Ok(job)}){Ok(job)=>job,Err(error)=>{let _=child.kill();let _=child.wait();return Err(format!("Backend process containment failed: {error}"));}};backend._job=Some(job);}
        *backend.child.lock().unwrap()=Some(child);
        let deadline=Instant::now()+Duration::from_secs(30);
        while Instant::now()<deadline {
            if let Some(status)=backend.child.lock().unwrap().as_mut().unwrap().try_wait().map_err(|e|e.to_string())?{return Err(format!("Horizon backend exited ({status}). Details: {}",logs.join("desktop-backend.err.log").display()));}
            if ready_at(address){return Ok(backend);}
            std::thread::sleep(Duration::from_millis(150));
        }
        Err(format!("Horizon backend did not become ready. Details: {}",logs.join("desktop-backend.err.log").display()))
    }
    pub fn credential(&self)->String{self.token.clone()}
    pub fn stop(&self){
        if let Some(mut child)=self.child.lock().unwrap().take(){
            if matches!(child.try_wait(),Ok(Some(_))){return;}
            if let Ok(mut stream)=TcpStream::connect_timeout(&"127.0.0.1:3001".parse().unwrap(),Duration::from_millis(500)){let _=stream.set_write_timeout(Some(Duration::from_millis(500)));let request=format!("POST /api/desktop/shutdown HTTP/1.1\r\nHost: 127.0.0.1:3001\r\nAuthorization: Bearer {}\r\nContent-Length: 0\r\nConnection: close\r\n\r\n",self.token);let _=stream.write_all(request.as_bytes());}
            let deadline=Instant::now()+Duration::from_secs(4);while Instant::now()<deadline{if matches!(child.try_wait(),Ok(Some(_))){return;}std::thread::sleep(Duration::from_millis(80));}
            #[cfg(unix)]unsafe{libc::kill(-(child.id() as i32),libc::SIGTERM);}
            #[cfg(windows)]{
                use std::os::windows::process::CommandExt;
                let _=Command::new("taskkill.exe").args(["/PID",&child.id().to_string(),"/T","/F"]).creation_flags(0x08000000).output();
            }
            let _=child.kill();let _=child.wait();
        }
    }
}
impl Drop for Backend {fn drop(&mut self){self.stop();}}

#[cfg(test)]mod tests{
    use super::*;use std::net::TcpListener;
    fn response(body:&str,status:&str)->SocketAddr{
        let listener=TcpListener::bind("127.0.0.1:0").unwrap();let address=listener.local_addr().unwrap();
        let reply=format!("HTTP/1.1 {status}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",body.len());
        std::thread::spawn(move||{let(mut stream,_)=listener.accept().unwrap();let mut request=[0;2048];let _=stream.read(&mut request);stream.write_all(reply.as_bytes()).unwrap();});address
    }
    #[test]fn accepts_only_healthy_horizon_backend(){
        assert!(ready_at(response(r#"{"app":"Horizon","status":"ok","desktopOwned":true}"#,"200 OK")));
        assert!(!ready_at(response(r#"{"app":"Horizon","status":"ok"}"#,"200 OK")));
        assert!(!ready_at(response(r#"{"status":"ok"}"#,"200 OK")));
        assert!(!ready_at(response(r#"{"app":"Horizon","status":"ok"}"#,"500 Error")));
    }
    #[cfg(windows)]#[test]fn node_runtime_paths_do_not_keep_verbatim_prefixes(){
        assert_eq!(runtime_path(PathBuf::from(r"\\?\C:\Apps\Horizon\backend")),PathBuf::from(r"C:\Apps\Horizon\backend"));
        assert_eq!(runtime_path(PathBuf::from(r"C:\Apps\Horizon\backend")),PathBuf::from(r"C:\Apps\Horizon\backend"));
    }
    #[test]fn stopping_an_unowned_backend_is_a_noop(){let backend=Backend{child:Mutex::new(None),token:String::new(),#[cfg(windows)]_job:None};backend.stop();assert!(backend.child.lock().unwrap().is_none());}
    #[test]fn profile_storage_keeps_first_profile_data_and_isolates_later_profiles(){let root=std::env::temp_dir().join(format!("horizon-profile-path-{}",uuid::Uuid::new_v4()));let registry=root.join("profiles.json");let legacy=root.join("legacy");let profiles=root.join("profiles");assert_eq!(active_profile_data(&registry,&profiles,&legacy).unwrap(),legacy);std::fs::create_dir_all(&root).unwrap();std::fs::write(&registry,r#"{"version":1,"activeProfileId":"first","profiles":[{"id":"first","legacyData":true}]}"#).unwrap();assert_eq!(active_profile_data(&registry,&profiles,&legacy).unwrap(),legacy);std::fs::write(&registry,r#"{"version":1,"activeProfileId":"second","profiles":[{"id":"second","legacyData":false}]}"#).unwrap();assert_eq!(active_profile_data(&registry,&profiles,&legacy).unwrap(),profiles.join("second/data"));std::fs::remove_dir_all(root).unwrap();}
}
