export function HorizonMark({size=40}:{size?:number}){
 return <svg width={size} height={size} viewBox="0 0 40 40" fill="currentColor" aria-hidden="true">{Array.from({length:12},(_,index)=><path key={index} d="M20 3 21 15 20 20 18.5 15Z" transform={'rotate('+index*30+' 20 20)'}/>)}</svg>;
}
