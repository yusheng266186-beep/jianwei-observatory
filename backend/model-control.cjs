'use strict';
const providers=require('./providers.json'),profiles=require('./model-profiles.json');
const {hash}=require('./tencent.cjs');
const extras={
 'kimi-code':{label:'Kimi 官方 · 个人会员',url:'https://api.kimi.com/coding/v1',protocol:'kimi',key:'KIMI_API_KEY',model:'k3',catalog:['k3']},
 gemini:{label:'ByteCat · Gemini',url:'https://www.bytecatcode.org',protocol:'gemini',key:'GEMINI_API_KEY',model:'gemini-3.8-flash',catalog:['gemini-3.8-flash']}
};
const routes={...extras,...providers},revisionKey=n=>'models/revisions/'+String(n).padStart(10,'0')+'.json';
const fail=code=>Object.assign(new Error(code),{status:code==='MODEL_REVISION_CONFLICT'?409:400});
function modelProfile(provider,model){return profiles.providers?.[provider]?.[model]||(provider==='deepseek'?profiles.models[model]:null);}
function configured(provider,env=process.env){let declared=[];try{declared=JSON.parse(env.TRAINING_CONFIGURED_PROVIDERS||'[]');}catch{}return !!env[routes[provider]?.key]||declared.includes(provider);}
function snapshot(selection,env=process.env){
 if(!selection||Object.keys(selection).some(k=>!['provider','model','effort'].includes(k)))throw fail('MODEL_SELECTION_INVALID');
 const {provider,model,effort}=selection,route=routes[provider];
 if(!route||!route.catalog.includes(model)||!['eco','standard','deep'].includes(effort))throw fail('MODEL_SELECTION_INVALID');
 if(!configured(provider,env))throw fail('MODEL_NOT_CONFIGURED');
 const profile=modelProfile(provider,model),efforts=profile?.efforts||(provider==='kimi-code'?{deep:'max'}:{deep:'high'});if(!Object.hasOwn(efforts,effort))throw fail('MODEL_SELECTION_INVALID');const reasoningEffort=efforts[effort];
 return {provider,model,effort,reasoningEffort,protocol:route.protocol,base:route.url,credentialRef:route.key,profileVersion:profiles.version,timeoutMs:885000,...(profile?{adapterProfile:structuredClone(profile)}:{})};
}
function defaultSelection(env=process.env){const provider=env.TRAINING_PROVIDER||'gemini';return {provider,model:routes[provider]?.model||'k3',effort:'deep'};}
function publicCatalog(env=process.env){return Object.entries(routes).map(([id,r])=>({id,label:r.label,defaultModel:r.model,protocol:r.protocol,configured:configured(id,env),models:r.catalog.map(model=>{const p=modelProfile(id,model);return {id:model,name:p?.name||(id==='kimi-code'?'Kimi K3':id==='gemini'?'Gemini 3.8 Flash':model),efforts:p?.efforts||(id==='kimi-code'?{deep:'max'}:{deep:'high'}),note:p?.note||''};})}));}
async function latestChecks(store){let low=0,high=1;const key=n=>'model-checks/'+String(n).padStart(10,'0')+'.json';while(await store.get(key(high))){low=high;high=high*2+1;}while(high-low>1){const mid=Math.floor((high+low)/2);if(await store.get(key(mid)))low=mid;else high=mid;}return low?(await store.get(key(low))).value:{revision:0,checks:[]};}
async function recordCheck(store,generation,result,at=Date.now()){
 for(let n=0;n<8;n++){const previous=await latestChecks(store),check={provider:generation.provider,model:generation.model,effort:generation.effort,checkedAt:at,status:result.status==='ready'?'passed':'failed',...(result.error?{error:result.error}:{}),...(result.probe?{latencyMs:result.probe.latencyMs}:{})};const checks=[check,...previous.checks.filter(c=>selectionId(c)!==selectionId(generation))].slice(0,100),revision=previous.revision+1;if(await store.create('model-checks/'+String(revision).padStart(10,'0')+'.json',{revision,checks}))return;}throw Error('MODEL_CHECK_CONFLICT');
}
function publicGeneration(g){return {provider:g.provider,model:g.model,reasoningEffort:g.reasoningEffort};}
function createModelControl({store,env=process.env,now=Date.now}){
 let hint=0;
 // Revisions are immutable, contiguous create-once objects. A concurrent writer
 // can win only one next slot. This avoids an unsafe GET/overwrite race on COS.
 async function latest(){let low=hint,high=hint+1;while(await store.get(revisionKey(high))){low=high;high=high*2+1;}while(high-low>1){const mid=Math.floor((low+high)/2);if(await store.get(revisionKey(mid)))low=mid;else high=mid;}hint=low;return low?(await store.get(revisionKey(low))).value:{revision:0,selection:defaultSelection(env),updatedAt:null};}
 async function state(){const current=await latest(),history=[];for(let n=current.revision;n>Math.max(0,current.revision-8);n--){const item=await store.get(revisionKey(n));if(item)history.push(item.value);}return {current,history,checks:(await latestChecks(store)).checks,providers:publicCatalog(env),image:{model:'GPT Image 2',label:'复杂配图',mode:'图示模型按策略选择，常见模型优先SVG'}};}
 async function apply(input){if(!input||Object.keys(input).some(k=>!['expectedRevision','selection','role'].includes(k))||!Number.isSafeInteger(input.expectedRevision)||input.expectedRevision<0||input.role!==undefined&&!['exercise','diagram'].includes(input.role))throw fail('MODEL_SELECTION_INVALID');const role=input.role||'exercise';if(role!=='diagram'||input.selection!==null)snapshot(input.selection,env);const current=await latest();if(input.expectedRevision!==current.revision)throw fail('MODEL_REVISION_CONFLICT');const next={...current,revision:current.revision+1,...(role==='diagram'?{diagramSelection:input.selection?{...input.selection}:null}:{selection:{...input.selection}}),role,updatedAt:now()};if(!await store.create(revisionKey(next.revision),next))throw fail('MODEL_REVISION_CONFLICT');hint=next.revision;return next;}
 async function generations(){const current=await latest();return {generation:snapshot(current.selection,env),figureGeneration:snapshot(current.diagramSelection||current.selection,env)};}
 async function generation(role='exercise'){const selected=await generations();return role==='diagram'?selected.figureGeneration:selected.generation;}
 return {state,apply,generation,generations};
}
const selectionId=g=>hash(JSON.stringify({provider:g.provider,model:g.model,effort:g.effort})).slice(0,24);
module.exports={routes,modelProfile,snapshot,configured,publicCatalog,publicGeneration,createModelControl,defaultSelection,selectionId,recordCheck,latestChecks};
