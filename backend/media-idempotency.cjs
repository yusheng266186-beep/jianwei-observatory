'use strict';
// State-aware reuse for illustration/figure requests. COS objects are
// create-only here: each attempt claims the next immutable slot, so two
// concurrent requests can never dispatch two jobs for the same source/question.
const DEFAULT_WINDOW_MS=15000,DEFAULT_PHANTOM_MS=30000;
const slotPrefix=({owner,sourceId,questionId,type})=>'media-requests/'+owner+'/'+sourceId+'/'+questionId+'/'+type+'/';
const jobKey=(owner,id)=>'jobs/'+owner+'/'+id;

async function latestSlot(store,prefix){
 const first=await store.get(prefix+'0.json');
 if(!first)return null;
 let low=0,high=1;
 while(await store.get(prefix+high+'.json')){low=high;high=high*2+1;}
 while(high-low>1){const mid=Math.floor((low+high)/2);if(await store.get(prefix+mid+'.json'))low=mid;else high=mid;}
 const found=low?await store.get(prefix+low+'.json'):first;
 return {n:low,value:found.value};
}

async function mediaJobState(store,key,meta,now=Date.now()){
 if(await store.get(key+'/removed.json'))return {status:'failed',error:'JOB_REMOVED'};
 const result=await store.get(key+'/result.json');
 if(result?.value){const value=result.value;return {status:value.status==='ready'?'ready':'failed',...(value.error?{error:value.error}:{}),...(value.failureDetail?{failureDetail:value.failureDetail}:{})};}
 const progress=(await store.get(key+'/progress.json'))?.value;
 if(progress?.phase==='removed')return {status:'failed',error:'JOB_CANCELLED'};
 if(progress?.phase==='failed'||progress?.figureStage?.status==='failed')return {status:'failed',error:progress.figureStage?.error||'FIGURE_FAILED'};
 const run=(await store.get(key+'/run.json'))?.value,deadline=run?.deadlineAt||meta?.deadline;
 if(Number.isFinite(deadline)&&deadline<now)return {status:'failed',error:'JOB_EXPIRED'};
 return {status:run?'running':'queued'};
}

async function claimedJob(store,prefix,n,owner,slot,now){
 for(let attempt=0;attempt<25;attempt++){
  const rejected=(await store.get(prefix+n+'.rejected.json'))?.value;
  if(rejected)return {id:slot.id,created:false,createdAt:slot.createdAt,state:{status:'failed',error:rejected.error}};
  const meta=(await store.get(jobKey(owner,slot.id)+'/meta.json'))?.value;
  if(meta)return {id:slot.id,created:false,createdAt:meta.createdAt||slot.createdAt,state:await mediaJobState(store,jobKey(owner,slot.id),meta,now())};
  await new Promise(resolve=>setTimeout(resolve,20));
 }
 return {id:slot.id,created:false,createdAt:slot.createdAt,state:{status:'queued'}};
}
async function resolve({store,owner,sourceId,questionId,type,id,fingerprint,redraw=false,now=Date.now,at,reserve=async()=>{},accept=async()=>{},windowMs=DEFAULT_WINDOW_MS,phantomMs=DEFAULT_PHANTOM_MS}){
 const prefix=slotPrefix({owner,sourceId,questionId,type}),latest=await latestSlot(store,prefix),createdAt=Number.isFinite(at)?at:now();
 // Deployment bridge: adopt an in-flight/ready legacy illustration pin once.
 // Failed, removed or expired pins are ignored so they cannot lock the next attempt.
 if(!latest&&type==='illustration'){
  const legacy=(await store.get('illustration-requests/'+owner+'/'+sourceId+'/'+questionId+'.json'))?.value,legacyKey=legacy?.id&&jobKey(owner,legacy.id),legacyMeta=legacyKey?(await store.get(legacyKey+'/meta.json'))?.value:null,legacyState=legacyMeta?await mediaJobState(store,legacyKey,legacyMeta,now()):null;
  if(legacyMeta&&(legacyState.status==='queued'||legacyState.status==='running'||(legacyState.status==='ready'&&!redraw))){
   const adopted={id:legacy.id,fingerprint,createdAt:legacyMeta.createdAt||createdAt,redraw:false};
   if(await store.create(prefix+'0.json',adopted))return {id:legacy.id,created:false,createdAt:adopted.createdAt,state:legacyState};
   const seeded=(await store.get(prefix+'0.json')).value,seededMeta=(await store.get(jobKey(owner,seeded.id)+'/meta.json'))?.value;
   return {id:seeded.id,created:false,createdAt:seededMeta?.createdAt||seeded.createdAt,state:await mediaJobState(store,jobKey(owner,seeded.id),seededMeta,now())};
  }
 }
 if(latest){
  const latestId=latest.value.id,key=jobKey(owner,latestId),meta=(await store.get(key+'/meta.json'))?.value,state=await mediaJobState(store,key,meta,now());
  // The claim exists but the job object has not been written yet. Treat a
  // recent claim as queued so a simultaneous second request reuses it; an old
  // orphan claim is abandoned and the next attempt is created.
  if(!meta){if(!await store.get(prefix+latest.n+'.rejected.json')&&now()-latest.value.createdAt<phantomMs)return claimedJob(store,prefix,latest.n,owner,latest.value,now);}
  else if(state.status==='queued'||state.status==='running')return {id:latestId,created:false,createdAt:meta.createdAt||latest.value.createdAt,state};
  if(state.status==='ready'){
   // A normal illustration request reuses the completed image. A figure
   // request keeps explicit redraw ability once the dedupe window has passed.
   if(type==='illustration'&&!redraw)return {id:latestId,created:false,createdAt:meta?.createdAt||latest.value.createdAt,state};
   const same=latest.value.fingerprint===fingerprint,recent=now()-latest.value.createdAt<=windowMs;
   if(same&&recent&&(latest.value.redraw===true)===(redraw===true))return {id:latestId,created:false,createdAt:meta?.createdAt||latest.value.createdAt,state};
  }
  // failed, cancelled, removed or expired jobs never pin the next attempt.
 }
 const n=latest?latest.n+1:0,slot={id,fingerprint,createdAt,redraw:redraw===true};
 if(await store.create(prefix+n+'.json',slot)){
  try{await reserve();await accept();return {id,created:true,createdAt,state:{status:'queued'}};}
  catch(error){await store.create(prefix+n+'.rejected.json',{error:['DAILY_LIMIT','USAGE_BUSY'].includes(error.message)?error.message:'SERVICE_UNAVAILABLE',at:now()});throw error;}
 }
 const winner=(await store.get(prefix+n+'.json')).value;
 return claimedJob(store,prefix,n,owner,winner,now);
}

module.exports={resolve,mediaJobState,latestSlot,WINDOW_MS:DEFAULT_WINDOW_MS};
