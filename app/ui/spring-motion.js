import {finishAnimation} from './animation-lifecycle.js';

// A critically damped spring: gentle acceleration, no bounce from rest, and
// continuous position / velocity when a second action interrupts the first.
// Sampled native keyframes run on the compositor, without a per-frame JS loop.
const channels=new WeakMap();
export function springAt(from,to,velocity={},seconds=0,frequency=30){
 if(seconds<=0)return {value:{...from},velocity:Object.fromEntries(Object.keys(to).map(key=>[key,velocity[key]||0]))};
 const value={},speed={},t=Math.max(0,seconds),decay=Math.exp(-frequency*t);
 for(const key of Object.keys(to)){
  const offset=from[key]-to[key],b=(velocity[key]||0)+frequency*offset;
  value[key]=to[key]+(offset+b*t)*decay;
  speed[key]=(b-frequency*(offset+b*t))*decay;
 }
 return {value,velocity:speed};
}
export function springPlan(from,to,velocity={},frequency=30){
 const sample=ms=>springAt(from,to,velocity,ms/1000,frequency);
 let duration=100;
 // Pixel tolerance includes velocity so the last frame cannot stop abruptly.
 for(;duration<900;duration+=1000/60){const frame=sample(duration);if(Object.keys(to).every(k=>Math.abs(frame.value[k]-to[k])<.15&&Math.abs(frame.velocity[k])<3))break;}
 duration=Math.min(900,duration);
 const count=Math.max(2,Math.ceil(duration/(1000/60)));
 return {duration,sample,frames:Array.from({length:count+1},(_,i)=>({offset:i/count,...(i===count?{value:{...to},velocity:Object.fromEntries(Object.keys(to).map(k=>[k,0]))}:sample(i/count*duration))}))};
}
export function springFrame(element,channel='position'){
 const state=channels.get(element)?.get(channel);if(!state)return null;
 return state.animation?state.plan.sample(Math.max(0,Number(state.animation.currentTime)||0)):{value:{...state.target},velocity:Object.fromEntries(Object.keys(state.target).map(k=>[k,0]))};
}
export function stopSpring(element,channel='position'){
 const frame=springFrame(element,channel),bucket=channels.get(element),state=bucket?.get(channel);bucket?.delete(channel);state?.animation?.cancel();return frame;
}
export function animateSpring(element,target,{from=target,velocity={},map,channel='position',frequency=30,immediate=false}={}){
 let bucket=channels.get(element);if(!bucket){bucket=new Map();channels.set(element,bucket);}
 const previous=bucket.get(channel),current=springFrame(element,channel);
 if(previous&&Object.keys(target).every(k=>previous.target[k]===target[k])&&!immediate)return previous.promise;
 const state={target:{...target},animation:null,promise:Promise.resolve()};bucket.set(channel,state);previous?.animation?.cancel();
 if(immediate||typeof element.animate!=='function')return state.promise;
 const plan=springPlan(current?.value||from,target,current?.velocity||velocity,frequency);state.plan=plan;
 if(Object.keys(target).every(k=>Math.abs((current?.value||from)[k]-target[k])<.1&&Math.abs((current?.velocity||velocity)[k]||0)<3))return state.promise;
 try{
  state.animation=element.animate(plan.frames.map(frame=>({offset:frame.offset,...map(frame.value)})),{duration:plan.duration,easing:'linear',fill:'both'});
  state.promise=finishAnimation(state.animation,plan.duration).then(()=>{if(bucket.get(channel)===state)state.animation=null;});
 }catch{state.animation=null;}
 return state.promise;
}
