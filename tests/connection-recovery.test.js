import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import https from 'node:https';
import transport from '../backend/tencent.cjs';

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
