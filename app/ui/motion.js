import {animateSpring,springFrame,stopSpring} from './spring-motion.js';
import {finishAnimation} from './animation-lifecycle.js';
export {finishAnimation};
// Native animations keep the live controls available throughout a transition.
// CSS and native animations read the same tokens. Defaults also allow engine
// tests and environments without a document to import this module.
let tokens;
const token=(name,fallback)=>tokens?.getPropertyValue('--motion-'+name).trim()||fallback;
const duration=(name,fallback)=>{const value=token(name,fallback+'ms');return parseFloat(value)*(value.endsWith('ms')?1:1000);};
export let settle,travel,hoverDelay;
const step=(name,ms,easing=settle)=>({duration:duration(name,ms),easing});
export const motion={};
export function refreshMotion(){
 tokens=typeof document!=='undefined'&&typeof getComputedStyle==='function'?getComputedStyle(document.documentElement):null;
 settle=token('ease','cubic-bezier(.22,1,.36,1)');travel=token('travel-ease','cubic-bezier(.2,.78,.22,1)');hoverDelay=duration('hover-delay',140);
 Object.assign(motion,{feedback:step('feedback',160),control:step('control',220),disclose:step('disclose',280),arrive:step('arrive',340),arrange:step('arrange',300),travel:step('travel',400,travel),leave:step('leave',180,token('exit-ease','cubic-bezier(.4,0,.75,.25)'))});
}
// Module preload may evaluate before optional theme links finish, especially in
// WebKit. Refresh once the interactive shell mounts, then share these timings.
refreshMotion();
export function visualFrame(element){const style=getComputedStyle(element);return {opacity:style.opacity,transform:style.transform};}
export function cancelOwnMotion(element){try{for(const animation of element.getAnimations?.()||[])try{animation.cancel();}catch{}}catch{}}
let canvasSlide=null,slideSerial=0;
function pinFixed(node,box,rect) {
  Object.assign(node.style,{position:'absolute',left:(box.left-rect.left)+'px',top:(box.top-rect.top)+'px',bottom:'auto',right:'auto',width:box.width+'px',height:box.height+'px',margin:'0',transform:'none'});
}
export function finishCanvasSlide() {
  const active=canvasSlide;if(!active)return;canvasSlide=null;
  stopSpring(active.canvas,'scene');
  for(const plane of active.planes)stopSpring(plane.node,'scene');
  for(const {node,style} of active.fixed)node.style.cssText=style;
  active.host.remove();active.canvas.style.removeProperty('will-change');active.canvas.removeAttribute('data-sliding');clearTimeout(active.timer);active.onCleanup();
}
// Move the outgoing live DOM into a clipped, inert plane. The real main stays
// interactive; no screenshot transition or delayed navigation is involved.
export function prepareCanvasSlide(canvas,direction,{onCleanup=()=>{}}={}) {
  const rect=canvas.getBoundingClientRect(),style=getComputedStyle(canvas),opacity=style.opacity,previous=canvasSlide,continuation=springFrame(canvas,'scene');
  const fixed=[...canvas.querySelectorAll('.compare-tray')].map(node=>({node,rect:node.getBoundingClientRect()}));
  // Retain every still-visible outgoing plane on rapid navigation. Removing the
  // predecessor here exposes a blank half-screen and makes a reversal jump.
  if(previous){clearTimeout(previous.timer);for(const item of previous.fixed)item.node.style.cssText=item.style;}
  stopSpring(canvas,'scene');cancelOwnMotion(canvas);
  const host=previous?.host||document.createElement('div'),leaving=document.createElement('div'),prefix='leaving-'+(++slideSerial)+'-';
  const width=document.documentElement.clientWidth,planes=(previous?.planes||[]).filter(plane=>{const box=plane.node.getBoundingClientRect();if(box.right>0&&box.left<width)return true;stopSpring(plane.node,'scene');plane.node.remove();return false;});
  host.className='scene-leaving-viewport';host.inert=true;host.setAttribute('aria-hidden','true');
  leaving.className=canvas.className+' scene-leaving-canvas';Object.assign(leaving.dataset,canvas.dataset);delete leaving.dataset.loading;
  leaving.style.cssText=canvas.style.cssText;
  Object.assign(leaving.style,{position:'absolute',left:rect.left+'px',top:rect.top+'px',width:rect.width+'px',height:rect.height+'px',maxWidth:'none',margin:'0',opacity,transform:'none'});
  leaving.append(...canvas.childNodes);
  // IDs belong exclusively to the active scene, including SVG paint servers.
  const ids=new Map([...leaving.querySelectorAll('[id]')].map(node=>[node.id,prefix+node.id]));
  // Visit only reference-bearing nodes, rather than every cell and attribute in
  // a long grade table. Renaming IDs still preserves SVG gradients and labels.
  for(const node of leaving.querySelectorAll('[id],[href],[*|href],[aria-labelledby],[aria-describedby],[aria-controls],[for],[fill],[stroke],[filter],[clip-path],[mask],[style]'))for(const name of ['id','href','xlink:href','aria-labelledby','aria-describedby','aria-controls','for','fill','stroke','filter','clip-path','mask','style']) {
    const before=node.getAttribute(name);if(before===null)continue;let value=before;
    if(name==='id')value=ids.get(value);
    else if(['href','xlink:href'].includes(name)&&value.startsWith('#'))value='#'+(ids.get(value.slice(1))||value.slice(1));
    else if(['aria-labelledby','aria-describedby','aria-controls','for'].includes(name))value=value.split(' ').map(id=>ids.get(id)||id).join(' ');
    else if(value.includes('url(#'))value=value.replace(/url\(#([^)]*)\)/g,(_,id)=>'url(#'+(ids.get(id)||id)+')');
    if(value!==before)node.setAttribute(name,value);
  }
  for(const {node,rect:box} of fixed)pinFixed(node,box,rect);
  host.append(leaving);if(!host.isConnected)document.body.append(host);
  planes.push({node:leaving,left:rect.left,width:rect.width,velocity:continuation?.velocity||{x:0}});
  const active={host,canvas,planes,fixed:[],onCleanup};canvasSlide=active;
  return ()=>{
    if(canvasSlide!==active)return;
    if(typeof canvas.animate!=='function'||typeof leaving.animate!=='function'){finishCanvasSlide();return;}
    const sign=direction==='backward'?-1:1,distance=document.documentElement.clientWidth+24;
    const base=canvas.getBoundingClientRect();
    for(const node of canvas.querySelectorAll('.compare-tray')){const box=node.getBoundingClientRect();active.fixed.push({node,style:node.style.cssText});pinFixed(node,box,base);}
    canvas.style.willChange='transform, opacity';canvas.dataset.sliding='true';
    const map=value=>({transform:'translateX('+value.x+'px)'}),promises=[];
    for(const plane of planes){const destination=sign>0?-plane.width-24:distance,x=destination-plane.left;plane.node.style.transform='translateX('+x+'px)';promises.push(animateSpring(plane.node,{x},{from:{x:0},velocity:plane.velocity,map,channel:'scene'}));}
    promises.push(animateSpring(canvas,{x:0},{from:{x:sign*distance},map,channel:'scene'}));
    active.timer=setTimeout(()=>{if(canvasSlide===active)finishCanvasSlide();},1000);
    Promise.allSettled(promises).then(()=>{if(canvasSlide===active)finishCanvasSlide();});
  };
}
// The highlight is the only scaling layer; labels retain their native size.
export function moveIndicator(element,target,{from,velocity,immediate=false}={}){
 Object.assign(element.style,{width:target.width+'px',height:target.height+'px',transform:'translate('+target.x+'px,'+target.y+'px)',transformOrigin:'left top'});
 element.dataset.motionOwned='indicator';
 return animateSpring(element,target,{from:from||target,velocity,immediate,frequency:36,channel:'indicator',map:value=>({transform:'translate('+value.x+'px,'+value.y+'px) scale('+value.width/Math.max(1,target.width)+','+value.height/Math.max(1,target.height)+')'})});
}
export function enterCanvas(canvas,direction) {
  if(typeof canvas.animate!=='function')return;
  const from=Number(getComputedStyle(canvas).opacity);cancelOwnMotion(canvas);
  canvas.animate([{opacity:from<1?from:.92},{opacity:1}],motion.control);
  const head=canvas.querySelector('.scene-head'),featured=canvas.querySelector('.overview-featured');
  if(head&&direction!=='focus')head.animate([{translate:(direction==='backward'?-8:8)+'px 0px'},{translate:'0px 0px'}],motion.arrive);
  if(featured&&featured.getBoundingClientRect().top<innerHeight)featured.animate([{translate:'0px 6px'},{translate:'0px 0px'}],motion.arrive);
}
const contentMotions=new WeakMap();
export function enterContent(root){
 const selector='.block,.materials-stage,.exercise-center,.report-studio,.directory-results,.student-grid,.paper-profile,.follow-workbench';
 let count=0;
 for(const element of root.querySelectorAll(selector)){
  if(element.parentElement.closest(selector)||element.contains(document.activeElement)&&document.activeElement.matches('input,textarea,select,[contenteditable=true]'))continue;
  const box=element.getBoundingClientRect();if(box.bottom<72||box.top>=innerHeight||!box.width||!box.height||count++>=6)continue;
  const previous=contentMotions.get(element),from=previous?visualFrame(element):{opacity:.96,transform:'translateY(3px)'};previous?.cancel();element.dataset.contentMotion='entering';
  try{const animation=element.animate([from,{opacity:1,transform:'none'}],motion.control);contentMotions.set(element,animation);finishAnimation(animation,motion.control.duration).then(()=>{if(contentMotions.get(element)!==animation)return;contentMotions.delete(element);delete element.dataset.contentMotion;});}catch{delete element.dataset.contentMotion;}
 }
}
export function arrangeRows(root,positions,{edge=72}={}) {
  let order=0;
  const measurements=[...root.querySelectorAll('[data-motion-key]')].map(element=>({element,before:positions.get(element),after:element.getBoundingClientRect()}));
  for(const {element,before,after} of measurements) {
    if(after.bottom<edge||after.top>innerHeight||typeof element.animate!=='function')continue;
    if(before&&(Math.abs(before.x-after.x)>1||Math.abs(before.y-after.y)>1))element.animate([{translate:(before.x-after.x)+'px '+(before.y-after.y)+'px'},{translate:'0px 0px'}],motion.arrange);
    else if(!before)element.animate([{opacity:.86,translate:'0px 6px'},{opacity:1,translate:'0px 0px'}],{...motion.arrange,delay:Math.min(order++,4)*16,fill:'backwards'});
  }
}
