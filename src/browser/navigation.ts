export type BrowserNavigation={id:string;url:string;alreadyOpen?:boolean;preview?:boolean};
export const browserNavigationEvent='openclaude:open-browser';
export function browserAddress(value:string,base=window.location.href){
 const url=new URL(value,base);
 if(!['http:','https:'].includes(url.protocol)||url.username||url.password)throw new Error('This link cannot be opened in the browser');
 return url.href;
}
export async function openInBrowser(value:string,options:{alreadyOpen?:boolean;preview?:boolean}={}){
 const url=browserAddress(value);
 window.dispatchEvent(new CustomEvent<BrowserNavigation>(browserNavigationEvent,{detail:{id:crypto.randomUUID(),url,...options}}));
}
export function registeredFileId(value:string){const url=new URL(value,window.location.href);return url.origin===window.location.origin?url.pathname.match(/^\/api\/files\/([^/]+)(?:\/preview)?$/)?.[1]:undefined;}
// Sandboxed previews send link clicks to the parent rather than spawning windows.
export const previewLinkScript=`<script>document.addEventListener('click',function(event){const link=event.target.closest&&event.target.closest('a[href]');if(!link||link.hasAttribute('download')||link.getAttribute('href').startsWith('#'))return;event.preventDefault();parent.postMessage({type:'openclaude:preview-link',url:link.getAttribute('href')},'*');});window.open=function(url){parent.postMessage({type:'openclaude:preview-link',url:String(url)},'*');return null;};<\/script>`;
