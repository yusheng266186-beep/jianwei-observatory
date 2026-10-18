import {motion,finishAnimation} from './motion.js';
const states=new WeakMap(),calm=()=>document.body.dataset.motion==='calm'||matchMedia('(prefers-reduced-motion: reduce)').matches;
const pixels=value=>Number.parseFloat(value)||0;
export function openDisclosure(details){
 if(!details)return;const previous=states.get(details);states.delete(details);previous?.animation?.cancel();delete details.dataset.disclosurePhase;details.open=true;
}
export function toggleDisclosure(details,{reducedMotion=calm,onSettled=()=>{}}={}){
 const previous=states.get(details),wanted=!(previous?.wanted??details.open),summary=[...details.children].find(el=>el.tagName==='SUMMARY');
 const before=details.getBoundingClientRect().height;previous?.animation?.cancel();
 const record={wanted};states.set(details,record);
 const complete=()=>{if(states.get(details)!==record)return false;
  if(!wanted&&details.contains(details.ownerDocument.activeElement)&&!summary?.contains(details.ownerDocument.activeElement))summary?.focus({preventScroll:true});
  details.open=wanted;delete details.dataset.disclosurePhase;states.delete(details);onSettled(details);return true;
 };
 if(!summary||reducedMotion()||typeof details.animate!=='function'){complete();return Promise.resolve(true);}
 details.open=true;details.dataset.disclosurePhase=wanted?'opening':'closing';
 const style=getComputedStyle(details),summaryStyle=getComputedStyle(summary),extra=pixels(style.paddingTop)+pixels(style.paddingBottom)+pixels(style.borderTopWidth)+pixels(style.borderBottomWidth),adjust=style.boxSizing==='border-box'?0:extra;
 const closed=summary.getBoundingClientRect().height+pixels(summaryStyle.marginTop)+pixels(summaryStyle.marginBottom)+extra,after=wanted?details.getBoundingClientRect().height:closed;
 try{record.animation=details.animate([{height:Math.max(0,before-adjust)+'px',overflow:'clip'},{height:Math.max(0,after-adjust)+'px',overflow:'clip'}],{...motion.disclose,fill:'both'});return finishAnimation(record.animation,motion.disclose.duration).then(complete);}catch{complete();return Promise.resolve(true);}
}
export function installDisclosures(root=document,options={}){
 const click=event=>{const summary=event.target.closest?.('summary'),details=summary?.parentElement;if(event.defaultPrevented||!details?.matches('details')||details.hasAttribute?.('data-native-disclosure')||event.target.closest?.('button,a,input,select,textarea,label,[contenteditable=true]')||summary.dataset.cmd||summary.dataset.aiAction)return;
  event.preventDefault();toggleDisclosure(details,options);
 };
 root.addEventListener('click',click);return ()=>root.removeEventListener('click',click);
}
