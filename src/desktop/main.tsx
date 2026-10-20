void (async()=>{
 if(!location.pathname.endsWith('/control-indicator')){const host=await import('./tauri');await host.desktopReady;}
 if(location.pathname.startsWith('/desktop/'))history.replaceState(null,'',location.pathname.slice('/desktop'.length)+location.search);
 await import('../main');
})().catch(error=>{const root=document.getElementById('root');if(root){root.textContent='Horizon could not connect to its authenticated desktop backend. Restart the app after the backend update. '+String(error?.message??error);root.style.padding='32px';}});
