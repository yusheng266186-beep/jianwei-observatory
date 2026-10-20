import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import stores from '../backend/store.cjs';
import worker from '../backend/worker.cjs';
import content from '../backend/content-review.cjs';
import figures from '../backend/figure-pipeline.cjs';
import groups from '../backend/exercise-groups.cjs';
import {solidFigures} from './fixtures/exercise-figures.js';
import {generationPhase,generationStages,generationActivity,exerciseProgressHTML} from '../app/ui/exercise-progress.js';
import {exercisePreviewHTML} from '../app/ui/exercise-preview.js';
const input={subject:'数学',grade:'高三',curriculum:'函数',focus:'函数代入',count:3,minutes:15,difficulty:'基础巩固',targets:['函数代入'],questionTypes:['填空'],visuals:'none',evidence:[]};
const profile={provider:'gemini',model:'gemini-3.8-flash',protocol:'gemini',reasoningEffort:'high',timeoutMs:885000};
const sheet=()=>({title:'函数练习',objective:'函数代入',questions:[1,2,3].map(id=>({id,level:id===1?'基础':'巩固',type:'填空',target:'函数代入',stem:'已知 $f(x)=x^2$，求 $f('+id+')$。',choices:[],answer:String(id*id),analysis:'将自变量代入并计算平方。',points:['计算正确得5分。'],maxScore:5,minutes:5}))});
async function setup(request=input){const store=new stores.MemoryStore(),key='jobs/'+'a'.repeat(32)+'/'+crypto.randomUUID(),queue=[],now=()=>Date.now(),job={id:key.split('/').at(-1),type:'exercise',pipeline:2,contentReview:1,generation:profile,figureGeneration:profile,input:request,createdAt:now(),deadline:now()+600000};await store.create(key+'/meta.json',job);return {store,key,job,queue,now,dispatch:async k=>queue.push(k)};}
const good=async document=>({sheet:document,changes:[],notes:[],model:profile.model,usage:{input:10,output:20}});
async function runNext(c,reviewer=good){const key=c.queue.shift(),job=(await c.store.get(key+'/meta.json')).value;assert.equal(job.type,'content-review');return content.runStep(c.store,key,job,{...c,reviewer});}
test('出题后先独立学科复核，重复查询、重开和事件重投不再调用出题模型',async()=>{
 const c=await setup();let authors=0,reviews=0;const original=sheet();await worker.run({key:c.key},{...c,generator:async()=>{authors++;return {sheet:original,usage:{input:1,output:2},model:profile.model};}});
 assert.equal((await content.snapshot(c.store,c.key,c)).status,'running');assert.equal(await c.store.get(c.key+'/result.json'),null);assert.equal(c.queue.length,1);
 const child=c.queue[0];await runNext(c,async(s,i,o)=>{reviews++;assert.deepEqual(o.generation,profile);assert.deepEqual(s,original);return good(s);});
 const result=await content.snapshot(c.store,c.key,c);assert.equal(result.status,'ready');assert.deepEqual(result.sheet,original);assert.deepEqual(result.usage,{input:11,output:22,thinking:0});assert(result.contentReview);
 await worker.run({key:c.key},{...c,generator:async()=>{throw Error('must not author');}});await worker.run({key:child},{...c,contentReviewer:async()=>{throw Error('must not review');}});assert.equal(authors,1);assert.equal(reviews,1);assert.equal(c.queue.length,0);
});
test('复核207字节后断流不自动重发；人工继续只重试复核且保留最初原稿',async()=>{
 const c=await setup(),original=sheet();await content.begin(c.store,c.key,c.job,{sheet:original},c);let reviews=0;
 await runNext(c,async()=>{reviews++;throw Object.assign(Error('NETWORK_INTERRUPTED'),{diagnostic:{tlsEstablished:true,requestFinished:true,responseHeadersReceived:true,responseBytes:207}});});
 const failure=await content.snapshot(c.store,c.key,c);assert.equal(failure.error,'CONTENT_REVIEW_INTERRUPTED');assert(failure.resumeAvailable);assert.equal(c.queue.length,0);assert.equal(reviews,1);
 await content.resume(c.store,c.key,c);assert.equal(c.queue.length,1);await content.resume(c.store,c.key,c);assert.equal(c.queue.length,1);
 await runNext(c,async s=>{reviews++;assert.deepEqual(s,original);return good(s);});assert.equal((await content.snapshot(c.store,c.key,c)).status,'ready');assert.equal(reviews,2);assert.deepEqual((await c.store.get(c.key+'/content-review-source.json')).value.sheet,original);
});
test('明确学科问题保存为内容审阅意见，不能走格式修复、生成配图或伪装ready',async()=>{
 const c=await setup();await content.begin(c.store,c.key,c.job,{sheet:sheet()},c);
 await runNext(c,async()=>{throw Object.assign(Error('CONTENT_REVIEW_FAILED'),{notes:[{questionId:1,issues:['条件不足，无法唯一求解。']}]});});
 const r=await content.snapshot(c.store,c.key,c);assert.equal(r.status,'failed');assert.match(r.failureDetail,/条件不足/);assert.equal(r.contentReviewNotes[0].questionId,1);assert.equal(c.queue.length,0);assert.equal(await c.store.get(c.key+'/figure-manifest.json'),null);assert.equal(await c.store.get(c.key+'/format-repair.json'),null);
});
test('学科修订显式记录后才开始配图，图示过程保留复核后的题文',async()=>{
 const request={...input,visuals:'vector'},c=await setup(request),original=sheet(),q=original.questions[0];q.figureRequest={caption:'模型示意',requirements:'长方体顶点',knownData:'长3宽2高2',labels:['A','B','C','D','A1','B1','C1','D1'],precision:'exact',placement:{after:q.stem,width:'standard',aspect:'wide'}};
 await content.begin(c.store,c.key,c.job,{sheet:original},c);await runNext(c,async s=>{s.questions[0].analysis='重新核算后，代入结果为1。';return {...await good(s),changes:[{questionId:1,reason:'核对代入步骤。',fields:['analysis']}]};});
 assert.equal((await figures.snapshot(c.store,c.key,c)).status,'running');let n=0;while(c.queue.length){assert(n++<8);const k=c.queue.shift(),j=(await c.store.get(k+'/meta.json')).value;await figures.runStep(c.store,k,j,{...c,planner:async question=>{assert.equal(question.analysis,'重新核算后，代入结果为1。');return {diagram:solidFigures[0]};},reviewer:async()=>({approved:true,issues:[]})});}
 const r=await figures.snapshot(c.store,c.key,c);assert.equal(r.status,'ready');assert.equal(r.contentReview.changes[0].questionId,1);assert.deepEqual((await c.store.get(c.key+'/content-review-source.json')).value.sheet,original);
});
test('学科复核结果保存中断只恢复存储，不重发付费模型；父任务删除阻止恢复',async()=>{
 const c=await setup();await content.begin(c.store,c.key,c.job,{sheet:sheet()},c);const child=c.queue.shift(),job=(await c.store.get(child+'/meta.json')).value,create=c.store.create.bind(c.store);let outage=true,calls=0;
 c.store.create=async(k,v)=>{if(k===child+'/result.json'&&outage)throw Error('STORE_UNAVAILABLE');return create(k,v);};
 await assert.rejects(content.runStep(c.store,child,job,{...c,reviewer:async s=>{calls++;return good(s);}}),/RESULT_SAVE_PENDING/);outage=false;
 await worker.run({key:child},{...c,contentReviewer:async()=>{throw Error('must reuse candidate');}});assert.equal((await content.snapshot(c.store,c.key,c)).status,'ready');assert.equal(calls,1);
 const d=await setup();await content.begin(d.store,d.key,d.job,{sheet:sheet()},d);await d.store.create(d.key+'/removed.json',{});assert.equal((await runNext(d,async()=>{throw Error('must stop');})).cancelled,true);assert.equal(await d.store.get(d.key+'/result.json'),null);
});
test('分组继承学科复核，失败仅继续当前复核，前组和题文不重生成',async()=>{
 const c=await setup({...input,count:6,minutes:30});let authors=0,checks=0;await worker.run({key:c.key},c);
 const drain=async fail=>{let n=0;while(c.queue.length){assert(n++<15);const key=c.queue.shift(),job=(await c.store.get(key+'/meta.json')).value;await worker.run({key},{...c,generator:async()=>{authors++;const s=sheet();for(const q of s.questions)q.stem='第'+authors+'组：'+q.stem;return {sheet:s};},contentReviewer:async s=>{checks++;if(fail&&checks===2)throw Error('NETWORK_INTERRUPTED');return good(s);}});}};
 await drain(true);assert.equal((await groups.snapshot(c.store,c.key,c)).status,'failed');assert.equal(authors,2);assert.equal(checks,2);
 await groups.resume(c.store,c.key,c);assert.equal((await c.store.get(c.queue[0]+'/meta.json')).value.type,'content-review');await drain(false);
 const r=await groups.snapshot(c.store,c.key,c);assert.equal(r.status,'ready');assert.equal(authors,2);assert.equal(checks,3);assert.equal(r.contentReview.groups.length,2);assert.equal(r.sheet.questions.length,6);
});
test('学科复核进度、实时输出和明确修订记录使用现有视觉组件并转义模型文本',async()=>{
 const progress={phase:'content-reviewing',contentStage:{attempt:1,model:'Sol6.1'},contentOutputText:'<script>修订</script>',contentThinkingText:'核对计算',heartbeatAt:Date.now()};
 const record={status:'running',request:input,progress};assert.match(generationPhase(record),/学科条件/);assert.equal(generationStages(record).find(x=>x.state==='is-current').label,'审稿');assert.match(generationActivity(record),/原稿独立保存/);
 const html=await exerciseProgressHTML(record);assert(html.includes('&lt;script&gt;'));assert(!html.includes('<script>'));assert(html.includes('学科复核'));
 const preview=await exercisePreviewHTML({sheet:sheet(),contentReview:{changes:[{questionId:1,reason:'<img>公式错误',fields:['analysis']}]}});assert(preview.includes('学科复核修订'));assert(preview.includes('&lt;img&gt;公式错误'));assert(!preview.includes('<img>公式错误'));
});

test('独立pipeline再次防守适配器返回的未声明改动和题数分值变化',async()=>{for(const mutate of [s=>s.questions.pop(),s=>s.questions[0].maxScore=99,s=>s.questions[0].answer='未声明答案']){const c=await setup();await content.begin(c.store,c.key,c.job,{sheet:sheet()},c);await runNext(c,async s=>{mutate(s);return good(s);});const r=await content.snapshot(c.store,c.key,c);assert.equal(r.status,'failed');assert.equal(r.error,'CONTENT_REVIEW_INVALID');assert.equal(await c.store.get(c.key+'/result.json'),null);}});
test('复核响应无效后保留诊断和候选；明确继续时只将其作为上下文',async()=>{const c=await setup();await content.begin(c.store,c.key,c.job,{sheet:sheet()},c);await runNext(c,async()=>{throw Object.assign(Error('CONTENT_REVIEW_INVALID'),{detail:'图示位置锚点已改变',candidate:sheet()});});await content.resume(c.store,c.key,c);await runNext(c,async(s,i,o)=>{assert.equal(o.feedback.detail,'图示位置锚点已改变');assert.deepEqual(o.candidate,sheet());assert.deepEqual(s,sheet());return good(s);});assert.equal((await content.snapshot(c.store,c.key,c)).status,'ready');});
