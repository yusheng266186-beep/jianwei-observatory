import test from 'node:test';import assert from 'node:assert/strict';import completion from '../backend/model-completion.cjs';import reader from '../backend/stream-reader.cjs';import generator from '../backend/generator.cjs';import {validateExerciseResult} from '../app/engine/exercise-contract.js';
const input={subject:'数学',grade:'高三',examStyle:'sichuan-gaokao',curriculum:'高中数学函数与导数',focus:'求导与单调性',count:3,minutes:40,difficulty:'拓展挑战',visuals:'none',evidence:[]};
const event=p=>Buffer.from('data: '+JSON.stringify(p)+'\n\n');
test('Gemini输出额度截断与缺少结束标记可区分，保留原始片段和实际用量诊断',()=>{
 const r=reader.createStreamReader('gemini');r.write(event({candidates:[{content:{parts:[{text:'{"questions":['}]}}]}));r.write(event({candidates:[{finishReason:'MAX_TOKENS'}],usageMetadata:{promptTokenCount:1500,candidatesTokenCount:1500,thoughtsTokenCount:23076}}));
 assert.throws(()=>completion.parseStream(r.finish(),'gemini'),e=>e.message==='MODEL_OUTPUT_LIMIT'&&e.output==='{"questions":['&&e.diagnostic.finishReason==='MAX_TOKENS'&&e.diagnostic.usage.thinking===23076);
 assert.throws(()=>completion.parseStream(event({candidates:[{content:{parts:[{text:'{}'}]}}]}).toString(),'gemini'),e=>e.message==='MODEL_INCOMPLETE'&&e.diagnostic.finishReason==='missing');
});
test('高强度出题预留模型支持的完整输出预算，不降低原有思考档位',async()=>{
 const p=await generator.buildExercisePrompt(input),body=JSON.parse(p.body);assert.equal(body.generationConfig.maxOutputTokens,65536);assert.equal(body.generationConfig.thinkingConfig.thinkingLevel,'high');assert(body.generationConfig.responseJsonSchema);assert.equal(p.input.count,3);assert.equal(p.input.difficulty,'拓展挑战');
});
test('流式与非流式Gemini截断均只发送一次，不把半份文档伪装成成稿',async()=>{
 for(const streaming of [true,false]){let calls=0;await assert.rejects(generator.generate(input,{key:'test-only',onProgress:streaming?()=>{}:undefined,transport:async(url,options)=>{calls++;const packet={candidates:[{content:{parts:[{text:'{"questions":['}]},finishReason:'MAX_TOKENS'}],usageMetadata:{thoughtsTokenCount:24000}};if(streaming){options.onChunk(event(packet));return {status:200,body:''};}return{status:200,body:JSON.stringify(packet)};}}),e=>e.message==='MODEL_OUTPUT_LIMIT'&&e.diagnostic.usage.thinking===24000);assert.equal(calls,1);}
});
test('正常STOP不替代文档完整性校验，不修补缺失的题目或JSON',async()=>{let calls=0;await assert.rejects(generator.generate(input,{key:'test-only',onProgress:()=>{},transport:async(url,options)=>{calls++;options.onChunk(event({candidates:[{content:{parts:[{text:'{"questions":['}]},finishReason:'STOP'}]}));return{status:200,body:''};}}),e=>e.message==='MODEL_CONTENT_INVALID'&&e.diagnostic.kind==='document'&&e.diagnostic.completeSignal);assert.equal(calls,1);});
test('命题提示提供一次JSON编码的完整字段示例，解码后公式反斜杠与真实换行正确',async()=>{
 const p=await generator.buildExercisePrompt(input),source=p.system.split('完整字段编码示例（仅说明格式，不是本次试题）：')[1].split('。提交前逐字段核对')[0],sample=JSON.parse(source);assert(sample.analysis.includes('$e=\\sqrt{3}$'));assert(sample.analysis.includes('\n'));assert(!sample.analysis.includes('\\n'));assert(!sample.stem.includes('\\quad'));assert.equal(p.template.version,'subject-templates-20261020.10');
});
import stores from '../backend/store.cjs';import worker from '../backend/worker.cjs';import diagnostic from '../backend/completion-diagnostics.cjs';import figures from '../backend/figure-pipeline.cjs';import {solidFigures} from './fixtures/exercise-figures.js';
test('云端保留停止原因与用量，教师反馈不泄露原始响应，截断不重试付费请求',async()=>{
 const store=new stores.MemoryStore(),key='jobs/'+'a'.repeat(32)+'/00000000-0000-4000-8000-000000000001';await store.create(key+'/meta.json',{type:'exercise',deadline:Date.now()+60000,input});let calls=0;
 await worker.run({key},{store,generator:async()=>{calls++;throw diagnostic.incompleteCompletion({protocol:'gemini',finish:'MAX_TOKENS',done:true,output:'{"incomplete":',usage:{thoughtsTokenCount:24000}});}});
 const d=(await store.get(key+'/diagnostic.json')).value,r=(await store.get(key+'/result.json')).value;assert.equal(calls,1);assert.equal(d.upstream.finishReason,'MAX_TOKENS');assert.equal(d.upstream.usage.thinking,24000);assert.equal(r.error,'MODEL_OUTPUT_LIMIT');assert.match(r.failureDetail,/输出额度上限/);assert(!r.failureDetail.includes('incomplete'));
});
import recovery from '../backend/revalidate-result.cjs';
test('完整长解答可按新规则重新校验原稿，截断、格式错误和不允许的图示不能恢复',async()=>{
 const store=new stores.MemoryStore(),key='jobs/test/recovery',request={...input,difficulty:'基础巩固',minutes:15},sheet={title:'完整练习',objective:'求导训练',questions:Array.from({length:3},(_,i)=>({id:i+1,level:i?'巩固':'基础',type:'填空',stem:'求第'+i+'个函数的导数。',choices:[],answer:'完整证明。'.repeat(600),analysis:'使用求导法则。',points:['结果正确得5分。'],maxScore:5,minutes:5}))},failed={status:'failed',error:'MODEL_CONTENT_INVALID',finishedAt:10000};
 await store.create(key+'/diagnostic.json',{raw:JSON.stringify(sheet)});const original=JSON.stringify(sheet);const ready=await recovery.revalidateResult(store,key,{type:'exercise',input:request},failed);assert.equal(ready.status,'ready');assert.equal(JSON.stringify(ready.sheet),original);assert.equal((await recovery.revalidateResult(store,key,{type:'exercise',input:request},{...failed,error:'MODEL_INCOMPLETE'})).status,'failed');
 await store.create('truncated/diagnostic.json',{raw:JSON.stringify(sheet),truncated:true});assert.equal((await recovery.revalidateResult(store,'truncated',{type:'exercise',input:request},failed)).status,'failed');
 for(const [name,mutate] of [['draft',s=>s.questions[0].analysis='等等，重新核算，若我们把选项改为另一个数。'],['table',s=>s.questions[0].stem='| A | B |\n| - | - | - |\n| 1 | 2 |']]){const invalid=structuredClone(sheet);mutate(invalid);await store.create(name+'/diagnostic.json',{raw:JSON.stringify(invalid)});assert.equal((await recovery.revalidateResult(store,name,{type:'exercise',input:request},failed)).status,'failed');}
 const bad=structuredClone(sheet);bad.questions[0].answer='\\sqrt{2}';await store.create('bad-format/diagnostic.json',{raw:JSON.stringify(bad)});assert.equal((await recovery.revalidateResult(store,'bad-format',{type:'exercise',input:request},failed)).status,'failed');
 const diagram=structuredClone(sheet);diagram.questions[0].diagram={kind:'illustration',prompt:'物理模型图'};await store.create('bad-diagram/diagnostic.json',{raw:JSON.stringify(diagram)});assert.equal((await recovery.revalidateResult(store,'bad-diagram',{type:'exercise',input:request},failed)).status,'failed');
});

const recoveryRequest={...input,visuals:'vector',minutes:15,difficulty:'基础巩固'};
const recoverySheet=()=>({title:'完整练习',objective:'求导训练',questions:Array.from({length:3},(_,i)=>({id:i+1,level:i?'巩固':'基础',type:'填空',stem:'求第'+i+'个函数的导数。',choices:[],answer:'完整答案。',analysis:'使用求导法则。',points:['结果正确得5分。'],maxScore:5,minutes:5}))});
test('历史恢复执行完整图题语义检查，如图无图不能写入ready',async()=>{
 const store=new stores.MemoryStore(),key='jobs/test/recovery-missing-figure',sheet=recoverySheet();sheet.questions[0].stem='函数图像如图所示，求导数。';
 await store.create(key+'/diagnostic.json',{raw:JSON.stringify(sheet)});
 const result=await recovery.revalidateResult(store,key,{type:'exercise',input:recoveryRequest},{status:'failed',error:'MODEL_CONTENT_INVALID',finishedAt:10000});
 assert.equal(result.status,'failed');assert.equal(await store.get(key+'/recovered.json'),null);
});
test('历史恢复拒绝学科不匹配图示和图中坏公式标签',async()=>{
 const store=new stores.MemoryStore(),circuit={kind:'science',caption:'电路',description:'电源与电阻串联。',spec:{family:'circuit',nodes:[{id:'a',x:100,y:100},{id:'b',x:300,y:100}],branches:[{from:'a',to:'b',component:'resistor',label:'R'}]}},plot={kind:'plot',caption:'函数图像',description:'一条直线。',xLabel:'$x$',yLabel:'y',xRange:[0,1],yRange:[0,1],series:[{label:'y',points:[[0,0],[1,1]]}]};
 for(const [name,diagram] of [['subject',circuit],['label',plot]]){
  const key='jobs/test/recovery-'+name,sheet=recoverySheet();sheet.questions[0].diagram=diagram;
  await store.create(key+'/diagnostic.json',{raw:JSON.stringify(sheet)});
  const result=await recovery.revalidateResult(store,key,{type:'exercise',input:recoveryRequest},{status:'failed',error:'MODEL_CONTENT_INVALID',finishedAt:10000});
  assert.equal(result.status,'failed');assert.equal(await store.get(key+'/recovered.json'),null);
 }
});
test('pipeline2待独立图示的恢复接续完整图示流程，不直接ready漏图',async()=>{
 const store=new stores.MemoryStore(),key='jobs/test/recovery-pending-figures',profile={provider:'test',model:'test-model',reasoningEffort:'high',timeoutMs:885000},sheet=recoverySheet(),q=sheet.questions[0];
 q.stem='长方体模型如图所示。\n写出一组平行棱。';
 q.figureRequest={caption:'长方体模型',requirements:'长方体的八个顶点和棱，遮挡棱用虚线，不标出答案。',knownData:'长3、宽2、高2',labels:['A','B','C','D'],precision:'exact',placement:{after:'长方体模型如图所示。',width:'standard',aspect:'wide'}};
 await store.create(key+'/diagnostic.json',{raw:JSON.stringify(sheet)});
 const queue=[],options={now:()=>Date.now(),dispatch:async child=>queue.push(child)},job={type:'exercise',input:recoveryRequest,pipeline:2,generation:profile,figureGeneration:profile,imageGeneration:profile},failed={status:'failed',error:'MODEL_CONTENT_INVALID',finishedAt:10000};
 const state=await recovery.revalidateResult(store,key,job,failed,options);
 assert.notEqual(state.status,'ready');assert.equal(await store.get(key+'/recovered.json'),null);assert(await store.get(key+'/figure-manifest.json'));assert(queue.length>0);
 while(queue.length){const child=queue.shift(),meta=(await store.get(child+'/meta.json')).value;await figures.runStep(store,child,meta,{...options,planner:async()=>({diagram:solidFigures[0],model:profile.model}),reviewer:async()=>({approved:true,issues:[]})});}
 const ready=await recovery.revalidateResult(store,key,job,failed,options);
 assert.equal(ready.status,'ready');assert.equal(ready.recovered,true);assert.deepEqual(ready.sheet.questions[0].diagram,solidFigures[0]);
});
