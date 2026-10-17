import {useEffect,useState} from 'react';
import {browserNavigationEvent,openInBrowser,type BrowserNavigation} from './navigation';
export function useBrowserNavigation(openPanel:()=>void,onError:(message:string)=>void){
 const [navigation,setNavigation]=useState<BrowserNavigation|null>(null);
 useEffect(()=>{
  const open=(event:Event)=>{setNavigation((event as CustomEvent<BrowserNavigation>).detail);openPanel();};
  const click=(event:MouseEvent)=>{
   const target=event.target instanceof Element?event.target.closest('a[href]'):null;
   if(!target||target.hasAttribute('download')||event.button>1)return;
   const href=target.getAttribute('href');if(!href||href.startsWith('#'))return;
   const url=new URL(href,location.href);
   if(!['http:','https:'].includes(url.protocol)){event.preventDefault();onError('This link type cannot be opened in the app browser.');return;}
   // In-app navigation continues to use the application's own router.
   if(url.origin===location.origin&&/^\/(?:desktop\/)?(?:new|chat\/|projects|skills|artifacts)(?:\/|$)/.test(url.pathname))return;
   event.preventDefault();void openInBrowser(url.href).catch(error=>onError(error.message));
  };
  const message=(event:MessageEvent)=>{if(event.data?.type!=='openclaude:preview-link'||typeof event.data.url!=='string')return;const frame=[...document.querySelectorAll<HTMLIFrameElement>('iframe[data-app-preview]')].find(frame=>frame.contentWindow===event.source);if(!frame)return;void openInBrowser(new URL(event.data.url,frame.dataset.linkBase??location.href).href).catch(error=>onError(error.message));};
  window.addEventListener(browserNavigationEvent,open);document.addEventListener('click',click,true);document.addEventListener('auxclick',click,true);window.addEventListener('message',message);
  return()=>{window.removeEventListener(browserNavigationEvent,open);document.removeEventListener('click',click,true);document.removeEventListener('auxclick',click,true);window.removeEventListener('message',message);};
 },[openPanel,onError]);
 return navigation;
}
