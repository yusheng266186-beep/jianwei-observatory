import {animateSpring,stopSpring} from './spring-motion.js';
import {motionReduced,installMotionPreference} from './motion-preference.js';
import {refreshMotion} from './motion.js';

const installations=new WeakMap();
// Press uses an independent scale, so it composes with hover lift, Dock travel
// and selection rather than replacing their transforms. Only active controls
// are tracked; a large student directory needs no per-button setup or listeners.
export function installControlMotion(doc=document){
 refreshMotion();
 if(installations.has(doc))return installations.get(doc);
 installMotionPreference(doc);
 const view=doc.defaultView||globalThis,events=new AbortController(),active=new Map(),pointers=new Map();let keyboard=null,serial=0;
 const listen=(host,type,fn)=>host.addEventListener(type,fn,{signal:events.signal});
 const control=target=>{
  const node=target?.closest?.('button,a.button,[role=button],summary');
  return node?.namespaceURI==='http://www.w3.org/1999/xhtml'&&!node.disabled&&node.getAttribute('aria-disabled')!=='true'&&!node.closest('[inert],.scene-leaving-viewport')?node:null;
 };
 function change(node,pressed,{immediate=false}={}){
  if(!node)return;const before=active.get(node);if(before?.pressed===pressed&&!immediate)return;
  const id=++serial,state={id,pressed};active.set(node,state);node.dataset.motionControl='true';
  const compression=pressed&&!motionReduced()?(node.matches('summary')||node.offsetWidth>240?6:node.matches('.icon-only,.icon-button,.toast-dismiss')?28:14):0;
  node.style.scale=String(1-compression/1000);
  animateSpring(node,{compression},{from:{compression:0},channel:'press',frequency:pressed?70:34,immediate:immediate||motionReduced(),map:value=>({scale:String(1-value.compression/1000)})}).then(()=>{
   if(active.get(node)!==state||pressed)return;
   active.delete(node);stopSpring(node,'press');node.style.removeProperty('scale');
  });
 }
 function releaseAll(immediate=false){pointers.clear();keyboard=null;for(const node of active.keys())change(node,false,{immediate});}
 listen(doc,'pointerdown',event=>{if(event.button!==0||event.isPrimary===false)return;const node=control(event.target);if(!node)return;pointers.set(event.pointerId,node);change(node,true);});
 listen(doc,'pointerup',event=>{const node=pointers.get(event.pointerId);pointers.delete(event.pointerId);change(node,false);});
 listen(doc,'pointercancel',event=>{const node=pointers.get(event.pointerId);pointers.delete(event.pointerId);change(node,false);});
 listen(doc,'pointerout',event=>{const node=pointers.get(event.pointerId);if(node&&!node.contains(event.relatedTarget))change(node,false);});
 listen(doc,'pointerover',event=>{const node=pointers.get(event.pointerId);if(node?.contains(event.target)&&event.buttons===1)change(node,true);});
 listen(doc,'keydown',event=>{if(event.repeat||event.altKey||event.ctrlKey||event.metaKey||!['Enter',' '].includes(event.key))return;const node=control(event.target);if(!node)return;keyboard=node;change(node,true);});
 listen(doc,'keyup',event=>{if(!['Enter',' '].includes(event.key))return;change(keyboard,false);keyboard=null;});
 listen(doc,'focusout',event=>{if(keyboard&&keyboard===event.target){change(keyboard,false);keyboard=null;}});
 listen(doc,'dragstart',()=>releaseAll(true));listen(view,'blur',()=>releaseAll(true));
 listen(doc,'visibilitychange',()=>{if(doc.hidden)releaseAll(true);});
 listen(doc,'motionpreferencechange',event=>{if(event.detail.reduced)releaseAll(true);});
 const dispose=()=>{events.abort();releaseAll(true);installations.delete(doc);};installations.set(doc,dispose);return dispose;
}
