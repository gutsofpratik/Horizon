use std::{io::{Read,Write},net::TcpStream,time::Duration};
use tauri::Manager;

fn prepare(token:&str)->Result<serde_json::Value,String>{
 let mut socket=TcpStream::connect_timeout(&"127.0.0.1:3001".parse().unwrap(),Duration::from_secs(2)).map_err(|e|e.to_string())?;
 socket.set_read_timeout(Some(Duration::from_secs(20))).map_err(|e|e.to_string())?;
 write!(socket,"POST /api/updates/prepare-install HTTP/1.1\r\nHost: 127.0.0.1:3001\r\nAuthorization: Bearer {}\r\nContent-Length: 0\r\nConnection: close\r\n\r\n",token).map_err(|e|e.to_string())?;
 let mut response=String::new();socket.take(65536).read_to_string(&mut response).map_err(|e|e.to_string())?;
 let (head,body)=response.split_once("\r\n\r\n").ok_or("Invalid updater response")?;
 if !head.starts_with("HTTP/1.1 200 "){return Err("Update verification failed; see Settings > Updates".into());}
 serde_json::from_str(body).map_err(|e|e.to_string())
}

// Called only at full application exit, before stopping the owned backend.
pub fn install_on_exit(app:&tauri::AppHandle)->Result<(),String>{
 #[cfg(windows)]{
  use std::{fs,process::{Command,Stdio},os::windows::process::CommandExt};
  let exe=std::env::current_exe().map_err(|e|e.to_string())?;
  let directory=exe.parent().ok_or("Installation directory missing")?;
  // Never overwrite a development checkout or unsupported portable host.
  if exe.file_name().and_then(|s|s.to_str())!=Some("Horizon.exe")||!directory.join("Uninstall.exe").is_file(){return Ok(());}
  let value=prepare(&app.state::<super::backend::Backend>().credential())?;
  if value["pending"]!=true{return Ok(());}
  let path=value["path"].as_str().ok_or("Missing installer")?;
  let hash=value["sha256"].as_str().ok_or("Missing installer hash")?;
  if hash.len()!=64||!hash.bytes().all(|b|b.is_ascii_hexdigit())||!path.ends_with(".exe"){return Err("Invalid verified installer".into());}
  let work=app.path().app_local_data_dir().map_err(|e|e.to_string())?.join("updater");
  fs::create_dir_all(&work).map_err(|e|e.to_string())?;
  let config=work.join(format!("{}.json",uuid::Uuid::new_v4()));
  fs::write(&config,serde_json::to_vec(&serde_json::json!({"installer":path,"sha256":hash,"directory":dunce::simplified(directory),"pid":std::process::id(),"started":true})).unwrap()).map_err(|e|e.to_string())?;
  let script=work.join("install.ps1");fs::write(&script,include_str!("updater.ps1")).map_err(|e|e.to_string())?;
  Command::new("powershell.exe").args(["-NoLogo","-NoProfile","-NonInteractive","-ExecutionPolicy","Bypass","-File"]).arg(script).arg(&config).creation_flags(0x08000000).stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null()).spawn().map_err(|e|e.to_string())?;
 }
 #[cfg(not(windows))]let _=app;
 Ok(())
}
