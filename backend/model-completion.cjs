'use strict';
const {completionUsage,incompleteCompletion}=require('./completion-diagnostics.cjs'),{eventError,httpError}=require('./upstream-event.cjs');
const {request}=require('./tencent.cjs'),{routes,connectionMatches}=require('./model-control.cjs'),{adaptModelBody}=require('./model-adapter.cjs'),{USER_AGENT,readCompletion}=require('./kimi.cjs');
function upstreamError(response,key){return httpError(response,key);}
function parseStream(source,protocol,options={}){
 let output='',done=false,finish='',usage={};
 for(const event of String(source).split(/\r?\n\r?\n/)){
  const text=event.split(/\r?\n/).filter(x=>x.startsWith('data:')).map(x=>x.slice(5).trimStart()).join('\n');if(!text||text==='[DONE]')continue;
  let data;try{data=JSON.parse(text);}catch{throw new Error('MODEL_BAD_RESPONSE');}
  if(data.type==='error'||data.error||['response.failed','response.incomplete'].includes(data.type))throw eventError(data,{protocol,key:options.key,outputChars:output.length,partial:!!output.trim()});
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
 if(!done||!['stop','end_turn'].includes(finish)||!output.trim())throw incompleteCompletion({protocol,finish,done,output,usage});
 return {output,usage:completionUsage(usage)};
}
function parseResponse(response,protocol,options={}){
 if(String(response.body).trimStart().startsWith('{')){
  let data;try{data=JSON.parse(response.body);}catch{throw new Error('MODEL_BAD_RESPONSE');}
  if(data.error||data.type==='error'||data.status==='failed'||['response.failed','response.incomplete'].includes(data.type)||protocol==='responses'&&data.status==='incomplete')throw eventError(data,{protocol,key:options.key});
  if(protocol==='gemini'){const candidate=data.candidates?.[0],output=(candidate?.content?.parts||[]).filter(p=>!p.thought&&typeof p.text==='string').map(p=>p.text).join('');if(candidate?.finishReason!=='STOP'||!output.trim())throw incompleteCompletion({protocol,finish:candidate?.finishReason,done:!!candidate?.finishReason,output,usage:data.usageMetadata});return {output,usage:completionUsage(data.usageMetadata)};}
  const content=protocol==='anthropic'?data.content:protocol==='responses'?(data.output||[]).filter(x=>x.type==='message').flatMap(x=>x.content||[]):null;
  const output=content?content.filter(x=>['text','output_text'].includes(x.type)).map(x=>x.text||'').join(''):data.choices?.[0]?.message?.content;
  if(!output||(protocol==='anthropic'?data.stop_reason!=='end_turn':protocol==='responses'?data.status!=='completed':data.choices?.[0]?.finish_reason!=='stop'))throw new Error('MODEL_INCOMPLETE');
  return {output,usage:{input:data.usage?.input_tokens||data.usage?.prompt_tokens||0,output:data.usage?.output_tokens||data.usage?.completion_tokens||0,thinking:data.usage?.completion_tokens_details?.reasoning_tokens||0}};
 }
 return protocol==='chat-completions'?readCompletion(response.body,{protocol,key:options.key}):parseStream(response.body,protocol,options);
}
async function completeRemote(prompt,generation,{key,transport=request,probe=false,onProgress,signal}={}){
 const route=routes[generation.provider];if(!connectionMatches(generation)||!['chat-completions','anthropic','responses'].includes(generation.protocol)||!key)throw new Error('MODEL_NOT_CONFIGURED');
 const body=adaptModelBody({messages:[{role:'system',content:prompt.system},{role:'user',content:JSON.stringify(prompt.input)}],max_tokens:probe?256:32768,effort:generation.effort},{name:generation.provider,model:generation.model},generation.effort,{profile:generation.adapterProfile,probe});
 if(prompt.image)require('./model-vision.cjs').attachImage(body,generation.protocol,prompt.image);
 const protocol=generation.protocol,suffix=protocol==='anthropic'?'/v1/messages':protocol==='responses'?'/responses':'/chat/completions';
 const reader=require('./stream-reader.cjs').createStreamReader(protocol),progress=onProgress?require('./progress.cjs').streamProgress(protocol,onProgress):null;
 const response=await transport(generation.base.replace(/\/$/,'')+suffix,{method:'POST',body:JSON.stringify(body),headers:{'Content-Type':'application/json','User-Agent':USER_AGENT,...(protocol==='anthropic'?{'x-api-key':key,'anthropic-version':'2023-06-01'}:{Authorization:'Bearer '+key})},timeout:probe?45000:840000,deadlineMs:probe?45000:840000,maxBytes:64*1024*1024,collectBody:false,signal,onChunk:chunk=>{reader.write(chunk);progress?.(chunk);}});
 if(response.status!==200)throw upstreamError(response,key);
 return {...parseResponse(reader.received?{...response,body:reader.finish()}:response,protocol,{key}),model:generation.model,provider:generation.provider,reasoningEffort:generation.reasoningEffort};
}
async function completeGemini(prompt,generation,{key,transport=request,onProgress,signal,probe=false}={}){
 if(!connectionMatches(generation)||generation.protocol!=='gemini'||!key)throw new Error('MODEL_NOT_CONFIGURED');
 const reader=require('./stream-reader.cjs').createStreamReader('gemini'),progress=onProgress?require('./progress.cjs').streamProgress('gemini',onProgress):null;
 const body=prompt.body?JSON.parse(prompt.body):{systemInstruction:{parts:[{text:prompt.system}]},contents:[{role:'user',parts:[{text:JSON.stringify(prompt.input)}]}],generationConfig:{temperature:.2,maxOutputTokens:65536,responseMimeType:'application/json',responseJsonSchema:prompt.schema}};
 body.contents.at(-1).parts.push({text:require('./prompt-policy.cjs').outputReminder(prompt)});
 if(prompt.image)require('./model-vision.cjs').attachImage(body,'gemini',prompt.image);
 if(probe)body.generationConfig.maxOutputTokens=8192;
 body.generationConfig.thinkingConfig={thinkingLevel:generation.reasoningEffort||'high',...(onProgress?{includeThoughts:true}:{})};
 const response=await transport(generation.base+'/v1beta/models/'+generation.model+':streamGenerateContent?alt=sse',{method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':key},body:JSON.stringify(body),timeout:probe?45000:840000,deadlineMs:probe?45000:840000,maxBytes:64*1024*1024,collectBody:false,signal,onChunk:chunk=>{reader.write(chunk);progress?.(chunk);}});
 if(response.status!==200)throw upstreamError(response,key);
 return {...parseResponse(reader.received?{...response,body:reader.finish()}:response,'gemini',{key}),model:generation.model,provider:generation.provider,reasoningEffort:generation.reasoningEffort};
}
async function probeModel(generation,{env=process.env,transport=request}={}){
 const started=Date.now(),prompt={system:'只输出JSON对象，字段value为整数。计算37乘19，不输出解释。禁止Markdown和代码围栏，回复首字符必须为{，末字符必须为}。',input:{task:'37×19'},schema:{type:'object',properties:{value:{type:'integer'}},required:['value'],additionalProperties:false}};
 let result;
 if(generation.protocol==='kimi')result=await require('./kimi.cjs').completeKimi(prompt,{key:env[generation.credentialRef],kind:'code',effort:generation.reasoningEffort,transport,probe:true});
 else if(generation.protocol==='gemini')result=await completeGemini(prompt,generation,{key:env[generation.credentialRef],transport,probe:true});
 else result=await completeRemote(prompt,generation,{key:env[generation.credentialRef],transport,probe:true});
 let value;try{value=JSON.parse(result.output);}catch{throw new Error('MODEL_CONTENT_INVALID');}if(value?.value!==703)throw new Error('MODEL_CONTENT_INVALID');
 return {probe:{passed:true,latencyMs:Date.now()-started},model:generation.model,provider:generation.provider,reasoningEffort:generation.reasoningEffort};
}
module.exports={completeRemote,completeGemini,parseStream,parseResponse,probeModel,upstreamError};
