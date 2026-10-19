import test from 'node:test';
import assert from 'node:assert/strict';
import control from '../backend/model-control.cjs';
import completion from '../backend/model-completion.cjs';
import {modelSpeedLabel,modelPerformanceHTML} from '../app/ui/model-performance.js';

test('猎豹新增型号使用明确白名单及独立凭据，轻快/深入档位按各自协议发送',async()=>{
 for(const [provider,model,key] of [['wefucke-gpt','gpt-6.1-sol','WEFUCKE_GPT_API_KEY'],['cheetah-deepseek','deepseek-v4.1-flash','CHEETAH_DEEPSEEK_API_KEY']]){
  assert.throws(()=>control.snapshot({provider,model,effort:'deep'},{CHEETAH_GEMINI_API_KEY:'unrelated'}),/MODEL_NOT_CONFIGURED/);
  for(const effort of ['eco','deep']){
   const generation=control.snapshot({provider,model,effort},{[key]:'private-test-key'});
   assert.equal(generation.credentialRef,key);assert.equal(generation.reasoningEffort,effort==='eco'?'low':'max');
   let captured;
   const result=await completion.probeModel(generation,{env:{[key]:'private-test-key'},transport:async(url,options)=>{captured={url,options};return {status:200,body:'data: '+JSON.stringify({choices:[{delta:{content:'{"value":703}'},finish_reason:'stop'}]})+'\n\ndata: [DONE]\n\n'};}});
   const body=JSON.parse(captured.options.body);
   assert.equal(result.probe.passed,true);assert.equal(captured.url,'https://www.wefucke.top/v1/chat/completions');
   assert.equal(body.model,model);assert.equal(body.reasoning_effort,generation.reasoningEffort);assert.equal(body.stream,true);
   assert.equal(body[provider==='wefucke-gpt'?'max_completion_tokens':'max_tokens'],8192);
   assert.equal(captured.options.headers.Authorization,'Bearer private-test-key');
   if(provider==='cheetah-deepseek')assert.deepEqual(body.thinking,{type:'enabled'});
  }
 }
});

test('目录中的TPS按中转站隔离，不流入冻结请求；空数据不冒充零速或另一家数据',()=>{
 const catalog=control.publicCatalog({TRAINING_CONFIGURED_PROVIDERS:'["cheetah-deepseek","wefucke-gpt"]'});
 const find=(provider,model)=>catalog.find(p=>p.id===provider)?.models.find(m=>m.id===model);
 const cheetah=find('wefucke-gpt','gpt-6.1-sol'),bytecat=find('bytecat-gpt','gpt-6.1-sol');
 assert.equal(cheetah.performance.tps,29.8);assert.equal(bytecat.performance.tps,51.7);
 assert(cheetah.performance.groups.some(g=>g.name==='gpt 福利公益组'&&g.tps===35.9));
 assert.equal(find('cheetah-deepseek','deepseek-v4.1-flash').performance.tps,175.3);
 assert.equal(find('baidu','deepseek-v4.1-flash').performance,undefined);
 assert.equal(find('kimi-code','k3').performance,undefined);
 const generation=control.snapshot({provider:'wefucke-gpt',model:'gpt-6.1-sol',effort:'deep'},{WEFUCKE_GPT_API_KEY:'secret'});
 assert.equal(generation.performance,undefined);assert(!JSON.stringify(catalog).includes('secret'));
 cheetah.performance.tps=0;assert.equal(find('bytecat-gpt','gpt-6.1-sol').performance.tps,51.7);
 assert.equal(control.publicCatalog().find(p=>p.id==='wefucke-gpt').models.find(m=>m.id==='gpt-6.1-sol').performance.tps,29.8);
});

test('速度提示可展开分组、来源与日期；缺失/无效数据不显示为0TPS，来源链接只允许公开模型页',()=>{
 const reference={tps:29.8,observedAt:'2026-10-19',sourceUrl:'https://www.wefucke.top/pricing/gpt-6.1-sol',groups:[{name:'gpt 福利公益组',tps:35.9},{name:'a<script>',tps:23.6},{name:'unknown',tps:null}]};
 assert.equal(modelSpeedLabel(reference),'29.8 TPS');
 const html=modelPerformanceHTML(reference);assert.match(html,/<details/);assert.match(html,/35\.9 TPS/);assert.match(html,/2026-10-19/);assert.match(html,/target="_blank" rel="noopener noreferrer"/);assert(!html.includes('<script>'));assert(!html.includes('unknown'));
 assert.equal(modelSpeedLabel({tps:0,groups:[{tps:NaN}]}),'');
 assert.equal(modelSpeedLabel({...reference,tps:null}),'23.6–35.9 TPS（分组）');
 assert.equal(modelSpeedLabel(null),'');assert.equal(modelPerformanceHTML(undefined),'');
 assert.match(modelPerformanceHTML({tps:null,groups:[],observedAt:'2026-10-19'}),/暂无 TPS 数据/);
 for(const sourceUrl of ['javascript:alert(1)','https://evil.test/pricing/x','https://www.wefucke.top/keys'])assert(!modelPerformanceHTML({...reference,sourceUrl}).includes('<a '));
});
