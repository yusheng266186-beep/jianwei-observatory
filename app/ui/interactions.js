let motionPreference=()=>false,resizeObserver,revealObserver,tooltipTarget=null,tooltipOriginal=null,tooltipFrame=0;
const observedTables=new Set(),revealed=new WeakSet(),disclosures=new WeakMap();
function refreshTable(frame) {
  const scroll=frame.querySelector('.table-scroll');if(!scroll)return;
  const extent=scroll.scrollWidth-scroll.clientWidth,overflow=extent>3,left=scroll.scrollLeft<=2,right=scroll.scrollLeft>=extent-2;
  frame.dataset.overflow=String(overflow);frame.dataset.atStart=String(left);frame.dataset.atEnd=String(right);
  for(const b of frame.querySelectorAll('.table-shift'))b.disabled=!overflow||(Number(b.dataset.direction)<0?left:right);
  const track=frame.querySelector('.table-overflow-note i');if(track){track.style.setProperty('--scroll-progress',overflow?Math.max(0,Math.min(100,scroll.scrollLeft/extent*100))+'%':'0%');track.style.setProperty('--scroll-thumb',Math.max(12,Math.min(100,scroll.clientWidth/Math.max(1,scroll.scrollWidth)*100))+'%');}
}
export function prepareUpdate(){hideTooltip();}
export function enhance(root=document) {
  hideTooltip();
  for(const frame of observedTables)if(!frame.isConnected){resizeObserver?.unobserve(frame);observedTables.delete(frame);}
  for(const frame of root.querySelectorAll('.table-frame')){refreshTable(frame);if(!observedTables.has(frame)){observedTables.add(frame);resizeObserver?.observe(frame);}}
  if(revealObserver&&!motionPreference())for(const node of root.querySelectorAll('.block,.student-scope,.follow-workbench,.knowledge-card,.personal-skills article'))if(!revealed.has(node)){revealed.add(node);if(node.getBoundingClientRect().top>innerHeight-25)revealObserver.observe(node);}
}
export function shiftTable(button) {
  const frame=button.closest('.table-frame'),scroll=frame?.querySelector('.table-scroll');scroll?.scrollBy({left:Number(button.dataset.direction)*scroll.clientWidth*.8,behavior:motionPreference()?'instant':'smooth'});
}
function hideTooltip() {
  cancelAnimationFrame(tooltipFrame);const tooltip=document.getElementById('chart-tooltip');if(tooltip){if(tooltip.hidePopover&&tooltip.matches(':popover-open'))tooltip.hidePopover();tooltip.hidden=true;}
  if(tooltipTarget&&tooltipOriginal){if(tooltipOriginal.title!==null)tooltipTarget.setAttribute('title',tooltipOriginal.title);if(tooltipOriginal.svgTitle)tooltipOriginal.svgTitle.textContent=tooltipOriginal.svgText;if(tooltipOriginal.description===null)tooltipTarget.removeAttribute('aria-describedby');else tooltipTarget.setAttribute('aria-describedby',tooltipOriginal.description);}
  tooltipTarget=null;tooltipOriginal=null;
}
function placeTooltip(x,y) {
  const tip=document.getElementById('chart-tooltip');if(!tip||tip.hidden)return;
  const rect=tip.getBoundingClientRect(),left=Math.max(12,Math.min(innerWidth-rect.width-12,x+15)),top=y+18+rect.height<innerHeight-14?y+18:Math.max(12,y-rect.height-15);
  tip.style.left=left+'px';tip.style.top=top+'px';
}
function showTooltip(target,x,y) {
  if(target===tooltipTarget){placeTooltip(x,y);return;}hideTooltip();
  const tip=document.getElementById('chart-tooltip'),svgTitle=target.querySelector(':scope > title'),text=target.dataset.tip||target.getAttribute('title')||svgTitle?.textContent;if(!tip||!text)return;
  tooltipTarget=target;tooltipOriginal={title:target.getAttribute('title'),svgTitle,svgText:svgTitle?.textContent,description:target.getAttribute('aria-describedby')};
  target.removeAttribute('title');if(svgTitle)svgTitle.textContent='';target.setAttribute('aria-describedby','chart-tooltip');tip.textContent=text;tip.hidden=false;if(tip.showPopover&&!tip.matches(':popover-open'))tip.showPopover();placeTooltip(x,y);
}
async function toggleDetails(details) {
  const previous=disclosures.get(details),wanted=!(previous?.wanted??details.open),body=[...details.children].find(el=>el.tagName!=='SUMMARY');
  const from=body?.getBoundingClientRect().height||0;previous?.animation.cancel();
  if(!body||motionPreference()){details.open=wanted;disclosures.delete(details);return;}
  details.open=true;const to=wanted?body.scrollHeight:0,animation=body.animate([{height:(previous?from:wanted?0:from)+'px',opacity:wanted ? .25 : 1},{height:to+'px',opacity:wanted?1:0}],{duration:280,easing:'cubic-bezier(.22,.8,.22,1)',fill:'both'}),record={wanted,animation};
  disclosures.set(details,record);
  try{await animation.finished;}catch{return;}
  if(disclosures.get(details)!==record)return;
  if(!wanted&&body.contains(document.activeElement))details.querySelector('summary')?.focus({preventScroll:true});
  details.open=wanted;animation.cancel();disclosures.delete(details);for(const frame of details.querySelectorAll('.table-frame'))refreshTable(frame);
}
export function installInteractions({reducedMotion}) {
  motionPreference=reducedMotion;
  if('ResizeObserver' in window)resizeObserver=new ResizeObserver(entries=>{for(const entry of entries)refreshTable(entry.target);});
  if('IntersectionObserver' in window)revealObserver=new IntersectionObserver(entries=>{for(const entry of entries)if(entry.isIntersecting){revealObserver.unobserve(entry.target);if(!motionPreference())entry.target.animate([{opacity:.4,transform:'translateY(15px)'},{opacity:1,transform:'translateY(0)'}],{duration:420,easing:'cubic-bezier(.22,.8,.22,1)'});}},{rootMargin:'0px 0px -25px 0px',threshold:.06});
  document.addEventListener('scroll',event=>{if(event.target?.matches?.('.table-scroll'))refreshTable(event.target.closest('.table-frame'));else {hideTooltip();document.body.dataset.scrolled=String(window.scrollY>18);}},true);
  document.addEventListener('click',event=>{const summary=event.target.closest('summary');if(!summary||event.target.closest('button,a,input'))return;const details=summary.parentElement;if(details.matches('.card-scores,.card-meta,.record-accordion')){event.preventDefault();toggleDetails(details);}});
  document.addEventListener('pointerover',event=>{if(event.pointerType==='touch')return;const target=event.target.closest('[data-plot-action],.student-dot,.heat-cell[title],[data-tip]');if(target)showTooltip(target,event.clientX,event.clientY);});
  document.addEventListener('pointermove',event=>{if(!tooltipTarget)return;cancelAnimationFrame(tooltipFrame);tooltipFrame=requestAnimationFrame(()=>placeTooltip(event.clientX,event.clientY));});
  document.addEventListener('pointerout',event=>{if(tooltipTarget&&!tooltipTarget.contains(event.relatedTarget))hideTooltip();});
  document.addEventListener('focusin',event=>{const target=event.target.closest('[data-plot-action],.student-dot,[data-tip]');if(target){const rect=target.getBoundingClientRect();showTooltip(target,rect.left+rect.width/2,rect.bottom);}});
  document.addEventListener('focusout',event=>{if(tooltipTarget&&!tooltipTarget.contains(event.relatedTarget))hideTooltip();});
  window.addEventListener('resize',()=>{for(const frame of observedTables)refreshTable(frame);hideTooltip();});
}
