import test from 'node:test';import assert from 'node:assert/strict';
import control from '../backend/model-control.cjs';import completion from '../backend/model-completion.cjs';import generator from '../backend/generator.cjs';
const env={BYTECAT_GROK_API_KEY:'test-secret-not-public'},models=['grok-4.5','grok-4.6','grok-4.7','grok-composer-2.5-fast'];
test('ByteCat Grok作为独立服务配置，公开目录只含可选模型而不含密钥',()=>{
 const route=control.publicCatalog(env).find(p=>p.id==='bytecat-grok');assert(route.configured);assert.equal(route.defaultModel,'grok-4.7');assert.deepEqual(route.models.map(m=>m.id),models);assert(!JSON.stringify(route).includes(env.BYTECAT_GROK_API_KEY));assert(!control.publicCatalog({}).find(p=>p.id==='bytecat-grok').configured);
 assert.throws(()=>control.snapshot({provider:'bytecat-grok',model:'unknown',effort:'deep'},env));
});
test('Grok沿用真实流式协议和云端学科提示，不发送未经证实的推理参数',async()=>{
 const prompt=await generator.buildExercisePrompt({subject:'数学',grade:'高三',curriculum:'函数与导数',focus:'单调性',count:3,minutes:15,difficulty:'基础巩固',evidence:[],examStyle:'sichuan-gaokao',visuals:'none'});
 for(const model of models){let captured;const chunks=[{choices:[{delta:{reasoning_content:'test reasoning'}}]},{choices:[{delta:{content:'{"value":703}'}}]},{choices:[{delta:{},finish_reason:'stop'}]}],generation=control.snapshot({provider:'bytecat-grok',model,effort:'deep'},env),result=await completion.completeRemote(prompt,generation,{key:env.BYTECAT_GROK_API_KEY,transport:async(url,opts)=>{captured={url,body:JSON.parse(opts.body),headers:opts.headers};for(const chunk of chunks)opts.onChunk(Buffer.from('data: '+JSON.stringify(chunk)+'\n\n'));opts.onChunk(Buffer.from('data: [DONE]\n\n'));return {status:200};}});
  assert.equal(captured.url,'https://www.bytecatcode.org/v1/chat/completions');assert.equal(captured.body.model,model);assert.equal(captured.body.stream,true);assert(!Object.hasOwn(captured.body,'reasoning_effort'));assert(!Object.hasOwn(captured.body,'thinking'));assert(!Object.hasOwn(captured.body,'reasoning'));assert.match(captured.body.messages[0].content,/四川高考知识与能力范围硬约束/);assert.equal(result.output,'{"value":703}');assert.equal(captured.headers.Authorization,'Bearer '+env.BYTECAT_GROK_API_KEY);
 }
});
