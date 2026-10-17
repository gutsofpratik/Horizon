"""Bounded Qwen XML tool protocol. Parse complete calls; never execute text."""
import json,re

NATIVE_POLICY='\nTool protocol: answer normally in plain text. To request a currently eligible tool, emit <tool_call>\n<function=tool_name>\n<parameter=argument_name>\nvalue\n</parameter>\n</function>\n</tool_call>. Use JSON values for object/array/number/boolean arguments and raw text for string arguments. Available schemas and any required-call constraint are in the latest application workspace context. For toolkit, action and name are raw strings; arguments is a complete JSON object, e.g. {"url":"https://example.com"}. Historical catalogs do not grant permissions.'

def detect_protocol(template):
    return 'qwen_xml' if all(marker in template for marker in ('<tool_call>','<function=','<parameter=')) else 'envelope'

def render_native_call(name,arguments):
    if isinstance(arguments,str):arguments=json.loads(arguments)
    if not isinstance(arguments,dict):raise ValueError('Historical tool arguments must be an object')
    params=''.join('\n<parameter='+key+'>\n'+(value if isinstance(value,str) else json.dumps(value,ensure_ascii=True))+'\n</parameter>' for key,value in arguments.items())
    return '<tool_call>\n<function='+name+'>'+params+'\n</function>\n</tool_call>'

def _json_value(value):
    value=value.strip()
    fence=re.fullmatch(r'```(?:json)?\s*([\s\S]*?)\s*```',value,re.I)
    if fence:value=fence[1]
    def pairs(items):
        result={}
        for key,item in items:
            if key in result:raise ValueError('Duplicate JSON key')
            result[key]=item
        return result
    def constant(_):raise ValueError('Non-finite JSON value')
    # XML parameter bodies may contain literal newlines inside JSON strings.
    # This preserves their exact value without guessing quotes or executing code.
    return json.loads(value,strict=False,object_pairs_hook=pairs,parse_constant=constant)

def decode_native_calls(text,tools):
    # Some native templates end the turn immediately after </function>. That
    # function has explicitly ended: restore only its outer transport wrapper.
    # Never invent a parameter delimiter, JSON value, or function completion.
    if text.count('<tool_call>')==text.count('</tool_call>')+1 and text.rstrip().endswith('</function>'):
        text=text.rstrip()+'\n</tool_call>'
    try:return parse_native_calls(text,tools)
    except ValueError as error:
        names=[tool['function']['name'] for tool in tools]
        match=re.search(r'<function=([\w.-]+)>',text)
        name=match[1] if match and match[1] in names else names[0] if len(names)==1 else None
        if not name:raise
        # The provider carries argument_error into registry validation. This
        # placeholder must fail before any handler runs, allowing correction.
        guidance='Emit a fresh complete <tool_call><function=NAME> with every <parameter=KEY> closed by </parameter>, then </function></tool_call>. Do not continue a truncated value.' if 'Incomplete' in str(error) else 'Use double-quoted JSON keys/strings, no comments or trailing commas; arguments must be one complete JSON object.'
        return [{'name':name,'arguments':{},'argument_error':str(error).removesuffix('; no tools executed')+'. No tool was executed. '+guidance}]

def parse_native_calls(text,tools):
    if len(text)>1048576:raise ValueError('Native tool response exceeds 1 MiB')
    offered={tool['function']['name']:tool['function'].get('parameters',{}) for tool in tools};calls=[];offset=0
    while True:
        start=text.find('<tool_call>',offset)
        if start<0:
            if '<tool_call' in text[offset:]:raise ValueError('Incomplete native tool call; no tools executed')
            break
        if text[:start].count('```')%2:raise ValueError('Tool calls inside a code example are not executable')
        end=text.find('</tool_call>',start)
        if end<0:raise ValueError('Incomplete native tool call; no tools executed')
        block=text[start+11:end].strip()
        # Qwen-family templates also occur with a JSON function body inside the
        # same wrapper. Accept that complete, validated transport without trying
        # to repair quotes, infer values, or execute JSON printed as ordinary text.
        if block.startswith('{'):
            value=_json_value(block)
            if not isinstance(value,dict) or set(value)-{'name','arguments'} or value.get('name') not in offered or not isinstance(value.get('arguments'),dict):raise ValueError('Invalid native JSON tool body; no tools executed')
            calls.append({'name':value['name'],'arguments':value['arguments']})
            if len(calls)>16:raise ValueError('Too many native tool calls')
            offset=end+12;continue
        match=re.fullmatch(r'<function=([\w.-]+)>([\s\S]*)</function>',block)
        if not match or match[1] not in offered:raise ValueError('Invalid or unavailable native tool call; no tools executed')
        name,body=match.groups();args={};position=0;schema=offered[name]
        for param in re.finditer(r'<parameter=([\w.-]+)>([\s\S]*?)</parameter>',body):
            if body[position:param.start()].strip() or param[1] in args:raise ValueError('Invalid/duplicate native tool parameter')
            key,value=param.groups();value=value.strip('\r\n');kind=schema.get('properties',{}).get(key,{}).get('type')
            if kind in ('integer','number','boolean','object','array','null'):
                try:value=_json_value(value)
                except ValueError as error:raise ValueError('Invalid JSON value for tool parameter '+key+': '+str(error)) from error
            elif kind is None:
                try:value=_json_value(value)
                except ValueError:pass
            if kind in ('object','array') and isinstance(value,str):
                try:value=_json_value(value)
                except ValueError as error:raise ValueError('Invalid JSON value for tool parameter '+key) from error
            args[key]=value;position=param.end()
        if body[position:].strip():raise ValueError('Malformed native tool parameters; no tools executed')
        calls.append({'name':name,'arguments':args})
        if len(calls)>16:raise ValueError('Too many native tool calls')
        offset=end+12
    return calls

class NativeToolStream:
    def __init__(self):self.buffer='';self.inside=False
    def feed(self,text):
        self.buffer+=text;visible=''
        while self.buffer:
            if self.inside:
                end=self.buffer.find('</tool_call>')
                if end<0:
                    self.buffer=self.buffer[-11:];break
                self.buffer=self.buffer[end+12:];self.inside=False;continue
            start=self.buffer.find('<tool_call>')
            if start>=0:visible+=self.buffer[:start];self.buffer=self.buffer[start+11:];self.inside=True;continue
            hold=max((n for n in range(1,min(len(self.buffer),10)+1) if self.buffer.endswith('<tool_call>'[:n])),default=0)
            visible+=self.buffer[:-hold] if hold else self.buffer;self.buffer=self.buffer[-hold:] if hold else '';break
        return visible
    def flush(self):
        value='' if self.inside or self.buffer.startswith('<tool') else self.buffer;self.buffer='';return value
