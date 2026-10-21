import test from 'node:test';import assert from 'node:assert/strict';import crypto from 'node:crypto';
import storeModule from '../backend/store.cjs';import media from '../backend/media-idempotency.cjs';import envelope from '../backend/transport-envelope.cjs';import server from '../backend/server.cjs';import tencent from '../backend/tencent.cjs';import totp from '../backend/totp.cjs';
import {hydrateJobArtifacts} from '../app/ui/job-artifacts.js';
import {mergeJobSnapshot} from '../app/engine/exercise-jobs.js';

const {MemoryStore}=storeModule,{mediaJobState}=media,{jobEnvelope,RESPONSE_BUDGET}=envelope;

test('媒体幂等先读已完成稿：续绘成功不再被判失败',async()=>{
 const store=new MemoryStore(),key='jobs/'+'a'.repeat(32)+'/'+crypto.randomUUID(),at=Date.now(),meta={createdAt:at,deadline:at+600000};
 await store.create(key+'/meta.json',meta);
 await store.create(key+'/result.json',{status:'failed',error:'FIGURE_GENERATION_FAILED',failureDetail:'首次绘图失败'});
 await store.create(key+'/recovered.json',{status:'ready',questionId:1,diagram:{kind:'illustration',caption:'图'}});
 assert.deepEqual(await mediaJobState(store,key,meta,at),{status:'ready'});
});

test('恢复稿失败而结果稿已完成时仍以已完成为准，失败/删除/过期逻辑保持',async()=>{
 const store=new MemoryStore(),at=Date.now(),key='jobs/'+'b'.repeat(32)+'/'+crypto.randomUUID(),meta={createdAt:at,deadline:at+600000};
 await store.create(key+'/meta.json',meta);
 await store.create(key+'/result.json',{status:'ready',questionId:1,diagram:{kind:'drawing'}});
 await store.create(key+'/recovered.json',{status:'failed',error:'IMAGE_REQUEST_FAILED'});
 assert.equal((await mediaJobState(store,key,meta,at)).status,'ready');
 const failed='jobs/'+'c'.repeat(32)+'/'+crypto.randomUUID();
 await store.create(failed+'/meta.json',meta);
 await store.create(failed+'/result.json',{status:'failed',error:'FIGURE_IMAGE_FAILED',failureDetail:'上游中断'});
 assert.deepEqual(await mediaJobState(store,failed,meta,at),{status:'failed',error:'FIGURE_IMAGE_FAILED',failureDetail:'上游中断'});
 const removed='jobs/'+'d'.repeat(32)+'/'+crypto.randomUUID();
 await store.create(removed+'/meta.json',meta);await store.create(removed+'/removed.json',{removedAt:at});
 await store.create(removed+'/recovered.json',{status:'ready'});
 assert.equal((await mediaJobState(store,removed,meta,at)).error,'JOB_REMOVED');
 const expired='jobs/'+'e'.repeat(32)+'/'+crypto.randomUUID(),old={createdAt:at-900000,deadline:at-300000};
 await store.create(expired+'/meta.json',old);
 assert.equal((await mediaJobState(store,expired,old,at)).error,'JOB_EXPIRED');
});

test('顶层diagram.image超出响应预算时走认证分片，输入对象不被改写',async()=>{
 const image={mime:'image/png',data:'A'.repeat(RESPONSE_BUDGET+1)},source={status:'ready',questionId:3,diagram:{kind:'illustration',caption:'图',description:'说明',image},figureLayout:{width:'wide'}};
 const packed=jobEnvelope(source);
 assert.equal(packed.artifacts.diagram,3);
 assert.equal(packed.diagram.image,undefined);
 assert.equal(packed.diagram.caption,'图');
 assert.equal(source.diagram.image,image,'原始响应对象不得被突变');
 assert.equal(packed.questionId,3);
 const hydrated=await hydrateJobArtifacts(packed,async name=>{assert.equal(name,'images/3');return {image};});
 assert.deepEqual(hydrated.diagram.image,image);
 assert.equal(hydrated.diagram.caption,'图');
 assert.equal(packed.diagram.image,undefined,'hydrate后仍不得回写分片对象');
});

test('小响应不产生分片，图题刷新的人工校验信息保持不变',async()=>{
 const source={status:'ready',questionId:1,diagram:{kind:'drawing',caption:'图'}};
 assert.equal(jobEnvelope(source),source);
 await assert.rejects(hydrateJobArtifacts({status:'ready',questionId:1,diagram:{kind:'drawing'},artifacts:{diagram:2}},async()=>({image:{}})),/图示暂未读完/);
});

const seed=totp.encodeSecret(Buffer.from('12345678901234567890'));
const profile={provider:'gemini',model:'gemini-3.8-flash',protocol:'gemini',reasoningEffort:'high',timeoutMs:885000};
const request={subject:'数学',grade:'高三',curriculum:'高中数学已学内容',focus:'函数与数列',count:6,minutes:60,difficulty:'基础巩固',targets:[],questionTypes:[],visuals:'none',evidence:[]};
const question=id=>({id,level:'巩固',type:'填空',target:'函数',stem:'第'+id+'题：求函数值。',choices:[],answer:'1',analysis:'代入计算。',points:['正确得5分。'],maxScore:5,minutes:10});
const figureId=(key,q,attempt,stage)=>{const h=crypto.createHash('sha256').update(key+'|figure|'+q+'|'+attempt+'|'+stage).digest('hex');return h.slice(0,8)+'-'+h.slice(8,12)+'-4'+h.slice(13,16)+'-a'+h.slice(17,20)+'-'+h.slice(20,32);};
async function withServer(run){
 const store=new MemoryStore(),secret='test-official-flow-'+crypto.randomBytes(32).toString('hex'),env={TRAINING_SESSION_SECRET:secret,TRAINING_TOTP_SECRET:seed,TRAINING_ORIGINS:'https://school.test',TRAINING_DAILY_LIMIT:'20'},app=server.createServer({store,env,dispatch:async()=>{}});
 await new Promise(resolve=>app.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+app.address().port;let token;
 const call=(route,body)=>fetch(base+route,{method:body?'POST':'GET',headers:{Origin:'https://school.test','Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:body?JSON.stringify(body):undefined});
 token=(await(await call('/session',{code:totp.codeForCounter(seed,Math.floor(Date.now()/30000))})).json()).token;
 try{return await run({store,secret,owner:tencent.hash(secret).slice(0,32),call});}finally{await new Promise(resolve=>app.close(resolve));}
}

test('resume只返回轻量状态，题组恢复标志与计数完整',async()=>{
 await withServer(async({store,owner,call})=>{
  const at=Date.now(),id=crypto.randomUUID(),key='jobs/'+owner+'/'+id,base=key.slice(0,key.lastIndexOf('/')+1);
  await store.create(key+'/meta.json',{id,type:'exercise',input:request,generation:profile,imageGeneration:profile,repairGeneration:profile,repairAttempts:1,pipeline:2,contentReview:1,createdAt:at,deadline:at+600000});
  await store.create(key+'/groups.json',{version:1,planVersion:2,parts:[{index:0,offset:0,input:{...request,count:3,minutes:30}},{index:1,offset:3,input:{...request,count:3,minutes:30}}],input:request,generation:profile,imageGeneration:profile,repairGeneration:profile,repairAttempts:1,contentReview:1,pipeline:2,createdAt:at});
  const ready=crypto.randomUUID(),failed=crypto.randomUUID();
  await store.create(key+'/group-attempts/00000/00000.json',{id:ready,createdAt:at});
  await store.create(base+ready+'/meta.json',{id:ready,type:'exercise-part',group:{parentId:id,index:0,attempt:0},status:'queued',createdAt:at,deadline:at+600000});
  await store.create(base+ready+'/result.json',{status:'ready',model:'unit',provider:'test',sheet:{title:'组一',objective:request.focus,questions:[question(1),question(2),question(3)]}});
  await store.create(base+ready+'/progress.json',{sequence:1,phase:'ready',heartbeatAt:at,receivedAt:at});
  await store.create(key+'/group-attempts/00001/00000.json',{id:failed,createdAt:at});
  await store.create(base+failed+'/meta.json',{id:failed,type:'exercise-part',group:{parentId:id,index:1,attempt:0},status:'queued',createdAt:at,deadline:at+600000});
  await store.create(base+failed+'/result.json',{status:'failed',error:'MODEL_CONNECTION_LOST',failureDetail:'上游连接中断',finishedAt:at});
  await store.create(base+failed+'/progress.json',{sequence:2,phase:'failed',heartbeatAt:at,receivedAt:at});
  const response=await call('/jobs/'+id+'/resume',{}),body=await response.json();
  assert.equal(response.status,202);
  assert.equal(body.id,id);assert.equal(body.status,'running');
  assert.equal(body.groupIndex,2);assert.equal(body.groupCount,2);assert.equal(body.completedQuestions,3);assert.equal(body.groupRevision,7);
  assert.equal(body.sheet,undefined);assert.equal(body.progress,undefined);assert.equal(body.draft,undefined);
  assert(JSON.stringify(body).length<600);
  const record={status:'failed',resumeAvailable:false};
  assert.equal(mergeJobSnapshot(record,body),true);
  assert.equal(record.status,'running');assert.equal(record.groupIndex,2);assert.equal(record.completedQuestions,3);
 });
});

test('resume保留图示恢复标志：需重新生图时不自动续跑也不丢状态',async()=>{
 await withServer(async({store,owner,call})=>{
  const at=Date.now(),id=crypto.randomUUID(),key='jobs/'+owner+'/'+id,base=key.slice(0,key.lastIndexOf('/')+1);
  await store.create(key+'/meta.json',{id,type:'figure-refresh',input:{sourceId:crypto.randomUUID(),questionId:1},sourceRequest:request,generation:profile,imageGeneration:profile,figureGeneration:profile,createdAt:at,deadline:at+600000});
  await store.create(key+'/figure-manifest.json',{version:1,questions:[1],input:request,generation:profile,imageGeneration:profile,figureGeneration:profile,refresh:true,sourceId:crypto.randomUUID(),createdAt:at});
  await store.create(key+'/figure-attempts/1/000000.json',{feedback:[],createdAt:at});
  const diagram={kind:'illustration',caption:'图',description:'说明',image:{mime:'image/png',data:'AAA'}};
  for(const [stage,result] of [['plan',{status:'ready',diagram,model:'unit'}],['render',{status:'ready',diagram,model:'unit'}],['review',{status:'ready',approved:false,issues:['图中标注与题干不符'],contentIssues:[],layoutNotes:[],reviewScope:'pixels',model:'unit'}]]){
   const child=base+figureId(key,1,0,stage);
   await store.create(child+'/meta.json',{id:child.split('/').at(-1),type:'figure-step',figure:{parentId:id,questionId:1,attempt:0,stage,feedback:[]},status:'queued',createdAt:at,deadline:at+600000});
   await store.create(child+'/result.json',result);
  }
  const response=await call('/jobs/'+id+'/resume',{}),body=await response.json();
  assert.equal(response.status,202);
  assert.equal(body.status,'failed');assert.equal(body.requiresImageRegeneration,true);assert.equal(body.resumeAvailable,true);
  assert.equal(body.figurePipeline,true);assert.equal(body.figureStage,'review');assert.equal(body.figureQuestion,1);assert.equal(body.figureFailureCode,'FIGURE_REVIEW_FAILED');
  assert.equal(body.figureCompleted,0);assert.equal(body.figureTotal,1);assert.equal(body.sheet,undefined);assert.equal(body.progress,undefined);
  assert(JSON.stringify(body).length<4000);
  const record={status:'failed',requiresImageRegeneration:false,resumeAvailable:false,figurePipeline:false};
  assert.equal(mergeJobSnapshot(record,body),true);
  assert.equal(record.requiresImageRegeneration,true);assert.equal(record.resumeAvailable,true);assert.equal(record.figurePipeline,true);assert.equal(record.figureStage,'review');
  assert.equal(await store.get(key+'/figure-attempts/1/000001.json'),null,'未确认重新生图时不得自动进入下一次付费绘图');
 });
});

test('images路由同时服务题组图片与顶层续绘图，并保持删除校验',async()=>{
 await withServer(async({store,owner,call})=>{
  const at=Date.now(),id=crypto.randomUUID(),key='jobs/'+owner+'/'+id;
  await store.create(key+'/meta.json',{id,type:'figure-refresh',createdAt:at,deadline:at+600000});
  await store.create(key+'/result.json',{status:'ready',questionId:2,diagram:{kind:'illustration',caption:'图',image:{mime:'image/png',data:'top-level'}}});
  const ok=await call('/jobs/'+id+'/images/2'),payload=await ok.json();
  assert.equal(ok.status,200);assert.deepEqual(payload.image,{mime:'image/png',data:'top-level'});
  assert.equal((await call('/jobs/'+id+'/images/1')).status,404);
  await store.create(key+'/removed.json',{removedAt:at});
  assert.equal((await call('/jobs/'+id+'/images/2')).status,410);
 });
});
