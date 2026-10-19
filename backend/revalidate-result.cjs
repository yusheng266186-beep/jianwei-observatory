'use strict';
// Re-check an unchanged, fully returned source document after validator updates.
// Never repair JSON, add missing fields, or recover interrupted model output.
async function revalidateResult(store,key,job,result){
 if(result?.error!=='MODEL_CONTENT_INVALID'||job.type!=='exercise')return result;
 const cached=await store.get(key+'/recovered.json');if(cached)return cached.value;
 const diagnostic=(await store.get(key+'/diagnostic.json'))?.value;if(!diagnostic?.raw||diagnostic.truncated)return result;
 try{const {validateExerciseResult}=await import('./exercise-contract.mjs'),sheet=validateExerciseResult(JSON.parse(diagnostic.raw),job.input,{requireFinalAnalysis:true,requireStructuredTables:true}),illustrations=sheet.questions.filter(q=>q.diagram?.kind==='illustration');
  if(job.input.visuals==='none'&&sheet.questions.some(q=>q.diagram)||illustrations.length>1||illustrations.length&&job.input.visuals!=='hybrid')return result;
  const ready={status:'ready',sheet,...(job.generation?{model:job.generation.model,provider:job.generation.provider,reasoningEffort:job.generation.reasoningEffort}:{}),finishedAt:result.finishedAt,generatedAt:new Date(result.finishedAt).toISOString(),recovered:true,...(diagnostic.upstream?.usage?{usage:diagnostic.upstream.usage}:{})};await store.create(key+'/recovered.json',ready);return (await store.get(key+'/recovered.json')).value;
 }catch{return result;}
}
module.exports={revalidateResult};
