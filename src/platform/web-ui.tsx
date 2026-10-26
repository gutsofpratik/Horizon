export {WebBrowser as BrowserView} from '../browser/WebBrowser';
export const NativeTerminal=(_:any)=>null;
export const ComputerControl=(_:any)=>null;
export const ModelLibrary=(_:any)=>null;
export const ManagedModels=(_:any)=>null;
export const RuntimePacks=(_:any)=>null;
export {openInBrowser as openExternal} from '../browser/navigation';

export async function pickSpeechFolder():Promise<string>{throw new Error('Local model import requires Horizon Desktop.');}
