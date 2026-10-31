/** A named saved file is an outcome even when research is the main task. */
export function explicitFileTask(text:string){
 const pattern=/\b(?:save|write|export|create|generate)\b\s+(?:(?:a|an|the|short|brief|new|revised|updated|small|local|file|report|it|as|to|into|called|named)\s+){0,8}["'`]?[-\w]+\.(?:md|txt|json|csv|html|svg|xlsx|docx|pptx|pdf)\b/gi;
 for(const match of text.matchAll(pattern))if(!/\b(?:do not|don't|never|no need to)\s*$/i.test(text.slice(Math.max(0,match.index!-24),match.index)))return true;
 return false;
}
