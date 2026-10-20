import {createApp as createHostApp} from '../../server/app.ts';
/** Exercise protected routes using a real signed session, never a production auth bypass. */
export async function createApp(options:Parameters<typeof createHostApp>[0]):Promise<any>{
 const app=await createHostApp(options);const session=(app as any).context.ephemeral.get('hostAccess').cookie().split(';')[0];const inject=app.inject.bind(app);
 (app as any).inject=(options:any,...rest:any[])=>{const request=typeof options==='string'?{url:options}:{...options};request.headers={cookie:session,...request.headers};return (inject as any)(request,...rest);};return app;
}
