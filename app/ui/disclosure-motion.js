import {motion,finishAnimation} from './motion.js';
import {motionReduced} from './motion-preference.js';
const states=new WeakMap(),pixels=value=>Number.parseFloat(value)||0;
export function openDisclosure(details){
 if(!details)return;states.get(details)?.stop();states.delete(details);delete details.dataset.disclosurePhase;details.open=true;
}
export function toggleDisclosure(details,{reducedMotion=motionReduced,onSettled=()=>{}}={}){
 const previous=states.get(details),wanted=!(previous?.wanted??details.open),summary=[...details.children].find(el=>el.tagName==='SUMMARY'),before=details.getBoundingClientRect().height;
 previous?.stop();
 let resolve,observer,childrenObserver,resizeFrame=0;
 const promise=new Promise(done=>resolve=done),record={wanted,animation:null,promise,stop(){observer?.disconnect();childrenObserver?.disconnect();if(resizeFrame)cancelAnimationFrame(resizeFrame);record.animation?.cancel();resolve(false);}};states.set(details,record);
 const complete=()=>{
  if(states.get(details)!==record)return;
  observer?.disconnect();childrenObserver?.disconnect();if(resizeFrame)cancelAnimationFrame(resizeFrame);
  if(!wanted&&details.contains(details.ownerDocument.activeElement)&&!summary?.contains(details.ownerDocument.activeElement))summary?.focus({preventScroll:true});
  details.open=wanted;delete details.dataset.disclosurePhase;states.delete(details);resolve(true);onSettled(details);
 };
 if(!summary||reducedMotion()||typeof details.animate!=='function'){complete();return promise;}
 details.open=true;details.dataset.disclosurePhase=wanted?'opening':'closing';
 function measure(){
  const style=getComputedStyle(details),summaryStyle=getComputedStyle(summary),extra=pixels(style.paddingTop)+pixels(style.paddingBottom)+pixels(style.borderTopWidth)+pixels(style.borderBottomWidth);
  return {adjust:style.boxSizing==='border-box'?0:extra,height:wanted?details.getBoundingClientRect().height:(summary.offsetHeight||summary.getBoundingClientRect().height)+pixels(summaryStyle.marginTop)+pixels(summaryStyle.marginBottom)+extra};
 }
 function run(start,timing){
  const {height,adjust}=measure();record.target=height;
  try{
   const animation=details.animate([{height:Math.max(0,start-adjust)+'px',overflow:'clip'},{height:Math.max(0,height-adjust)+'px',overflow:'clip'}],{...timing,fill:'both'});record.animation=animation;
   finishAnimation(animation,timing.duration).then(()=>{if(record.animation===animation)complete();});
  }catch{complete();}
 }
 run(before,motion.disclose);
 // Observe the content, never the animated outer height. Font loading, responsive
 // wrapping and async text can then retarget from the current frame without a
 // resize feedback loop or a jump when automatic height is finally restored.
 if(states.get(details)===record&&typeof ResizeObserver==='function'){
  const sizes=new WeakMap();
  const schedule=()=>{if(resizeFrame)return;resizeFrame=requestAnimationFrame(()=>{resizeFrame=0;if(states.get(details)!==record)return;const current=details.getBoundingClientRect().height;record.animation?.cancel();run(current,motion.control);});};
  const observe=()=>{for(const child of details.children){if(sizes.has(child))continue;sizes.set(child,{width:child.offsetWidth,height:child.offsetHeight});observer.observe(child,{box:'border-box'});}};
  observer=new ResizeObserver(entries=>{let changed=false;for(const entry of entries){const box=entry.borderBoxSize?.[0]||(entry.borderBoxSize?.inlineSize!=null?entry.borderBoxSize:null),rect=box?{width:box.inlineSize,height:box.blockSize}:entry.target.getBoundingClientRect(),last=sizes.get(entry.target);if(last&&(Math.abs(last.width-rect.width)>1||Math.abs(last.height-rect.height)>1))changed=true;sizes.set(entry.target,rect);}if(changed)schedule();});observe();
  if(typeof MutationObserver==='function'){childrenObserver=new MutationObserver(()=>{observe();schedule();});childrenObserver.observe(details,{childList:true});}
 }
 return promise;
}
export function installDisclosures(root=document,options={}){
 const click=event=>{const summary=event.target.closest?.('summary'),details=summary?.parentElement;if(event.defaultPrevented||!details?.matches('details')||details.hasAttribute?.('data-native-disclosure')||event.target.closest?.('button,a,input,select,textarea,label,[contenteditable=true]')||summary.dataset.cmd||summary.dataset.aiAction)return;
  event.preventDefault();toggleDisclosure(details,options);
 };
 root.addEventListener('click',click);return ()=>root.removeEventListener('click',click);
}
