export function viewportMetrics(layoutHeight,visual={}){
 const full=Math.max(1,Number(layoutHeight)||1),height=Math.min(full,Math.max(1,Number(visual.height)||full));
 const top=Math.max(0,Math.min(full-height,Number(visual.offsetTop)||0));
 return {height,top,bottom:Math.max(0,full-top-height)};
}
let installed=false;
export function installViewportMetrics(){
 if(installed)return;installed=true;
 let frame=0,previous='';
 const update=()=>{
  const root=document.documentElement,metrics=viewportMetrics(root.clientHeight||innerHeight,window.visualViewport),key=Object.values(metrics).join('|');
  if(key===previous)return;previous=key;
  for(const [name,value] of Object.entries(metrics))root.style.setProperty('--visual-view-'+name,value+'px');
  const active=document.activeElement;
  if(active?.closest('dialog[open]')&&active.matches('textarea,input:not([type=checkbox]):not([type=radio]),[contenteditable=true]')){
   const rect=active.getBoundingClientRect();if(rect.top<metrics.top+8||rect.bottom>metrics.top+metrics.height-8)active.scrollIntoView({block:'nearest',inline:'nearest',behavior:'instant'});
  }
 };
 const schedule=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(update);};
 window.addEventListener('resize',schedule,{passive:true});window.visualViewport?.addEventListener('resize',schedule,{passive:true});window.visualViewport?.addEventListener('scroll',schedule,{passive:true});update();
}
