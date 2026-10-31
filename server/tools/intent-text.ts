/** Normalize routing language only; never rewrite messages, paths or tool arguments. */
export function normalizeTaskText(text:string){
 const spellings:Record<string,string>={termnal:'terminal',terminl:'terminal',ddirecory:'directory',direcory:'directory',directoy:'directory',direcotry:'directory',artifacct:'artifact',artifcat:'artifact',artifcats:'artifacts',artefact:'artifact',artefacts:'artifacts'};
 return text.replace(/(https?:\/\/\S+|\x60[^\x60]*\x60)|\b[a-zA-Z]+\b/g,(word,quoted)=>{
  if(quoted)return word;const lower=word.toLowerCase();
  if(spellings[lower])return spellings[lower];
  if(/^t+e+r+m+i+n+a+l+s?$/.test(lower))return 'terminal';
  if(/^a+r+t+i+f+a+c+t+s?$/.test(lower))return lower.endsWith('s')?'artifacts':'artifact';
  if(/^c+r+e+a+t+e+$/.test(lower))return 'create';
  return word;
 });
}
export function capabilityQuestion(text:string){
 const value=normalizeTaskText(text);
 if(/(?:\b(?:to|and|then)\b|[,;:])\s+(?:please\s+)?(?:create|build|write|run|execute|open|edit|delete|deploy|install|list|find|search|inspect|navigate|read|copy|move|scroll|click|type|test|npm|pnpm|yarn|bun)\b/i.test(value))return false;
 return /\bwhat\s+can\s+(?:you|u)\s+(?:do|access)\b/i.test(value)||
 /\b(?:use|access)\s+(?:the\s+)?(?:terminal|shell|tools?|files?)\b.{0,8}\?.{0,35}\b(?:you|u)\s+can\b/i.test(value)||
 /\b(?:what|which|how many)\b.{0,100}\b(?:tools?|capabilities|access)\b/i.test(value)||
 /\b(?:can|could|do|are)\s+(?:you|u)\b.{0,70}\b(?:use|access|have|able)\b.{0,55}\b(?:terminal|shell|ssh|tools?|files?|github|artifacts?|computer|browser)\b/i.test(value)||
 /\b(?:is|are)\b.{0,30}\b(?:terminal|shell|ssh|tools?|browser|computer)\b.{0,45}\b(?:available|connected|enabled|disabled|off|on|gone)\b/i.test(value);
}
