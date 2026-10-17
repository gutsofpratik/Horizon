void (async()=>{
 if(!location.pathname.endsWith('/control-indicator'))await import('./tauri');
 if(location.pathname.startsWith('/desktop/'))history.replaceState(null,'',location.pathname.slice('/desktop'.length)+location.search);
 await import('../main');
})();
