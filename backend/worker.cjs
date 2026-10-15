'use strict';
const {recordCheck}=require('./model-control.cjs');
const {COSStore}=require('./store.cjs'),{generate,generationProfile}=require('./generator.cjs'),{generateIllustration}=require('./illustration.cjs');
async function run(event,{store=new COSStore(),generator=generate,illustrator=generateIllustration,prober=require('./model-completion.cjs').probeModel,now=Date.now,modelStore}={}){
 if(!event||!/^jobs\/[a-f0-9]{32}\/[a-f0-9-]{36}$/.test(event.key||''))throw new Error('INVALID_JOB_EVENT');
 const found=await store.get(event.key+'/meta.json'),job=found?.value;if(!job||job.deadline<now())return {skipped:true};
 const profile=job.generation?.protocol?job.generation:generationProfile(job.generation?.provider||'gemini'),startedAt=now();
 if(!await store.create(event.key+'/run.json',{startedAt,deadlineAt:startedAt+(job.type==='illustration'?450000:profile.timeoutMs)}))return {skipped:true};
 const check=async result=>{if(job.type==='model-probe'){try{const controls=modelStore||(process.env.TRAINING_BUCKET?new COSStore({prefix:'training-control-v1/'}):null);if(controls)await recordCheck(controls,profile,result,now());}catch{}}};
 try{let result;if(job.type==='model-probe'){result=await prober(profile);}else if(job.type==='illustration'){const parent=event.key.slice(0,event.key.lastIndexOf('/'))+'/'+job.input.sourceId,source=await store.get(parent+'/result.json'),diagram=source?.value.sheet?.questions.find(q=>q.id===job.input.questionId)?.diagram;if(diagram?.kind!=='illustration')throw new Error('IMAGE_SOURCE_INVALID');result={image:await illustrator(diagram),sourceId:job.input.sourceId,questionId:job.input.questionId,model:'gpt-image-2'};}else result=await generator(job.input,{provider:profile.provider,...(profile.protocol?{generation:profile}:{})});await store.create(event.key+'/result.json',{...result,status:'ready',finishedAt:now()});await check({...result,status:'ready'});return {ok:true};}
 catch(error){if(error.cause||error.diagnostic){try{await store.create(event.key+'/diagnostic.json',{at:now(),category:error.message,validation:error.cause?.message,...(error.output?{raw:String(error.output).slice(0,256000),truncated:String(error.output).length>256000}:{}),...(error.diagnostic?{upstream:error.diagnostic}:{})});}catch{}}const code=['MODEL_BALANCE_REQUIRED','MODEL_SUBSCRIPTION_EXPIRED','MODEL_AUTH_FAILED','MODEL_RATE_LIMIT','MODEL_INCOMPLETE','MODEL_CONTENT_INVALID','MODEL_REQUEST_FAILED','NETWORK_TIMEOUT','IMAGE_NOT_CONFIGURED','IMAGE_RATE_LIMIT','IMAGE_REQUEST_FAILED','IMAGE_RESPONSE_INVALID','IMAGE_SOURCE_INVALID','IMAGE_UNAVAILABLE','IMAGE_URL_REJECTED'].includes(error.message)?error.message:'GENERATION_FAILED';await store.create(event.key+'/result.json',{status:'failed',error:code,finishedAt:now()});await check({status:'failed',error:code});return {ok:false};}
}
async function handle(event,options={}){
 if(!Array.isArray(event?.Records))return run(event,options);
 const results=[];
 for(const record of event.Records){const bucket=record.cos?.cosBucket,expected=process.env.TRAINING_BUCKET;if(expected&&bucket?.name+'-'+bucket?.appid!==expected)continue;let name;try{name=decodeURIComponent(record.cos?.cosObject?.key||'');}catch{continue;}const match=name.match(/(?:^|\/)training-v1\/(jobs\/[a-f0-9]{32}\/[a-f0-9-]{36})\/meta\.json$/);if(match&&record.event?.eventSource==='qcs::cos'&&record.event.eventName.startsWith('cos:ObjectCreated:'))results.push(await run({key:match[1]},options));}
 return {handled:results.length};
}
exports.main_handler=event=>handle(event);exports.run=run;exports.handle=handle;
