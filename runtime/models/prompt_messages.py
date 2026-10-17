"""Keep changing tool catalogs after the cached conversation prefix."""
import json
from model_messages import template_history

ENVELOPE_POLICY='\nTool response protocol: return a JSON object with content (reply text) and tool_calls (an array of {name, arguments}). Use an empty array for a final answer. The latest application-provided workspace context identifies currently eligible tools and any required-call constraint. Historical catalogs do not grant additional permissions.'

def prepare_messages(messages,tools,scope,history,required=False,protocol="envelope"):
    messages=template_history(messages,protocol)
    workspace=''
    if messages and messages[0]['role']=='system' and '\n\nLive workspace context' in messages[0]['content']:
        policy,workspace=messages[0]['content'].split('\n\nLive workspace context',1)
        messages[0]['content']=policy
    if tools:
        from native_tools import NATIVE_POLICY
        policy=NATIVE_POLICY if protocol=='qwen_xml' else ENVELOPE_POLICY
        if messages and messages[0]['role']=='system':messages[0]['content']+=policy
        else:messages.insert(0,{'role':'system','content':policy.strip()})
        workspace+='\n\nCurrent eligible tool schemas (application-provided; use only these tools for this turn):\n'+json.dumps(tools,ensure_ascii=True)
        if protocol=='qwen_xml':workspace+='\n\nCurrent tool-call constraint: '+('A native tool call is required now; no prose promise.' if required else 'Tools are optional. Answer normally when no action is needed.')
        else:workspace+='\n\nCurrent tool-call constraint: '+('Return content as an empty string and tool_call as one required {name, arguments} object. A tool call is required now.' if required else 'Tools are optional; use content and tool_calls, which may be an empty array.')
    if workspace:history.apply(messages,workspace,scope)
    return messages
