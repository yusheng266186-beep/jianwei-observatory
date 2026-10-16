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
 const p=await generator.buildExercisePrompt(input),source=p.system.split('正确的非选择题JSON字段转义示例（仅说明格式，题型仍按逐题安排）：')[1].split('。题干、答案、解析、选项和评分点逐字段复核')[0],sample=JSON.parse(source);assert(sample.analysis.includes('$e=\\sqrt{3}$'));assert(sample.analysis.includes('\n'));assert(!sample.analysis.includes('\\n'));assert(!sample.stem.includes('\\quad'));assert.equal(p.template.version,'subject-templates-20261016.17');
});
import stores from '../backend/store.cjs';import worker from '../backend/worker.cjs';import diagnostic from '../backend/completion-diagnostics.cjs';
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
 const bad=structuredClone(sheet);bad.questions[0].answer='\\sqrt{2}';await store.create('bad-format/diagnostic.json',{raw:JSON.stringify(bad)});assert.equal((await recovery.revalidateResult(store,'bad-format',{type:'exercise',input:request},failed)).status,'failed');
 const diagram=structuredClone(sheet);diagram.questions[0].diagram={kind:'illustration',prompt:'物理模型图'};await store.create('bad-diagram/diagnostic.json',{raw:JSON.stringify(diagram)});assert.equal((await recovery.revalidateResult(store,'bad-diagram',{type:'exercise',input:request},failed)).status,'failed');
});
