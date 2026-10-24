import test from 'node:test';import assert from 'node:assert/strict';
import kimi from '../backend/kimi.cjs';import generator from '../backend/generator.cjs';
import control from '../backend/model-control.cjs';import completion from '../backend/model-completion.cjs';import figures from '../backend/figure-generation.cjs';
const input={subject:'数学',grade:'高三',curriculum:'已学函数与导数',focus:'多项式函数单调性',count:12,minutes:60,difficulty:'基础巩固',visuals:'none',evidence:[],targets:['单调性'],questionTypes:['填空']};
const sheet=()=>({title:'专项训练',objective:'巩固导数判断单调性',questions:Array.from({length:12},(_,i)=>({id:i+1,target:'单调性',level:i?'巩固':'基础',type:'填空',stem:'求函数 $f(x)=x^{'+(i+2)+'}$ 的导数。',choices:[],answer:'导数',analysis:'按幂函数求导。',points:['正确求导'],maxScore:5,minutes:5}))});
const frame=data=>'data: '+JSON.stringify(data)+'\r\n\r\n';
const stream=(text,finish='stop')=>frame({choices:[{index:0,delta:{reasoning_content:'private internal reasoning'}}]})+frame({choices:[{index:0,delta:{content:text.slice(0,25)}}]})+frame({choices:[{index:0,delta:{content:text.slice(25)},finish_reason:finish}]})+frame({choices:[],usage:{prompt_tokens:100,completion_tokens:9000,completion_tokens_details:{reasoning_tokens:6000}}})+'data: [DONE]\r\n\r\n';
test('K3 max uses official endpoints, exact 12-question schema and real client identity; only final document content is read',async()=>{
 for(const provider of ['kimi-platform','kimi-code']){
  let calls=0;const expected=sheet(),result=await generator.generate(input,{provider,key:'unit-test-only',transport:async(url,options)=>{
   calls++;const body=JSON.parse(options.body),profile=kimi.kimiProfile(provider.slice(5));assert.equal(url,profile.base+'/chat/completions');assert.equal(body.model,profile.model);assert.equal(body.reasoning_effort,'max');assert.equal(body.max_completion_tokens,131072);assert.equal(body.temperature,undefined);assert.equal(body.stream,true);assert.equal(body.response_format.type,'json_schema');assert.equal(body.response_format.json_schema.schema.properties.questions.maxItems,12);assert.deepEqual(JSON.parse(body.messages[1].content),input);assert.match(body.messages[0].content,/一次输出成稿/);assert.equal(options.headers['User-Agent'],kimi.USER_AGENT);assert(!/claude|kimi-cli|codex\/|opencode/i.test(options.headers['User-Agent']));assert.equal(options.deadlineMs,840000);return {status:200,body:stream(JSON.stringify(expected))};
  }});assert.equal(calls,1);assert.deepEqual(result.sheet,expected);assert.equal(result.provider,provider);assert.equal(result.reasoningEffort,'max');assert.deepEqual(result.usage,{input:100,output:9000,thinking:6000});assert(!JSON.stringify(result).includes('private internal reasoning'));
 }
});
test('Kimi rejects interrupted or truncated streams, invalid JSON and incomplete question sets without repair or fallback',async()=>{
 assert.throws(()=>kimi.readCompletion(stream('{}','length')),/MODEL_INCOMPLETE/);assert.throws(()=>kimi.readCompletion(stream('{}').replace('data: [DONE]','')),/MODEL_INCOMPLETE/);assert.throws(()=>kimi.readCompletion('data: invalid\n\n'),/MODEL_BAD_RESPONSE/);
 for(const output of ['{"unfinished":',JSON.stringify({...sheet(),questions:sheet().questions.slice(0,8)})]){
  let calls=0;await assert.rejects(generator.generate(input,{provider:'kimi-platform',key:'test-only',transport:async()=>{calls++;return {status:200,body:stream(output)};}}),/MODEL_CONTENT_INVALID/);assert.equal(calls,1);
 }
});
test('Kimi connection errors redact keys and unsupported endpoint kinds fail before network access',async()=>{
 const key='private-test-credential',prompt=await generator.buildExercisePrompt(input);await assert.rejects(kimi.completeKimi(prompt,{key,transport:async()=>({status:403,body:'denied '+key})}),error=>error.message==='MODEL_AUTH_FAILED'&&error.diagnostic.status===403&&!error.diagnostic.message.includes(key));assert.throws(()=>kimi.kimiProfile('untrusted'),/MODEL_ENDPOINT_INVALID/);assert.equal(generator.generationProfile('kimi-platform').timeoutMs,885000);assert.equal(generator.generationProfile('gemini').timeoutMs,885000);
});

test('Moonshot schema supplies types inside question alternatives without changing the source contract',async()=>{
 const prompt=await generator.buildExercisePrompt({...input,questionTypes:['选择','填空','解答']}),original=structuredClone(prompt.schema),compatible=kimi.kimiExerciseSchema(prompt.schema),items=compatible.properties.questions.items;
 for(const branch of items.anyOf){assert.equal(branch.type,'object');assert.equal(branch.properties.type.type,'string');assert.equal(branch.properties.choices.type,'array');assert.equal(branch.properties.choices.items.type,'string');}
 assert.equal(compatible.properties.questions.maxItems,12);assert.deepEqual(prompt.schema,original);assert.deepEqual(compatible.properties.questions.prefixItems.map(q=>q.properties.type.enum),original.properties.questions.prefixItems.map(q=>q.properties.type.enum));
});

test('Kimi K3.1 Pro、K3与K2.8目录公开准确名称和三档映射，默认仍为K3',()=>{
 const env={KIMI_API_KEY:'private-kimi-test'},p=control.publicCatalog(env).find(p=>p.id==='kimi-code');
 assert.equal(p.defaultModel,'k3');assert.deepEqual(p.models.map(m=>m.name),['Kimi K3.1 Pro','Kimi K3','Kimi K2.8 Preview']);
 for(const m of p.models){assert.deepEqual(m.efforts,{eco:'low',standard:'high',deep:'max'});for(const [effort,native]of Object.entries(m.efforts)){const g=control.snapshot({provider:p.id,model:m.id,effort},env);assert.equal(g.model,m.id);assert.equal(g.reasoningEffort,native);assert.equal(g.credentialRef,'KIMI_API_KEY');}}
 assert(!JSON.stringify(p).includes(env.KIMI_API_KEY));
 assert.throws(()=>control.snapshot({provider:'kimi-code',model:'k2.8',effort:'deep'},env),/MODEL_SELECTION_INVALID/);
});

test('Kimi三款模型三档出题均发送冻结的真实型号和强度，不回退到K3',async()=>{
 for(const model of ['k3.1-pro','k3','kimi-for-coding'])for(const effort of ['eco','standard','deep']){
  const generation=control.snapshot({provider:'kimi-code',model,effort},{KIMI_API_KEY:'test-only'});let sent;
  const result=await generator.generate(input,{generation,key:'test-only',transport:async(url,o)=>{sent=JSON.parse(o.body);assert.equal(url,'https://api.kimi.com/coding/v1/chat/completions');return {status:200,body:stream(JSON.stringify(sheet()))};}});
  assert.equal(sent.model,model);assert.equal(sent.reasoning_effort,{eco:'low',standard:'high',deep:'max'}[effort]);assert.equal(result.model,model);assert.equal(result.reasoningEffort,sent.reasoning_effort);assert.equal(result.sheet.questions.length,12);
 }
});

test('Kimi图示及学科校检共用结构调用与连接测试都沿用所选型号及强度',async()=>{
 for(const model of ['k3.1-pro','k3','kimi-for-coding'])for(const effort of ['eco','standard','deep']){
  const env={KIMI_API_KEY:'test-only'},generation=control.snapshot({provider:'kimi-code',model,effort},env),requests=[];
  const transport=async(url,o)=>{requests.push(JSON.parse(o.body));return {status:200,body:stream('{"value":703}')};};
  const result=await figures.structured({system:'仅输出JSON',input:{},schema:{type:'object',properties:{value:{type:'integer'}},required:['value']}},{generation,env,transport});
  const probe=await completion.probeModel(generation,{env,transport});
  assert.equal(result.model,model);assert(probe.probe.passed);assert.equal(probe.model,model);
  for(const body of requests){assert.equal(body.model,model);assert.equal(body.reasoning_effort,generation.reasoningEffort);assert.equal(body.stream,true);}
 }
});

test('Kimi拒绝未知型号、接口错配和未知思考强度，网络请求前即失败',async()=>{
 let calls=0;const prompt={system:'JSON',input:{},schema:{type:'object'}},options={key:'test-only',transport:async()=>{calls++;throw Error('unexpected network');}};
 for(const args of [{kind:'code',model:'k2.8'},{kind:'code',model:'https://evil.test'},{kind:'platform',model:'kimi-for-coding'},{kind:'code',model:'k3',effort:'auto'}])await assert.rejects(kimi.completeKimi(prompt,{...options,...args}),/MODEL_SELECTION_INVALID/);
 assert.equal(calls,0);assert.equal(kimi.kimiProfile('code').model,'k3');assert.equal(kimi.kimiProfile('platform').model,'kimi-k3');assert.equal(kimi.kimiProfile('platform','kimi-k3.1-pro').model,'kimi-k3.1-pro');assert.throws(()=>kimi.kimiProfile('code','kimi-k3.1-pro'),/MODEL_SELECTION_INVALID/);assert.throws(()=>kimi.kimiProfile('platform','k3.1-pro'),/MODEL_SELECTION_INVALID/);
});
