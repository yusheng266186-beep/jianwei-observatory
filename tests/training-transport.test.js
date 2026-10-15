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
