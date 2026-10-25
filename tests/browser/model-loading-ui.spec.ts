import {conversationRoute,conversationResponse,runState} from './fixtures';
import {test,expect} from './test-fixture';
test('prompt posts immediately and the response changes from loading to visible thinking',async({page})=>{
 const id='loading-ui',chat={id,title:'Loading UI',headId:'u',messages:[{id:'u',role:'user',content:'Hi',parentId:null}]};
 await page.addInitScript(()=>{(window as any).EventSource=class{onmessage:any;onerror:any;constructor(){(window as any).testSource=this;}close(){}};});
 await page.route('**/api/entities/settings',route=>route.fulfill({json:route.request().method()==='GET'?[{id:'main',providerId:'builtin',model:'a',theme:'dark'}]:route.request().postDataJSON()}));
 await page.route('**/api/models',route=>route.fulfill({json:{models:[{id:'a',name:'Local model',providerId:'builtin',local:true,loaded:false,capabilities:['thinking'],reasoningMode:'summary'}]}}));
 await page.route('**/api/runs',route=>route.fulfill({json:{id:'loading-run',conversationId:id}}));
 await page.route(conversationRoute(id),route=>route.fulfill({json:conversationResponse(route,chat)}));
 await page.goto('http://127.0.0.1:3001/desktop/new');await page.getByRole('textbox',{name:'Message',exact:true}).fill('Hi');await page.getByRole('button',{name:'Send message',exact:true}).click();
 await expect.poll(()=>page.evaluate(()=>!!(window as any).testSource)).toBe(true);
 const emit=async(type:string,data:any)=>page.evaluate(({type,data})=>(window as any).testSource.onmessage({data:JSON.stringify({type,data})}),{type,data});
 await emit('message.started',{message:{id:'a',parentId:'u',role:'assistant',runId:'loading-run',status:'generating',engineStage:'loading',reasoningMode:'summary',reasoning:'',content:''}});
 await expect(page.getByText('Loading model…',{exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Loading selected model'})).toHaveCount(0);await expect(page.getByRole('button',{name:'Stop generation'})).toBeVisible();
 await emit('model.status',{messageId:'a',phase:'prefill',progress:{processedTokens:512,promptTokens:2048,elapsedSeconds:1}});await expect(page.locator('.thinking-shimmer')).toBeVisible();await expect(page.getByText('512 / 2,048 prompt tokens',{exact:true})).toHaveCount(0);await expect(page.getByText('Processing the conversation and tools…',{exact:true})).toHaveCount(0);
 await emit('model.status',{messageId:'a',phase:'prefill',progress:{processedTokens:1800,promptTokens:2048,cachedTokens:1700,elapsedSeconds:.2}});await expect(page.getByText('1,700 reused',{exact:false})).toHaveCount(0);
 await expect(page.getByText('Reading new context…',{exact:true})).toHaveCount(0);
 await emit('model.status',{messageId:'a',phase:'compacting'});await expect(page.getByText('Compacting conversation…',{exact:true})).toBeVisible();
 await emit('reasoning.delta',{messageId:'a',text:'Checking current details.'});await expect(page.getByText('Checking current details.',{exact:true})).toBeVisible();await expect(page.locator('.thinking-shimmer')).toBeVisible();await expect(page.getByText('Waiting for the model…',{exact:true})).toHaveCount(0);
 await emit('model.status',{messageId:'a',phase:'tool_arguments',progress:{characters:12345,elapsedSeconds:12}});await expect(page.locator('.thinking-shimmer')).toBeVisible();
 await emit('model.delta',{messageId:'a',text:'Hello there.'});await expect(page.getByText('Hello there.',{exact:true})).toBeVisible();
 const body='\n\n'+Array.from({length:180},(_,index)=>`Paragraph ${index}: **Streamed content** stays readable while typing. [Source](https://example.com)`).join('\n\n');
 const stream=page.evaluate(async(body)=>{for(let index=0;index<body.length;index+=600){(window as any).testSource.onmessage({data:JSON.stringify({type:'model.delta',data:{messageId:'a',text:body.slice(index,index+600)}})});await new Promise(resolve=>setTimeout(resolve,5));}},body);
 await page.getByRole('textbox',{name:'Message',exact:true}).fill('Typing during a streamed reply');await expect(page.getByRole('textbox',{name:'Message',exact:true})).toHaveValue('Typing during a streamed reply');await stream;
 await expect(page.getByText('Paragraph 179:',{exact:false})).toBeVisible();await expect(page.getByRole('button',{name:'Read aloud'})).toHaveCount(0);
 const final={usage:{prompt_tokens:2048,prompt_eval_tokens:348,completion_tokens:80,prompt_tokens_details:{cached_tokens:1700},prompt_eval_seconds:.5,generation_seconds:2},id:'a',parentId:'u',role:'assistant',runId:'loading-run',status:'completed',reasoningMode:'summary',reasoning:'Checking current details.',content:'Hello there.'+body};
 await emit('message.completed',{message:final});await emit('run.completed',{status:'completed',conversation:{...chat,headId:'a',messages:[...chat.messages,final]}});await expect(page.getByRole('button',{name:'Read aloud'})).toBeVisible();await expect(page.getByText('Response statistics',{exact:true})).toHaveCount(0);
});

