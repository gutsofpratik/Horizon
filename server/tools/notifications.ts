import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import type {ToolRegistry} from './registry.ts';
import type {AppContext} from '../app.ts';
export function registerNotificationTools(registry:ToolRegistry){
 registry.register({name:'notification_send',capability:'conversation',description:'Deliver a persistent in-app completion or attention notification with a link to this saved chat. It appears in the app notification inbox while Horizon is open. This does not send email, SMS or a system push. Unavailable in incognito.',input:z.object({title:z.string().trim().min(1).max(120),message:z.string().trim().min(1).max(2000)}).strict(),handler:(args,ctx)=>{if(ctx.incognito)throw new Error('Persistent notifications require a saved chat');const items=ctx.app.store.list('notifications').sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));for(const item of items.slice(99))ctx.app.store.delete('notifications',item.id);const notification=ctx.app.store.put('notifications',{id:randomUUID(),...args,conversationId:ctx.conversationId,createdAt:new Date().toISOString(),read:false});ctx.emit('notification.created',{notification});return {notification,delivered:true,channel:'in-app'};}});
 registry.register({name:'notification_list',capability:'conversation',description:'Read notifications created for this saved conversation.',input:z.object({}).strict(),handler:(_args,ctx)=>({notifications:ctx.incognito?[]:ctx.app.store.list('notifications').filter(item=>item.conversationId===ctx.conversationId).slice(0,30)})});
}
export function registerNotificationRoutes(app:any,context:AppContext){
 app.get('/api/notifications',async()=>({notifications:context.store.list('notifications').filter(item=>!item.read).sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt))).slice(0,30)}));
 app.post('/api/notifications/:id/read',async(request:any)=>{const item=context.store.get('notifications',request.params.id);if(!item)throw new Error('Notification not found');context.store.put('notifications',{...item,read:true});return {read:true};});
}
