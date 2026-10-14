// One local print worker, with foreground download owners and cancellable
// preview owners. Cancelling an obsolete preview never cancels its download.
let worker=null,active=null,serial=0,idleTimer=0;
const queue=[];
const abortError=()=>new DOMException('纸面预览已取消','AbortError');
function releaseWorker(){clearTimeout(idleTimer);worker?.terminate();worker=null;}
function ensureWorker(){
 if(worker)return worker;
 worker=new Worker(new URL('./pdf-worker.js?v=runtime-v44',import.meta.url),{type:'module'});const host=worker;
 host.onmessage=({data})=>{if(worker!==host||!active||data.id!==active.id)return;finish(data.error?new Error(data.error):null,data.blob);};
 host.onerror=event=>{event.preventDefault();if(worker!==host)return;releaseWorker();if(active)finish(new Error('PDF后台组件未能载入，请重试'));};
 return worker;
}
export function warmPDFWorker(){
 if(active||queue.length)return;
 try{clearTimeout(idleTimer);ensureWorker().postMessage({warm:true});idleTimer=setTimeout(releaseWorker,90000);}catch{}
}
function next(){
 if(active||!queue.length)return;clearTimeout(idleTimer);const job=queue.shift();active=job;
 try{
  ensureWorker();
  job.timer=setTimeout(()=>{releaseWorker();finish(new Error('PDF生成超时，可缩小报告范围或先下载Word'));},120000);
  worker.postMessage({id:job.id,report:job.report});
 }catch(error){releaseWorker();finish(error);}
}
function finish(error,blob){
 const job=active;if(!job)return;active=null;clearTimeout(job.timer);job.finished=true;job.error=error;if(error)releaseWorker();error?job.reject(error):job.resolve(blob);
 if(queue.length)next();else idleTimer=setTimeout(releaseWorker,30000);
}
export function idlePDFWorker(){if(!active&&!queue.length)releaseWorker();}
export function createPDFJob(report){
 let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;}),job={id:++serial,report,resolve,reject,promise,owners:0,finished:false};queue.push(job);next();
 return {promise,get failed(){return Boolean(job.error);},claim(signal){
  if(signal?.aborted)return Promise.reject(abortError());job.owners++;
  return new Promise((yes,no)=>{
   let settled=false;const done=(error,blob)=>{if(settled)return;settled=true;signal?.removeEventListener('abort',cancel);job.owners--;error?no(error):yes(blob);};
   const cancel=()=>{done(abortError());if(job.owners||job.finished)return;if(active===job){releaseWorker();finish(abortError());}else {const i=queue.indexOf(job);if(i>=0)queue.splice(i,1);job.finished=true;job.error=abortError();job.reject(job.error);}};
   signal?.addEventListener('abort',cancel,{once:true});promise.then(blob=>done(null,blob),error=>done(error));
  });
 }};
}
