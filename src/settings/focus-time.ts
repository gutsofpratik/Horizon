export type QuietInterval={day:0|1|2|3|4|5|6;start:string;end:string};
export type FocusPolicy={timeZone:string;dailyLimitMinutes:number|null;quiet:QuietInterval[]};
export function isQuietTime(now:Date,policy:FocusPolicy):boolean{
 const parts=new Intl.DateTimeFormat('en-US',{timeZone:policy.timeZone,weekday:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now);
 const value=(type:string)=>parts.find(part=>part.type===type)?.value??'';const day=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(value('weekday'));const minute=Number(value('hour'))*60+Number(value('minute'));
 const parse=(time:string)=>{if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(time))throw new Error('Quiet hours need valid HH:MM times');const [h,m]=time.split(':').map(Number);return h*60+m;};
 return policy.quiet.some(interval=>{const start=parse(interval.start),end=parse(interval.end);if(start===end)return false;if(start<end)return day===interval.day&&minute>=start&&minute<end;return day===interval.day&&minute>=start||day===(interval.day+1)%7&&minute<end;});
}
