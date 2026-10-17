import json

def template_history(messages,protocol="envelope"):
    """Render successful requests in the selected protocol, never teach invalid calls."""
    invalid=set()
    for message in messages:
        if message.get('role')!='tool':continue
        try:
            value=json.loads(message.get('content',''))
            if value.get('status')=='failed' and value.get('error',{}).get('code') in ('INVALID_TOOL_JSON','INVALID_ARGUMENTS','REPEATED_INVALID_ARGUMENTS'):
                invalid.add(message.get('tool_call_id'))
        except (ValueError,TypeError,AttributeError):pass
    result=[]
    for original in messages:
        message=dict(original)
        if message.get('tool_calls'):
            original_calls=message.pop('tool_calls')
            calls=[call for call in original_calls if call.get('id') not in invalid and not call.get('function',{}).get('argument_error')]
            if len(calls)<len(original_calls):message['content']=(message.get('content') or '')+'\nA previous tool request failed validation and was not executed. Correct it using the returned tool feedback; do not copy the invalid request.'
            if protocol=='qwen_xml':
                from native_tools import render_native_call
                message['content']=(message.get('content') or '')+''.join('\n'+render_native_call(call.get('function',call)['name'],call.get('function',call)['arguments']) for call in calls)
            elif calls:message['content']=(message.get('content') or '')+'\nTool calls: '+json.dumps(calls)
        if message['role']=='tool':message['role']='user';message['content']='Tool result: '+str(message.get('content',''))
        result.append(message)
    return result

def normalize_system_messages(messages):
    """Strict chat templates accept one leading system message only."""
    system=[message for message in messages if message.get('role')=='system']
    if not system:return [dict(message) for message in messages]
    if any(not isinstance(message.get('content',''),(str,type(None))) for message in system):raise ValueError('This text runtime requires text system instructions')
    return [{**system[0],'content':'\n\n'.join(message.get('content') or '' for message in system)}]+[dict(message) for message in messages if message.get('role')!='system']
