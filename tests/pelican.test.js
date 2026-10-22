import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{MemoryStore}=require('../backend/store.cjs'),{createPelicanControl,safeSVG,defaultComplete}=require('../backend/pelican.cjs');
const owner='a'.repeat(32),env={OPENAI_CODEX_ENABLED:'true'},pick={provider:'openai-codex',model:'gpt-6.1-sol',effort:'medium'},svg='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="20"/></svg>';
test('comparison serializes candidates, preserves real timings and resumes without another model call',async()=>{
 const store=new MemoryStore(),dispatched=[];let time=1000,calls=0;
 const control=createPelicanControl({store,owner,env,now:()=>time,dispatch:async k=>dispatched.push(k),bindGeneration:async g=>({...g,codexAccountId:'b'.repeat(32)}),complete:async(p,g,o)=>{calls++;time+=80;await o.onProgress({phase:'writing',draftSource:'<svg'});time+=120;return {output:svg,usage:{input:11,output:22,thinking:4}};}});
 const id=crypto.randomUUID(),input={candidates:[pick,{...pick,model:'gpt-6-luna'}]};await control.begin(input,id);assert.equal(dispatched.length,1);
 const first=dispatched[0],job=(await store.get(first+'/meta.json')).value;assert.equal(job.generation.codexAccountId,'b'.repeat(32));await control.run(first,job);assert.equal(dispatched.length,2);
 const second=dispatched[1];await control.run(second,(await store.get(second+'/meta.json')).value);
 const result=await control.status(id);assert.equal(result.status,'ready');assert.equal(result.candidates[0].firstOutputMs,80);assert.equal(result.candidates[0].latencyMs,200);assert.equal(result.candidates[0].usage.input,11);
 await control.begin(input,id);await control.run(first,job);assert.equal(calls,2);assert.equal((await control.list()).runs.length,1);assert(!JSON.stringify(await control.list()).includes('<svg'));
 await assert.rejects(control.begin({candidates:[pick],prompt:'different'},id),/REQUEST_ID_CONFLICT/);
});
test('one failed comparison retains another model’s animated document for sandbox rendering',async()=>{
 const store=new MemoryStore(),keys=[];let calls=0;const c=createPelicanControl({store,owner,env,dispatch:async k=>keys.push(k),complete:async()=>{if(calls++===0)throw Error('MODEL_AUTH_FAILED');return {output:'<svg><script>alert(1)</script></svg>'};}}),id=crypto.randomUUID();
 await c.begin({candidates:[pick,{...pick,effort:'high'}]},id);
 for(let i=0;i<2;i++)await c.run(keys[i],(await store.get(keys[i]+'/meta.json')).value);
 const r=await c.status(id);assert.equal(r.status,'partial');assert.equal(r.candidates[0].error,'MODEL_AUTH_FAILED');assert.equal(r.candidates[1].html,'<svg><script>alert(1)</script></svg>');assert.equal(r.candidates[1].kind,'svg');assert.equal(r.candidates[1].firstOutputMs,null);assert.equal(r.candidates[1].usage,null);
 assert.equal(safeSVG(svg),svg);for(const bad of ['<svg onload="x"></svg>','<svg><use href="https://x"/></svg>','<svg><path style="fill:url(https://x)"/></svg>'])assert.equal(safeSVG(bad),null);
 assert(safeSVG('<svg><!-- the bicycle --><defs><linearGradient id="g"/></defs><path fill="url(#g)"/></svg>'));
});
test('cancelling a comparison prevents future calls and retains already finished drawings',async()=>{
 const store=new MemoryStore(),keys=[];let calls=0;const c=createPelicanControl({store,owner,env,dispatch:async k=>keys.push(k),complete:async()=>{calls++;return {output:svg};}}),id=crypto.randomUUID();
 await c.begin({candidates:[pick,{...pick,effort:'high'}]},id);await c.run(keys[0],(await store.get(keys[0]+'/meta.json')).value);await c.cancel(id);await c.run(keys[1],(await store.get(keys[1]+'/meta.json')).value);
 const r=await c.status(id);assert.equal(calls,1);assert.equal(r.status,'cancelled');assert.equal(r.candidates[0].status,'ready');assert.equal(r.candidates[1].status,'cancelled');
 const other=createPelicanControl({store,owner:'c'.repeat(32),env});await assert.rejects(other.status(id),/PELICAN_NOT_FOUND/);
});
test('a saved drawing can finish delivery after storage failure without paying for regeneration',async()=>{
 const store=new MemoryStore(),keys=[];let calls=0,failed=false;const create=store.create.bind(store);store.create=async(k,v)=>{if(k.endsWith('/result.json')&&!failed){failed=true;throw Error('STORE_UNAVAILABLE');}return create(k,v);};
 const c=createPelicanControl({store,owner,env,dispatch:async k=>keys.push(k),complete:async()=>{calls++;return {output:svg};}}),id=crypto.randomUUID();await c.begin({candidates:[pick]},id);
 const k=keys[0],job=(await store.get(k+'/meta.json')).value;await assert.rejects(c.run(k,job),/STORE_UNAVAILABLE/);await c.run(k,job);assert.equal((await c.status(id)).status,'ready');assert.equal(calls,1);
});
test('native Gemini and Kimi comparisons use the required SVG string schema rather than an exercise schema',async()=>{
 const {snapshot}=require('../backend/model-control.cjs'),payload=JSON.stringify({svg});
 for(const selection of [{provider:'gemini',model:'gemini-3.8-flash',effort:'deep'},{provider:'kimi-code',model:'k3',effort:'deep'}]){
  const env={GEMINI_API_KEY:'test-only',KIMI_API_KEY:'test-only'},g=snapshot(selection,env);let body;
  const result=await defaultComplete({system:'画骑车的鹈鹕',input:{}},g,{env,transport:async(u,o)=>{body=JSON.parse(o.body);return {status:200,body:JSON.stringify(g.protocol==='gemini'?{candidates:[{content:{parts:[{text:payload}]},finishReason:'STOP'}]}:{choices:[{message:{content:payload},finish_reason:'stop'}]})};}});
  const schema=g.protocol==='gemini'?body.generationConfig.responseJsonSchema:body.response_format.json_schema.schema;
  assert.deepEqual(schema.required,['svg']);assert.equal(schema.properties.svg.type,'string');assert.equal(safeSVG(result.output),svg);
 }
});
