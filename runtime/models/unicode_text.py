"""Keep malformed JSON Unicode escapes away from UTF-8 tokenizers."""
def clean_unicode(value):
    if isinstance(value,str):
        if not any(0xd800<=ord(char)<=0xdfff for char in value):return value
        return value.encode('utf-16-le','surrogatepass').decode('utf-16-le','replace')
    if isinstance(value,list):return [clean_unicode(item) for item in value]
    if isinstance(value,dict):return {key:clean_unicode(item) for key,item in value.items()}
    return value
