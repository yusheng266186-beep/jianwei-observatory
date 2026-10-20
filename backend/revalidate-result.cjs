'use strict';
// Re-check an unchanged, fully returned source document after validator updates.
// Never repair JSON, add missing fields, or recover interrupted model output.
// Recovery uses the same strict document and figure validation as generation.
async function revalidateResult(store,key,job,result,{now=Date.now,dispatch=async()=>{}}={}){
 if(result?.error!=='MODEL_CONTENT_INVALID'||job.type!=='exercise')return result;
 if(await store.get(key+'/removed.json'))return result;
 const cached=await store.get(key+'/recovered.json');if(cached?.value?.status==='ready')return cached.value;
 const diagnostic=(await store.get(key+'/diagnostic.json'))?.value;if(!diagnostic?.raw||diagnostic.truncated)return result;
 const separateFigures=job.pipeline===2;
 let sheet;
 try{
  const {validateOutput}=require('./generator.cjs');
  sheet=await validateOutput(diagnostic.raw,job.input,{separateFigures,usage:diagnostic.upstream?.usage});
 }catch{return result;}
 const finishedAt=Number.isFinite(result.finishedAt)?result.finishedAt:now(),ready={status:'ready',sheet,...(job.generation?{model:job.generation.model,provider:job.generation.provider,reasoningEffort:job.generation.reasoningEffort}:{}),finishedAt,generatedAt:new Date(finishedAt).toISOString(),recovered:true,...(diagnostic.upstream?.usage?{usage:diagnostic.upstream.usage}:{})};
 if(job.contentReview){await require('./content-review.cjs').begin(store,key,job,ready,{now,dispatch});return await require('./content-review.cjs').snapshot(store,key,{now,dispatch})||result;}
 if(!(separateFigures&&sheet.questions.some(q=>q.figureRequest))){
  const created=await store.create(key+'/recovered.json',ready);return created?ready:(await store.get(key+'/recovered.json'))?.value||ready;
 }
 // Pipeline 2 keeps figure requests separate from the text document. Recovery
 // must continue that full plan/render/review flow instead of marking ready.
 if(!job.generation)return result;
 const figures=require('./figure-pipeline.cjs');
 if(!await store.get(key+'/figure-manifest.json')){
  try{const started=await figures.begin(store,key,{...job,type:'exercise'},ready,{now,dispatch});if(!started)return result;}catch{return result;}
 }
 const text=await store.get(key+'/text-result.json');
 if(!text||!require('node:util').isDeepStrictEqual(text.value?.sheet,sheet))return result;
 let delivered=null;
 const delivery={
  get:name=>name===key+'/result.json'?(delivered?{value:delivered}:null):store.get(name),
  async create(name,value){
   if(name!==key+'/result.json')return store.create(name,value);
   // The historical failed result is immutable. Validate the completed figure
   // document through the same strict entry point and save it as recovered.json.
   const final={...value,recovered:true};
   await require('./generator.cjs').validateOutput(JSON.stringify(final.sheet),job.input,{separateFigures:false,usage:diagnostic.upstream?.usage});
   const created=await store.create(key+'/recovered.json',final);
   delivered=created?final:(await store.get(key+'/recovered.json'))?.value||final;
   return created;
  },
  progress:(name,value)=>store.progress(name,value)
 };
 try{return await figures.snapshot(delivery,key,{now,dispatch})||result;}catch{return result;}
}
module.exports={revalidateResult};
