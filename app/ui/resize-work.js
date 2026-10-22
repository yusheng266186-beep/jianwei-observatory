// ResizeObserver delivers after layout. Defer its writes to the next frame so
// changing an observed chart's viewBox/height cannot recurse in that delivery.
export function createResizeWork(apply,{requestFrame=requestAnimationFrame,cancelFrame=cancelAnimationFrame}={}){
 const pending=new Map();let frame=null;
 function flush(){frame=null;const work=[...pending];pending.clear();for(const [target,kind] of work)if(target.isConnected)apply(target,kind);}
 return {add(target,kind){pending.set(target,kind);if(frame===null)frame=requestFrame(flush);},cancel(){if(frame!==null)cancelFrame(frame);frame=null;pending.clear();}};
}
