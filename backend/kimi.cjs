'use strict';
// Use the application's real identity. A subscription endpoint is never
// accessed by impersonating a supported coding client.
const {request}=require('./tencent.cjs');
const USER_AGENT='JianweiObservatory/1.0 (+https://github.com/yusheng266186-beep/jianwei-observatory)';
function kimiProfile(kind='platform'){
 if(kind==='platform')return {kind,base:'https://api.moonshot.cn/v1',model:'kimi-k3'};
 if(kind==='code')return {kind,base:'https://api.kimi.com/coding/v1',model:'k3'};
 throw new Error('MODEL_ENDPOINT_INVALID');
}
function kimiExerciseSchema(schema){
 const compatible=structuredClone(schema),questions=compatible.properties.questions;
 // MFJS requires explicit types even for constraints in an anyOf branch.
 // Supply them from the same field's base schema before generation.
 for(const item of [questions.items,...(questions.prefixItems||[])])for(const branch of item.anyOf||[]){
  branch.type='object';
  for(const [field,constraint] of Object.entries(branch.properties||{}))branch.properties[field]={...structuredClone(item.properties[field]),...constraint};
 }
 return compatible;
}
function readCompletion(source){
 let output='',finish='',done=false,usage={};
 for(const event of String(source).split(/\r?\n\r?\n/)){
  const data=event.split(/\r?\n/).filter(line=>line.startsWith('data:')).map(line=>line.slice(5).trimStart()).join('\n');
  if(!data)continue;if(data==='[DONE]'){done=true;continue;}
  let chunk;try{chunk=JSON.parse(data);}catch{throw new Error('MODEL_BAD_RESPONSE');}
  if(chunk.error)throw new Error('MODEL_REQUEST_FAILED');
  const choice=chunk.choices?.find(item=>item.index===0)||chunk.choices?.[0];
  if(typeof choice?.delta?.content==='string')output+=choice.delta.content;
  if(choice?.finish_reason)finish=choice.finish_reason;
  if(chunk.usage)usage=chunk.usage;
 }
 if(!done||finish!=='stop'||!output.trim())throw Object.assign(new Error('MODEL_INCOMPLETE'),{diagnostic:{kind:'completion',finishReason:finish||'missing',streamComplete:done,usage}});
 return {output,usage:{input:usage.prompt_tokens||0,output:usage.completion_tokens||0,thinking:usage.completion_tokens_details?.reasoning_tokens||0}};
}
async function completeKimi({input,system,schema},{key,kind='platform',transport=request}={}){
 const profile=kimiProfile(kind);if(!key)throw new Error('MODEL_NOT_CONFIGURED');
 const body=JSON.stringify({model:profile.model,reasoning_effort:'max',max_completion_tokens:131072,messages:[{role:'system',content:system},{role:'user',content:JSON.stringify(input)}],response_format:{type:'json_schema',json_schema:{name:'student_exercise',strict:true,schema:kimiExerciseSchema(schema)}},stream:true,stream_options:{include_usage:true}});
 const response=await transport(profile.base+'/chat/completions',{method:'POST',body,headers:{'Content-Type':'application/json',Authorization:'Bearer '+key,'User-Agent':USER_AGENT},timeout:120000,deadlineMs:840000,maxBytes:8*1024*1024});
 if(response.status!==200)throw Object.assign(new Error(response.status===429?'MODEL_RATE_LIMIT':'MODEL_REQUEST_FAILED'),{diagnostic:{kind:'upstream',status:response.status,message:String(response.body||'').replaceAll(key,'[REDACTED]').slice(0,4000)}});
 return {...readCompletion(response.body),model:profile.model,provider:'kimi-'+kind,reasoningEffort:'max'};
}
module.exports={kimiProfile,kimiExerciseSchema,readCompletion,completeKimi,USER_AGENT};
