def tool_envelope(tools,thinking=False,required=False):
    # Function schemas are standalone documents. Rebase local references before
    # nesting them; otherwise Zod's recursive JSON definitions point at a
    # nonexistent envelope-level $defs and the native grammar cannot compile.
    definitions={};variants=[]
    def embed(value,prefix):
        if isinstance(value,list):return [embed(item,prefix) for item in value]
        if not isinstance(value,dict):return value
        result={}
        for key,item in value.items():
            if key in ('$schema','$id'):continue
            if key=='$ref':
                if not isinstance(item,str) or not item.startswith('#'):raise ValueError('Tool sampling requires local schema references')
                result[key]=prefix+item[1:]
            else:result[key]=embed(item,prefix)
        return result
    for index,tool in enumerate(tools):
        key='tool-'+str(index);definitions[key]=embed(tool['function'].get('parameters',{'type':'object'}),'#/$defs/'+key)
        variants.append({'type':'object','properties':{'name':{'const':tool['function']['name']},'arguments':{'$ref':'#/$defs/'+key}},'required':['name','arguments'],'additionalProperties':False})
    if required and not variants:raise ValueError('A required tool call needs at least one eligible tool')
    properties={}
    if thinking:properties['reasoning']={'type':'string','description':'Brief explanation of your approach for the user.'}
    properties['content']={'const':''} if required else {'type':'string'}
    if required:properties['tool_call']={'anyOf':variants}
    else:properties['tool_calls']={'type':'array','items':{'anyOf':variants}} if variants else {'const':[]}
    return {'type':'object','properties':properties,'required':list(properties),'additionalProperties':False,**({'$defs':definitions} if definitions else {})}
