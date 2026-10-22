// Give the current interaction and transition a frame before optional work.
// Run one item per idle slice; input, hidden pages and cancellations take priority.
export function scheduleIdleWork(jobs,{delay=350,active=()=>true,host=globalThis}={}){
 const queue=[...jobs];let cancelled=false,handle,kind='timer';
 const clear=()=>{if(kind==='idle')host.cancelIdleCallback?.(handle);else host.clearTimeout(handle);};
 function schedule(){if(cancelled||!queue.length)return;if(host.requestIdleCallback){kind='idle';handle=host.requestIdleCallback(run);}else{kind='timer';handle=host.setTimeout(()=>run(),80);}}
 function run(deadline){
  if(cancelled||!active())return;
  if(host.document?.hidden||host.navigator?.scheduling?.isInputPending?.()||deadline&&deadline.timeRemaining()<8){kind='timer';handle=host.setTimeout(schedule,150);return;}
  const job=queue.shift();try{Promise.resolve(job()).catch(()=>{});}catch{}
  schedule();
 }
 handle=host.setTimeout(schedule,delay);return ()=>{cancelled=true;clear();};
}
