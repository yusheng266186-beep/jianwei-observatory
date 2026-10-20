import test from 'node:test';import assert from 'node:assert/strict';import crypto from 'node:crypto';
import storeModule from '../backend/store.cjs';import serverModule from '../backend/server.cjs';import worker from '../backend/worker.cjs';import totp from '../backend/totp.cjs';
const {MemoryStore}=storeModule,{createServer}=serverModule,secret='test-only-'+crypto.randomBytes(24).toString('hex');
const env={TRAINING_SESSION_SECRET:secret,TRAINING_TOTP_SECRET:totp.encodeSecret(Buffer.from('12345678901234567890')),TRAINING_ORIGINS:'https://school.test',TRAINING_DAILY_LIMIT:'2'};
const input={subject:'数学',grade:'高三',curriculum:'已学函数与导数',focus:'求导与单调性',count:3,minutes:15,difficulty:'基础巩固',evidence:[]};
const readySheet=title=>({title,objective:'函数代入',questions:[1,2,3].map(id=>({id,level:id===1?'基础':'巩固',type:'填空',stem:'已知 $f(x)=x^2$，求 $f('+id+')$。',choices:[],answer:String(id*id),analysis:'代入并计算平方。',points:['计算正确得5分。'],maxScore:5,minutes:5}))});
async function runReviews(store,now=Date.now){for(const k of [...store.data.keys()].filter(k=>k.endsWith('/meta.json'))){if((await store.get(k)).value.type==='content-review')await worker.run({key:k.slice(0,-10)},{store,now,contentReviewer:async sheet=>({sheet,changes:[],notes:[]})});}}

test('教师验证、跨域边界、匿名请求、并发额度、重复ID、断线重查与任务隔离',async()=>{const store=new MemoryStore(),dispatched=[],server=createServer({store,env,dispatch:async key=>dispatched.push(key)});await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;let token='';const call=(path,{method='GET',body,id,origin='https://school.test',auth=true}={})=>fetch(base+path,{method,headers:{Origin:origin,'Content-Type':'application/json',...(auth&&token?{Authorization:'Bearer '+token}:{}),...(id?{'X-Request-ID':id}:{})},...(body?{body:JSON.stringify(body)}:{})});try{
 assert.equal((await call('/jobs/'+crypto.randomUUID())).status,401);assert.equal((await call('/health',{origin:'https://evil.test'})).status,403);assert.equal((await call('/session',{method:'POST',body:{code:'wrong'}})).status,401);
 const session=await call('/session',{method:'POST',body:{code:totp.codeForCounter(env.TRAINING_TOTP_SECRET,Math.floor(Date.now()/30000))}});token=(await session.json()).token;assert(token);
 const id=crypto.randomUUID();assert.equal((await call('/jobs',{method:'POST',body:{...input,sid:'private'},id})).status,400);
 const all=await Promise.all(Array.from({length:8},()=>call('/jobs',{method:'POST',body:input,id})));assert(all.every(r=>r.status===202));assert.equal([...store.data.keys()].filter(k=>k.startsWith('budget/')).length,1);
 assert.equal((await call('/jobs',{method:'POST',body:{...input,focus:'不同目标'},id})).status,409);
 const key=dispatched[0],job=await(await call('/jobs/'+id)).json();assert.equal(job.status,'queued');assert(Number.isFinite(job.createdAt));assert(Number.isFinite(job.serverTime));assert(Number.isFinite(job.deadlineAt));assert(!('input' in job));let calls=0;const generator=async()=>{calls++;await new Promise(r=>setTimeout(r,15));return {sheet:readySheet('已生成'),model:'gemini-3.8-flash'};};await Promise.all(Array.from({length:12},()=>worker.run({key},{store,generator})));assert.equal(calls,1);await runReviews(store);const completed=await(await call('/jobs/'+id)).json();assert.equal(completed.status,'ready');assert(completed.startedAt>=job.createdAt);assert(completed.finishedAt>=completed.startedAt);
 const ids=[crypto.randomUUID(),crypto.randomUUID(),crypto.randomUUID()],responses=await Promise.all(ids.map(id=>call('/jobs',{method:'POST',body:input,id})));assert.equal(responses.filter(r=>r.status===202).length,1);assert.equal(responses.filter(r=>r.status===429).length,2);assert.equal([...store.data.keys()].filter(k=>k.startsWith('budget/')).length,2);
 const invalid=await call('/jobs/not-valid');assert.equal(invalid.status,404);
 }finally{await new Promise(r=>server.close(r));}});
test('生成失败保存独立失败结果，重放事件不会再次调用模型，也不泄露上游错误信息',async()=>{const store=new MemoryStore(),key='jobs/'+'a'.repeat(32)+'/'+crypto.randomUUID();await store.create(key+'/meta.json',{input,deadline:Date.now()+60000});let calls=0;const generator=async()=>{calls++;throw new Error('private upstream response and credentials');};await worker.run({key},{store,generator});await worker.run({key},{store,generator});assert.equal(calls,1);const result=(await store.get(key+'/result.json')).value;assert.equal(result.error,'GENERATION_FAILED');assert(!JSON.stringify(result).includes('private'));});
test('COS通知只接收本任务meta对象，结果对象和重放通知不会重复调用模型',async()=>{const store=new MemoryStore(),key='jobs/'+'a'.repeat(32)+'/'+crypto.randomUUID();await store.create(key+'/meta.json',{input,deadline:Date.now()+60000});let calls=0;const generator=async()=>{calls++;return {sheet:{title:'完成'}};};const record=file=>({cos:{cosObject:{key:'/1459223409/jianwei-training-dev/training-v1/'+key+'/'+file}},event:{eventSource:'qcs::cos',eventName:'cos:ObjectCreated:Put'}});await worker.handle({Records:[record('meta.json'),record('run.json'),record('result.json'),record('meta.json')]},{store,generator});assert.equal(calls,1);});

test('模型失败的具体诊断单独保存在私有任务对象，不进入可显示的任务结果，事件重放不重试模型',async()=>{const store=new MemoryStore(),key='jobs/'+'a'.repeat(32)+'/'+crypto.randomUUID();await store.create(key+'/meta.json',{input,deadline:Date.now()+60000});let calls=0;const generator=async()=>{calls++;throw Object.assign(new Error('MODEL_CONTENT_INVALID'),{cause:new Error('第2题的题型不符合所选题型。'),output:'{"privateDraft":true}'});};await worker.run({key},{store,generator});await worker.run({key},{store,generator});assert.equal(calls,1);const result=(await store.get(key+'/result.json')).value,diagnostic=(await store.get(key+'/diagnostic.json')).value;assert.equal(result.error,'MODEL_CONTENT_INVALID');assert(!JSON.stringify(result).includes('privateDraft'));assert.match(diagnostic.validation,/第2题/);assert.equal(diagnostic.raw,'{"privateDraft":true}');});

test('浏览器离开及API重开不会取消已接收的云端任务，原编号重放不再出题',async()=>{
 const store=new MemoryStore();let release,started,calls=0,work;const running=new Promise(r=>started=r),gate=new Promise(r=>release=r),dispatch=async key=>{work=worker.run({key},{store,contentReviewer:async sheet=>({sheet,changes:[],notes:[]}),generator:async()=>{calls++;started();await gate;return {sheet:readySheet('离线期间完成')};}});};
 let server=createServer({store,env,dispatch});await new Promise(r=>server.listen(0,'127.0.0.1',r));let base='http://127.0.0.1:'+server.address().port,token='';const call=(url,{method='GET',body,id}={})=>fetch(base+url,{method,headers:{Origin:'https://school.test','Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{}),...(id?{'X-Request-ID':id}:{})},...(body?{body:JSON.stringify(body)}:{})});
 try{token=(await(await call('/session',{method:'POST',body:{code:totp.codeForCounter(env.TRAINING_TOTP_SECRET,Math.floor(Date.now()/30000))}})).json()).token;const id=crypto.randomUUID();assert.equal((await call('/jobs',{method:'POST',body:input,id})).status,202);await running;assert.equal((await(await call('/jobs/'+id)).json()).status,'running');await new Promise(r=>server.close(r));release();await work;await runReviews(store);
 server=createServer({store,env,dispatch});await new Promise(r=>server.listen(0,'127.0.0.1',r));base='http://127.0.0.1:'+server.address().port;const recovered=await(await call('/jobs/'+id)).json();assert.equal(recovered.status,'ready');assert(recovered.startedAt<=recovered.finishedAt);assert.equal((await call('/jobs',{method:'POST',body:input,id})).status,202);assert.equal(calls,1);
 }finally{release();await work;await new Promise(r=>server.close(r));}
});

test('Kimi任务保存接收时的模型配置，八分钟仍可查询，不沿用旧模型的短超时或重复调用',async()=>{
 const store=new MemoryStore(),dispatched=[];let at=Date.now(),release,started,calls=0;
 const server=createServer({store,env:{...env,TRAINING_PROVIDER:'kimi-platform'},now:()=>at,dispatch:async key=>dispatched.push(key)});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;let token='',work;
 const call=(path,{method='GET',body,id}={})=>fetch(base+path,{method,headers:{Origin:'https://school.test','Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{}),...(id?{'X-Request-ID':id}:{})},...(body?{body:JSON.stringify(body)}:{})});
 const gate=new Promise(r=>release=r),running=new Promise(r=>started=r);
 try{
  assert.equal((await(await call('/health')).json()).model,'kimi-k3');
  token=(await(await call('/session',{method:'POST',body:{code:totp.codeForCounter(env.TRAINING_TOTP_SECRET,Math.floor(at/30000))}})).json()).token;
  const id=crypto.randomUUID();assert.equal((await call('/jobs',{method:'POST',body:input,id})).status,202);
  const key=dispatched[0],meta=(await store.get(key+'/meta.json')).value;assert.equal(meta.generation.provider,'kimi-platform');assert.equal(meta.generation.reasoningEffort,'max');
  work=worker.run({key},{store,now:()=>at,generator:async(request,options)=>{calls++;assert.equal(options.provider,'kimi-platform');started();await gate;return {sheet:readySheet('完成'),model:'kimi-k3'};}});await running;
  at+=8*60000;const snapshot=await(await call('/jobs/'+id)).json();assert.equal(snapshot.status,'running');assert.equal(snapshot.model,'kimi-k3');assert(snapshot.deadlineAt>at);
  assert.equal((await call('/jobs',{method:'POST',body:input,id})).status,202);assert.equal(calls,1);
  release();await work;await runReviews(store,()=>at);assert.equal((await(await call('/jobs/'+id)).json()).status,'ready');
 }finally{release();await work;await new Promise(r=>server.close(r));}
});
