//! Kernel containment: only app-owned process handles are assigned, never a process-name match.
use std::os::windows::io::AsRawHandle;
use windows_sys::Win32::{Foundation::{HANDLE,CloseHandle},System::{JobObjects::{CreateJobObjectW,SetInformationJobObject,AssignProcessToJobObject,JOBOBJECT_EXTENDED_LIMIT_INFORMATION,JobObjectExtendedLimitInformation,JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE},Threading::{OpenProcess,PROCESS_SET_QUOTA,PROCESS_TERMINATE}}};
pub struct Job(HANDLE);
unsafe impl Send for Job{}
unsafe impl Sync for Job{}
impl Job{
 pub fn new()->Result<Self,String>{unsafe{let handle=CreateJobObjectW(std::ptr::null(),std::ptr::null());if handle.is_null(){return Err(std::io::Error::last_os_error().to_string());}let job=Self(handle);let mut limits:JOBOBJECT_EXTENDED_LIMIT_INFORMATION=std::mem::zeroed();limits.BasicLimitInformation.LimitFlags=JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;if SetInformationJobObject(handle,JobObjectExtendedLimitInformation,&limits as *const _ as *const _,std::mem::size_of_val(&limits) as u32)==0{return Err(std::io::Error::last_os_error().to_string());}Ok(job)}}
 pub fn assign(&self,child:&std::process::Child)->Result<(),String>{unsafe{if AssignProcessToJobObject(self.0,child.as_raw_handle())==0{return Err(std::io::Error::last_os_error().to_string());}}Ok(())}
 /// The PTY owns the original process handle throughout this call, preventing PID reuse.
 pub fn assign_pty(&self,pid:u32)->Result<(),String>{unsafe{let handle=OpenProcess(PROCESS_SET_QUOTA|PROCESS_TERMINATE,0,pid);if handle.is_null(){return Err(std::io::Error::last_os_error().to_string());}let assigned=AssignProcessToJobObject(self.0,handle);let error=if assigned==0{Some(std::io::Error::last_os_error().to_string())}else{None};CloseHandle(handle);if let Some(error)=error{return Err(error);}}Ok(())}
}
impl Drop for Job{fn drop(&mut self){unsafe{CloseHandle(self.0);}}}
