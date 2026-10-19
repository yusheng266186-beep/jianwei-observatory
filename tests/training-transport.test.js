import test from 'node:test';import assert from 'node:assert/strict';import https from 'node:https';import {EventEmitter} from 'node:events';
import transport from '../backend/tencent.cjs';
test('streaming requests have an absolute deadline even when a connection stays open',async t=>{
 let destroyed=false;
 t.mock.method(https,'request',()=>{const req=new EventEmitter();req.setTimeout=()=>req;req.end=()=>{};req.destroy=error=>{destroyed=true;req.emit('error',error);};return req;});
 await assert.rejects(transport.request('https://unit.test/',{deadlineMs:10}),/NETWORK_TIMEOUT/);assert(destroyed);
});
test('transport retains split UTF-8 response bytes and rejects incomplete connections',async t=>{
 let mode='complete';
 t.mock.method(https,'request',(url,options,onResponse)=>{const req=new EventEmitter();req.setTimeout=()=>req;req.destroy=error=>req.emit('error',error);req.end=()=>queueMicrotask(()=>{const res=new EventEmitter();res.statusCode=200;res.headers={};res.destroy=error=>res.emit('error',error);onResponse(res);if(mode==='aborted')return res.emit('aborted');const data=Buffer.from('data: 中文\n\n');res.emit('data',data.subarray(0,7));res.emit('data',data.subarray(7));res.emit('end');});return req;});
 assert.equal((await transport.request('https://unit.test/',{deadlineMs:100})).body,'data: 中文\n\n');mode='aborted';await assert.rejects(transport.request('https://unit.test/'),/NETWORK_INTERRUPTED/);
});
test('取消信号会关闭已开始和未开始的请求，不触发未处理错误',async t=>{let ended=0; t.mock.method(https,'request',()=>{const req=new EventEmitter();req.setTimeout=()=>req;req.end=()=>{ended++;};req.destroy=error=>req.emit('error',error);return req;});const first=new AbortController();first.abort();await assert.rejects(transport.request('https://unit.test/',{signal:first.signal}),/JOB_CANCELLED/);assert.equal(ended,0);const second=new AbortController(),pending=transport.request('https://unit.test/',{signal:second.signal});second.abort();await assert.rejects(pending,/JOB_CANCELLED/);assert.equal(ended,1);});

test('私有文档读取容纳完整大图与正文，超过8MiB仍拒绝，不改变通用传输预算',async t=>{
 const {COSStore}=await import('../backend/store.cjs');let content=JSON.stringify({image:{data:'A'.repeat(5200000)},text:'文'.repeat(500000)});assert(Buffer.byteLength(content)>6*1024*1024);
 t.mock.method(https,'request',(url,options,onResponse)=>{const req=new EventEmitter();req.setTimeout=()=>req;req.destroy=error=>req.emit('error',error);req.end=()=>queueMicrotask(()=>{const res=new EventEmitter();res.statusCode=200;res.headers={etag:'test'};let destroyed=false;res.destroy=error=>{destroyed=true;res.emit('error',error);};onResponse(res);res.emit('data',Buffer.from(content));if(!destroyed)res.emit('end');});return req;});
 const store=new COSStore({bucket:'unit-test-123456',auth:{SecretId:'test',SecretKey:'test'}});assert.deepEqual((await store.get('jobs/test/result.json')).value,JSON.parse(content));
 await assert.rejects(transport.cos('unit.test','/test',{auth:{SecretId:'test',SecretKey:'test'}}),/RESPONSE_LIMIT/);content=JSON.stringify({data:'A'.repeat(8*1024*1024)});await assert.rejects(store.get('jobs/test/result.json'),/RESPONSE_LIMIT/);
});
