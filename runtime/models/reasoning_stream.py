class ReasoningStream:
    """Separate native thought delimiters from answer/JSON, including split tokens."""
    def __init__(self,active=False):self.active=active;self.buffer=''
    def feed(self,text,final=False):
        self.buffer+=text;reasoning='';answer=''
        if self.active:
            if self.buffer.startswith('<think>'):self.buffer=self.buffer[7:]
            marker='</think>';index=self.buffer.find(marker)
            if index>=0:reasoning=self.buffer[:index];self.buffer=self.buffer[index+len(marker):];self.active=False
            else:
                hold=0
                if not final:
                    for size in range(1,min(len(marker),len(self.buffer))+1):
                        if self.buffer.endswith(marker[:size]):hold=size
                split=len(self.buffer)-hold;reasoning=self.buffer[:split];self.buffer=self.buffer[split:]
        if not self.active:answer=self.buffer;self.buffer=''
        return {'reasoning':reasoning,'content':answer}
