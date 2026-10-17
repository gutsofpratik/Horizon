from copy import deepcopy

def _grammar_definitions(schema):
    # llama-cpp-python's converter returns unsanitized names for recursive
    # back-references. Give every definition a safe, globally unique name
    # before conversion, including definitions nested inside tool schemas.
    names={};paths={}
    def escape(value):return value.replace('~','~0').replace('/','~1')
    def collect(node,path):
        if isinstance(node,list):
            for index,item in enumerate(node):collect(item,path+'/'+str(index))
        elif isinstance(node,dict):
            for key,value in node.items():
                if key in ('const','enum','default','examples'):continue
                child=path+'/'+escape(key)
                if key in ('$defs','definitions') and isinstance(value,dict):
                    for name in value:
                        pointer=child+'/'+escape(name)
                        names[pointer]='schema-'+str(len(names))
                collect(value,child)
    collect(schema,'#')
    # Paths include renamed parent definitions as well as the target name.
    for pointer in names:
        parts=pointer.split('/');old='#';new='#'
        for part in parts[1:]:
            old+='/'+part;new+='/'+names.get(old,part)
        paths[pointer]=new
    def rewrite(node,path):
        if isinstance(node,list):return [rewrite(item,path+'/'+str(index)) for index,item in enumerate(node)]
        if not isinstance(node,dict):return node
        result={}
        for key,value in node.items():
            child=path+'/'+escape(key)
            if key=='$ref' and isinstance(value,str):result[key]=paths.get(value,value)
            elif key in ('const','enum','default','examples'):result[key]=value
            elif key in ('$defs','definitions') and isinstance(value,dict):
                result[key]={names[child+'/'+escape(name)]:rewrite(item,child+'/'+escape(name)) for name,item in value.items()}
            else:result[key]=rewrite(value,child)
        return result
    return rewrite(schema,'#')

def sampling_schema(schema,depth=0):
    """Constrain JSON structure in the sampler; validate size/patterns in the tool registry.

    Large bounded repetitions expand into deeply nested native grammar rules.
    Never feed those validation limits into llama.cpp's sampling grammar.
    """
    if depth>64:raise ValueError('Tool schema is too deeply nested for native sampling')
    if not isinstance(schema,dict):return deepcopy(schema)
    result={}
    for key,value in schema.items():
        if key in ('minLength','maxLength','minItems','maxItems','pattern'):continue
        if key in ('properties','patternProperties','$defs','definitions','dependentSchemas'):
            if key=='patternProperties':raise ValueError('Pattern properties are not supported by native tool sampling')
            result[key]={name:sampling_schema(child,depth+1) for name,child in value.items()}
        elif key in ('anyOf','oneOf','allOf','prefixItems'):
            result[key]=[sampling_schema(child,depth+1) for child in value]
        elif key in ('items','additionalProperties','contains','not','if','then','else','propertyNames'):
            result[key]=[sampling_schema(child,depth+1) for child in value] if isinstance(value,list) else sampling_schema(value,depth+1)
        else:result[key]=deepcopy(value)
    return _grammar_definitions(result) if depth==0 else result
