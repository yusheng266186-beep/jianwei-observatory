'use strict';
const crypto=require('node:crypto');
const {snapshot}=require('./model-control.cjs');
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const promptDefinition=require('./pelican-prompt.json'),{extractDocument}=require('./pelican-document.cjs');
const DEFAULT_PROMPT=promptDefinition.prompt;
const fail=(code,status=400)=>Object.assign(Error(code),{status});
function safeSVG(output){
 try{const parsed=JSON.parse(String(output));if(typeof parsed?.svg==='string')output=parsed.svg;}catch{}
 let svg=String(output).match(/<svg\b[\s\S]*?<\/svg\s*>/i)?.[0];
 if(svg)svg=svg.replace(/<!--[\s\S]*?-->/g,'');
 if(!svg||svg.length>200000||/<(?:script|foreignObject|iframe|image|animate|set|a)\b|\bon\w+\s*=|<!|<\?|@import/i.test(svg))return null;
 for(const m of svg.matchAll(/\b(?:href|src)\s*=\s*["']([^"']*)["']/gi))if(!/^#[A-Za-z0-9_.:-]+$/.test(m[1]))return null;
 for(const m of svg.matchAll(/url\s*\(\s*["']?([^\s"')]+)["']?\s*\)/gi))if(!/^#[A-Za-z0-9_.:-]+$/.test(m[1]))return null;
 if(!/\sxmlns\s*=/.test(svg))svg=svg.replace(/<svg\b/,'<svg xmlns="http://www.w3.org/2000/svg"');
 return svg;
}
async function latest(store,base){let low=0,high=1;const k=n=>base+'/'+String(n).padStart(10,'0')+'.json';while(await store.get(k(high))){low=high;high=high*2+1;}while(high-low>1){const mid=Math.floor((high+low)/2);if(await store.get(k(mid)))low=mid;else high=mid;}return {revision:low,value:low?(await store.get(k(low))).value:[]};}
async function defaultComplete(prompt,generation,options){
 const methods=require('./model-completion.cjs'),key=options.env[generation.credentialRef];
 if(prompt.outputFormat!=='html'&&['gemini','kimi'].includes(generation.protocol))prompt={...prompt,system:prompt.system+'\n传输格式：将完整SVG放在JSON对象的svg字符串字段中，仅返回该JSON对象。',schema:{type:'object',properties:{svg:{type:'string'}},required:['svg'],additionalProperties:false}};
 if(generation.protocol==='gemini')return methods.completeGemini(prompt,generation,{...options,key});
 if(generation.protocol==='kimi')return require('./kimi.cjs').completeKimi(prompt,{...options,key,kind:'code',model:generation.model,effort:generation.reasoningEffort});
 return methods.completeRemote(prompt,generation,{...options,key});
}
function createPelicanControl({store,owner,env=process.env,now=Date.now,dispatch=async()=>{},bindGeneration=async g=>g,complete=defaultComplete}={}){
 if(!/^[a-f0-9]{32}$/.test(owner||''))throw fail('PELICAN_OWNER_INVALID');
 const base='pelican/'+owner,key=id=>base+'/'+id,child=id=>'jobs/'+owner+'/'+id;
 async function manifest(id){if(!uuid.test(id||''))throw fail('PELICAN_NOT_FOUND',404);const m=(await store.get(key(id)+'/manifest.json'))?.value;if(!m)throw fail('PELICAN_NOT_FOUND',404);return m;}
 async function register(m){for(let i=0;i<8;i++){const old=await latest(store,base+'/index');if(old.value.some(r=>r.id===m.id))return;const value=[{id:m.id,createdAt:m.createdAt,count:m.candidates.length},...old.value].slice(0,20);if(await store.create(base+'/index/'+String(old.revision+1).padStart(10,'0')+'.json',value))return;}throw fail('PELICAN_INDEX_BUSY',503);}
 async function advance(m){
  if(await store.get(key(m.id)+'/cancel.json'))return;
  for(const candidate of m.candidates){
   const k=child(candidate.id),saved=(await store.get(k+'/delivery-candidate.json'))?.value;
   if(saved)await store.create(k+'/result.json',saved);
   const done=await store.get(k+'/result.json');if(done)continue;
   const old=(await store.get(k+'/meta.json'))?.value;
   if(old&&old.deadline<now()){await store.create(k+'/result.json',{status:'failed',error:'NETWORK_TIMEOUT',finishedAt:now()});continue;}
   if(!old)await store.create(k+'/meta.json',{id:candidate.id,type:'pelican',parentId:m.id,generation:candidate.generation,prompt:m.prompt,...(m.promptVersion?{promptVersion:m.promptVersion,deliveryInstructions:m.deliveryInstructions}:{}),createdAt:now(),deadline:now()+890000,status:'queued'});
   // Re-dispatching an accepted child is safe: run.json is create-once.
   if(!await store.get(k+'/run.json'))await dispatch(k);
   return;
  }
 }
 async function status(id,{brief=false}={}){
  const m=await manifest(id);await advance(m);const cancelled=!!await store.get(key(id)+'/cancel.json');
  const candidates=[];
  for(const c of m.candidates){const k=child(c.id),result=(await store.get(k+'/result.json'))?.value,run=(await store.get(k+'/run.json'))?.value,progress=(await store.get(k+'/progress.json'))?.value;
   const row={id:c.id,selection:{provider:c.generation.provider,model:c.generation.model,effort:c.generation.effort},label:c.generation.model,status:result?.status||(cancelled?'cancelled':run?'running':'queued'),...(result||{})};
   if(result?.status==='ready'&&!row.html){const doc=extractDocument(row.output||row.svg||'');if(doc){Object.assign(row,doc);delete row.renderWarning;}}
   if(result?.status==='ready'&&!row.html&&!row.svg){const svg=safeSVG(row.output);if(svg){row.svg=svg;delete row.renderWarning;}}
   if(!result&&run){row.phase=progress?.phase||'thinking';row.elapsedMs=Math.max(0,now()-run.startedAt);row.firstOutputMs=progress?.firstOutputMs??null;if(!brief)row.output=progress?.draftSource||'';}
   if(brief){delete row.output;delete row.svg;delete row.html;}candidates.push(row);
  }
  const pending=candidates.some(r=>['queued','running'].includes(r.status)),ready=candidates.filter(r=>r.status==='ready').length;
  return {id,createdAt:m.createdAt,prompt:m.prompt,promptVersion:m.promptVersion||'legacy-svg',deliveryInstructions:m.deliveryInstructions||null,status:cancelled?'cancelled':pending?'running':ready===candidates.length?'ready':ready?'partial':'failed',candidates};
 }
 async function begin(input,id){
  if(!uuid.test(id||''))throw fail('REQUEST_ID_REQUIRED');
  if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!['candidates','prompt'].includes(k))||!Array.isArray(input.candidates)||!input.candidates.length||input.candidates.length>8||input.prompt!==undefined&&(typeof input.prompt!=='string'||!input.prompt.trim()||input.prompt.length>6000))throw fail('PELICAN_INPUT_INVALID');
  const unique=[...new Map(input.candidates.map(s=>[JSON.stringify(s),s])).values()],prompt=input.prompt?.trim()||DEFAULT_PROMPT;
  const fingerprint=crypto.createHash('sha256').update(JSON.stringify({candidates:unique,prompt})).digest('hex');
  const existing=(await store.get(key(id)+'/manifest.json'))?.value;
  if(existing){if(existing.fingerprint!==fingerprint)throw fail('REQUEST_ID_CONFLICT',409);await register(existing);return status(id);}
  const candidates=[];for(const s of unique)candidates.push({id:crypto.randomUUID(),generation:await bindGeneration(snapshot(s,env))});
  const m={id,fingerprint,prompt,promptVersion:promptDefinition.version,deliveryInstructions:promptDefinition.deliveryInstructions,candidates,createdAt:now()};
  if(!await store.create(key(id)+'/manifest.json',m))return begin(input,id);
  await register(m);return status(id);
 }
 async function list(){const index=await latest(store,base+'/index'),runs=[];for(const r of index.value)runs.push(await status(r.id,{brief:true}));return {runs};}
 async function cancel(id){const m=await manifest(id);await store.create(key(id)+'/cancel.json',{at:now()});for(const c of m.candidates)if(!await store.get(child(c.id)+'/result.json'))await store.create(child(c.id)+'/removed.json',{at:now()});return status(id);}
 async function run(k,job){
  if(k!==child(job.id)||job.type!=='pelican')throw fail('PELICAN_JOB_INVALID');
  const m=await manifest(job.parentId);if(!m.candidates.some(c=>c.id===job.id))throw fail('PELICAN_JOB_INVALID');
  const candidate=(await store.get(k+'/delivery-candidate.json'))?.value;
  if(candidate)await store.create(k+'/result.json',candidate);
  if(await store.get(k+'/result.json')){await advance(m);return {recovered:true};}
  if(await store.get(key(m.id)+'/cancel.json')||await store.get(k+'/removed.json'))return {cancelled:true};
  const startedAt=now();if(!await store.create(k+'/run.json',{startedAt}))return {skipped:true};
  const controller=new AbortController();let firstOutputMs=null,lastSave=0,previous='';
  const timer=setInterval(async()=>{try{if(await store.get(key(m.id)+'/cancel.json')||await store.get(k+'/removed.json'))controller.abort();}catch{}},2500);timer.unref?.();
  try{
   if(job.deadline<startedAt)throw Error('NETWORK_TIMEOUT');
   const onProgress=async value=>{const text=typeof value.draftSource==='string'?value.draftSource:'';if(text&&text!==previous&&firstOutputMs===null)firstOutputMs=Math.max(0,now()-startedAt);if(now()-lastSave>1500){lastSave=now();previous=text;await store.progress(k+'/progress.json',{phase:value.phase||'thinking',draftSource:text.slice(0,200000),firstOutputMs,updatedAt:now()}).catch(()=>{});}};
   const request=job.promptVersion?{system:job.deliveryInstructions,inputText:job.prompt,outputFormat:'html'}:{system:job.prompt,input:{task:'输出自包含SVG，禁止外部资源。'}};
   const result=await complete(request,job.generation,{onProgress,signal:controller.signal,env});
   if(controller.signal.aborted||await store.get(k+'/removed.json'))throw Error('JOB_CANCELLED');
   const output=String(result.output||'').slice(0,200000),doc=extractDocument(output),svg=!doc?safeSVG(output):null,u=result.usage;
   const finished={status:'ready',output,...(doc?doc:svg?{svg}:{renderWarning:'模型未返回完整HTML文档，可查看模型原文。'}),latencyMs:Math.max(0,now()-startedAt),firstOutputMs,usage:u?{input:Number.isFinite(u.input)?u.input:null,output:Number.isFinite(u.output)?u.output:null,thinking:Number.isFinite(u.thinking)?u.thinking:null}:null,finishedAt:now()};
   await store.create(k+'/delivery-candidate.json',finished);await store.create(k+'/result.json',finished);
  }catch(e){if(/^(STORE_UNAVAILABLE|CODEX_AUTH_PERSIST_FAILED)$/.test(e.message))throw e;const error=/^[A-Z][A-Z0-9_]{2,70}$/.test(e.message)?e.message:'MODEL_REQUEST_FAILED';await store.create(k+'/result.json',{status:error==='JOB_CANCELLED'?'cancelled':'failed',error,latencyMs:Math.max(0,now()-startedAt),firstOutputMs,finishedAt:now()});}
  finally{clearInterval(timer);}
  await advance(m);return {ok:true};
 }
 return {begin,status,list,cancel,run};
}
module.exports={createPelicanControl,safeSVG,DEFAULT_PROMPT,defaultComplete};
