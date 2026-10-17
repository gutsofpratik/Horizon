import {useEffect,useState} from 'react';
import {Download,FileText} from 'lucide-react';
import {api} from '../app/api';
import {previewLinkScript} from './navigation';
export function FilePreview({id,onError,onClose}:any){
 const [file,setFile]=useState<any>(null),[html,setHtml]=useState<string>();
 useEffect(()=>{let live=true;setFile(null);setHtml(undefined);api('/files/'+encodeURIComponent(id)+'/info').then(async file=>{if(!live)return;setFile(file);if(file.mediaType==='text/html'){const response=await fetch(file.previewUrl);if(!response.ok)throw new Error('Cannot read this HTML file');const source=await response.text();if(live)setHtml('<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'unsafe-inline\'; style-src \'unsafe-inline\'; img-src data: blob:; form-action \'none\'">'+previewLinkScript+source);}}).catch(error=>{if(live)onError(error.message);});return()=>{live=false;};},[id]);
 if(!file)return <p className="form-note" role="status">Opening file…</p>;
 return <div className="browser-file-preview"><div className="browser-file-heading"><button type="button" aria-label="Back to browser" onClick={onClose}>←</button><FileText size={16}/><span>{file.name}</span><a href={file.url} download={file.name} aria-label={'Download '+file.name}><Download size={15}/></a></div>{file.previewable?file.mediaType==='text/html'?html!==undefined&&<iframe title={file.name} data-app-preview data-link-base={location.origin+file.url} sandbox="allow-scripts" srcDoc={html}/>:<iframe title={file.name} sandbox={file.mediaType==='application/pdf'?undefined:''} src={file.previewUrl}/>:<div className="panel-empty"><FileText size={32}/><p>A preview is not available for this file format.</p><a href={file.url} download={file.name}>Download {file.name}</a></div>}</div>;
}
