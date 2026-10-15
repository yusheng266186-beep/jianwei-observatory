'use strict';
const {StringDecoder}=require('node:string_decoder');
// Keep answer events for the final parser, while progress receives the original
// chunks (including thought text). Long reasoning must not fill the HTTP buffer.
function createStreamReader(protocol){
 const decoder=new StringDecoder('utf8'),events=[];let buffer='',mode='',kept=0,chunks=0;
 function keep(text){kept+=Buffer.byteLength(text);if(kept>2*1024*1024)throw new Error('MODEL_OUTPUT_LIMIT');events.push(text);}
 function packet(block){const text=block.split(/\r?\n/).filter(l=>l.startsWith('data:')).map(l=>l.slice(5).trimStart()).join('\n');if(!text)return;if(text==='[DONE]'){keep('data: [DONE]\n\n');return;}let p;try{p=JSON.parse(text);}catch{throw new Error('MODEL_BAD_RESPONSE');}let clean;
  if(p.error||p.type==='error'||p.type==='response.failed'||p.type==='response.incomplete')clean=p;
  else if(['chat-completions','kimi'].includes(protocol)){const choices=(p.choices||[]).map(c=>({index:c.index,delta:typeof c.delta?.content==='string'?{content:c.delta.content}:{},...(c.finish_reason?{finish_reason:c.finish_reason}:{})})).filter(c=>c.delta.content||c.finish_reason);if(choices.length||p.usage)clean={choices,...(p.usage?{usage:p.usage}:{})};}
  else if(protocol==='anthropic'){if(p.type==='content_block_start'&&p.content_block?.type==='text'||p.type==='content_block_delta'&&p.delta?.type==='text_delta'||['message_start','message_delta','message_stop'].includes(p.type))clean=p;}
  else if(protocol==='responses'){if(p.type==='response.output_text.delta')clean={type:p.type,delta:p.delta};if(p.type==='response.completed')clean={type:p.type,response:{status:p.response?.status,usage:p.response?.usage,output:(p.response?.output||[]).filter(o=>o.type==='message')}};}
  else if(protocol==='gemini'){const candidates=(p.candidates||[]).map(c=>({content:{parts:(c.content?.parts||[]).filter(part=>!part.thought&&typeof part.text==='string')},...(c.finishReason?{finishReason:c.finishReason}:{})})).filter(c=>c.content.parts.length||c.finishReason);if(candidates.length||p.usageMetadata)clean={candidates,...(p.usageMetadata?{usageMetadata:p.usageMetadata}:{})};}
  if(clean)keep('data: '+JSON.stringify(clean)+'\n\n');
 }
 return {get received(){return chunks>0;},write(chunk){chunks++;buffer+=decoder.write(chunk);if(!mode&&buffer.trim())mode=buffer.trimStart().startsWith('{')?'json':'sse';if(mode==='json'){if(Buffer.byteLength(buffer)>2*1024*1024)throw new Error('MODEL_OUTPUT_LIMIT');return;}let match;while((match=/\r?\n\r?\n/.exec(buffer))){packet(buffer.slice(0,match.index));buffer=buffer.slice(match.index+match[0].length);}if(Buffer.byteLength(buffer)>2*1024*1024)throw new Error('MODEL_OUTPUT_LIMIT');},finish(){buffer+=decoder.end();if(mode==='json')return buffer;if(buffer.trim())packet(buffer);return events.join('');}};
}
module.exports={createStreamReader};
