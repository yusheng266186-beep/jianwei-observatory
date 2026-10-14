// Migration/identity/rank repair runs once in a worker, away from input and
// animation. Only our atomically saved storage metadata can bypass that work.
import {prepareURL} from './prepare-entry.js';
function task(input){return new Promise((resolve,reject)=>{
 const worker=new Worker(prepareURL,{type:'module'});
 const timer=setTimeout(()=>finish(new Error('材料整理超时，请重新打开工作区')),120000);
 function finish(error,value){clearTimeout(timer);worker.terminate();error?reject(error):resolve(value);}
 worker.onmessage=({data})=>finish(data.error?new Error(data.error):null,data.result||data.dataset);
 worker.onerror=()=>finish(new Error('材料整理组件暂时无法载入，请刷新后重试'));
 worker.postMessage(input);
});}
export const prepareDataset=dataset=>task({dataset});
export const prepareWorkspace=()=>task({operation:'hydrate'});
export const prepareMaterial=(before,incoming,mode)=>task({operation:'material',before,incoming,mode});
