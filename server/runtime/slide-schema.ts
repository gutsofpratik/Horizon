import {z} from 'zod';

const shared={title:z.string().min(1).max(300).regex(/\S/).describe('Visible slide title; do not insert empty placeholder slides'),body:z.string().max(10000).default(''),notes:z.string().max(20000).optional()};
const content={...shared,layout:z.literal('content').default('content')};
const table=z.object({headers:z.array(z.string().max(300)).min(1).max(8),rows:z.array(z.array(z.string().max(1000))).max(12)}).strict();
// Structural alternatives keep the advertised JSON schema consistent with
// execution. A hidden refinement cannot teach a model which layout to choose.
export const presentationSlideSchema=z.union([
 z.object({...shared,layout:z.literal('section')}).strict(),
 z.object({...content,bullets:z.array(z.string().max(1000)).max(20)}).strict(),
 z.object({...content,table}).strict().refine(slide=>slide.table.rows.every(row=>row.length===slide.table.headers.length),'Table rows must match header columns'),
 z.object(content).strict(),
]);

export function requestedSlideCount(request:string){
 const words:Record<string,number>={one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10};
 const counts=[...request.matchAll(/\b(\d{1,3}|one|two|three|four|five|six|seven|eight|nine|ten)[ -]+slides?\b/gi)].map(match=>words[match[1].toLowerCase()]??Number(match[1])).filter(value=>value>=1&&value<=100);
 const unique=[...new Set(counts)];return unique.length===1?unique[0]:undefined;
}
