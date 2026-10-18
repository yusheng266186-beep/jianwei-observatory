// A paused or unavailable native animation must never hold a modal or scene.
export function finishAnimation(animation,duration){
 return new Promise(resolve=>{
  let completed=false;
  const complete=()=>{if(completed)return;completed=true;clearTimeout(timer);try{animation?.cancel();}catch{}resolve();};
  const timer=setTimeout(complete,duration+60);
  try{if(animation?.finished?.then)animation.finished.then(complete,complete);else complete();}catch{complete();}
 });
}
