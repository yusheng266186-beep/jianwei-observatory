'use strict';
// Use the application's real identity. A subscription endpoint is never
// accessed by impersonating a supported coding client.
const {request}=require('./tencent.cjs'),{eventError,httpError}=require('./upstream-event.cjs');
const USER_AGENT='JianweiObservatory/1.0 (+https://github.com/yusheng266186-beep/jianwei-observatory)';
function kimiProfile(kind='platform',model){
 const route=kind==='platform'?{base:'https://api.moonshot.cn/v1',model:'kimi-k3',models:['kimi-k3']}:kind==='code'?{base:'https://api.kimi.com/coding/v1',model:'k3',models:['k3','kimi-for-coding']}:null;
 if(!route)throw new Error('MODEL_ENDPOINT_INVALID');
 model=model??route.model;
 if(!route.models.includes(model))throw new Error('MODEL_SELECTION_INVALID');
 return {kind,base:route.base,model};
}
function kimiExerciseSchema(schema){
 const compatible=structuredClone(schema),questions=compatible.properties.questions;if(!questions)return compatible;
 // MFJS requires explicit types even for constraints in an anyOf branch.
 // Supply them from the same field's base schema before generation.
 for(const item of [questions.items,...(questions.prefixItems||[])])for(const branch of item.anyOf||[]){
  branch.type='object';
  for(const [field,constraint] of Object.entries(branch.properties||{}))branch.properties[field]={...structuredClone(item.properties[field]),...constraint};
 }
 return compatible;
}
function readCompletion(source,options={}){
 const protocol=options.protocol||'kimi';
 if(String(source).trimStart().startsWith('{')){let data;try{data=JSON.parse(source);}catch{throw Error('MODEL_BAD_RESPONSE');}if(data.error||data.type==='error'||data.status==='failed'||['response.failed','response.incomplete'].includes(data.type))throw eventError(data,{protocol,key:options.key});const choice=data.choices?.find(c=>c.index===0)||data.choices?.[0],output=choice?.message?.content;const usage=data.usage||{};if(choice?.finish_reason!=='stop'||typeof output!=='string'||!output.trim())throw Object.assign(Error('MODEL_INCOMPLETE'),{diagnostic:{kind:'completion',finishReason:choice?.finish_reason||'missing',streamComplete:!!choice?.finish_reason,usage}});return {output,usage:{input:usage.prompt_tokens||0,output:usage.completion_tokens||0,thinking:usage.completion_tokens_details?.reasoning_tokens||0}};}
 let output='',finish='',done=false,usage={};
 for(const event of String(source).split(/\r?\n\r?\n/)){
  const data=event.split(/\r?\n/).filter(line=>line.startsWith('data:')).map(line=>line.slice(5).trimStart()).join('\n');
  if(!data)continue;if(data==='[DONE]'){done=true;continue;}
  let chunk;try{chunk=JSON.parse(data);}catch{throw new Error('MODEL_BAD_RESPONSE');}
  if(chunk.error||chunk.type==='error'||chunk.type==='response.failed'||chunk.type==='response.incomplete')throw eventError(chunk,{protocol,key:options.key,outputChars:output.length,partial:!!output.trim()});
  const choice=chunk.choices?.find(item=>item.index===0)||chunk.choices?.[0];
  if(typeof choice?.delta?.content==='string')output+=choice.delta.content;
  if(choice?.finish_reason)finish=choice.finish_reason;
  if(chunk.usage)usage=chunk.usage;
 }
 if(!done||finish!=='stop'||!output.trim())throw Object.assign(new Error('MODEL_INCOMPLETE'),{diagnostic:{kind:'completion',finishReason:finish||'missing',streamComplete:done,usage}});
 return {output,usage:{input:usage.prompt_tokens||0,output:usage.completion_tokens||0,thinking:usage.completion_tokens_details?.reasoning_tokens||0}};
}
async function completeKimi({input,system,schema},{key,kind='platform',model,effort='max',transport=request,probe=false,onProgress,signal}={}){
 const profile=kimiProfile(kind,model);if(!key)throw new Error('MODEL_NOT_CONFIGURED');
 if(!['low','high','max'].includes(effort))throw new Error('MODEL_SELECTION_INVALID');
 const body=JSON.stringify({model:profile.model,reasoning_effort:effort,max_completion_tokens:probe?4096:131072,messages:[{role:'system',content:system},{role:'user',content:JSON.stringify(input)}],response_format:{type:'json_schema',json_schema:{name:'student_exercise',strict:true,schema:kimiExerciseSchema(schema)}},stream:true,stream_options:{include_usage:true}});
 const reader=require('./stream-reader.cjs').createStreamReader('kimi'),progress=onProgress?require('./progress.cjs').streamProgress('kimi',onProgress):null;
 const response=await transport(profile.base+'/chat/completions',{method:'POST',body,headers:{'Content-Type':'application/json',Authorization:'Bearer '+key,'User-Agent':USER_AGENT},timeout:probe?45000:840000,deadlineMs:probe?45000:840000,maxBytes:64*1024*1024,collectBody:false,signal,onChunk:chunk=>{reader.write(chunk);progress?.(chunk);}});
 if(response.status!==200)throw httpError(response,key);
 return {...readCompletion(reader.received?reader.finish():response.body,{protocol:'kimi',key}),model:profile.model,provider:'kimi-'+kind,reasoningEffort:effort};
}
module.exports={kimiProfile,kimiExerciseSchema,readCompletion,completeKimi,USER_AGENT};
