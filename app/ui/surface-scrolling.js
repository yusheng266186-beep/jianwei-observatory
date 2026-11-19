import {cancelScrollOn,scrollByMotion} from './scroll-motion.js';
import {motionReduced} from './motion-preference.js';

const editing='input:not([type=checkbox],[type=radio],[type=button],[type=submit]),textarea,select,[contenteditable]:not([contenteditable=false])';
const wheelEditing='textarea,select,input:is([type=number],[type=range]):focus,[contenteditable]:not([contenteditable=false])';
const chrome='[data-scroll-chrome]';
const verticalWheel=event=>event.cancelable&&!event.defaultPrevented&&!event.ctrlKey&&!event.metaKey&&!event.shiftKey&&Math.abs(event.deltaY)>Math.abs(event.deltaX);
const wheelPixels=(event,pane)=>event.deltaY*(event.deltaMode===1?16:event.deltaMode===2?pane.clientHeight:1);
const subpixels=new WeakMap();
function move(pane,delta){
 if(!pane?.isConnected||Math.abs(delta)<.0001)return 0;
 cancelScrollOn(pane);
 const max=Math.max(0,pane.scrollHeight-pane.clientHeight),at=pane.scrollTop,previous=subpixels.get(pane);
 const position=Math.max(0,Math.min(max,at+(previous?.at===at?previous.remainder:0)));
 const top=Math.max(0,Math.min(max,position+delta)),used=top-position;
 if(!used)return 0;
 pane.dispatchEvent(new Event('surface-scroll-input',{bubbles:true}));
 pane.scrollTo({top,behavior:'instant'});
 subpixels.set(pane,{at:pane.scrollTop,remainder:top-pane.scrollTop});
 return used;
}
function chain(inner,outer,delta){
 const used=inner===outer?0:move(inner,delta);
 return move(outer,delta-used)?outer:used?inner:null;
}
function updatePan(state,y,at,moved){
 const elapsed=Math.max(8,at-state.at),speed=(state.y-y)/elapsed;
 state.speed=elapsed>90||Math.sign(speed)!==Math.sign(state.speed)?speed:.4*state.speed+.6*speed;
 state.y=y;state.at=at;
 state.moved=moved;
}
function glide(state,at){
 const speed=Math.max(-2.4,Math.min(2.4,state?.speed||0)),pane=state?.moved;
 if(!pane?.isConnected||at-state.at>80||Math.abs(speed)<.2||motionReduced())return;
 subpixels.delete(pane);
 scrollByMotion(pane,{top:speed*130},{frequency:12,initialVelocity:{y:speed*1000}});
 return pane;
}

// Consume a vertical gesture in the bounded text or list, then send its
// remaining distance to the reading surface without a second wheel or swipe.
export function installNestedScrollHandoff(scope,selector,owner=node=>node.parentElement.closest('[data-scroll-pane],dialog')){
 let touchPan,gliding;
 const find=target=>{
  if(target?.closest?.(editing))return null;
  const node=target?.closest?.(selector);
  return node&&node.scrollHeight>node.clientHeight+1?node:null;
 };
 scope.addEventListener('wheel',event=>{
  if(!verticalWheel(event))return;
  const node=find(event.target),pane=node&&owner(node);
  if(pane&&chain(node,pane,wheelPixels(event,node)))event.preventDefault();
 },{passive:false});

 scope.addEventListener('touchstart',event=>{
  touchPan?.abort();
  const node=find(event.target),pane=node&&owner(node),touch=event.touches[0];
  if(!pane||event.touches.length!==1)return;
  const selection=node.ownerDocument.getSelection();
  if(selection&&!selection.isCollapsed&&node.contains(selection.anchorNode))return;
  cancelScrollOn(node);cancelScrollOn(pane);
  const lifecycle=touchPan=new AbortController(),signal=lifecycle.signal,stop=()=>lifecycle.abort();
  const state={y:touch.clientY,at:event.timeStamp,speed:0,moved:null};let started=false;
  node.addEventListener('touchmove',event=>{
   const finger=event.touches[0];
   if(event.touches.length!==1||finger?.identifier!==touch.identifier||!event.cancelable){stop();return;}
   const dy=state.y-finger.clientY;
   if(!started){
    const dx=Math.abs(finger.clientX-touch.clientX);
    if(dx>8&&dx>Math.abs(dy)){stop();return;}
    if(Math.abs(dy)<8||Math.abs(dy)<=dx)return;
   }
   const moved=chain(node,pane,dy);
   if(!started&&!moved){stop();return;}
   started=true;
   updatePan(state,finger.clientY,event.timeStamp,moved);
   event.preventDefault();
  },{passive:false,signal});
  node.addEventListener('touchend',event=>{if(started)gliding=glide(state,event.timeStamp);stop();},{passive:true,signal});
  node.addEventListener('touchcancel',stop,{passive:true,signal});
 },{passive:true});
 scope.addEventListener('surfaceclosing',()=>{touchPan?.abort();if(gliding)cancelScrollOn(gliding);gliding=null;});
}

// Real content panes keep their native scrolling. This only covers fixed
// toolbars and gutters which sit alongside the pane in a modal workspace.
export function installSurfaceScrolling(dialog){
 let drag,gliding;
 function paneFor(target,x,editors=editing){
  if(!dialog.open||dialog.inert||target?.closest?.('dialog')!==dialog||target.closest(editors+', [popover]'))return;
  if(target.closest('[data-scroll-pane]'))return;
  const panes=[...dialog.querySelectorAll('[data-scroll-pane]')];
  const visible=panes.filter(pane=>!pane.closest('[inert]')&&pane.clientHeight>0);
  const primary=visible.find(pane=>pane.dataset.scrollPane!=='settings')||visible[0];
  if(!Number.isFinite(x))return primary;
  return visible.find(pane=>{const {left,right}=pane.getBoundingClientRect();return x>=left&&x<=right;})||primary;
 }
 dialog.addEventListener('wheel',event=>{
  if(!verticalWheel(event))return;
  const pane=paneFor(event.target,event.clientX,wheelEditing);
  if(pane&&move(pane,wheelPixels(event,pane)))event.preventDefault();
 },{passive:false});

 // A vertical drag can start on the same fixed controls. Horizontal gestures,
 // taps and pinch zoom keep their platform behavior.
 dialog.addEventListener('pointerdown',event=>{
  if(event.pointerType!=='touch')return;
  if(!event.isPrimary){drag=null;return;}
  const bar=event.target.closest?.(chrome);
  const pane=bar&&paneFor(event.target,event.clientX);
  if(pane)cancelScrollOn(pane);
  drag=pane?{id:event.pointerId,bar,pane,x:event.clientX,y:event.clientY,at:event.timeStamp,speed:0,started:false}:null;
 });
 dialog.addEventListener('pointermove',event=>{
  if(!drag||event.pointerId!==drag.id)return;
  const dy=drag.y-event.clientY;
  if(!drag.started){
   const dx=Math.abs(event.clientX-drag.x);
   if(dx>8&&dx>Math.abs(dy)){drag=null;return;}
   if(Math.abs(dy)<8||Math.abs(dy)<=dx)return;
   drag.started=true;
   if(!drag.bar.isConnected){drag=null;return;}
   drag.bar.setPointerCapture?.(event.pointerId);
  }
  updatePan(drag,event.clientY,event.timeStamp,move(drag.pane,dy)?drag.pane:null);
 });
 dialog.addEventListener('pointerup',event=>{if(event.pointerId===drag?.id){if(drag.started)gliding=glide(drag,event.timeStamp);drag=null;}});
 dialog.addEventListener('pointercancel',event=>{if(event.pointerId===drag?.id)drag=null;});
 dialog.addEventListener('lostpointercapture',event=>{if(event.pointerId===drag?.id&&event.target===drag.bar)drag=null;});
 dialog.addEventListener('surfaceclosing',()=>{drag=null;if(gliding)cancelScrollOn(gliding);gliding=null;});

 dialog.addEventListener('keydown',event=>{
  if(event.defaultPrevented||event.altKey||event.ctrlKey||event.metaKey||!event.target.closest?.(chrome))return;
  const pane=paneFor(event.target);
  if(!pane)return;
  const page=Math.max(50,pane.clientHeight-36);
  const delta={ArrowDown:40,ArrowUp:-40,PageDown:page,PageUp:-page,Home:-pane.scrollHeight,End:pane.scrollHeight}[event.key];
  if(Number.isFinite(delta)&&move(pane,delta))event.preventDefault();
 });
}
