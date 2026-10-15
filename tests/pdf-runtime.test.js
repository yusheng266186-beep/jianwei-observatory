import test from 'node:test';
import assert from 'node:assert/strict';
import {createPDFJob,idlePDFWorker,suspendPDFWorker,resumePDFWorker} from '../app/io/pdf-runtime.js';
class LocalWorker{
 static hosts=[];
 constructor(){LocalWorker.hosts.push(this);this.messages=[];this.terminated=false;}
 postMessage(message){this.messages.push(message);}
 terminate(){this.terminated=true;}
 complete(blob=new Blob(['print'])){this.onmessage({data:{id:this.messages.at(-1).id,blob}});}
}
const latest=()=>LocalWorker.hosts.at(-1);

test('关闭预览不会取消同一份PDF的下载；同一后台结果交给两个消费者',async()=>{
 const original=globalThis.Worker;globalThis.Worker=LocalWorker;
 try{
  const controller=new AbortController(),job=createPDFJob({title:'同一打印材料'}),preview=job.claim(controller.signal),download=job.claim(),host=latest();
  controller.abort();await assert.rejects(preview,{name:'AbortError'});assert.equal(host.terminated,false);
  host.complete();assert.equal(await (await download).text(),'print');idlePDFWorker();assert.equal(host.terminated,true);
 }finally{idlePDFWorker();globalThis.Worker=original;}
});
test('旧预览取消后终止其后台计算，并立即处理最后一次材料；旧响应不污染新请求',async()=>{
 const original=globalThis.Worker;globalThis.Worker=LocalWorker;
 try{
  const controller=new AbortController(),old=createPDFJob({title:'旧范围'}),waiting=old.claim(controller.signal),oldHost=latest(),next=createPDFJob({title:'新范围'}),output=next.claim();
  controller.abort();await assert.rejects(waiting,{name:'AbortError'});assert.equal(oldHost.terminated,true);
  const newHost=latest();assert.notEqual(newHost,oldHost);assert.equal(newHost.messages[0].report.title,'新范围');
  let settled=false;output.then(()=>settled=true);oldHost.onmessage({data:{id:newHost.messages[0].id,blob:new Blob(['stale'])}});await Promise.resolve();assert.equal(settled,false);
  newHost.complete(new Blob(['latest']));assert.equal(await (await output).text(),'latest');idlePDFWorker();
 }finally{idlePDFWorker();globalThis.Worker=original;}
});
test('PDF组件失败会释放后台实例，直接重试使用新实例而不复用失败的模块',async()=>{
 const original=globalThis.Worker;globalThis.Worker=LocalWorker;
 try{
  const failed=createPDFJob({title:'首次'}),result=failed.claim(),host=latest();host.onmessage({data:{id:host.messages[0].id,error:'PDF组件加载失败'}});
  await assert.rejects(result,/PDF组件加载失败/);assert.equal(host.terminated,true);
  const retry=createPDFJob({title:'重试'}),output=retry.claim();assert.notEqual(latest(),host);latest().complete();assert.equal(await(await output).text(),'print');idlePDFWorker();
 }finally{idlePDFWorker();globalThis.Worker=original;}
});

test('刷新或离开文档时终止预热和排队PDF，暂停期间不启动Worker，返回后可重新准备',async()=>{const original=globalThis.Worker;globalThis.Worker=LocalWorker;try{const active=createPDFJob({title:'预备学生版'}),a=active.claim(),queued=createPDFJob({title:'预备教师版'}),q=queued.claim(),host=latest();suspendPDFWorker();await assert.rejects(a,{name:'AbortError'});await assert.rejects(q,{name:'AbortError'});assert.equal(host.terminated,true);const count=LocalWorker.hosts.length,late=createPDFJob({title:'旧页面延迟预热'});await assert.rejects(late.claim(),{name:'AbortError'});assert.equal(LocalWorker.hosts.length,count);resumePDFWorker();const current=createPDFJob({title:'返回后准备'}),result=current.claim();latest().complete();assert.equal(await(await result).text(),'print');}finally{resumePDFWorker();idlePDFWorker();globalThis.Worker=original;}});
