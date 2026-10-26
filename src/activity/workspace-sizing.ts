export function workspaceBounds(available:number){
 const space=Math.max(0,Number.isFinite(available)?available:0);
 const min=Math.min(280,Math.max(0,space*.45));
 return {min,max:Math.max(min,space-400)};
}
