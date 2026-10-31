import Ajv from 'ajv';
import {z} from 'zod';
import {ToolError,type ToolRegistry} from './registry.ts';

function bounded(value:unknown,max:number){if(JSON.stringify(value).length>max)throw new ToolError('DATA_TOO_LARGE','Input exceeds the tool size limit');}
function checkSchema(value:any,depth=0,budget={nodes:0}){
 if(depth>16||++budget.nodes>300)throw new ToolError('SCHEMA_TOO_COMPLEX','Use a schema under 300 nodes and 16 levels');
 if(!value||typeof value!=='object')return;
 for(const key of ['$ref','$dynamicRef','pattern','patternProperties','format','uniqueItems'])if(Object.hasOwn(value,key))throw new ToolError('UNSUPPORTED_SCHEMA_KEYWORD',key+' is not supported by the bounded validator');
 for(const key of ['properties','$defs','definitions','dependentSchemas','dependencies'])for(const item of Object.values(value[key]??{}))checkSchema(item,depth+1,budget);
 for(const key of ['items','additionalItems','additionalProperties','contains','not','if','then','else','propertyNames','unevaluatedItems','unevaluatedProperties','contentSchema']){const item=value[key];if(Array.isArray(item))for(const child of item)checkSchema(child,depth+1,budget);else if(item&&typeof item==='object')checkSchema(item,depth+1,budget);}
 for(const key of ['allOf','anyOf','oneOf','prefixItems'])if(Array.isArray(value[key]))for(const item of value[key])checkSchema(item,depth+1,budget);
}
export function registerApiTools(registry:ToolRegistry){
 registry.register({name:'api_parse_response',capability:'conversation',description:'Parse supplied JSON response text into a real structured value. Returns precise syntax errors; does not call a network endpoint.',input:z.object({text:z.string().max(200000)}).strict(),handler:args=>{try{return {value:JSON.parse(args.text)};}catch(error){throw new ToolError('INVALID_JSON',(error as Error).message);}}});
 registry.register({name:'api_validate_schema',capability:'conversation',description:'Validate supplied JSON against a bounded JSON Schema (draft 7). Supports types, properties, required, enum, bounds, arrays and alternatives. Remote/local references, regex/format, and uniqueItems are rejected. No type coercion or data mutation.',input:z.object({value:z.json(),schema:z.record(z.string(),z.json())}).strict(),handler:args=>{bounded(args.value,200000);bounded(args.schema,20000);checkSchema(args.schema);try{const ajv=new Ajv({strict:false,allErrors:false,validateFormats:false,addUsedSchema:false,ownProperties:true}),validate=ajv.compile(args.schema);const valid=validate(args.value);return {valid,errors:validate.errors?.map(error=>({path:error.instancePath,keyword:error.keyword,message:error.message,details:error.params}))??[]};}catch(error){if(error instanceof ToolError)throw error;throw new ToolError('INVALID_SCHEMA',(error as Error).message);}}});
}
