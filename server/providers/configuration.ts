import type {Provider} from './adapter.ts';
import {validateModelOptions} from './model-options.ts';
const types=['ollama','openai','responses','anthropic','gemini','azure','bedrock','vertex'];
export function providerCredential(provider:Provider){
 const key=provider.apiKeyEnv?process.env[provider.apiKeyEnv]:provider.apiKey;
 if(provider.apiKeyEnv&&!key)throw new Error(`Provider credential environment variable ${provider.apiKeyEnv} is not set`);
 if(key&&(/[\r\n]/.test(key)||key.length>16384))throw new Error('Invalid provider credential');
 return key;
}
export function publicProvider(provider:Provider){const {apiKey,...safe}=provider;return {...safe,hasApiKey:!!apiKey,credentialSource:provider.apiKeyEnv?'environment':apiKey?'saved':(['bedrock','vertex'].includes(provider.type)?'identity-chain':'none')};}
export function validateProvider(provider:Provider){
 validateModelOptions(provider);
 if(!types.includes(provider.type))throw new Error('Unknown provider type');
 if(provider.azureApi!==undefined&&!['chat','responses'].includes(provider.azureApi))throw new Error('Azure API must be Chat Completions or Responses');
 if(typeof provider.name!=='string'||!provider.name.trim()||provider.name.length>200)throw new Error('Provider name is required');
 if(provider.modelIds!==undefined&&(!Array.isArray(provider.modelIds)||provider.modelIds.length>200||provider.modelIds.some(id=>typeof id!=='string'||!id.trim()||id.length>300)))throw new Error('Model IDs must be a list of up to 200 nonempty strings');
 if(provider.apiKey!==undefined&&(typeof provider.apiKey!=='string'||provider.apiKey.length>16384||/[\r\n]/.test(provider.apiKey)))throw new Error('Invalid provider API key');
 if(provider.apiKeyEnv!==undefined&&(typeof provider.apiKeyEnv!=='string'||provider.apiKeyEnv!==''&&!/^[A-Za-z_][A-Za-z0-9_]{0,127}$/.test(provider.apiKeyEnv)))throw new Error('Invalid credential environment variable');
 if(provider.awsProfile!==undefined&&(typeof provider.awsProfile!=='string'||!/^[\w.@+-]{0,128}$/.test(provider.awsProfile)))throw new Error('Invalid AWS profile');
 if(provider.type==='bedrock'&&!/^[a-z]{2}(?:-[a-z]+)+-\d+$/.test(provider.region??''))throw new Error('Bedrock requires an AWS region');
 if(provider.type==='vertex'&&(!/^[a-z][a-z0-9-]{4,61}[a-z0-9]$/.test(provider.projectId??'')||!/^(global|[a-z]+(?:-[a-z0-9]+)+)$/.test(provider.location??'')))throw new Error('Vertex requires a Google Cloud project ID and location');
 if(['bedrock','vertex'].includes(provider.type)&&!provider.baseUrl)return;
 const url=new URL(provider.baseUrl);
 if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.search||url.hash)throw new Error('Invalid provider base URL');
 if((provider.apiKey||provider.apiKeyEnv)&&url.protocol!=='https:'&&!['localhost','127.0.0.1','[::1]'].includes(url.hostname))throw new Error('Use HTTPS for remote providers with credentials');
 if(['bedrock','vertex'].includes(provider.type)&&url.protocol!=='https:'&&!['localhost','127.0.0.1','[::1]'].includes(url.hostname))throw new Error('Enterprise identity endpoints require HTTPS');
 if(provider.type==='azure'&&!url.pathname.replace(/\/$/,'').endsWith('/openai/v1'))throw new Error('Azure endpoint must end in /openai/v1');
}
