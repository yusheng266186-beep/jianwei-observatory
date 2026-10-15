'use strict';
const {request}=require('./tencent.cjs'),{routes}=require('./model-control.cjs'),{adaptModelBody}=require('./model-adapter.cjs'),{USER_AGENT,readCompletion}=require('./kimi.cjs');
function upstreamError(response,key){
 let detail;try{detail=JSON.parse(response.body).error;}catch{}
 const message=String(detail?.message||''),code=detail?.code==='subscription_expired'?'MODEL_SUBSCRIPTION_EXPIRED':/insufficient (?:credits|balance)|余额不足/i.test(message)?'MODEL_BALANCE_REQUIRED':response.status===401||response.status===403?'MODEL_AUTH_FAILED':response.status===429?'MODEL_RATE_LIMIT':[408,504,524].includes(response.status)?'MODEL_UPSTREAM_TIMEOUT':'MODEL_REQUEST_FAILED';
 return Object.assign(new Error(code),{diagnostic:{kind:'upstream',status:response.status,message:String(response.body).replaceAll(key,'[REDACTED]').slice(0,4000)}});
}
function parseStream(source,protocol){
 let output='',done=false,finish='',usage={};
 for(const event of String(source).split(/\r?\n\r?\n/)){
  const text=event.split(/\r?\n/).filter(x=>x.startsWith('data:')).map(x=>x.slice(5).trimStart()).join('\n');if(!text||text==='[DONE]')continue;
  let data;try{data=JSON.parse(text);}catch{throw new Error('MODEL_BAD_RESPONSE');}
  if(data.type==='error'||data.error||['response.failed','response.incomplete'].includes(data.type))throw new Error('MODEL_REQUEST_FAILED');
  if(protocol==='gemini'){const candidate=data.candidates?.[0];for(const part of candidate?.content?.parts||[])if(!part.thought)output+=part.text||'';if(candidate?.finishReason){finish=candidate.finishReason==='STOP'?'stop':candidate.finishReason;done=true;}usage=data.usageMetadata||usage;}else if(protocol==='anthropic'){
   if(data.type==='content_block_start'&&data.content_block?.type==='text')output+=data.content_block.text||'';
   if(data.type==='content_block_delta'&&data.delta?.type==='text_delta')output+=data.delta.text||'';
   if(data.type==='message_start')usage={...usage,...data.message?.usage};
   if(data.type==='message_delta'){finish=data.delta?.stop_reason||finish;usage={...usage,...data.usage};}
   if(data.type==='message_stop')done=true;
  }else{
   if(data.type==='response.output_text.delta')output+=data.delta||'';
   if(data.type==='response.completed'){
    done=data.response?.status==='completed';finish=done?'stop':'incomplete';usage=data.response?.usage||{};
    const final=(data.response?.output||[]).filter(x=>x.type==='message').flatMap(x=>x.content||[]).filter(x=>x.type==='output_text').map(x=>x.text||'').join('');if(final)output=final;
   }
  }
 }
 if(!done||!['stop','end_turn'].includes(finish)||!output.trim())throw new Error('MODEL_INCOMPLETE');
 return {output,usage:{input:usage.input_tokens||usage.promptTokenCount||0,output:usage.output_tokens||usage.candidatesTokenCount||0,thinking:usage.output_tokens_details?.reasoning_tokens||usage.thoughtsTokenCount||0}};
}
function parseResponse(response,protocol){
 if(String(response.body).trimStart().startsWith('{')){
  let data;try{data=JSON.parse(response.body);}catch{throw new Error('MODEL_BAD_RESPONSE');}
  const content=protocol==='anthropic'?data.content:protocol==='responses'?(data.output||[]).filter(x=>x.type==='message').flatMap(x=>x.content||[]):null;
  const output=content?content.filter(x=>['text','output_text'].includes(x.type)).map(x=>x.text||'').join(''):data.choices?.[0]?.message?.content;
  if(!output||(protocol==='anthropic'?data.stop_reason!=='end_turn':protocol==='responses'?data.status!=='completed':data.choices?.[0]?.finish_reason!=='stop'))throw new Error('MODEL_INCOMPLETE');
  return {output,usage:{input:data.usage?.input_tokens||data.usage?.prompt_tokens||0,output:data.usage?.output_tokens||data.usage?.completion_tokens||0,thinking:data.usage?.completion_tokens_details?.reasoning_tokens||0}};
 }
 return protocol==='chat-completions'?readCompletion(response.body):parseStream(response.body,protocol);
}
async function completeRemote(prompt,generation,{key,transport=request,probe=false,onProgress,signal}={}){
 const route=routes[generation.provider];if(!route||route.url!==generation.base||route.protocol!==generation.protocol||!route.catalog.includes(generation.model)||!key)throw new Error('MODEL_NOT_CONFIGURED');
 const body=adaptModelBody({messages:[{role:'system',content:prompt.system},{role:'user',content:JSON.stringify(prompt.input)}],max_tokens:probe?256:32768,effort:generation.effort},{name:generation.provider,model:generation.model},generation.effort,{profile:generation.adapterProfile,probe});
 const suffix=route.protocol==='anthropic'?'/v1/messages':route.protocol==='responses'?'/responses':'/chat/completions';
 const reader=require('./stream-reader.cjs').createStreamReader(route.protocol),progress=onProgress?require('./progress.cjs').streamProgress(route.protocol,onProgress):null;
 const response=await transport(route.url.replace(/\/$/,'')+suffix,{method:'POST',body:JSON.stringify(body),headers:{'Content-Type':'application/json','User-Agent':USER_AGENT,...(route.protocol==='anthropic'?{'x-api-key':key,'anthropic-version':'2023-06-01'}:{Authorization:'Bearer '+key})},timeout:probe?45000:840000,deadlineMs:probe?45000:840000,maxBytes:64*1024*1024,collectBody:false,signal,onChunk:chunk=>{reader.write(chunk);progress?.(chunk);}});
 if(response.status!==200)throw upstreamError(response,key);
 return {...parseResponse(reader.received?{...response,body:reader.finish()}:response,route.protocol),model:generation.model,provider:generation.provider,reasoningEffort:generation.reasoningEffort};
}
async function probeModel(generation,{env=process.env,transport=request}={}){
 const started=Date.now(),prompt={system:'只输出JSON对象，字段value为整数。计算37乘19，不输出解释。禁止Markdown和代码围栏，回复首字符必须为{，末字符必须为}。',input:{task:'37×19'},schema:{type:'object',properties:{value:{type:'integer'}},required:['value'],additionalProperties:false}};
 let result;
 if(generation.protocol==='kimi')result=await require('./kimi.cjs').completeKimi(prompt,{key:env[generation.credentialRef],kind:'code',effort:generation.reasoningEffort,transport,probe:true});
 else if(generation.protocol==='gemini'){
  const r=await transport(generation.base+'/v1beta/models/'+generation.model+':generateContent',{method:'POST',body:JSON.stringify({contents:[{parts:[{text:prompt.system}]}],generationConfig:{maxOutputTokens:1024,responseMimeType:'application/json'}}),headers:{'Content-Type':'application/json','x-goog-api-key':env[generation.credentialRef]},timeout:45000,deadlineMs:45000});
  if(r.status!==200)throw new Error('MODEL_REQUEST_FAILED');let data;try{data=JSON.parse(r.body);}catch{throw new Error('MODEL_BAD_RESPONSE');}result={output:data.candidates?.[0]?.content?.parts?.filter(p=>!p.thought).map(p=>p.text||'').join('')};
 }else result=await completeRemote(prompt,generation,{key:env[generation.credentialRef],transport,probe:true});
 let value;try{value=JSON.parse(result.output);}catch{throw new Error('MODEL_CONTENT_INVALID');}if(value?.value!==703)throw new Error('MODEL_CONTENT_INVALID');
 return {probe:{passed:true,latencyMs:Date.now()-started},model:generation.model,provider:generation.provider,reasoningEffort:generation.reasoningEffort};
}
module.exports={completeRemote,parseStream,parseResponse,probeModel,upstreamError};
