import test from 'node:test';
import assert from 'node:assert/strict';
import control from '../backend/model-control.cjs';
import adapter from '../backend/model-adapter.cjs';
import completion from '../backend/model-completion.cjs';

test('CodeBuddy is a separate fixed route with declared efforts and no public credential',()=>{
 const env={CODEBUDDY_API_KEY:'test-codebuddy-secret'},route=control.publicCatalog(env).find(p=>p.id==='codebuddy');
 assert(route.configured);assert.equal(route.models.length,14);assert.equal(route.defaultModel,'deepseek-v4.1-flash');
 assert(!JSON.stringify(route).includes(env.CODEBUDDY_API_KEY));
 for(const model of route.models)for(const effort of Object.keys(model.efforts)){
  const g=control.snapshot({provider:'codebuddy',model:model.id,effort},env);
  assert.equal(g.base,'https://www.codebuddy.cn/v2');assert.equal(g.credentialRef,'CODEBUDDY_API_KEY');
  const body=adapter.adaptModelBody({messages:[{role:'system',content:'规则'},{role:'user',content:'完整问题'}],max_tokens:64000,effort},{name:'codebuddy',model:model.id});
  assert.equal(body.model,model.id);assert.equal(body.reasoning_effort,g.reasoningEffort);assert.equal(body.stream,true);
  assert(body.max_tokens<=g.adapterProfile.maxTokens);assert.equal(body.temperature,undefined);assert.equal(body.thinking,undefined);
  assert(g.adapterProfile.catalogSource.nativeEfforts.includes(body.reasoning_effort));
 }
 assert.equal(control.snapshot({provider:'codebuddy',model:'hy4-preview',effort:'deep'},env).reasoningEffort,'high');
 assert.throws(()=>control.snapshot({provider:'codebuddy',model:'unlisted',effort:'deep'},env),/MODEL_SELECTION_INVALID/);
 assert.throws(()=>control.snapshot({provider:'codebuddy',model:'deepseek-v4.1-flash',effort:'ultra'},env),/MODEL_SELECTION_INVALID/);
});

test('CodeBuddy completion preserves exact role history, streams its selected model, and reads final text only',async()=>{
 const env={CODEBUDDY_API_KEY:'test-codebuddy-secret'},g=control.snapshot({provider:'codebuddy',model:'deepseek-v4.1-flash',effort:'deep'},env);
 const prompt={system:'原始规则',inputText:'完整对话及请求',schema:{type:'object'}};let calls=0;
 const result=await completion.probeModel(g,{env,transport:async(url,options)=>{
  calls++;assert.equal(url,'https://www.codebuddy.cn/v2/chat/completions');assert.equal(options.headers.Authorization,'Bearer '+env.CODEBUDDY_API_KEY);
  assert(!/CodeBuddy\/|cbc\//i.test(options.headers['User-Agent']));
  const body=JSON.parse(options.body);assert.equal(body.model,g.model);assert.equal(body.reasoning_effort,'max');assert.equal(body.stream,true);
  return {status:200,body:'data: '+JSON.stringify({choices:[{index:0,delta:{reasoning_content:'private reasoning'}}]})+'\n\ndata: '+JSON.stringify({choices:[{index:0,delta:{content:'{"value":703}'},finish_reason:'stop'}]})+'\n\ndata: [DONE]\n\n'};
 }});
 assert.equal(calls,1);assert(result.probe.passed);assert.equal(result.model,g.model);
 const messages=[{role:'system',content:prompt.system},{role:'user',content:'早期经历'},{role:'assistant',content:'追问'},{role:'user',content:prompt.inputText}];
 const body=adapter.adaptModelBody({messages,max_tokens:32000,effort:'deep'},{name:'codebuddy',model:g.model});assert.deepEqual(body.messages,messages);
});
