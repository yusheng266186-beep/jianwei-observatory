import {motion,visualFrame,cancelOwnMotion,finishAnimation} from './motion.js?v=runtime-v45';
import {motionReduced} from './motion-preference.js';

const states=new WeakMap();
const calm=motionReduced;
const backdropFrame=element=>element.open?getComputedStyle(element,'::backdrop').opacity:'0';
export function prepareBackdrop(element,phase,from=backdropFrame(element)){
  if(element.tagName!=='DIALOG')return;
  element.style.setProperty('--surface-backdrop-from',from);
  element.dataset.backdropPhase=phase;
}
// One interruptible lifecycle for modal windows and teacher control popovers.
// The element remains in the top layer throughout exit; a newer open cancels
// the pending close, including paused / unavailable animation fallbacks.
export function openSurface(element,{show=()=>element.showModal(),isOpen=()=>element.open,reducedMotion=calm,from:initial,timing:customTiming}={}){
  const existing=states.get(element),wasOpen=isOpen();
  if(wasOpen&&existing&&existing.phase!=='leaving')return existing.promise;
  const control=element.matches?.('.plan-picker-panel,.exercise-choice-panel'),from=wasOpen?visualFrame(element):initial||(control?{opacity:.16,transform:'translateY(6px) scale(.988)'}:{opacity:.24,transform:'translateY(12px) scale(.992)'}),backdrop=backdropFrame(element);
  cancelOwnMotion(element);
  prepareBackdrop(element,'entering',backdrop);
  const state={phase:'entering',promise:Promise.resolve()};states.set(element,state);
  element.dataset.surfaceMotion='managed';element.dataset.surfacePhase='entering';
  element.inert=false;
  if(!wasOpen)show();
  else if(existing?.focus?.isConnected&&element.contains(existing.focus))existing.focus.focus({preventScroll:true});
  element.dispatchEvent(new Event('surfaceopening'));
  element.style.willChange='transform, opacity';
  const complete=()=>{if(states.get(element)!==state)return;state.phase='open';element.dataset.surfacePhase='open';element.style.removeProperty('will-change');};
  if(reducedMotion()){complete();return Promise.resolve();}
  const timing=customTiming||(control?motion.control:motion.arrive);
  try{state.animation=element.animate([from,{opacity:1,transform:'none'}],{...timing,fill:'both'});state.promise=finishAnimation(state.animation,timing.duration).then(complete);return state.promise;}catch{complete();return Promise.resolve();}
}
export function closeSurface(element,{hide=()=>element.close(),isOpen=()=>element.open,reducedMotion=calm,to={opacity:0,transform:'translateY(8px) scale(.996)'},timing=motion.leave}={}){
  const previous=states.get(element);if(previous?.phase==='leaving')return previous.promise;
  if(!isOpen())return Promise.resolve(true);
  const from=visualFrame(element),backdrop=backdropFrame(element);cancelOwnMotion(element);
  prepareBackdrop(element,'leaving',backdrop);
  const focused=element.ownerDocument?.activeElement,state={phase:'leaving',promise:null,focus:element.contains?.(focused)?focused:null};states.set(element,state);
  element.dataset.surfaceMotion='managed';element.dataset.surfacePhase='leaving';
  element.inert=true;
  element.dispatchEvent(new Event('surfaceclosing'));
  element.style.willChange='transform, opacity';
  state.promise=(async()=>{
    if(!reducedMotion())try{state.animation=element.animate([from,to],{...timing,fill:'both'});await finishAnimation(state.animation,timing.duration);}catch{}
    if(states.get(element)!==state)return false;
    if(isOpen())hide();state.phase='closed';element.dataset.surfacePhase='closed';element.style.removeProperty('will-change');element.dispatchEvent(new Event('surfaceclosed'));return true;
  })();return state.promise;
}
