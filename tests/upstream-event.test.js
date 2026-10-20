import test from 'node:test';import assert from 'node:assert/strict';
import upstream from '../backend/upstream-event.cjs';import kimi from '../backend/kimi.cjs';import completion from '../backend/model-completion.cjs';import figureGeneration from '../backend/figure-generation.cjs';
const sse=events=>events.map(event=>'data: '+JSON.stringify(event)+'\n\n').join('');
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
