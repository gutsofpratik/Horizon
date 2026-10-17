//! App-owned, windowless backend lifecycle.
use std::{fs::{self,OpenOptions},io::{Read,Write},net::{TcpStream,SocketAddr},path::PathBuf,process::{Child,Command,Stdio},sync::Mutex,time::{Duration,Instant}};

pub struct Backend { child: Mutex<Option<Child>> }

fn ready_at(address:SocketAddr)->bool {
    let Ok(mut stream)=TcpStream::connect_timeout(&address,Duration::from_millis(400)) else{return false};
    let _=stream.set_read_timeout(Some(Duration::from_millis(600)));
    let _=stream.set_write_timeout(Some(Duration::from_millis(600)));
    if stream.write_all(b"GET /api/health HTTP/1.1\r\nHost: 127.0.0.1:3001\r\nConnection: close\r\n\r\n").is_err(){return false;}
    let mut response=String::new();
    if stream.take(32768).read_to_string(&mut response).is_err(){return false;}
    let Some((head,body))=response.split_once("\r\n\r\n") else{return false};
    if !head.starts_with("HTTP/1.1 200 ")&&!head.starts_with("HTTP/1.0 200 "){return false;}
    serde_json::from_str::<serde_json::Value>(body).is_ok_and(|value|value["app"]=="OpenClaude"&&value["status"]=="ok")
}

fn workspace()->Result<PathBuf,String>{
    let mut candidates=Vec::new();
    if let Some(path)=std::env::var_os("OPENCLAUDE_WORKSPACE_ROOT"){candidates.push(PathBuf::from(path));}
    if let Ok(exe)=std::env::current_exe(){if let Some(folder)=exe.parent(){candidates.push(folder.join("backend"));}}
    #[cfg(debug_assertions)]candidates.push(PathBuf::from(env!("CARGO_MANIFEST_DIR")).join(".."));
    candidates.into_iter().find(|root|root.join("server.mjs").is_file()||root.join("server/index.ts").is_file()&&root.join("node_modules/tsx/dist/cli.mjs").is_file()).ok_or_else(||"OpenClaude backend resources were not found. Restore the application installation.".into())
}

fn node(root:&std::path::Path)->Result<PathBuf,String>{
    if let Some(path)=std::env::var_os("OPENCLAUDE_NODE"){let path=PathBuf::from(path);if path.is_file(){return Ok(path);}return Err("Configured OpenClaude backend runtime was not found".into());}
    let bundled=root.join(".local/desktop-runtime/node.exe");if bundled.is_file(){return Ok(bundled);}
    let packaged=root.join("node/node.exe");if packaged.is_file(){return Ok(packaged);}
    let paths=std::env::var_os("PATH").unwrap_or_default();
    std::env::split_paths(&paths).map(|path|path.join("node.exe")).find(|path|path.is_file()).ok_or_else(||"OpenClaude's Node runtime is missing. Repair the desktop installation.".into())
}

impl Backend {
    pub fn start()->Result<Self,String>{
        let address:SocketAddr="127.0.0.1:3001".parse().unwrap();
        let backend=Self{child:Mutex::new(None)};
        if ready_at(address){return Ok(backend);}
        if TcpStream::connect_timeout(&address,Duration::from_millis(200)).is_ok(){return Err("Port 3001 is occupied by a different service. OpenClaude did not stop or replace it.".into());}
        let root=workspace()?;let executable=node(&root)?;
        let packaged=root.join("server.mjs").is_file();
        let logs=if packaged{PathBuf::from(std::env::var_os("LOCALAPPDATA").ok_or("Windows application data directory is unavailable")?).join("OpenClaude/data")}else{root.join(".local")};fs::create_dir_all(&logs).map_err(|e|e.to_string())?;
        let stdout=OpenOptions::new().create(true).append(true).open(logs.join("desktop-backend.log")).map_err(|e|e.to_string())?;
        let stderr=OpenOptions::new().create(true).append(true).open(logs.join("desktop-backend.err.log")).map_err(|e|e.to_string())?;
        let mut command=Command::new(executable);
        if packaged{command.arg(root.join("server.mjs")).env("OPENCLAUDE_DATA_DIR",&logs).env("OPENCLAUDE_BUNDLED_PYTHON",root.join("python")).env("OPENCLAUDE_PYTHON",root.join("python/python.exe"));}else{command.arg(root.join("node_modules/tsx/dist/cli.mjs")).arg(root.join("server/index.ts"));}
        command.current_dir(&root).env("PORT","3001").env("OPENCLAUDE_DESKTOP_OWNED","1").stdin(Stdio::null()).stdout(stdout).stderr(stderr);
        #[cfg(windows)]{use std::os::windows::process::CommandExt;command.creation_flags(0x08000000);}
        let child=command.spawn().map_err(|error|format!("Could not start OpenClaude backend: {error}"))?;
        *backend.child.lock().unwrap()=Some(child);
        let deadline=Instant::now()+Duration::from_secs(30);
        while Instant::now()<deadline {
            if let Some(status)=backend.child.lock().unwrap().as_mut().unwrap().try_wait().map_err(|e|e.to_string())?{return Err(format!("OpenClaude backend exited ({status}). Details: {}",logs.join("desktop-backend.err.log").display()));}
            if ready_at(address){return Ok(backend);}
            std::thread::sleep(Duration::from_millis(150));
        }
        Err(format!("OpenClaude backend did not become ready. Details: {}",logs.join("desktop-backend.err.log").display()))
    }
    pub fn stop(&self){
        if let Some(mut child)=self.child.lock().unwrap().take(){
            if matches!(child.try_wait(),Ok(Some(_))){return;}
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
    #[test]fn accepts_only_healthy_openclaude_backend(){
        assert!(ready_at(response(r#"{"app":"OpenClaude","status":"ok"}"#,"200 OK")));
        assert!(!ready_at(response(r#"{"status":"ok"}"#,"200 OK")));
        assert!(!ready_at(response(r#"{"app":"OpenClaude","status":"ok"}"#,"500 Error")));
    }
    #[test]fn stopping_an_unowned_backend_is_a_noop(){let backend=Backend{child:Mutex::new(None)};backend.stop();assert!(backend.child.lock().unwrap().is_none());}
}
