import {exerciseFigurePercent} from '../engine/exercise-figure-layout.js';

// Only the small corner control captures touch gestures; reading and scrolling
// the rest of the question stay native. No math rendering runs during a drag.
export function installExerciseFigureResize(root,{onCommit,onPreview=()=>{},getContext=()=>undefined}){
 let drag=null;
 const parentWidth=figure=>{const node=figure.parentElement,style=getComputedStyle(node);return node.clientWidth-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight);};
 const valueOf=figure=>exerciseFigurePercent(figure.getBoundingClientRect().width/parentWidth(figure)*100);
 const limit=(figure,value)=>Math.min(exerciseFigurePercent(value),Math.max(20,Math.floor((Number(figure.dataset.figureMaxPercent)||100)*10)/10));
 function paint(figure,value){
  figure.style.width=value+'%';figure.style.maxWidth='none';
  const control=figure.querySelector('[data-figure-resize]');
  control.setAttribute('aria-valuenow',value);control.setAttribute('aria-valuetext',value+'%');
  figure.querySelector('[data-figure-size]').textContent='宽度 · '+value+'%';
 }
 function commit(figure,value,context){onCommit(Number(figure.closest('[data-question-id]').dataset.questionId),value,context);}
 function finish(){
  if(!drag)return;const state=drag;drag=null;state.figure.classList.remove('is-resizing');
  if(state.control.hasPointerCapture(state.pointerId))state.control.releasePointerCapture(state.pointerId);
  if(state.changed)commit(state.figure,state.value,state.context);
 }
 root.addEventListener('pointerdown',event=>{
  const control=event.target.closest('[data-figure-resize]');if(!control||!event.isPrimary||event.button!==0)return;
  finish();const figure=control.closest('.exercise-diagram');
  drag={figure,control,context:getContext(),pointerId:event.pointerId,x:event.clientX,y:event.clientY,start:valueOf(figure),value:valueOf(figure),parentWidth:parentWidth(figure),ratio:Number(figure.dataset.figureRatio),scroll:root.closest('dialog')?.scrollTop||0,changed:false};
  control.setPointerCapture(event.pointerId);control.focus({preventScroll:true});event.preventDefault();figure.classList.add('is-resizing');
 });
 root.addEventListener('pointermove',event=>{
  if(!drag||event.pointerId!==drag.pointerId)return;
  const dx=event.clientX-drag.x,dy=event.clientY-drag.y+(root.closest('dialog')?.scrollTop||0)-drag.scroll;
  // The figure stays centered: the right edge moves half as far as its width.
  const delta=(dx*.5+dy/drag.ratio)/(.25+1/drag.ratio**2);
  const value=limit(drag.figure,drag.start+delta/drag.parentWidth*100);
  if(Math.abs(value-drag.value)<.05)return;
  drag.value=value;drag.changed=true;onPreview();paint(drag.figure,value);event.preventDefault();
 });
 for(const name of ['pointerup','pointercancel','lostpointercapture'])root.addEventListener(name,event=>{if(event.pointerId===drag?.pointerId)finish();});
 root.addEventListener('keydown',event=>{
  const control=event.target.closest('[data-figure-resize]');if(!control||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(event.key))return;
  event.preventDefault();finish();const figure=control.closest('.exercise-diagram'),value=limit(figure,event.key==='Home'?20:event.key==='End'?100:valueOf(figure)+(['ArrowLeft','ArrowDown'].includes(event.key)?-1:1)*(event.shiftKey?5:1));
  onPreview();paint(figure,value);commit(figure,value,getContext());
 });
 function sync(){for(const figure of root.querySelectorAll('.exercise-diagram.is-resizable')){const control=figure.querySelector('[data-figure-resize]'),value=valueOf(figure);control.setAttribute('aria-valuenow',value);control.setAttribute('aria-valuetext',value+'%');}}
 return {finish,sync};
}
