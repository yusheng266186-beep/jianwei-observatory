// Native animations keep the live controls available throughout a transition.
const spring='linear(0, .12, .35, .59, .78, .91, .98, 1.012, 1.016, 1.011, 1.005, 1)';
export const settle=typeof CSS!=='undefined'&&CSS.supports('animation-timing-function',spring)?spring:'cubic-bezier(.2,.9,.25,1)';
// A monotonic, damped glide: quick response, long gentle settling, no page bounce.
const glide='linear(0, .035 2%, .14 5%, .36 12%, .63 24%, .82 40%, .94 62%, .985 82%, 1)';
export const travel=typeof CSS!=='undefined'&&CSS.supports('animation-timing-function',glide)?glide:'cubic-bezier(.2,.85,.25,1)';
export const motion={arrive:{duration:420,easing:'cubic-bezier(.16,1,.3,1)'},arrange:{duration:340,easing:settle},leave:{duration:180,easing:'cubic-bezier(.3,0,.7,1)'}};
export function visualFrame(element){const style=getComputedStyle(element);return {opacity:style.opacity,transform:style.transform};}
export function cancelOwnMotion(element){try{for(const animation of element.getAnimations?.()||[])try{animation.cancel();}catch{}}catch{}}
// Exit animations are optional: a paused or unavailable animation must never
// keep a dialog modal. Cancel the visual effect before its caller closes it.
export function finishAnimation(animation,duration) {
  return new Promise(resolve=>{
    let completed=false;
    const complete=()=>{if(completed)return;completed=true;clearTimeout(timer);try{animation?.cancel();}catch{}resolve();};
    const timer=setTimeout(complete,duration+60);
    try{if(animation?.finished?.then)animation.finished.then(complete,complete);else complete();}catch{complete();}
  });
}
let canvasSlide=null,slideSerial=0;
function pinFixed(node,box,rect) {
  Object.assign(node.style,{position:'absolute',left:(box.left-rect.left)+'px',top:(box.top-rect.top)+'px',bottom:'auto',right:'auto',width:box.width+'px',height:box.height+'px',margin:'0',transform:'none'});
}
export function finishCanvasSlide() {
  const active=canvasSlide;if(!active)return;canvasSlide=null;
  for(const animation of active.animations)animation.cancel();
  for(const {node,style} of active.fixed)node.style.cssText=style;
  active.host.remove();active.canvas.style.removeProperty('will-change');active.canvas.removeAttribute('data-sliding');clearTimeout(active.timer);active.onCleanup();
}
// Move the outgoing live DOM into a clipped, inert plane. The real main stays
// interactive; no screenshot transition or delayed navigation is involved.
export function prepareCanvasSlide(canvas,direction,{onCleanup=()=>{}}={}) {
  const rect=canvas.getBoundingClientRect(),top=scrollY,style=getComputedStyle(canvas),opacity=style.opacity,x=style.transform==='none'?0:new DOMMatrixReadOnly(style.transform).m41;
  const fixed=[...canvas.querySelectorAll('.compare-tray')].map(node=>({node,rect:node.getBoundingClientRect()}));
  finishCanvasSlide();cancelOwnMotion(canvas);
  const host=document.createElement('div'),leaving=document.createElement('div'),prefix='leaving-'+(++slideSerial)+'-';
  host.className='scene-leaving-viewport';host.inert=true;host.setAttribute('aria-hidden','true');
  leaving.className=canvas.className+' scene-leaving-canvas';Object.assign(leaving.dataset,canvas.dataset);delete leaving.dataset.loading;
  leaving.style.cssText=canvas.style.cssText;
  Object.assign(leaving.style,{position:'absolute',left:rect.left+'px',top:(rect.top+top)+'px',width:rect.width+'px',height:rect.height+'px',maxWidth:'none',margin:'0',opacity});
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
  host.append(leaving);document.body.append(host);host.scrollTop=top;
  const active={host,canvas,animations:[],fixed:[],onCleanup};canvasSlide=active;
  return ()=>{
    if(canvasSlide!==active)return;
    if(typeof canvas.animate!=='function'||typeof leaving.animate!=='function'){finishCanvasSlide();return;}
    const sign=direction==='backward'?-1:1,distance=document.documentElement.clientWidth+24,options={duration:460,easing:travel};
    const base=canvas.getBoundingClientRect();
    for(const node of canvas.querySelectorAll('.compare-tray')){const box=node.getBoundingClientRect();active.fixed.push({node,style:node.style.cssText});pinFixed(node,box,base);}
    canvas.style.willChange='transform, opacity';canvas.dataset.sliding='true';
    active.animations=[leaving.animate([{transform:'translateX(0px)',opacity},{transform:'translateX('+(-sign*distance-x)+'px)',opacity}],options),canvas.animate([{transform:'translateX('+(sign*distance+x)+'px)'},{transform:'translateX(0px)'}],options)];
    active.timer=setTimeout(()=>{if(canvasSlide===active)finishCanvasSlide();},options.duration+100);
    Promise.allSettled(active.animations.map(animation=>animation.finished)).then(()=>{if(canvasSlide===active)finishCanvasSlide();});
  };
}
export function enterCanvas(canvas,direction) {
  if(typeof canvas.animate!=='function')return;
  const from=Number(getComputedStyle(canvas).opacity);cancelOwnMotion(canvas);
  canvas.animate([{opacity:from<1?from:.88},{opacity:1}],{duration:220,easing:motion.arrive.easing});
  const head=canvas.querySelector('.scene-head'),featured=canvas.querySelector('.overview-featured');
  if(head&&direction!=='focus')head.animate([{translate:(direction==='backward'?-12:12)+'px 0px'},{translate:'0px 0px'}],motion.arrive);
  if(featured&&featured.getBoundingClientRect().top<innerHeight)featured.animate([{translate:'0px 8px'},{translate:'0px 0px'}],motion.arrive);
}
export function arrangeRows(root,positions,{edge=72}={}) {
  let order=0;
  const measurements=[...root.querySelectorAll('[data-motion-key]')].map(element=>({element,before:positions.get(element),after:element.getBoundingClientRect()}));
  for(const {element,before,after} of measurements) {
    if(after.bottom<edge||after.top>innerHeight||typeof element.animate!=='function')continue;
    if(before&&(Math.abs(before.x-after.x)>1||Math.abs(before.y-after.y)>1))element.animate([{translate:(before.x-after.x)+'px '+(before.y-after.y)+'px'},{translate:'0px 0px'}],motion.arrange);
    else if(!before)element.animate([{opacity:.55,translate:'0px 8px'},{opacity:1,translate:'0px 0px'}],{...motion.arrange,delay:Math.min(order++,4)*16,fill:'backwards'});
  }
}
