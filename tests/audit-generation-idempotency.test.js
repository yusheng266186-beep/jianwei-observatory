import test from 'node:test';import assert from 'node:assert/strict';import crypto from 'node:crypto';
import storeModule from '../backend/store.cjs';import serverModule from '../backend/server.cjs';import totp from '../backend/totp.cjs';import tencent from '../backend/tencent.cjs';
const {MemoryStore}=storeModule,{createServer}=serverModule,{hash}=tencent;
const seed=totp.encodeSecret(Buffer.from('12345678901234567890'));
const request={subject:'生物',grade:'高三',curriculum:'细胞结构',focus:'细胞器',count:3,minutes:15,difficulty:'基础巩固',evidence:[],visuals:'hybrid'};
const question=id=>({id,level:id===1?'基础':'巩固',type:'填空',stem:'第'+id+'题：写出细胞器的名称。',choices:[],answer:'线粒体',analysis:'依据细胞结构作答。',points:['名称正确'],maxScore:5,minutes:5,diagram:{kind:'illustration',caption:'细胞结构',description:'匿名细胞结构示意'}});
const sheet=()=>({title:'匿名练习',objective:'核对幂等',questions:[1,2,3].map(question)});
async function context(){
 const store=new MemoryStore(),dispatched=[],env={TRAINING_SESSION_SECRET:'audit-idem-'+crypto.randomBytes(32).toString('hex'),TRAINING_TOTP_SECRET:seed,TRAINING_ORIGINS:'https://school.test',TRAINING_DAILY_LIMIT:'80'},app=createServer({store,env,dispatch:async key=>dispatched.push(key)});
 await new Promise(resolve=>app.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+app.address().port;let token='';
 const call=async(path,{body,id}={})=>{const response=await fetch(base+path,{method:body?'POST':'GET',headers:{Origin:'https://school.test','Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{}),...(id?{'X-Request-ID':id}:{})},body:body?JSON.stringify(body):undefined});return {status:response.status,data:await response.json()};};
 token=(await call('/session',{body:{code:totp.codeForCounter(seed,Math.floor(Date.now()/30000))}})).data.token;
 const sourceId=crypto.randomUUID(),sourceKey='jobs/'+hash(env.TRAINING_SESSION_SECRET).slice(0,32)+'/'+sourceId;
 await store.create(sourceKey+'/meta.json',{id:sourceId,type:'exercise',input:request});
 await store.create(sourceKey+'/result.json',{status:'ready',sheet:sheet()});
 return {store,dispatched,app,call,sourceId,owner:hash(env.TRAINING_SESSION_SECRET).slice(0,32)};
}
test('插图按任务状态幂等：原请求重放真实状态，活跃任务复用，失败/过期/移除释放旧锁，显式重绘另起任务',async()=>{
 const {store,dispatched,app,call,sourceId,owner}=await context();
 try{
  assert.equal((await call('/jobs',{body:{...request,count:12,minutes:5},id:crypto.randomUUID()})).status,400);
  const first=crypto.randomUUID(),created=await call('/illustrations',{body:{sourceId,questionId:1},id:first});
  assert.equal(created.status,202);assert.equal(created.data.id,first);assert.equal(created.data.status,'queued');assert.equal(dispatched.length,1);
  const firstKey=dispatched[0];
  await store.create(firstKey+'/result.json',{status:'failed',error:'IMAGE_REQUEST_FAILED',failureDetail:'匿名失败'});
  const replayFailed=await call('/illustrations',{body:{sourceId,questionId:1},id:first});
  assert.equal(replayFailed.data.status,'failed');assert.equal(replayFailed.data.error,'IMAGE_REQUEST_FAILED');assert.equal(dispatched.length,1);

  const second=crypto.randomUUID(),retry=await call('/illustrations',{body:{sourceId,questionId:1},id:second});
  assert.equal(retry.data.id,second);assert.equal(retry.data.status,'queued');assert.equal(dispatched.length,2);
  const secondKey=dispatched[1];
  await store.create(secondKey+'/run.json',{startedAt:Date.now(),deadlineAt:Date.now()+450000});
  const active=await call('/illustrations',{body:{sourceId,questionId:1},id:crypto.randomUUID()});
  assert.equal(active.data.id,second);assert.equal(active.data.status,'running');assert.equal(dispatched.length,2);

  await store.create(secondKey+'/result.json',{status:'ready',image:{mime:'image/png',data:'AA=='}});
  const replayReady=await call('/illustrations',{body:{sourceId,questionId:1},id:second});
  assert.equal(replayReady.data.status,'ready');
  const reuse=await call('/illustrations',{body:{sourceId,questionId:1},id:crypto.randomUUID()});
  assert.equal(reuse.data.id,second);assert.equal(reuse.data.status,'ready');assert.equal(dispatched.length,2);

  const redraw=await call('/illustrations',{body:{sourceId,questionId:1,redraw:true},id:crypto.randomUUID()});
  assert.equal(redraw.data.status,'queued');assert.notEqual(redraw.data.id,second);assert.equal(dispatched.length,3);
  const redrawId=redraw.data.id;
  const doubleClick=await call('/illustrations',{body:{sourceId,questionId:1,redraw:true},id:crypto.randomUUID()});
  assert.equal(doubleClick.data.id,redrawId);assert.equal(dispatched.length,3);

  await store.create('jobs/'+owner+'/'+redrawId+'/removed.json',{removedAt:Date.now()});
  const afterRemove=await call('/illustrations',{body:{sourceId,questionId:1},id:crypto.randomUUID()});
  assert.equal(afterRemove.status,202);assert.notEqual(afterRemove.data.id,redrawId);assert.equal(dispatched.length,4);

  const expiredId=afterRemove.data.id,expiredKey=dispatched.at(-1);
  await store.create(expiredKey+'/run.json',{startedAt:Date.now()-600000,deadlineAt:Date.now()-1000});
  const afterExpired=await call('/illustrations',{body:{sourceId,questionId:1},id:crypto.randomUUID()});
  assert.equal(afterExpired.status,202);assert.notEqual(afterExpired.data.id,expiredId);assert.equal(dispatched.length,5);

  assert.equal((await call('/illustrations',{body:{sourceId,questionId:1,redraw:'yes'},id:crypto.randomUUID()})).status,400);
 }finally{await new Promise(resolve=>app.close(resolve));}
});
test('同源同题图形双击只派发一个任务，完成后的重复提交在窗口内幂等，显式重绘可区分',async()=>{
 const {store,dispatched,app,call,sourceId,owner}=await context();
 try{
  const ids=[crypto.randomUUID(),crypto.randomUUID()],responses=await Promise.all(ids.map(id=>call('/figures',{body:{sourceId,questionId:1},id})));
  assert(responses.every(response=>response.status===202));assert.equal(responses[0].data.id,responses[1].data.id);assert.equal(dispatched.length,1);
  const jobId=responses[0].data.id,key='jobs/'+owner+'/'+jobId;
  const replay=await call('/figures',{body:{sourceId,questionId:1},id:ids[0]});
  assert.equal(replay.data.id,jobId);assert.equal(replay.data.status,'queued');

  await store.create(key+'/result.json',{status:'ready',diagram:{kind:'illustration',caption:'匿名图',description:'匿名示意'}});
  const duplicate=await call('/figures',{body:{sourceId,questionId:1},id:crypto.randomUUID()});
  assert.equal(duplicate.data.id,jobId);assert.equal(duplicate.data.status,'ready');assert.equal(dispatched.length,1);

  const redrawRequestId=crypto.randomUUID(),redraw=await call('/figures',{body:{sourceId,questionId:1,redraw:true},id:redrawRequestId});
  assert.equal(redraw.data.status,'queued');assert.notEqual(redraw.data.id,jobId);assert.equal(dispatched.length,2);
  const clicks=await Promise.all([crypto.randomUUID(),crypto.randomUUID()].map(id=>call('/figures',{body:{sourceId,questionId:1,redraw:true},id})));
  assert.equal(clicks[0].data.id,redraw.data.id);assert.equal(clicks[1].data.id,redraw.data.id);assert.equal(dispatched.length,2);

  await store.create('jobs/'+owner+'/'+redraw.data.id+'/progress.json',{phase:'failed',figureStage:{status:'failed',error:'FIGURE_PLAN_FAILED'}});
  const failedReplay=await call('/figures',{body:{sourceId,questionId:1,redraw:true},id:redrawRequestId});
  assert.equal(failedReplay.data.status,'failed');assert.equal(failedReplay.data.error,'FIGURE_PLAN_FAILED');
  const retry=await call('/figures',{body:{sourceId,questionId:1,redraw:true},id:crypto.randomUUID()});
  assert.notEqual(retry.data.id,redraw.data.id);assert.equal(retry.data.status,'queued');assert.equal(dispatched.length,3);
 }finally{await new Promise(resolve=>app.close(resolve));}
});

test('额度为1时图示并发提交只保留一个计费名额，拒绝后清零可以立即重试',async()=>{
 const {app,call,dispatched,sourceId}=await context();
 try{
  const before=await call('/admin/usage');assert.equal(before.data.used,0);
  assert.equal((await call('/admin/usage',{body:{expectedRevision:before.data.revision,limit:1}})).status,200);
  const replies=await Promise.all([1,2].map(()=>call('/figures',{body:{sourceId,questionId:1},id:crypto.randomUUID()})));
  assert(replies.every(r=>r.status===202));assert.equal(replies[0].data.id,replies[1].data.id);assert.equal(dispatched.length,1);
  const used=await call('/admin/usage');assert.equal(used.data.used,1);
  const denied=await call('/figures',{body:{sourceId,questionId:2},id:crypto.randomUUID()});assert.equal(denied.status,429);assert.equal(denied.data.error,'DAILY_LIMIT');
  await call('/admin/usage',{body:{expectedRevision:used.data.revision,limit:1,reset:true}});
  const retry=await call('/figures',{body:{sourceId,questionId:2},id:crypto.randomUUID()});assert.equal(retry.status,202);assert.equal(retry.data.status,'queued');assert.equal(dispatched.length,2);
  assert.equal((await call('/admin/usage')).data.used,1);
 }finally{await new Promise(resolve=>app.close(resolve));}
});
