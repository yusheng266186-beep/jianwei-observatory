import {motion,visualFrame,cancelOwnMotion,finishAnimation} from './motion.js?v=runtime-v36';

const states=new WeakMap();
const calm=()=>document.body.dataset.motion==='calm'||matchMedia('(prefers-reduced-motion: reduce)').matches;
const backdropFrame=element=>element.open?getComputedStyle(element,'::backdrop').opacity:'0';
export function prepareBackdrop(element,phase,from=backdropFrame(element)){
  if(element.tagName!=='DIALOG')return;
  element.style.setProperty('--surface-backdrop-from',from);
  element.dataset.backdropPhase=phase;
}
// One interruptible lifecycle for modal windows and teacher control popovers.
// The element remains in the top layer throughout exit; a newer open cancels
// the pending close, including paused / unavailable animation fallbacks.
export function openSurface(element,{show=()=>element.showModal(),isOpen=()=>element.open,reducedMotion=calm,from:initial}={}){
  const existing=states.get(element),wasOpen=isOpen();
  if(wasOpen&&existing&&existing.phase!=='leaving')return existing.promise;
  const from=wasOpen?visualFrame(element):initial||{opacity:.16,transform:'translateY(12px) scale(.988)'},backdrop=backdropFrame(element);
  cancelOwnMotion(element);
  prepareBackdrop(element,'entering',backdrop);
  const state={phase:'entering'};states.set(element,state);
  element.dataset.surfaceMotion='managed';element.dataset.surfacePhase='entering';
  if(!wasOpen)show();
  element.dispatchEvent(new Event('surfaceopening'));
  element.style.willChange='transform, opacity';
  const complete=()=>{if(states.get(element)!==state)return;state.phase='open';element.dataset.surfacePhase='open';element.style.removeProperty('will-change');};
  if(reducedMotion()){complete();return Promise.resolve();}
  const timing=element.matches?.('.plan-picker-panel')?motion.control:motion.arrive;
  try{state.animation=element.animate([from,{opacity:1,transform:'none'}],{...timing,fill:'both'});state.promise=finishAnimation(state.animation,timing.duration).then(complete);return state.promise;}catch{complete();return Promise.resolve();}
}
export function closeSurface(element,{hide=()=>element.close(),isOpen=()=>element.open,reducedMotion=calm}={}){
  const previous=states.get(element);if(previous?.phase==='leaving')return previous.promise;
  if(!isOpen())return Promise.resolve(true);
  const from=visualFrame(element),backdrop=backdropFrame(element);cancelOwnMotion(element);
  prepareBackdrop(element,'leaving',backdrop);
  const state={phase:'leaving',promise:null};states.set(element,state);
  element.dataset.surfaceMotion='managed';element.dataset.surfacePhase='leaving';
  element.dispatchEvent(new Event('surfaceclosing'));
  element.style.willChange='transform, opacity';
  state.promise=(async()=>{
    if(!reducedMotion())try{state.animation=element.animate([from,{opacity:0,transform:'translateY(8px) scale(.994)'}],{...motion.leave,fill:'both'});await finishAnimation(state.animation,motion.leave.duration);}catch{}
    if(states.get(element)!==state)return false;
    if(isOpen())hide();state.phase='closed';element.dataset.surfacePhase='closed';element.style.removeProperty('will-change');element.dispatchEvent(new Event('surfaceclosed'));return true;
  })();return state.promise;
}
