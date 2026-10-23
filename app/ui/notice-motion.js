import {openSurface,closeSurface} from './surface-motion.js';
import {motion} from './motion.js';

// Retain the same live notification through exit and quick replacement. Native
// popovers are hidden only after the opacity/position lifecycle has finished.
export function createNoticeMotion(element,{reducedMotion}={}){
 const isOpen=()=>element.classList.contains('visible');
 return {
  show(){element.inert=false;return openSurface(element,{reducedMotion,isOpen,from:{opacity:0,transform:'translateY(8px)'},timing:motion.control,show:()=>{element.classList.add('visible');if(element.showPopover&&!element.matches(':popover-open'))element.showPopover();}});},
  hide(){element.inert=true;return closeSurface(element,{reducedMotion,isOpen,to:{opacity:0,transform:'translateY(5px)'},timing:motion.feedback,hide:()=>{element.classList.remove('visible');if(element.hidePopover&&element.matches(':popover-open'))element.hidePopover();}});}
 };
}
