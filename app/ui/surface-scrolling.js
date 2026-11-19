const editing='input,textarea,select,[contenteditable]:not([contenteditable=false])';
const chrome='[data-scroll-chrome]';
const verticalWheel=event=>!event.defaultPrevented&&!event.ctrlKey&&!event.metaKey&&!event.shiftKey&&Math.abs(event.deltaY)>Math.abs(event.deltaX);
const wheelPixels=(event,pane)=>event.deltaY*(event.deltaMode===1?16:event.deltaMode===2?pane.clientHeight:1);
function move(pane,delta){
 if(!pane?.isConnected)return false;
 const top=Math.max(0,Math.min(pane.scrollHeight-pane.clientHeight,pane.scrollTop+delta));
 if(Math.abs(top-pane.scrollTop)<.01)return false;
 pane.dispatchEvent(new Event('surface-scroll-input',{bubbles:true}));
 pane.scrollTo({top,behavior:'instant'});
 return true;
}

// Some bounded lists need their own scrollbar. Hand an outward gesture at
// their edge to the containing workspace, including engines that latch onto
// the inner region even after its last line.
export function installNestedScrollHandoff(scope,selector,owner=node=>node.parentElement.closest('[data-scroll-pane],dialog')){
 const find=target=>{
  const node=target?.closest?.(selector);
  return node&&node.scrollHeight>node.clientHeight+1?node:null;
 };
 const edge=(node,delta)=>delta>0?node.scrollHeight-node.clientHeight-node.scrollTop<=1:node.scrollTop<=1;
 scope.addEventListener('wheel',event=>{
  if(!event.cancelable||!verticalWheel(event))return;
  const node=find(event.target),pane=node&&owner(node);
  if(pane&&edge(node,event.deltaY)&&move(pane,wheelPixels(event,pane)))event.preventDefault();
 },{passive:false});

 scope.addEventListener('touchstart',event=>{
  const node=find(event.target),pane=node&&owner(node),touch=event.touches[0];
  if(!pane||event.touches.length!==1||!edge(node,1)&&!edge(node,-1))return;
  const lifecycle=new AbortController(),signal=lifecycle.signal;
  let y=touch.clientY,started=false;
  node.addEventListener('touchmove',event=>{
   const finger=event.touches[0];
   if(event.touches.length!==1||finger?.identifier!==touch.identifier||!event.cancelable){lifecycle.abort();return;}
   const dy=y-finger.clientY;
   if(!started){
    const dx=Math.abs(finger.clientX-touch.clientX);
    if(dx>8&&dx>Math.abs(dy)){lifecycle.abort();return;}
    if(Math.abs(dy)<8)return;
    if(!edge(node,dy)||!move(pane,dy)){lifecycle.abort();return;}
    started=true;
   }else move(pane,dy);
   y=finger.clientY;
   event.preventDefault();
  },{passive:false,signal});
  for(const type of ['touchend','touchcancel'])node.addEventListener(type,()=>lifecycle.abort(),{passive:true,signal});
 },{passive:true});
}

// Real content panes keep their native scrolling. This only covers fixed
// toolbars and gutters which sit alongside the pane in a modal workspace.
export function installSurfaceScrolling(dialog){
 let drag;
 function paneFor(target,x){
  if(!dialog.open||dialog.inert||target?.closest?.('dialog')!==dialog||target.closest(editing+', [popover]'))return;
  if(target.closest('[data-scroll-pane]'))return;
  const panes=[...dialog.querySelectorAll('[data-scroll-pane]')];
  const visible=panes.filter(pane=>!pane.closest('[inert]')&&pane.clientHeight>0);
  const primary=visible.find(pane=>pane.dataset.scrollPane!=='settings')||visible[0];
  if(!Number.isFinite(x))return primary;
  return visible.find(pane=>{const {left,right}=pane.getBoundingClientRect();return x>=left&&x<=right;})||primary;
 }
 dialog.addEventListener('wheel',event=>{
  if(!verticalWheel(event))return;
  const pane=paneFor(event.target,event.clientX);
  if(pane&&move(pane,wheelPixels(event,pane)))event.preventDefault();
 },{passive:false});

 // A vertical drag can start on the same fixed controls. Horizontal gestures,
 // taps and pinch zoom keep their platform behavior.
 dialog.addEventListener('pointerdown',event=>{
  if(event.pointerType!=='touch')return;
  if(!event.isPrimary){drag=null;return;}
  const bar=event.target.closest?.(chrome);
  const pane=bar&&paneFor(event.target,event.clientX);
  drag=pane?{id:event.pointerId,bar,pane,x:event.clientX,y:event.clientY,started:false}:null;
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
  move(drag.pane,dy);
  drag.y=event.clientY;
 });
 for(const type of ['pointerup','pointercancel']){
  dialog.addEventListener(type,event=>{if(event.pointerId===drag?.id)drag=null;});
 }
 dialog.addEventListener('lostpointercapture',event=>{if(event.pointerId===drag?.id&&event.target===drag.bar)drag=null;});
 dialog.addEventListener('surfaceclosing',()=>{drag=null;});

 dialog.addEventListener('keydown',event=>{
  if(event.defaultPrevented||event.altKey||event.ctrlKey||event.metaKey||!event.target.closest?.(chrome))return;
  const pane=paneFor(event.target);
  if(!pane)return;
  const page=Math.max(50,pane.clientHeight-36);
  const delta={ArrowDown:40,ArrowUp:-40,PageDown:page,PageUp:-page,Home:-pane.scrollHeight,End:pane.scrollHeight}[event.key];
  if(Number.isFinite(delta)&&move(pane,delta))event.preventDefault();
 });
}
