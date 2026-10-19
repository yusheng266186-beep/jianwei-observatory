import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import stores from '../backend/store.cjs';
import worker from '../backend/worker.cjs';
import delivery from '../backend/result-delivery.cjs';
import repair from '../backend/format-repair.cjs';
import pipeline from '../backend/figure-pipeline.cjs';
import {generationActivity,generationPhase} from '../app/ui/exercise-progress.js';
const sheet={title:'保存故障测试',objective:'函数',questions:[]};
const profile={provider:'test',model:'unit',reasoningEffort:'high',timeoutMs:1000};
const repairRequest={subject:'数学',grade:'高三',curriculum:'已学函数与导数',focus:'单调性',count:3,minutes:15,difficulty:'基础巩固',targets:['单调性'],questionTypes:['填空'],visuals:'none',evidence:[]};
const repairSheet=()=>({title:'函数练习',objective:'单调性',questions:Array.from({length:3},(_,i)=>({id:i+1,level:i?'巩固':'基础',type:'填空',target:'单调性',stem:'已知 $f(x)=x^2$，求 $f('+i+')$ 的值。',choices:[],answer:'$'+i*i+'$',analysis:'将自变量代入函数解析式得结果。',points:['正确得5分。'],maxScore:5,minutes:5}))});
async function context(){const store=new stores.MemoryStore(),key='jobs/'+'a'.repeat(32)+'/'+crypto.randomUUID(),at=Date.now(),job={type:'exercise',input:{count:3},createdAt:at,deadline:at+600000};await store.create(key+'/meta.json',job);return {store,key,job,now:()=>at};}
test('完整成稿首次写入失败重试存储，模型只调用一次',async()=>{
 const c=await context(),create=c.store.create.bind(c.store);let calls=0,writes=0;
 c.store.create=async(k,v)=>{if(k===c.key+'/result.json'&&++writes===1)throw Error('STORE_UNAVAILABLE');return create(k,v);};
 const generator=async()=>{calls++;return {sheet};};
 await worker.run({key:c.key},{...c,generator});await worker.run({key:c.key},{...c,generator});
 assert.equal(calls,1);assert.equal(writes,2);assert.equal((await c.store.get(c.key+'/result.json')).value.status,'ready');
});
test('持续保存故障保留私有成稿，事件晚于原截止仍能交付，不重发模型',async()=>{
 const c=await context(),create=c.store.create.bind(c.store);let outage=true,calls=0;
 c.store.create=async(k,v)=>{if(k===c.key+'/result.json'&&outage)throw Error('STORE_UNAVAILABLE');return create(k,v);};
 const generator=async()=>{calls++;return {sheet};};
 await assert.rejects(worker.run({key:c.key},{...c,generator}),/RESULT_SAVE_PENDING/);
 assert.equal(await c.store.get(c.key+'/result.json'),null);assert.equal((await c.store.get(c.key+'/delivery-candidate.json')).value.result.sheet.title,sheet.title);
 const pending=await delivery.recover(c.store,c.key,c.job,{wait:async()=>{}});assert.equal(pending.deliveryPending,true);
 outage=false;await worker.run({key:c.key},{...c,now:()=>c.job.deadline+100000,generator});
 assert.equal(calls,1);assert.equal((await c.store.get(c.key+'/result.json')).value.status,'ready');
});
test('存储已写入但ACK中断，读回相同内容即可确认，不覆盖与不重复计费',async()=>{
 const c=await context(),create=c.store.create.bind(c.store);let calls=0;
 c.store.create=async(k,v)=>{const result=await create(k,v);if(result&&/delivery-candidate|result\.json/.test(k))throw Error('ECONNRESET');return result;};
 await worker.run({key:c.key},{...c,generator:async()=>{calls++;return {sheet};}});
 assert.equal(calls,1);assert.equal((await c.store.get(c.key+'/result.json')).value.status,'ready');
});
test('删除父任务后，恢复私有候选稿也不会发布成稿',async()=>{
 const c=await context();await delivery.checkpoint(c.store,c.key,c.job,{sheet,status:'ready',finishedAt:1});await c.store.create(c.key+'/removed.json',{});
 assert.equal(await delivery.recover(c.store,c.key,c.job),null);assert.equal(await c.store.get(c.key+'/result.json'),null);
});
test('图示子任务存储失败可复用完成的模型结果，run锁不导致永久丢稿',async()=>{
 const c=await context(),id=c.key.split('/').at(-1),child=c.key.slice(0,c.key.lastIndexOf('/')+1)+crypto.randomUUID(),q={id:1,stem:'已知三角形。',figureRequest:{caption:'三角形'}};
 await c.store.create(c.key+'/figure-manifest.json',{questions:[1],input:{subject:'数学'},generation:{model:'unit'},figureGeneration:{model:'unit'}});await c.store.create(c.key+'/text-result.json',{sheet:{questions:[q]}});
 const job={type:'figure-step',figure:{parentId:id,questionId:1,attempt:0,stage:'plan'},generation:{model:'unit'}};
 const create=c.store.create.bind(c.store);let outage=true,calls=0;c.store.create=async(k,v)=>{if(k===child+'/result.json'&&outage)throw Error('STORE_UNAVAILABLE');return create(k,v);};
 const planner=async()=>{calls++;return {diagram:{kind:'drawing',caption:'图',description:'三角形',scene:[]}};};
 await assert.rejects(pipeline.runStep(c.store,child,job,{planner}),/RESULT_SAVE_PENDING/);outage=false;
 await pipeline.runStep(c.store,child,job,{planner});assert.equal(calls,1);assert.equal((await c.store.get(child+'/result.json')).value.status,'ready');
});
test('保存状态明确告诉教师无需重新出题',()=>{
 const record={status:'running',progress:{phase:'saving',receivedAt:Date.now(),heartbeatAt:Date.now()}};
 assert.match(generationPhase(record),/保存/);assert.match(generationActivity(record),/无需重新出题/);
});
test('COS JSON往返移除undefined后不误报冲突，lost ACK回读确认',async()=>{
 const c=await context(),originalCreate=c.store.create.bind(c.store),originalGet=c.store.get.bind(c.store),json=value=>value===undefined?undefined:JSON.parse(JSON.stringify(value));
 c.store.create=async(k,v)=>originalCreate(k,json(v));c.store.get=async k=>{const saved=await originalGet(k);return saved?{...saved,value:json(saved.value)}:null;};
 const lost=new Set([c.key+'/delivery-candidate.json',c.key+'/result.json']);c.store.create=async(k,v)=>{const result=await originalCreate(k,json(v));if(lost.delete(k))throw Error('ECONNRESET');return result;};
 const result={sheet,status:'ready',finishedAt:1,output:undefined,usage:{input:1,output:undefined}};
 await delivery.save(c.store,c.key,c.job,result);
 const saved=(await c.store.get(c.key+'/result.json')).value;
 assert.equal('output' in saved,false);assert.equal('output' in saved.usage,false);
 await assert.doesNotReject(delivery.save(c.store,c.key,c.job,result));
 assert.equal((await delivery.recover(c.store,c.key,c.job)).status,'ready');
});
test('保存暂时失败先写saving状态，不写泛化失败结果',async()=>{
 const c=await context(),create=c.store.create.bind(c.store);
 c.store.create=async(k,v)=>{if(k===c.key+'/result.json')throw Error('STORE_UNAVAILABLE');return create(k,v);};
 await assert.rejects(worker.run({key:c.key},{...c,generator:async()=>({sheet})}),/RESULT_SAVE_PENDING/);
 assert.equal((await c.store.get(c.key+'/progress.json')).value.phase,'saving');
 assert.equal(await c.store.get(c.key+'/result.json'),null);
 assert((await c.store.get(c.key+'/delivery-candidate.json')).value.result);
});
test('写入候选后父图示任务删除，回读确认也不发布',async()=>{
 const c=await context(),parent=crypto.randomUUID(),job={...c.job,type:'figure-step',figure:{parentId:parent,questionId:1,attempt:0,stage:'plan'}},create=c.store.create.bind(c.store);let injected=false;
 c.store.create=async(k,v)=>{const result=await create(k,v);if(!injected&&k===c.key+'/delivery-candidate.json'){injected=true;await create(c.key.slice(0,c.key.lastIndexOf('/')+1)+parent+'/removed.json',{});throw Error('ECONNRESET');}return result;};
 await assert.rejects(delivery.save(c.store,c.key,job,{sheet,status:'ready',finishedAt:1}),/JOB_CANCELLED/);
 assert.equal(await c.store.get(c.key+'/result.json'),null);
});
test('父图示任务删除后恢复候选也不发布',async()=>{
 const c=await context(),parent=crypto.randomUUID(),job={...c.job,type:'figure-step',figure:{parentId:parent,questionId:1,attempt:0,stage:'plan'}};
 await delivery.checkpoint(c.store,c.key,job,{sheet,status:'ready',finishedAt:1});
 await c.store.create(c.key.slice(0,c.key.lastIndexOf('/')+1)+parent+'/removed.json',{});
 assert.equal(await delivery.recover(c.store,c.key,job),null);assert.equal(await c.store.get(c.key+'/result.json'),null);
});
test('格式修复成功稿存储暂时失败保持pending，恢复只提交候选并推进父状态',async()=>{
 const store=new stores.MemoryStore(),key='jobs/'+'b'.repeat(32)+'/'+crypto.randomUUID(),at=Date.now(),queue=[],now=()=>at,job={id:key.split('/').at(-1),type:'exercise',input:repairRequest,generation:profile,repairGeneration:profile,repairAttempts:1,pipeline:2,createdAt:at,deadline:at+600000};
 await store.create(key+'/meta.json',job);
 const source=JSON.stringify(repairSheet()),error=Object.assign(Error('MODEL_CONTENT_INVALID'),{cause:Error('模型在JSON正文前夹带说明文字。'),output:'说明。'+source,diagnostic:{kind:'document',completeSignal:true}});
 assert.equal(await repair.begin(store,key,job,error,{now,dispatch:async k=>queue.push(k)}),true);
 const child=queue.shift(),create=store.create.bind(store);let outage=true,calls=0;
 store.create=async(k,v)=>{if(k===child+'/result.json'&&outage)throw Error('STORE_UNAVAILABLE');return create(k,v);};
 const repairer=async()=>{calls++;return {sheet:repairSheet(),model:'unit',provider:'test',usage:{input:1,output:1}};};
 await assert.rejects(worker.run({key:child},{store,now,dispatch:async k=>queue.push(k),repairer}),/RESULT_SAVE_PENDING/);
 assert.equal(calls,1);assert.equal(await store.get(child+'/result.json'),null);
 assert.equal((await store.get(child+'/progress.json')).value.phase,'saving');assert(await store.get(child+'/delivery-candidate.json'));
 outage=false;
 const recovered=await repair.snapshot(store,key,{now,dispatch:async k=>queue.push(k)});
 assert.equal(recovered.status,'ready');assert.equal(calls,1);assert.equal((await store.get(key+'/result.json')).value.status,'ready');
 const second=await worker.run({key:child},{store,now,dispatch:async k=>queue.push(k),repairer:async()=>{assert.fail('恢复不能再次调用模型');}});
 assert.equal(second.recovered,true);assert.equal(calls,1);assert.equal((await store.get(child+'/result.json')).value.status,'ready');assert.equal((await store.get(key+'/result.json')).value.status,'ready');
});
test('worker恢复stagefigures候选后推进图示流程且不重新出题',async()=>{
 const store=new stores.MemoryStore(),key='jobs/'+'c'.repeat(32)+'/'+crypto.randomUUID(),at=Date.now(),input={subject:'数学',grade:'高三',curriculum:'函数',focus:'图像',count:1,minutes:5,difficulty:'基础起步',visuals:'vector',evidence:[]},question={id:1,level:'基础',type:'填空',stem:'图像如图所示。',choices:[],answer:'1',analysis:'略。',points:['5分。'],maxScore:5,minutes:5,figureRequest:{caption:'图像',requirements:'画出图像。',knownData:'x>0',labels:['x'],precision:'exact',placement:{after:'图像如图所示。',width:'standard',aspect:'wide'}}},sheet={title:'练习',objective:'图像',questions:[question]},job={type:'exercise',pipeline:2,input,generation:profile,figureGeneration:profile,imageGeneration:profile,createdAt:at,deadline:at+600000};
 await store.create(key+'/meta.json',job);await delivery.checkpoint(store,key,job,{sheet,status:'ready',finishedAt:1},{stage:'figures'});
 const queue=[],outcome=await worker.run({key},{store,now:()=>at,dispatch:async k=>queue.push(k),generator:async()=>{assert.fail('不能重新出题');}});
 assert.equal(outcome.recovered,true);assert.equal(outcome.pending,true);assert(await store.get(key+'/figure-manifest.json'));assert(queue.length>0);
});
test('worker恢复figurestep候选后推进父图示，不递归执行自身',async()=>{
 const store=new stores.MemoryStore(),key='jobs/'+'d'.repeat(32)+'/'+crypto.randomUUID(),at=Date.now(),input={subject:'数学',grade:'高三',curriculum:'函数',focus:'图像',count:1,minutes:5,difficulty:'基础起步',visuals:'vector',evidence:[]},question={id:1,level:'基础',type:'填空',stem:'图像如图所示。',choices:[],answer:'1',analysis:'略。',points:['5分。'],maxScore:5,minutes:5,figureRequest:{caption:'图像',requirements:'画出图像。',knownData:'x>0',labels:['x'],precision:'exact',placement:{after:'图像如图所示。',width:'standard',aspect:'wide'}}},queue=[];
 await store.create(key+'/meta.json',{type:'exercise',input,generation:profile,figureGeneration:profile,imageGeneration:profile,pipeline:2,createdAt:at,deadline:at+600000});
 await pipeline.begin(store,key,{type:'exercise',input,generation:profile,figureGeneration:profile,imageGeneration:profile}, {sheet:{title:'练习',objective:'图像',questions:[question]}},{now:()=>at,dispatch:async k=>queue.push(k)});
 const plan=queue.shift(),planJob=(await store.get(plan+'/meta.json')).value;
 await delivery.checkpoint(store,plan,planJob,{status:'ready',diagram:{kind:'drawing',caption:'图',description:'图像',scene:[]},model:'unit',finishedAt:1});
 const next=[],outcome=await worker.run({key:plan},{store,now:()=>at,dispatch:async k=>next.push(k)});
 assert.equal(outcome.recovered,true);assert.equal((await store.get(plan+'/result.json')).value.status,'ready');assert(next.length>0);
 assert.equal((await store.get(next[0]+'/meta.json')).value.figure.stage,'review');
});
