class JsonTextStream:
    """Incrementally decode only root-level visible text, never tool arguments."""
    def __init__(self):
        self.depth=0;self.string=False;self.role=None;self.key='';self.pending_key=None;self.expect_key=False;self.escape=False;self.unicode=None;self.high=None
    def feed(self,text):
        out={}
        def append(char):
            if self.role=='key':self.key+=char;return
            if self.role not in ('reasoning','content'):return
            code=ord(char)
            if 0xd800<=code<=0xdbff:
                if self.high is not None:out[self.role]=out.get(self.role,'')+'\ufffd'
                self.high=code;return
            if self.high is not None:
                if 0xdc00<=code<=0xdfff:char=chr(0x10000+((self.high-0xd800)<<10)+(code-0xdc00))
                else:char='\ufffd'+char
                self.high=None
            elif 0xdc00<=code<=0xdfff:char='\ufffd'
            out[self.role]=out.get(self.role,'')+char
        for char in text:
            if self.string:
                if self.unicode is not None:
                    self.unicode+=char
                    if len(self.unicode)==4:append(chr(int(self.unicode,16)));self.unicode=None
                elif self.escape:
                    self.escape=False
                    if char=='u':self.unicode=''
                    else:append({'n':'\n','r':'\r','t':'\t','b':'\b','f':'\f'}.get(char,char))
                elif char=='\\':self.escape=True
                elif char=='"':
                    if self.high is not None and self.role in ('reasoning','content'):out[self.role]=out.get(self.role,'')+'\ufffd'
                    self.string=False
                    if self.role=='key':self.pending_key=self.key;self.expect_key=False
                    self.role=None;self.high=None
                else:append(char)
            elif char=='"':
                self.string=True;self.key=''
                self.role='key' if self.depth==1 and self.expect_key else self.pending_key if self.depth==1 else None
            elif char in '{[':
                self.depth+=1
                if self.depth==1:self.expect_key=True
            elif char in '}]':self.depth-=1
            elif char==',' and self.depth==1:self.expect_key=True;self.pending_key=None
        return out
