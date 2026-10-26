import test from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),control=require('../backend/model-control.cjs'),{MemoryStore}=require('../backend/store.cjs'),adapter=require('../backend/codex-completion.cjs'),proxy=require('../backend/openai-proxy.cjs');
const env={OPENAI_CODEX_ENABLED:'true'},selection={provider:'openai-codex',model:'gpt-6.1-sol',effort:'high'};
test('current official configuration migrates the provider and preserves every role and image setting',async()=>{
 const store=new MemoryStore(),legacy={...selection,provider:'openai-chatgpt'},imageSelection={provider:'bytecat-image',model:'gpt-image-2'};
 await store.create('models/revisions/0000000001.json',{revision:1,selection:legacy,diagramSelection:{...legacy,effort:'medium'},repairSelection:null,imageSelection,repairAttempts:2});
 const c=control.createModelControl({store,env}),state=await c.state(),all=await c.generations();
 assert.equal(state.current.selection.provider,'openai-codex');assert.equal(all.generation.protocol,'codex');assert.equal(all.figureGeneration.reasoningEffort,'medium');assert.equal(all.repairGeneration.reasoningEffort,'high');assert.equal(all.repairAttempts,2);assert.deepEqual(state.current.imageSelection,imageSelection);
 assert(!state.providers.some(p=>p.id==='openai-chatgpt'));assert(state.providers.find(p=>p.id==='openai-codex').configured);assert(!control.configured('openai-chatgpt',{...env,OPENAI_SIWC_ENABLED:'true'}));
 assert.equal((await store.get('models/revisions/0000000001.json')).value.selection.provider,'openai-chatgpt');
 await c.apply({expectedRevision:1,selection});assert.equal((await store.get('models/revisions/0000000002.json')).value.diagramSelection.provider,'openai-codex');
});
test('official completion keeps the frozen account, stream, image and cancellation signal',async()=>{
 const g={...control.snapshot(selection,env),codexAccountId:'a'.repeat(32)},signal=new AbortController().signal,prompt={system:'要求',input:{count:3},image:{mime:'image/png',data:'example'}};let observed;
 const result=await adapter.complete(prompt,g,{signal,onProgress:()=>{},control:{bind:async value=>value,withAccount:async(id,fn)=>{assert.equal(id,g.codexAccountId);return fn('runtime');}},runtimeMethods:{complete:async(rt,p,b,o)=>{observed={rt,p,b,o};return {output:'done'};}}});
 assert.equal(result.output,'done');assert.equal(observed.p,prompt);assert.equal(observed.o.signal,signal);assert.equal(observed.b.reasoningEffort,'high');
 await assert.rejects(adapter.complete(prompt,{...g,base:'https://untrusted.example'}),/MODEL_NOT_CONFIGURED/);
 await assert.rejects(adapter.complete(prompt,g,{control:{bind:async()=>{throw Error('CODEX_ACCOUNT_REAUTH_REQUIRED');}}}),/MODEL_AUTH_FAILED/);
 let at=0;await assert.rejects(adapter.complete(prompt,g,{now:()=>at,sleep:async ms=>{at+=ms;},control:{bind:async x=>x,withAccount:async()=>{throw Error('CODEX_ACCOUNT_BUSY');}}}),/MODEL_RATE_LIMIT/);
});
test('GPT-6.1 Terra exposes only its supported native efforts and preserves the selected model and account',async()=>{
 const model='gpt-6.1-terra',native=['none','low','medium','high','xhigh','max'],route=control.publicCatalog(env).find(p=>p.id==='openai-codex'),profile=control.modelProfile('openai-codex',model);
 assert(route.models.some(m=>m.id===model&&m.name==='GPT-6.1 Terra'));assert.equal(profile.contextWindow,1050000);assert.equal(profile.efforts.ultra,undefined);assert.throws(()=>control.snapshot({provider:'openai-codex',model,effort:'ultra'},env),/MODEL_SELECTION_INVALID/);
 for(const effort of native){const generation={...control.snapshot({provider:'openai-codex',model,effort},env),codexAccountId:'b'.repeat(32)},prompt={system:'规则',input:{task:'37×19'}};let seen;
  const result=await adapter.complete(prompt,generation,{control:{bind:async g=>g,withAccount:async(id,fn)=>{assert.equal(id,generation.codexAccountId);return fn('runtime');}},runtimeMethods:{complete:async(rt,p,g)=>{seen={p,g};return {output:'703'};}}});assert.equal(result.output,'703');assert.equal(seen.g.model,model);assert.equal(seen.g.reasoningEffort,effort);assert.equal(seen.p,prompt);
 }
});
test('a busy official credential waits before sending, without duplicate model calls or changing accounts',async()=>{
 let attempts=0,calls=0,at=0;const g={...control.snapshot(selection,env),codexAccountId:'a'.repeat(32)};
 const result=await adapter.complete({input:{}},g,{now:()=>at,sleep:async ms=>{at+=ms;},control:{bind:async x=>x,withAccount:async(id,fn)=>{assert.equal(id,g.codexAccountId);if(attempts++===0)throw Error('CODEX_ACCOUNT_BUSY');return fn('runtime');}},runtimeMethods:{complete:async()=>{calls++;return {output:'done'};}}});
 assert.equal(result.output,'done');assert.equal(calls,1);assert.equal(at,2500);
});
test('updated Reality proxy requires a public verification key and preserves private loopback binding',()=>{
 const outbound={protocol:'vless',streamSettings:{security:'reality',realitySettings:{publicKey:'public-test-key',serverName:'example.test'}}};const c=proxy.checkedConfig({outbounds:[outbound],inbounds:[{listen:'0.0.0.0'}]});assert.equal(c.inbounds[0].listen,'127.0.0.1');assert.equal(c.inbounds[0].port,18080);assert.deepEqual(c.outbounds,[outbound]);
 delete outbound.streamSettings.realitySettings.publicKey;assert.throws(()=>proxy.checkedConfig({outbounds:[outbound]}),/CONFIG_INVALID/);
});
