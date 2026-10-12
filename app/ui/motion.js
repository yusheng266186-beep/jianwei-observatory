// Native animations keep the live controls available throughout a transition.
const spring='linear(0, .12, .35, .59, .78, .91, .98, 1.012, 1.016, 1.011, 1.005, 1)';
export const settle=typeof CSS!=='undefined'&&CSS.supports('animation-timing-function',spring)?spring:'cubic-bezier(.2,.9,.25,1)';
export const motion={arrive:{duration:420,easing:'cubic-bezier(.16,1,.3,1)'},arrange:{duration:340,easing:settle},leave:{duration:180,easing:'cubic-bezier(.3,0,.7,1)'}};
export function visualFrame(element){const style=getComputedStyle(element);return {opacity:style.opacity,transform:style.transform};}
export function cancelOwnMotion(element){for(const animation of element.getAnimations())animation.cancel();}
let canvasSlide=null,slideSerial=0;
function pinFixed(node,box,rect) {
  Object.assign(node.style,{position:'absolute',left:(box.left-rect.left)+'px',top:(box.top-rect.top)+'px',bottom:'auto',right:'auto',width:box.width+'px',height:box.height+'px',margin:'0',transform:'none'});
}
export function finishCanvasSlide() {
  const active=canvasSlide;if(!active)return;canvasSlide=null;
  for(const animation of active.animations)animation.cancel();
  for(const {node,style} of active.fixed)node.style.cssText=style;
  active.host.remove();active.canvas.style.removeProperty('will-change');active.onCleanup();
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
  for(const node of leaving.querySelectorAll('*'))for(const attr of [...node.attributes]) {
    let value=attr.value;
    if(attr.name==='id')value=ids.get(value);
    else if(['href','xlink:href'].includes(attr.name)&&value.startsWith('#'))value='#'+(ids.get(value.slice(1))||value.slice(1));
    else if(['aria-labelledby','aria-describedby','aria-controls','for'].includes(attr.name))value=value.split(' ').map(id=>ids.get(id)||id).join(' ');
    else if(value.includes('url(#'))value=value.replace(/url\(#([^)]*)\)/g,(_,id)=>'url(#'+(ids.get(id)||id)+')');
    if(value!==attr.value)node.setAttribute(attr.name,value);
  }
  for(const {node,rect:box} of fixed)pinFixed(node,box,rect);
  host.append(leaving);document.body.append(host);host.scrollTop=top;
  const active={host,canvas,animations:[],fixed:[],onCleanup};canvasSlide=active;
  return ()=>{
    if(canvasSlide!==active)return;
    const sign=direction==='backward'?-1:1,distance=document.documentElement.clientWidth+32,options={duration:460,easing:'cubic-bezier(.22,.75,.25,1)'};
    const base=canvas.getBoundingClientRect();
    for(const node of canvas.querySelectorAll('.compare-tray')){const box=node.getBoundingClientRect();active.fixed.push({node,style:node.style.cssText});pinFixed(node,box,base);}
    canvas.style.willChange='transform';
    active.animations=[leaving.animate([{transform:'translateX(0px)'},{transform:'translateX('+(-sign*distance-x)+'px)'}],options),canvas.animate([{transform:'translateX('+(sign*distance+x)+'px)'},{transform:'translateX(0px)'}],options)];
    Promise.allSettled(active.animations.map(animation=>animation.finished)).then(()=>{if(canvasSlide===active)finishCanvasSlide();});
  };
}
export function enterCanvas(canvas,direction) {
  const from=Number(getComputedStyle(canvas).opacity);cancelOwnMotion(canvas);
  canvas.animate([{opacity:from<1?from:.88},{opacity:1}],{duration:220,easing:motion.arrive.easing});
  const head=canvas.querySelector('.scene-head'),featured=canvas.querySelector('.overview-featured');
  if(head&&direction!=='focus')head.animate([{translate:(direction==='backward'?-12:12)+'px 0px'},{translate:'0px 0px'}],motion.arrive);
  if(featured&&featured.getBoundingClientRect().top<innerHeight)featured.animate([{translate:'0px 8px'},{translate:'0px 0px'}],motion.arrive);
}
export function arrangeRows(root,positions,{edge=72}={}) {
  let order=0;
  for(const element of root.querySelectorAll('[data-motion-key]')) {
    const before=positions.get(element),after=element.getBoundingClientRect();
    if(after.bottom<edge||after.top>innerHeight)continue;
    if(before&&(Math.abs(before.x-after.x)>1||Math.abs(before.y-after.y)>1))element.animate([{translate:(before.x-after.x)+'px '+(before.y-after.y)+'px'},{translate:'0px 0px'}],motion.arrange);
    else if(!before)element.animate([{opacity:.55,translate:'0px 8px'},{opacity:1,translate:'0px 0px'}],{...motion.arrange,delay:Math.min(order++,4)*16,fill:'backwards'});
  }
}
