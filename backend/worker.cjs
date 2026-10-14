'use strict';
const {COSStore}=require('./store.cjs'),{generate}=require('./generator.cjs');
async function run(event,{store=new COSStore(),generator=generate,now=Date.now}={}){
 if(!event||!/^jobs\/[a-f0-9]{32}\/[a-f0-9-]{36}$/.test(event.key||''))throw new Error('INVALID_JOB_EVENT');
 const found=await store.get(event.key+'/meta.json'),job=found?.value;if(!job||job.deadline<now())return {skipped:true};
 if(!await store.create(event.key+'/run.json',{startedAt:now()}))return {skipped:true};
 try{const result=await generator(job.input);await store.create(event.key+'/result.json',{...result,status:'ready',finishedAt:now()});return {ok:true};}
 catch(error){const code=['MODEL_RATE_LIMIT','MODEL_INCOMPLETE','MODEL_CONTENT_INVALID','MODEL_REQUEST_FAILED','NETWORK_TIMEOUT'].includes(error.message)?error.message:'GENERATION_FAILED';await store.create(event.key+'/result.json',{status:'failed',error:code,finishedAt:now()});return {ok:false};}
}
async function handle(event,options={}){
 if(!Array.isArray(event?.Records))return run(event,options);
 const results=[];
 for(const record of event.Records){const bucket=record.cos?.cosBucket,expected=process.env.TRAINING_BUCKET;if(expected&&bucket?.name+'-'+bucket?.appid!==expected)continue;let name;try{name=decodeURIComponent(record.cos?.cosObject?.key||'');}catch{continue;}const match=name.match(/(?:^|\/)training-v1\/(jobs\/[a-f0-9]{32}\/[a-f0-9-]{36})\/meta\.json$/);if(match&&record.event?.eventSource==='qcs::cos'&&record.event.eventName.startsWith('cos:ObjectCreated:'))results.push(await run({key:match[1]},options));}
 return {handled:results.length};
}
exports.main_handler=event=>handle(event);exports.run=run;exports.handle=handle;
