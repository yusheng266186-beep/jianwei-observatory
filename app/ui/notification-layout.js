// Popovers live in the top layer. Anchor them to the active window's actual
// edges, and leave its bottom action row available at every viewport size.
export function installNotificationLayout(toast){
 let frame=0;
 const set=(name,value)=>{if(toast.style.getPropertyValue(name)!==value)toast.style.setProperty(name,value);};
 function update(){
  const host=toast.parentElement;
  if(!toast.classList.contains('visible'))return;
  if(host?.tagName!=='DIALOG'||!host.open){
   const viewport=window.visualViewport,limit=Math.min(innerHeight,viewport?viewport.offsetTop+viewport.height:innerHeight),dock=document.getElementById('navigation'),box=dock?.getBoundingClientRect();
   const edge=box?.height&&box.bottom>0&&box.top<limit?Math.min(limit,box.top):limit;
   set('--toast-clearance',Math.max(16,innerHeight-edge+12)+'px');toast.style.removeProperty('--toast-right');toast.style.removeProperty('--toast-width');return;
  }
  const box=host.getBoundingClientRect(),height=toast.getBoundingClientRect().height||56;let edge=box.bottom;
  for(const anchor of host.querySelectorAll('[data-notification-clearance]')){
   const r=anchor.getBoundingClientRect();if(r.height&&r.top<edge&&r.bottom>edge-16-height)edge=Math.min(edge,r.top+4);
  }
  set('--toast-clearance',Math.max(16,innerHeight-edge+16)+'px');set('--toast-right',Math.max(16,innerWidth-box.right+16)+'px');set('--toast-width',Math.max(80,box.width-32)+'px');
 }
 const schedule=()=>{if(!toast.classList.contains('visible'))return;cancelAnimationFrame(frame);frame=requestAnimationFrame(update);},observer=new ResizeObserver(schedule);
 function refresh(){
  observer.disconnect();observer.observe(toast);const host=toast.parentElement;if(host?.tagName==='DIALOG'){observer.observe(host);for(const anchor of host.querySelectorAll('[data-notification-clearance]'))observer.observe(anchor);}else{const dock=document.getElementById('navigation');if(dock)observer.observe(dock);}update();
 }
 window.addEventListener('resize',schedule,{passive:true});window.visualViewport?.addEventListener('resize',schedule,{passive:true});window.visualViewport?.addEventListener('scroll',schedule,{passive:true});
 document.addEventListener('scroll',event=>{if(toast.parentElement?.contains(event.target))schedule();},{capture:true,passive:true});
 return {refresh};
}
