import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import https from 'node:https';
import transport from '../backend/tencent.cjs';

test('207字节后断流保留响应状态和类型用于区分SSE与网关错误，仍不自动重发',async()=>{
 const original=https.request;
 try{for(const status of [200,524]){
  let calls=0;https.request=(url,options,respond)=>{calls++;const req=new EventEmitter();req.setTimeout=()=>{};req.end=()=>queueMicrotask(()=>{const socket=new EventEmitter();req.emit('socket',socket);socket.emit('secureConnect');req.emit('finish');const res=new EventEmitter();res.statusCode=status;res.headers={'content-type':status===200?'text/event-stream; charset=utf-8':'text/html','set-cookie':'private-cookie','x-private-key':'private-key'};respond(res);res.emit('data',Buffer.from('x'.repeat(207)));res.emit('aborted');});return req;};
  await assert.rejects(transport.request('https://model.test',{method:'POST',body:'private-prompt',collectBody:false,deadlineMs:1000}),error=>{const d=error.diagnostic;assert.equal(d.responseBytes,207);assert.equal(d.responseStatus,status);assert.equal(d.responseType,status===200?'text/event-stream':'text/html');assert.equal(d.status,undefined);assert(!JSON.stringify(d).includes('private'));assert(!JSON.stringify(d).includes('model.test'));return true;});assert.equal(calls,1);
 }}finally{https.request=original;}
});

test('仅TLS建立前且HTTP未写出的连接错误重连一次，沿用原总时限',async()=>{
 const original=https.request;let calls=0;
 https.request=(url,options,respond)=>{const req=new EventEmitter();req.setTimeout=()=>{};req.destroy=e=>queueMicrotask(()=>req.emit('error',e));req.end=()=>queueMicrotask(()=>{const socket=new EventEmitter();req.emit('socket',socket);if(++calls===1)req.emit('error',Object.assign(Error('connect failed'),{code:'ETIMEDOUT'}));else {socket.emit('secureConnect');req.emit('finish');const res=new EventEmitter();res.statusCode=200;res.headers={};respond(res);res.emit('data',Buffer.from('ok'));res.emit('end');}});return req;};
 try{assert.equal((await transport.request('https://model.test',{method:'POST',body:'private-model-input',timeout:2000,deadlineMs:2000})).body,'ok');assert.equal(calls,2);}finally{https.request=original;}
});

test('HTTP已写出、TLS已建立或复用TLS连接时中断不自动重发，也不重试524',async()=>{
 const original=https.request;
 try{for(const mode of ['tls','written','reused','response','524']){let calls=0;https.request=(url,options,respond)=>{calls++;const req=new EventEmitter();req.setTimeout=()=>{};req.destroy=e=>queueMicrotask(()=>req.emit('error',e));req.end=()=>queueMicrotask(()=>{const socket=new EventEmitter();if(mode==='reused')Object.assign(socket,{encrypted:true,connecting:false,authorized:true});req.emit('socket',socket);if(mode==='reused')assert.equal(socket.listenerCount('secureConnect'),0);if(mode==='tls')socket.emit('secureConnect');if(mode==='written')req.emit('finish');if(mode==='response'||mode==='524'){const res=new EventEmitter();res.statusCode=mode==='524'?524:200;res.headers={};respond(res);if(mode==='524'){res.emit('data',Buffer.from('error code: 524'));res.emit('end');return;}res.emit('data',Buffer.from('partial'));}req.emit('error',Object.assign(Error('socket closed'),{code:'ECONNRESET'}));});return req;};
  if(mode==='524')assert.equal((await transport.request('https://model.test',{deadlineMs:2000})).status,524);else await assert.rejects(()=>transport.request('https://model.test',{deadlineMs:2000}),error=>{assert.equal(error.diagnostic.kind,'network');assert(!JSON.stringify(error.diagnostic).includes('model.test'));return true;});assert.equal(calls,1,mode);
 }}finally{https.request=original;}
});

test('连接重试也不能延长已耗尽的任务总时限',async()=>{
 const original=https.request;let calls=0;https.request=()=>{calls++;const req=new EventEmitter();req.setTimeout=()=>{};req.end=()=>queueMicrotask(()=>req.emit('error',Object.assign(Error('connect failed'),{code:'ETIMEDOUT'})));return req;};
 try{await assert.rejects(()=>transport.request('https://model.test',{deadlineMs:100}),/connect failed/);assert.equal(calls,1);}finally{https.request=original;}
});


test('底层连接只有错误码没有消息时，重连后仍保留可识别的连接诊断',async()=>{
 const original=https.request;let calls=0;
 https.request=()=>{calls++;const req=new EventEmitter();req.setTimeout=()=>{};req.destroy=e=>queueMicrotask(()=>req.emit('error',e));req.end=()=>queueMicrotask(()=>req.emit('error',Object.assign(Error(''),{code:'ECONNRESET'})));return req;};
 try{await assert.rejects(()=>transport.request('https://model.test',{deadlineMs:2000}),error=>{assert.equal(error.message,'ECONNRESET');assert.equal(error.code,'ECONNRESET');assert.deepEqual(error.diagnostic,{kind:'network',tlsEstablished:false,requestFinished:false,responseHeadersReceived:false,responseBytes:0});return true;});assert.equal(calls,2);}finally{https.request=original;}
});

test('持续响应达到总时限与连接空闲超时分别记录，均不能重发已到达上游的请求',async()=>{
 const original=https.request;
 try{for(const mode of ['deadline','idle']){let calls=0,received=0;
  https.request=(url,options,respond)=>{calls++;const req=new EventEmitter();let idle;
   req.setTimeout=(ms,callback)=>{idle=callback;};req.destroy=error=>queueMicrotask(()=>req.emit('error',error));
   req.end=()=>queueMicrotask(()=>{const socket=new EventEmitter();req.emit('socket',socket);socket.emit('secureConnect');req.emit('finish');const res=new EventEmitter();res.statusCode=200;res.headers={};respond(res);res.emit('data',Buffer.from('partial stream'));if(mode==='idle')idle();});return req;
  };
  await assert.rejects(()=>transport.request('https://model.test',{method:'POST',body:'private input',timeout:80,deadlineMs:30,onChunk:chunk=>{received+=chunk.length;}}),error=>{assert.equal(error.message,'NETWORK_TIMEOUT');assert.equal(error.diagnostic.timeoutKind,mode);assert.equal(error.diagnostic.timeoutMs,mode==='idle'?80:30);assert.equal(error.diagnostic.responseBytes,received);assert(error.diagnostic.requestFinished);assert(error.diagnostic.responseHeadersReceived);assert(!JSON.stringify(error.diagnostic).includes('private input'));return true;});assert.equal(calls,1);assert(received>0);
 }}finally{https.request=original;}
});
