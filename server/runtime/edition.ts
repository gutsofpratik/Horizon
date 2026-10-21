/** User agents choose an edition only on a host started by the native app.
 * Native tool execution still requires the broker's authenticated connection. */
export function requestEdition(request:{headers:Record<string,any>},desktopOwned=process.env.OPENCLAUDE_DESKTOP_OWNED==='1'):'desktop'|'web'{
 return desktopOwned&&/\b(?:Horizon|OpenClaude)Desktop(?:\/|\b)/.test(String(request.headers['user-agent']??''))?'desktop':'web';
}
