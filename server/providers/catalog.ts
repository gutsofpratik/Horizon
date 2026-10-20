/** Transport, authentication and discovery are explicit; a profile is not a model capability claim. */
export type ProviderType='ollama'|'openai'|'responses'|'anthropic'|'gemini'|'azure'|'bedrock'|'vertex';
export interface ProviderProfile {id:string;name:string;type:ProviderType;baseUrl:string;category:'local'|'cloud'|'regional'|'gateway'|'enterprise';auth:'none'|'api-key'|'aws-chain'|'google-adc';note?:string}
export const providerProfiles:ProviderProfile[]=[
 {id:'ollama',name:'Ollama',type:'ollama',baseUrl:'http://127.0.0.1:11434',category:'local',auth:'none'},
 {id:'lmstudio',name:'LM Studio',type:'openai',baseUrl:'http://127.0.0.1:1234/v1',category:'local',auth:'none'},
 {id:'openai',name:'OpenAI Responses',type:'responses',baseUrl:'https://api.openai.com/v1',category:'cloud',auth:'api-key'},
 {id:'openai-chat',name:'OpenAI Chat Completions',type:'openai',baseUrl:'https://api.openai.com/v1',category:'cloud',auth:'api-key'},
 {id:'anthropic',name:'Anthropic',type:'anthropic',baseUrl:'https://api.anthropic.com/v1',category:'cloud',auth:'api-key'},
 {id:'gemini',name:'Google Gemini',type:'gemini',baseUrl:'https://generativelanguage.googleapis.com/v1beta',category:'cloud',auth:'api-key'},
 {id:'azure',name:'Azure OpenAI',type:'azure',baseUrl:'',category:'enterprise',auth:'api-key',note:'Use https://RESOURCE.openai.azure.com/openai/v1 and exact deployment names as model IDs.'},
 {id:'bedrock',name:'Amazon Bedrock',type:'bedrock',baseUrl:'',category:'enterprise',auth:'aws-chain',note:'AWS credential chain/profile with SigV4. Enter region and exact model or inference-profile IDs.'},
 {id:'vertex',name:'Google Vertex AI',type:'vertex',baseUrl:'',category:'enterprise',auth:'google-adc',note:'Application Default Credentials. Enter Google Cloud project, location and Gemini model IDs.'},
 ...([
 ['openrouter','OpenRouter','https://openrouter.ai/api/v1','gateway'],['together','Together AI','https://api.together.xyz/v1','cloud'],
 ['groq','Groq','https://api.groq.com/openai/v1','cloud'],['fireworks','Fireworks AI','https://api.fireworks.ai/inference/v1','cloud'],
 ['deepseek','DeepSeek','https://api.deepseek.com/v1','regional'],['mistral','Mistral AI','https://api.mistral.ai/v1','cloud'],
 ['xai','xAI','https://api.x.ai/v1','cloud'],['cerebras','Cerebras','https://api.cerebras.ai/v1','cloud'],
 ['sambanova','SambaNova','https://api.sambanova.ai/v1','cloud'],['perplexity','Perplexity','https://api.perplexity.ai','cloud'],
 ['qwen','Alibaba Cloud (international)','https://dashscope-intl.aliyuncs.com/compatible-mode/v1','regional'],
 ['qwen-cn','Alibaba Cloud (China)','https://dashscope.aliyuncs.com/compatible-mode/v1','regional'],
 ['moonshot','Moonshot AI','https://api.moonshot.ai/v1','regional'],['zai','Z.ai','https://api.z.ai/api/paas/v4','regional'],
 ['siliconflow','SiliconFlow','https://api.siliconflow.com/v1','regional'],['nvidia','NVIDIA NIM','https://integrate.api.nvidia.com/v1','cloud'],
 ['zhipu','Zhipu (China)','https://open.bigmodel.cn/api/paas/v4','regional'],['moonshot-cn','Moonshot (China)','https://api.moonshot.cn/v1','regional'],
 ['ark','Volcengine Ark','https://ark.cn-beijing.volces.com/api/v3','regional'],['qianfan','Baidu Qianfan','https://qianfan.baidubce.com/v2','regional'],
 ['hunyuan','Tencent Hunyuan','https://api.hunyuan.cloud.tencent.com/v1','regional'],['lingyi','Lingyi','https://api.lingyiwanwu.com/v1','regional'],
 ['poe','Poe','https://api.poe.com/v1','gateway'],['ppio','PPIO','https://api.ppinfra.com/v3/openai','regional'],
 ['modelscope','ModelScope','https://api-inference.modelscope.cn/v1','regional'],['infiniai','InfiniAI','https://cloud.infini-ai.com/maas/v1','regional'],
 ['ctyun','Ctyun','https://wishub-x1.ctyun.cn/v1','regional'],['stepfun','StepFun','https://api.stepfun.com/v1','regional'],
 ['minimax-cn','MiniMax (China)','https://api.minimaxi.com/v1','regional'],['minimax','MiniMax (Global)','https://api.minimax.io/v1','cloud'],
 ['novita','Novita AI','https://api.novita.ai/openai/v1','cloud'],['siliconflow-cn','SiliconFlow (China)','https://api.siliconflow.cn/v1','regional'],
 ['litellm','LiteLLM gateway','','gateway'],['custom','Custom OpenAI-compatible API','','gateway'],
 ] as const).map(([id,name,baseUrl,category])=>({id,name,type:'openai' as const,baseUrl,category,auth:'api-key' as const})),
];
