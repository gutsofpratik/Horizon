// Only complete social utterances qualify. Task follow-ups, mentions and attachments
// keep the normal tool workflow, even when they start with a greeting.
export function isConversationalTurn(message:any){
 if(!message||message.attachments?.length||typeof message.content!=='string')return false;
 if(message.content.length>180)return false;
 // Normalize only known social words, never fuzzy-match or rewrite task text.
 const text=message.content.toLowerCase().replace(/[’]/g,"'").replace(/[!,?.]/g,' ').trim().split(/\s+/).map((word:string)=>{
  if(/^h+i+$/.test(word))return 'hi';if(/^he+l+o+$/.test(word))return 'hello';if(/^he+y+$/.test(word))return 'hey';
  if(word==='r'||/^a+r+e+$/.test(word))return 'are';if(word==='u'||/^yo+u+$/.test(word))return 'you';return word;
 }).filter((word:string)=>!['bro','dude','mate','lol','lmao','haha'].includes(word)&&!/^lo+l$/.test(word)).join(' ');
 if(/^(?:(?:hi|hello|hey) )?(?:just )?(?:say hello|say hi|greet me)(?: briefly)?(?:;? (?:no (?:workspace task or )?tools (?:are )?needed|without (?:using )?tools))?$/.test(text))return true;
 return /^(?:(?:hi|hello|hey|hiya|good morning|good afternoon|good evening)(?: there)?(?: (?:how (?:are )?you(?: doing)?|how's it going))?|how (?:are )?you(?: doing)?|how's it going|thank you(?: so much)?|thanks(?: a lot)?|you're welcome|good night|bye|goodbye)$/.test(text);
}

