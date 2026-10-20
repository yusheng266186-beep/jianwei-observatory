import test from 'node:test';import assert from 'node:assert/strict';
import upstream from '../backend/upstream-event.cjs';import kimi from '../backend/kimi.cjs';import completion from '../backend/model-completion.cjs';import figureGeneration from '../backend/figure-generation.cjs';
const sse=events=>events.map(event=>'data: '+JSON.stringify(event)+'\n\n').join('');
const capture=fn=>{try{fn();}catch(error){return error;}throw new Error('expected an upstream failure');};
test('HTTP 200 JSON error envelopes classify and keep only bounded upstream facts',()=>{
 const key='exact-secret-key-123';
 assert.throws(()=>kimi.readCompletion(JSON.stringify({error:{code:'rate_limit_exceeded',message:'Rate limit reached for requests'}}),{key}),error=>error.message==='MODEL_RATE_LIMIT'&&error.diagnostic.kind==='upstream-event'&&error.diagnostic.protocol==='kimi'&&error.diagnostic.code==='rate_limit_exceeded'&&error.diagnostic.httpStatus===200&&error.diagnostic.status===undefined);
 assert.throws(()=>completion.parseResponse({status:200,body:JSON.stringify({error:{code:429,status:'RESOURCE_EXHAUSTED',message:'Quota metric exceeded'}})},'gemini',{key}),error=>error.message==='MODEL_RATE_LIMIT'&&error.diagnostic.type==='RESOURCE_EXHAUSTED'&&error.diagnostic.code==='429'&&!JSON.stringify(error.diagnostic).includes(key));
 assert.throws(()=>completion.parseResponse({status:200,body:JSON.stringify({type:'error',error:{type:'authentication_error',message:'invalid x-api-key'}})},'anthropic'),error=>error.message==='MODEL_AUTH_FAILED'&&error.diagnostic.type==='authentication_error');
 assert.throws(()=>completion.parseResponse({status:200,body:JSON.stringify({status:'failed',error:{code:'server_error',message:'failed at https://private.example/internal'}})},'responses'),error=>error.message==='MODEL_REQUEST_FAILED'&&error.diagnostic.code==='server_error'&&!JSON.stringify(error.diagnostic).includes('private.example'));
 for(const [event,code] of [[{error:{code:'subscription_expired',message:'expired'}},'MODEL_SUBSCRIPTION_EXPIRED'],[{error:{message:'You have insufficient credits to make this request.'}},'MODEL_BALANCE_REQUIRED'],[{error:{type:'timeout_error',message:'Request timed out'}},'MODEL_UPSTREAM_TIMEOUT'],[{error:{code:'brand_new',message:'unknown failure'}},'MODEL_REQUEST_FAILED']])assert.equal(upstream.eventError(event).message,code);
});
test('SSE error events carry protocol and partial facts without a resend-friendly status',()=>{
 const key='exact-secret-key-123';
 assert.throws(()=>kimi.readCompletion(sse([{choices:[{index:0,delta:{content:'{"partial":'}}]},{error:{code:'invalid_api_key',message:'Incorrect API key provided: '+key}}]),{protocol:'kimi',key}),error=>error.message==='MODEL_AUTH_FAILED'&&error.diagnostic.kind==='upstream-event'&&error.diagnostic.protocol==='kimi'&&error.diagnostic.partial===true&&error.diagnostic.outputChars==='{"partial":'.length&&!JSON.stringify(error.diagnostic).includes(key)&&error.diagnostic.status===undefined);
 assert.throws(()=>completion.parseStream(sse([{type:'content_block_delta',delta:{type:'text_delta',text:'{"x":'}},{type:'error',error:{type:'rate_limit_error',message:'Number of requests exceeded'}}]),'anthropic',{key}),error=>error.message==='MODEL_RATE_LIMIT'&&error.diagnostic.event==='error'&&error.diagnostic.type==='rate_limit_error'&&error.diagnostic.partial===true);
 assert.throws(()=>completion.parseStream(sse([{error:{code:429,status:'RESOURCE_EXHAUSTED',message:'Too many requests'}}]),'gemini'),error=>error.message==='MODEL_RATE_LIMIT');
 assert.throws(()=>completion.parseStream(sse([{type:'response.failed',response:{status:'failed',error:{code:'server_error',status:503,message:'upstream unavailable'}}}]),'responses'),error=>error.message==='MODEL_REQUEST_FAILED'&&error.diagnostic.upstreamStatus===503&&error.diagnostic.status===undefined);
});
test('response.incomplete keeps incomplete/length semantics and normal or truncated streams are unchanged',()=>{
 assert.throws(()=>completion.parseStream(sse([{type:'response.incomplete',response:{status:'incomplete',incomplete_details:{reason:'max_output_tokens'}}}]),'responses'),error=>error.message==='MODEL_OUTPUT_LIMIT'&&error.diagnostic.kind==='upstream-event'&&error.diagnostic.reason==='max_output_tokens');
 assert.throws(()=>completion.parseStream(sse([{type:'response.incomplete',response:{status:'incomplete'}}]),'responses'),error=>error.message==='MODEL_INCOMPLETE'&&error.diagnostic.kind==='upstream-event');
 const normal=kimi.readCompletion(sse([{choices:[{index:0,delta:{content:'{"ok":true}'},finish_reason:'stop'}]}])+'data: [DONE]\n\n');assert.equal(normal.output,'{"ok":true}');
 assert.throws(()=>kimi.readCompletion(JSON.stringify({choices:[{index:0,message:{content:'{}'},finish_reason:'length'}]})),error=>error.message==='MODEL_INCOMPLETE'&&error.diagnostic.kind==='completion');
 assert.throws(()=>completion.parseStream(sse([{candidates:[{content:{parts:[{text:'{"a":1}'}]},finishReason:'MAX_TOKENS'}]}]),'gemini'),error=>error.message==='MODEL_OUTPUT_LIMIT'&&error.diagnostic.kind==='completion');
 const completed=completion.parseStream(sse([{type:'response.output_text.delta',delta:'{"value":703}'},{type:'response.completed',response:{status:'completed',output:[{type:'message',content:[{type:'output_text',text:'{"value":703}'}]}],usage:{output_tokens:10}}}]),'responses');assert.equal(completed.output,'{"value":703}');
});
test('diagnostics bound message size and redact exact, Bearer and sk-like secrets and URLs',()=>{
 const key='sk-exact-private-key-0123456789',message='key='+key+' Bearer abc.def-123 sk-another-secret-999 https://private.internal/path '+('x'.repeat(6000)),error=upstream.eventError({error:{message}},{key});
 assert.equal(error.message,'MODEL_REQUEST_FAILED');assert(error.diagnostic.message.length<=4000);
 for(const secret of [key,'abc.def-123','sk-another-secret-999','private.internal'])assert(!JSON.stringify(error.diagnostic).includes(secret));
 assert.match(error.diagnostic.message,/\[REDACTED\]/);assert.match(error.diagnostic.message,/\[URL\]/);
 const http=completion.upstreamError({status:503,body:'denied '+key+' Bearer abc.def-123'},key);
 assert(!JSON.stringify(http.diagnostic).includes(key));assert(!JSON.stringify(http.diagnostic).includes('abc.def-123'));assert.equal(http.diagnostic.status,503);
});
test('a billed partial stream with an inband 503 is never automatically resent by structured generation',async()=>{
 let calls=0,transport=async()=>{calls++;return {status:200,body:sse([{choices:[{index:0,delta:{content:'{"questions":'}}]},{error:{code:'server_error',status:503,message:'connection reset'}}])};};
 await assert.rejects(figureGeneration.structured({system:'format',input:{},schema:{type:'object',properties:{questions:{type:'array',items:{type:'object',properties:{}}}}}},{generation:{provider:'kimi-code',model:'k3',reasoningEffort:'max'},key:'test-only',transport}),error=>error.message==='MODEL_REQUEST_FAILED'&&error.diagnostic.partial===true&&error.diagnostic.status===undefined);
 assert.equal(calls,1);
});
test('JSON responses failure wrappers keep nested reasons and incomplete output limits',()=>{
 const failed={type:'response.failed',response:{error:{code:'server_error',message:'capacity unavailable'}}};
 for(const parse of [source=>kimi.readCompletion(source),source=>completion.parseResponse({status:200,body:source},'responses')])assert.throws(()=>parse(JSON.stringify(failed)),error=>error.message==='MODEL_REQUEST_FAILED'&&error.diagnostic.code==='server_error'&&error.diagnostic.message==='capacity unavailable');
 for(const data of [{type:'response.incomplete',response:{incomplete_details:{reason:'max_output_tokens'}}},{status:'incomplete',incomplete_details:{reason:'max_output_tokens'}}])assert.throws(()=>completion.parseResponse({status:200,body:JSON.stringify(data)},'responses'),error=>error.message==='MODEL_OUTPUT_LIMIT'&&error.diagnostic.reason==='max_output_tokens');
 const masked=upstream.eventError({error:{message:'SK-private-123 sk_other-private-456 subscription has expired'}}).diagnostic;
 assert(!masked.message.includes('private'));assert.equal(upstream.eventError({error:{message:'subscription has expired'}}).message,'MODEL_SUBSCRIPTION_EXPIRED');
});
test('the real HTTP 403 pre-charge quota failure is a balance error on direct, JSON and SSE paths',async()=>{
 const key='private-quota-key',real=JSON.stringify({error:{message:'预扣费额度失败, 用户剩余额度: ¥0.206664, 需要预扣费额度: ¥0.282768 (request id: example)',type:'new_api_error',param:'',code:'insufficient_user_quota'}});
 for(const error of [upstream.httpError({status:403,body:real},key),completion.upstreamError({status:403,body:real},key),upstream.eventError(JSON.parse(real),{key}),capture(()=>completion.parseResponse({status:200,body:real},'chat-completions',{key})),capture(()=>kimi.readCompletion(real,{protocol:'kimi',key}))]){
  assert.equal(error.message,'MODEL_BALANCE_REQUIRED');assert.equal(error.diagnostic.code,'insufficient_user_quota');assert.equal(error.diagnostic.type,'new_api_error');assert(!JSON.stringify(error).includes(key));
  if(error.diagnostic.kind==='upstream-event'){assert.equal(error.diagnostic.httpStatus,200);assert.equal(error.diagnostic.status,undefined);}else assert.equal(error.diagnostic.status,403);
 }
 for(const parse of [()=>completion.parseStream(sse([{error:{code:'insufficient_user_quota',message:'预扣费额度失败'}}]),'anthropic',{key}),()=>kimi.readCompletion(sse([{error:{code:'insufficient_user_quota',message:'预扣费额度失败'}}]),{protocol:'kimi',key})]){
  const error=capture(parse);assert.equal(error.message,'MODEL_BALANCE_REQUIRED');assert.equal(error.diagnostic.httpStatus,200);assert.equal(error.diagnostic.status,undefined);
 }
 await assert.rejects(kimi.completeKimi({input:{},system:'s',schema:{type:'object',properties:{}}},{key,kind:'code',transport:async()=>({status:403,body:real})}),error=>error.message==='MODEL_BALANCE_REQUIRED'&&error.diagnostic.kind==='upstream'&&error.diagnostic.status===403&&error.diagnostic.code==='insufficient_user_quota'&&!JSON.stringify(error.diagnostic).includes(key));
});
test('code-only, type-only and Chinese-only markers classify identically for HTTP and inband errors',()=>{
 const cases=[
  [{error:{code:'insufficient_user_quota'}},403,'MODEL_BALANCE_REQUIRED'],
  [{error:{code:'insufficient_quota'}},400,'MODEL_BALANCE_REQUIRED'],
  [{error:{type:'insufficient_quota'}},403,'MODEL_BALANCE_REQUIRED'],
  [{error:{message:'余额不足'}},400,'MODEL_BALANCE_REQUIRED'],
  [{error:{message:'预扣费额度失败，请充值后重试'}},403,'MODEL_BALANCE_REQUIRED'],
  [{error:{code:'subscription_expired'}},403,'MODEL_SUBSCRIPTION_EXPIRED'],
  [{error:{code:'invalid_api_key'}},400,'MODEL_AUTH_FAILED'],
  [{error:{type:'authentication_error'}},400,'MODEL_AUTH_FAILED'],
  [{error:{message:'无效APIkey'}},400,'MODEL_AUTH_FAILED']
 ];
 for(const [event,status,code] of cases){
  const body=JSON.stringify(event),direct=upstream.httpError({status,body},'secret'),inband=upstream.eventError(event,{key:'secret'});
  assert.equal(direct.message,code,body);assert.equal(inband.message,code,body);
  assert.equal(direct.diagnostic.status,status);assert.equal(inband.diagnostic.status,undefined);assert.equal(inband.diagnostic.httpStatus,200);
 }
});
test('normal permission denials, rate limits, timeouts and ordinary content keep their meaning',()=>{
 const key='secret-key',denied=JSON.stringify({error:{message:'Access denied: this key has no permission to use this model'}});
 for(const error of [upstream.httpError({status:403,body:denied},key),completion.upstreamError({status:403,body:denied},key),capture(()=>kimi.readCompletion(denied,{key}))]){
  assert.equal(error.message,'MODEL_AUTH_FAILED');assert.notEqual(error.message,'MODEL_BALANCE_REQUIRED');
 }
 assert.equal(upstream.httpError({status:429,body:JSON.stringify({error:{message:'Too many requests'}})},key).message,'MODEL_RATE_LIMIT');
 assert.equal(upstream.httpError({status:524,body:'error code: 524 '+key},key).message,'MODEL_UPSTREAM_TIMEOUT');
 assert.equal(upstream.httpError({status:408,body:''},key).message,'MODEL_UPSTREAM_TIMEOUT');
 const normal='余额不足与预扣费额度失败只是正文内容';
 assert.equal(completion.parseResponse({status:200,body:JSON.stringify({choices:[{index:0,message:{content:normal},finish_reason:'stop'}]})},'chat-completions').output,normal);
 assert.equal(kimi.readCompletion(JSON.stringify({choices:[{index:0,message:{content:normal},finish_reason:'stop'}]})).output,normal);
});
test('Kimi non-200 responses use the shared canonical categories and redact credentials',async()=>{
 const key='private-kimi-key',prompt={input:{},system:'s',schema:{type:'object',properties:{}}};
 for(const [status,body,code] of [
  [403,JSON.stringify({error:{code:'insufficient_user_quota',message:'预扣费额度失败'}}),'MODEL_BALANCE_REQUIRED'],
  [401,JSON.stringify({error:{code:'invalid_api_key'}}),'MODEL_AUTH_FAILED'],
  [429,JSON.stringify({error:{code:'rate_limit_exceeded'}}),'MODEL_RATE_LIMIT'],
  [524,'error code: 524 '+key,'MODEL_UPSTREAM_TIMEOUT'],
  [403,JSON.stringify({error:{message:'permission denied'}}),'MODEL_AUTH_FAILED']
 ]){
  await assert.rejects(kimi.completeKimi(prompt,{key,kind:'platform',transport:async()=>({status,body})}),error=>error.message===code&&error.diagnostic.kind==='upstream'&&error.diagnostic.status===status&&!JSON.stringify(error.diagnostic).includes(key));
 }
});
test('HTTP diagnostics redact exact, Bearer and sk-like secrets plus URLs and stay bounded',()=>{
 const key='sk-http-private-key-0123456789',body=JSON.stringify({error:{code:'insufficient_user_quota',message:'预扣费额度失败 '+key+' Bearer abc.def-123 https://private.example/path '+('x'.repeat(6000))}}),error=upstream.httpError({status:403,body},key);
 assert.equal(error.message,'MODEL_BALANCE_REQUIRED');assert.equal(error.diagnostic.status,403);assert(error.diagnostic.message.length<=4000);
 for(const secret of [key,'abc.def-123','private.example'])assert(!JSON.stringify(error.diagnostic).includes(secret));
 assert.match(error.diagnostic.message,/\[REDACTED\]/);assert.match(error.diagnostic.message,/\[URL\]/);
});
