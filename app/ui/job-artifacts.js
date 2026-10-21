// Reassemble complete content from bounded, authenticated HTTP responses.
export async function hydrateJobArtifacts(data,load){
 if(!data?.artifacts)return data;
 const {artifacts,...result}=data;
 if(artifacts.trace===true){const trace=await load('trace');if(!trace?.progress)throw new Error('生成记录暂未读完，请继续查询');result.progress=trace.progress;}
 else if(artifacts.trace){
  const {parts,hash}=artifacts.trace;if(!Number.isInteger(parts)||parts<1||parts>64||! /^[a-f0-9]{64}$/.test(hash))throw new Error('生成记录无效，请继续查询');
  const chunks=await Promise.all(Array.from({length:parts},(_,i)=>load('trace/'+i)));
  if(chunks.some(part=>part?.hash!==hash||typeof part?.text!=='string'))throw new Error('生成记录已更新，正在继续查询');
  result.progress=JSON.parse(chunks.map(part=>part.text).join(''));
 }
 if(artifacts.images){
  if(!Array.isArray(artifacts.images)||artifacts.images.length>12||artifacts.images.some(id=>!Number.isInteger(id)||id<1||id>12))throw new Error('图示记录无效，请继续查询');
  await Promise.all(artifacts.images.map(async id=>{const question=result.sheet?.questions?.find(q=>q.id===id),part=await load('images/'+id);if(!question?.diagram||!part?.image)throw new Error('题目图示暂未读完，请继续查询');question.diagram.image=part.image;}));
 }
 // Figure refreshes return one top-level diagram rather than a sheet. Restore
 // it through the same authenticated images/:questionId route and a fresh
 // object so the parsed response is never mutated in place.
 if(artifacts.diagram!==undefined){
  const questionId=artifacts.diagram;
  if(!Number.isInteger(questionId)||questionId<1||questionId>12)throw new Error('图示记录无效，请继续查询');
  if(result.questionId!==questionId||!result.diagram)throw new Error('图示暂未读完，请继续查询');
  const part=await load('images/'+questionId);
  if(!part?.image)throw new Error('图示暂未读完，请继续查询');
  result.diagram={...result.diagram,image:part.image};
 }
 return result;
}
