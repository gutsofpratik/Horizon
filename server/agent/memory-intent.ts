// Routing hint only: the model extracts supported facts, not arbitrary messages.
export function personalMemoryIntent(text:string){
 if(/\b(don't|do not|never)\s+(?:save|remember|store)|\bforget\b|\b(?:password|api[ _-]?key|access[ _-]?token|private[ _-]?key|credit card|cvv|one.time (?:code|password))\b/i.test(text))return false;
 if(/\b(?:imagine|suppose|hypothetical|fictional|roleplay|example sentence|translate|rewrite)\b/i.test(text))return false;
 return /\b(?:remember|save (?:this|my|that)|keep (?:this|my|that).{0,30}(?:mind|memory))\b/i.test(text)||/\b(?:my (?:name|birthday|age|job|occupation|profession|goal|preference|hobby|hobbies|project|company|business|partner|wife|husband|child|daughter|son|dog|cat|diet|allergy|allergies|favorite|favourite|home|location)|call me|i (?:prefer|live|work|study|own|have|like|love|dislike)|i(?: am|'m) (?:a[n]?\b|\d{1,3}\b|from\b|based\b|allergic\b|vegetarian\b|vegan\b))\b/i.test(text);
}

export function personalMemoryFacts(text:string){
 if(!personalMemoryIntent(text))return [];
 const plain=text.replace(/```[\s\S]*?```/g,'');
 return plain.split(/(?:[.!?](?=\s|$)|\r?\n)/).map(sentence=>sentence.trim().replace(/^(?:please\s+)?(?:remember(?:\s+that)?|save\s+(?:this|that))\s*[:,]?\s*/i,''))
  .filter(sentence=>(sentence.length>=8||!!personalMemoryKey(sentence))&&sentence.length<=2000&&/^(?:my\s+(?:name|birthday|age|job|occupation|profession|goal|preference|hobby|hobbies|project|company|business|partner|wife|husband|child|daughter|son|dog|cat|diet|allergy|allergies|favorite|favourite|home|location)\b|call me\b|i\s+(?:prefer|live|work|study|own|have|like|love|dislike)\b|i(?: am|'m)\s+(?:a[n]?\b|\d{1,3}\b|from\b|based\b|allergic\b|vegetarian\b|vegan\b))/i.test(sentence)&&!/[?]|\b(?:if|would|could|error|bug|issue|problem|example|pretend|not remember|don't remember)\b/i.test(sentence))
  .slice(0,8);
}

export function personalMemoryKey(text:string){
 if(/^(?:my name is|call me)\b/i.test(text))return 'profile.name';
 if((/^i live in\b|^my (?:home|location) is\b/i.test(text))&&!/^i live in (?:fear|hope|denial|peace|harmony|constant|a world|the moment)\b/i.test(text))return 'profile.location';
 if(/^my birthday\b/i.test(text))return 'profile.birthday';
 if(/^(?:i(?: am|'m)|my age is) \d{1,3}(?:(?:\s+(?:years?|yrs?))?\s+old\b|\s*(?:years?|yrs?)?\s*$)/i.test(text))return 'profile.age';
 if(/^i(?: am|'m) (?:a )?(?:vegetarian|vegan)\b|^my diet is\b/i.test(text))return 'profile.diet';
 return undefined;
}
export function automaticMemoryFacts(text:string){
 const explicit=/\b(?:remember|save (?:this|my|that)|keep (?:this|my|that).{0,30}(?:mind|memory))\b/i.test(text);
 return personalMemoryFacts(text).filter(fact=>explicit||personalMemoryKey(fact));
}
