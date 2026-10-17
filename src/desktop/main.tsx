import './tauri';
if(location.pathname.startsWith('/desktop/'))history.replaceState(null,'',location.pathname.slice('/desktop'.length)+location.search);
void import('../main');
