import {z} from 'zod';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdir} from 'node:fs/promises';
import {relative} from 'node:path';
import {ToolError,type ToolRegistry,type ToolContext} from './registry.ts';
import {safePath,workspaceRoot} from './files.ts';

const exec=promisify(execFile),ref=z.string().min(1).max(200).regex(/^[A-Za-z0-9][A-Za-z0-9._/@{}^~:+-]*$/),path=z.string().min(1).max(500);
const redact=(text:string)=>text.replace(/(https?:\/\/)[^\s/@]+@/g,'$1[credentials]@');
const currentRequest=(ctx:ToolContext)=>ctx.app.store.get('conversations',ctx.conversationId)?.messages?.filter((message:any)=>message.role==='user').at(-1)?.content??'';
async function run(ctx:ToolContext,program:'git'|'gh',arguments_:string[],timeout=30000){const cwd=workspaceRoot(ctx);await mkdir(cwd,{recursive:true});try{const result=await exec(program,arguments_,{cwd,timeout,maxBuffer:2_000_000,windowsHide:true,signal:ctx.signal});return {stdout:redact(result.stdout).slice(0,100000),stderr:redact(result.stderr).slice(0,30000),exit_code:0};}catch(error:any){if(error.code==='ENOENT')throw new ToolError('RUNTIME_UNAVAILABLE',program+' is not installed');throw new ToolError('COMMAND_FAILED',redact(String(error.stderr??error.message)).slice(0,3000),{exit_code:error.code??1});}}
async function scoped(ctx:ToolContext,value:string){const root=workspaceRoot(ctx),file=await safePath(root,value);return relative(root,file).replaceAll('\\','/');}
function requireUser(ctx:ToolContext,action:string){const request=currentRequest(ctx);const explicit:Record<string,RegExp>={push:/\bpush\b/i,pr_create:/\b(?:create|open)\b.{0,80}\b(?:pr|pull request)\b/i,pr_review:/\b(?:review|comment|approve)\b.{0,80}\b(?:pr|pull request)\b/i,pr_merge:/\bmerge\b.{0,80}\b(?:pr|pull request)\b/i,clone:/\bclone\b/i};const pattern=explicit[action]??new RegExp('\\b(?:'+action.replaceAll('_','[ _-]')+'|git|repository|repo)\\b','i');if(!pattern.test(request))throw new ToolError('USER_AUTHORIZATION_REQUIRED','Ask the user to explicitly request this Git or pull-request change before running it');}

export function registerGitTools(registry:ToolRegistry){
 const add=(name:string,description:string,input:z.ZodType,build:(args:any,ctx:ToolContext)=>Promise<{program:'git'|'gh';args:string[];timeout?:number}>|{program:'git'|'gh';args:string[];timeout?:number},protectedAction=false)=>registry.register({name:'git_'+name,description,capability:'terminal',input,handler:async(args,ctx)=>{if(protectedAction)requireUser(ctx,name);const command=await build(args,ctx);return run(ctx,command.program,command.args,command.timeout);}});
 const no=z.object({}).strict(),revision=z.object({revision:ref}).strict(),branch=z.object({name:ref}).strict();
 add('status','Read repository status in the current workspace.',no,()=>({program:'git',args:['status','--short','--branch']}));
 add('diff','Read a bounded working or staged diff.',z.object({staged:z.boolean().default(false),path:path.optional()}).strict(),async(args,ctx)=>({program:'git',args:['diff',...(args.staged?['--cached']:[]),...(args.path?['--',await scoped(ctx,args.path)]:[])]}));
 add('log','Read recent repository commits.',z.object({limit:z.number().int().min(1).max(50).default(10)}).strict(),args=>({program:'git',args:['log','--oneline','-n',String(args.limit)]}));
 add('show','Read a Git revision.',revision,args=>({program:'git',args:['show','--stat','--oneline',args.revision]}));
 add('blame','Read line authorship for a workspace file.',z.object({path}).strict(),async(args,ctx)=>({program:'git',args:['blame','--',await scoped(ctx,args.path)]}));
 add('ls_files','List tracked repository paths.',no,()=>({program:'git',args:['ls-files']}));
 add('remotes','List configured remote names and destinations with credentials redacted.',no,()=>({program:'git',args:['remote','-v']}));
 add('reflog','Read recent local reference changes.',z.object({limit:z.number().int().min(1).max(50).default(10)}).strict(),args=>({program:'git',args:['reflog','-n',String(args.limit)]}));
 add('init','Initialize a repository in the current workspace.',no,()=>({program:'git',args:['init']}));
 add('clone','Clone a remote into a new workspace subdirectory.',z.object({url:z.string().url(),destination:path}).strict(),async(args,ctx)=>({program:'git',args:['clone','--',args.url,await scoped(ctx,args.destination)],timeout:300000}),true);
 add('add','Stage named workspace files.',z.object({paths:z.array(path).min(1).max(50)}).strict(),async(args,ctx)=>({program:'git',args:['add','--',...await Promise.all(args.paths.map((item:string)=>scoped(ctx,item)))]}));
 add('commit','Create a local commit from staged changes.',z.object({message:z.string().trim().min(1).max(500)}).strict(),args=>({program:'git',args:['commit','-m',args.message]}),true);
 add('restore','Restore a named workspace file from the index.',z.object({path}).strict(),async(args,ctx)=>({program:'git',args:['restore','--',await scoped(ctx,args.path)]}),true);
 add('reset','Move HEAD or unstage changes; hard mode discards working changes.',z.object({mode:z.enum(['soft','mixed','hard']),revision:ref}).strict(),args=>({program:'git',args:['reset','--'+args.mode,args.revision]}),true);
 add('revert','Create a reversal commit for a selected revision.',revision,args=>({program:'git',args:['revert','--no-edit',args.revision]}),true);
 add('cherry_pick','Apply a selected commit onto the current branch.',revision,args=>({program:'git',args:['cherry-pick',args.revision]}),true);
 add('stash','Save working changes in a local stash.',no,()=>({program:'git',args:['stash','push']}),true);
 add('stash_pop','Reapply the latest local stash.',no,()=>({program:'git',args:['stash','pop']}),true);
 add('branch','List branches or create a named branch.',z.object({name:ref.optional()}).strict(),args=>({program:'git',args:args.name?['branch',args.name]:['branch','--list']}),true);
 add('switch','Switch to an existing local branch.',branch,args=>({program:'git',args:['switch',args.name]}),true);
 add('merge','Merge another branch into the current branch.',branch,args=>({program:'git',args:['merge','--no-edit',args.name]}),true);
 add('rebase','Rebase the current branch onto a selected branch.',branch,args=>({program:'git',args:['rebase',args.name]}),true);
 add('worktree_list','List repository worktrees.',no,()=>({program:'git',args:['worktree','list','--porcelain']}));
 add('worktree_add','Create a worktree inside this workspace.',z.object({path,branch:ref}).strict(),async(args,ctx)=>({program:'git',args:['worktree','add',await scoped(ctx,args.path),args.branch]}),true);
 add('worktree_remove','Remove a repository worktree inside this workspace.',z.object({path}).strict(),async(args,ctx)=>({program:'git',args:['worktree','remove',await scoped(ctx,args.path)]}),true);
 add('worktree_prune','Prune stale worktree records.',no,()=>({program:'git',args:['worktree','prune']}),true);
 add('fetch','Fetch a configured remote.',z.object({remote:ref.default('origin')}).strict(),args=>({program:'git',args:['fetch',args.remote],timeout:300000}));
 add('pull','Pull a configured remote and branch.',z.object({remote:ref.default('origin'),branch:ref}).strict(),args=>({program:'git',args:['pull','--ff-only',args.remote,args.branch],timeout:300000}),true);
 add('push','Push a named branch to a configured remote.',z.object({remote:ref.default('origin'),branch:ref}).strict(),args=>({program:'git',args:['push',args.remote,args.branch],timeout:300000}),true);
 add('pr_list','List pull requests for this repository.',no,()=>({program:'gh',args:['pr','list','--json','number,title,state,url']}));
 add('pr_view','Read a pull request by number.',z.object({number:z.number().int().positive()}).strict(),args=>({program:'gh',args:['pr','view',String(args.number),'--json','number,title,body,state,url']}));
 add('pr_checks','Read checks on a pull request.',z.object({number:z.number().int().positive()}).strict(),args=>({program:'gh',args:['pr','checks',String(args.number)]}));
 add('pr_create','Create a draft pull request.',z.object({title:z.string().min(1).max(300),body:z.string().max(20000),base:ref.optional()}).strict(),args=>({program:'gh',args:['pr','create','--draft','--title',args.title,'--body',args.body,...(args.base?['--base',args.base]:[])]}),true);
 add('pr_checkout','Check out a pull request locally.',z.object({number:z.number().int().positive()}).strict(),args=>({program:'gh',args:['pr','checkout',String(args.number)]}),true);
 add('pr_review','Submit a review on a pull request when expressly requested.',z.object({number:z.number().int().positive(),decision:z.enum(['approve','request-changes','comment']),body:z.string().min(1).max(10000)}).strict(),args=>({program:'gh',args:['pr','review',String(args.number),'--'+args.decision,'--body',args.body]}),true);
 add('pr_merge','Merge a pull request after explicit user authorization.',z.object({number:z.number().int().positive(),method:z.enum(['merge','squash','rebase']).default('squash')}).strict(),args=>({program:'gh',args:['pr','merge',String(args.number),'--'+args.method]}),true);
}
