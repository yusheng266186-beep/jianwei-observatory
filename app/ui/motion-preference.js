import {preference} from '../data/storage.js';

export const motionReduced=()=>globalThis.document?.body?.dataset.motion==='calm'||Boolean(globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches);

const installed=new WeakMap();
// A preference change applies to animations already in flight as well as the
// next interaction. Completing finite work releases modal/disclosure lifecycles.
export function installMotionPreference(doc=document){
 if(installed.has(doc))return installed.get(doc);
 if(!doc.body.hasAttribute('data-motion'))doc.body.dataset.motion=preference('reading',{})?.motion==='calm'?'calm':'system';
 const view=doc.defaultView||globalThis,query=view.matchMedia('(prefers-reduced-motion: reduce)');let previous;
 const sync=()=>{
  const reduced=doc.body?.dataset.motion==='calm'||query.matches;if(reduced===previous)return;previous=reduced;
  if(reduced)for(const animation of doc.getAnimations())try{if(animation.effect?.getTiming().iterations!==Infinity)animation.finish();}catch{try{animation.cancel();}catch{}}
  doc.dispatchEvent(new view.CustomEvent('motionpreferencechange',{detail:{reduced}}));
 };
 const observer=new view.MutationObserver(sync);observer.observe(doc.body,{attributes:true,attributeFilter:['data-motion']});query.addEventListener('change',sync);sync();
 const dispose=()=>{observer.disconnect();query.removeEventListener('change',sync);installed.delete(doc);};installed.set(doc,dispose);return dispose;
}
