'use strict';
function completionUsage(usage={}){return {input:usage.input_tokens||usage.prompt_tokens||usage.promptTokenCount||0,output:usage.output_tokens||usage.completion_tokens||usage.candidatesTokenCount||0,thinking:usage.output_tokens_details?.reasoning_tokens||usage.completion_tokens_details?.reasoning_tokens||usage.thoughtsTokenCount||0};}
function incompleteCompletion({protocol,finish='',done=false,output='',usage={}}){
 const reason=/^[A-Za-z0-9_-]{1,80}$/.test(finish)?finish:'missing',limit=['MAX_TOKENS','length','max_tokens'].includes(reason);
 return Object.assign(new Error(limit?'MODEL_OUTPUT_LIMIT':'MODEL_INCOMPLETE'),{output,diagnostic:{kind:'completion',protocol,finishReason:reason,completeSignal:!!done,outputChars:output.length,usage:completionUsage(usage)}});
}
module.exports={completionUsage,incompleteCompletion};
