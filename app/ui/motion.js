// Native animations keep the live controls available throughout a transition.
const spring='linear(0, .12, .35, .59, .78, .91, .98, 1.012, 1.016, 1.011, 1.005, 1)';
export const settle=typeof CSS!=='undefined'&&CSS.supports('animation-timing-function',spring)?spring:'cubic-bezier(.2,.9,.25,1)';
export const motion={arrive:{duration:420,easing:'cubic-bezier(.16,1,.3,1)'},arrange:{duration:340,easing:settle},leave:{duration:180,easing:'cubic-bezier(.3,0,.7,1)'}};
export function visualFrame(element){const style=getComputedStyle(element);return {opacity:style.opacity,transform:style.transform};}
export function cancelOwnMotion(element){for(const animation of element.getAnimations())animation.cancel();}
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
