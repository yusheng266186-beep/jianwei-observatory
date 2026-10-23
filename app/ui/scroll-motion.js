import {springAt} from './spring-motion.js';
import {motionReduced} from './motion-preference.js';

const geometry=host=>{
 const view=host.window===host,box=view?host.document.scrollingElement:host;
 return {left:view?host.scrollX:host.scrollLeft,top:view?host.scrollY:host.scrollTop,maxLeft:Math.max(0,box.scrollWidth-(view?host.innerWidth:box.clientWidth)),maxTop:Math.max(0,box.scrollHeight-(view?host.innerHeight:box.clientHeight)),marker:view?host.document.documentElement:host};
};
const clamp=(value,max)=>Math.max(0,Math.min(max,Number(value)||0));
export function createScrollMotion({now=()=>performance.now(),requestFrame=fn=>requestAnimationFrame(fn),cancelFrame=id=>cancelAnimationFrame(id),read=geometry,write=(host,p)=>host.scrollTo({...p,behavior:'instant'}),reducedMotion=motionReduced}={}){
 const states=new WeakMap(),active=new Set();let frame=null;
 const cleanup=(state,done)=>{if(states.get(state.host)!==state)return;states.delete(state.host);active.delete(state);if(state.marker?.dataset)delete state.marker.dataset.scrollMotion;state.resolve(done);if(!active.size&&frame!==null){cancelFrame(frame);frame=null;}};
 const schedule=()=>{if(frame===null&&active.size)frame=requestFrame(tick);};
 function tick(){
  frame=null;const time=now();
  for(const state of [...active]){
   if(state.host.isConnected===false){cleanup(state,false);continue;}
   const pos=read(state.host);
   // A restore, scrollbar drag or another owner wins over an old scroll intent.
   if(Math.abs(pos.left-state.last.x)>2||Math.abs(pos.top-state.last.y)>2){cleanup(state,false);continue;}
   const target={x:clamp(state.target.x,pos.maxLeft),y:clamp(state.target.y,pos.maxTop)};
   if(target.x!==state.target.x||target.y!==state.target.y){state.velocity=springAt(state.from,state.target,state.velocity,(time-state.start)/1000,state.frequency).velocity;state.from={x:pos.left,y:pos.top};state.start=time;state.target=target;}
   const current=springAt(state.from,state.target,state.velocity,(time-state.start)/1000,state.frequency),done=time-state.start>=900||['x','y'].every(k=>Math.abs(current.value[k]-state.target[k])<.5&&Math.abs(current.velocity[k])<10),value=done?state.target:current.value;
   write(state.host,{left:clamp(value.x,pos.maxLeft),top:clamp(value.y,pos.maxTop)});const actual=read(state.host);state.last={x:actual.left,y:actual.top};
   if(done)cleanup(state,true);
  }
  schedule();
 }
 function to(host,values,{immediate=false,frequency=24}={}){
  const pos=read(host),old=states.get(host),time=now(),from={x:pos.left,y:pos.top},target={x:clamp(values.left??old?.target.x??from.x,pos.maxLeft),y:clamp(values.top??old?.target.y??from.y,pos.maxTop)},velocity=old?springAt(old.from,old.target,old.velocity,(time-old.start)/1000,old.frequency).velocity:{};
  if(old&&!immediate&&!reducedMotion()&&old.target.x===target.x&&old.target.y===target.y&&Math.abs(pos.left-old.last.x)<=2&&Math.abs(pos.top-old.last.y)<=2)return old.promise;
  if(old)cleanup(old,false);
  if(immediate||reducedMotion()||['x','y'].every(k=>Math.abs(from[k]-target[k])<.5)){write(host,{left:target.x,top:target.y});return Promise.resolve(true);}
  let resolve;const promise=new Promise(done=>resolve=done),state={host,from,target,velocity,start:time,frequency,resolve,promise,last:from,marker:pos.marker};states.set(host,state);active.add(state);if(pos.marker?.dataset)pos.marker.dataset.scrollMotion='running';schedule();return promise;
 }
 return {to,by(host,{left=0,top=0},options){const pos=read(host),old=states.get(host);return to(host,{left:(old?.target.x??pos.left)+left,top:(old?.target.y??pos.top)+top},options);},cancel(host){const state=states.get(host);if(state)cleanup(state,false);},cancelAll(){for(const state of [...active])cleanup(state,false);},finishAll(){for(const state of [...active]){const pos=read(state.host);write(state.host,{left:clamp(state.target.x,pos.maxLeft),top:clamp(state.target.y,pos.maxTop)});cleanup(state,true);}},activeHosts:()=>[...active].map(s=>s.host)};
}
let shared;
const controller=()=>shared||(shared=createScrollMotion());
export const scrollToMotion=(host,values,options)=>controller().to(host,values,options);
export const scrollByMotion=(host,values,options)=>controller().by(host,values,options);
export const cancelScrollMotion=()=>shared?.cancelAll();
const installations=new WeakSet();
export function installScrollMotion(doc=document){
 if(installations.has(doc))return;installations.add(doc);const view=doc.defaultView;
 const cancel=event=>{for(const host of controller().activeHosts())if(host===view||host.contains?.(event.target))controller().cancel(host);};
 for(const type of ['wheel','touchstart'])doc.addEventListener(type,cancel,{passive:true,capture:true});
 doc.addEventListener('pointerdown',event=>{if(!event.target.closest?.('button,a,summary,[role=button]'))cancel(event);},{passive:true,capture:true});
 doc.addEventListener('keydown',event=>{if(['ArrowDown','ArrowUp','ArrowLeft','ArrowRight','PageUp','PageDown','Home','End',' '].includes(event.key)&&!event.target.matches?.('.trajectory-scroll')&&!event.target.closest?.('button,a,summary,[role=button]'))cancel(event);});
 doc.addEventListener('motionpreferencechange',event=>{if(event.detail.reduced)shared?.finishAll();});view.addEventListener('blur',cancelScrollMotion);view.addEventListener('resize',cancelScrollMotion);
 doc.addEventListener('visibilitychange',()=>{if(doc.hidden)cancelScrollMotion();});
}
