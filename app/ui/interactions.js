import {motion} from './motion.js?v=research-v10';
let motionPreference=()=>false,resizeObserver,plotObserver,railObserver,revealObserver,tooltipTarget=null,tooltipOriginal=null,tooltipFrame=0,outlineFrame=0,pointerFrame=0,outline=null,outlineEntries=[];
const observedTables=new Set(),observedPlots=new Set(),observedReveals=new Set(),revealed=new WeakSet(),disclosures=new WeakMap();
const selectionRails=new Set(),railStates=new WeakMap();
const plotFrames=new WeakMap(),galleryOffsets=new Map();
function samplePlots(){for(const svg of observedPlots)for(const shape of svg.querySelectorAll('.plot-bar,.plot-column')){plotFrames.set(shape,shape.getBoundingClientRect());for(const animation of shape.getAnimations())animation.cancel();}}
function animatePlot(svg){
  if(motionPreference())return;
  const scale=svg.viewBox.baseVal.width/Math.max(1,svg.getBoundingClientRect().width);
  for(const shape of svg.querySelectorAll('.plot-bar,.plot-column')){
    const before=plotFrames.get(shape);plotFrames.delete(shape);if(!before)continue;
    const after=shape.getBoundingClientRect();if(after.width<.5||after.height<.5||after.bottom<72||after.top>innerHeight)continue;
    const dx=(before.left-after.left)*scale,dy=(before.top-after.top)*scale,sx=before.width/after.width,sy=before.height/after.height;
    if(Math.abs(dx)+Math.abs(dy)<1&&Math.abs(sx-1)+Math.abs(sy-1)<.01)continue;
    shape.animate([{transform:'translate('+dx+'px,'+dy+'px) scale('+sx+','+sy+')'},{transform:'translate(0,0) scale(1)'}],motion.arrange);
  }
}
function sampleRails(){for(const rail of selectionRails){const state=railStates.get(rail);if(state?.indicator?.isConnected){const rect=state.indicator.getBoundingClientRect(),host=rail.getBoundingClientRect();state.x=rect.left-host.left+rail.scrollLeft;state.width=rect.width;}}}
function selectionRail(rail){
  const selected=rail.querySelector('.chip.selected');if(!selected)return;
  let state=railStates.get(rail);if(!state){state={x:null,width:0};railStates.set(rail,state);selectionRails.add(rail);railObserver?.observe(rail);}
  const x=selected.offsetLeft,width=selected.offsetWidth;
  if(!width)return;
  if(state.indicator?.isConnected&&state.target===selected&&state.targetX===x&&state.targetWidth===width)return;
  if(state.indicator?.isConnected){const rect=state.indicator.getBoundingClientRect(),host=rail.getBoundingClientRect();state.x=rect.left-host.left+rail.scrollLeft;state.width=rect.width;for(const animation of state.indicator.getAnimations())animation.cancel();}
  let indicator=rail.querySelector(':scope > .selection-indicator');if(!indicator){indicator=document.createElement('span');indicator.className='selection-indicator';indicator.setAttribute('aria-hidden','true');rail.prepend(indicator);}
  indicator.style.width=width+'px';indicator.style.transform='translateX('+x+'px)';indicator.style.borderRadius=getComputedStyle(selected).borderRadius;
  if(!motionPreference()&&state.x!==null&&(Math.abs(state.x-x)>1||Math.abs(state.width-width)>1))indicator.animate([{transform:'translateX('+state.x+'px) scaleX('+state.width/Math.max(1,width)+')'},{transform:'translateX('+x+'px) scaleX(1)'}],motion.arrange);
  Object.assign(state,{indicator,x,width,target:selected,targetX:x,targetWidth:width});
}
function refreshPlot(svg) {
  const width=svg.getBoundingClientRect().width,viewWidth=svg.viewBox?.baseVal.width;if(!width||!viewWidth)return;
  const scale=viewWidth/width,size=Math.max(12,svg.classList.contains('bars')?11.5*scale:Math.min(34,11.5*scale));svg.style.setProperty('--plot-label-size',size+'px');
  const row=Math.max(37,32*scale),barHeight=Math.max(22,18*scale);
  if(svg.classList.contains('bars')) {
    const items=[...svg.querySelectorAll(':scope > .plot-item')];svg.viewBox.baseVal.height=Math.max(70,items.length*row+20);
    items.forEach((item,index)=>{
      item.setAttribute('transform','translate(0,'+index*(row-37)+')');
      item.querySelector('rect:not(.plot-bar)')?.setAttribute('height',row-4);
      item.querySelector('.plot-bar')?.setAttribute('height',barHeight);
      item.querySelector('.plot-track')?.setAttribute('height',barHeight);
      const line=item.querySelector('line');if(line)line.setAttribute('y2',Number(line.getAttribute('y1'))+barHeight);
    });
  }
  for(const text of svg.querySelectorAll('text')) {
    if(svg.classList.contains('bars')) {
      text.setAttribute('dy',Math.max(0,barHeight/2+size*.35-15));
      if(text.getAttribute('text-anchor')==='end') {
        const full=text.dataset.fullLabel||text.textContent; text.dataset.fullLabel=full;
        const limit=Math.max(3,Math.floor(160/size));text.textContent=full.length>limit?full.slice(0,limit-1)+'…':full;
      }
    }
  }
}
function refreshTable(frame) {
  const scroll=frame.querySelector('.table-scroll');if(!scroll)return;
  const extent=scroll.scrollWidth-scroll.clientWidth,overflow=extent>3,left=scroll.scrollLeft<=2,right=scroll.scrollLeft>=extent-2;
  frame.dataset.overflow=String(overflow);frame.dataset.atStart=String(left);frame.dataset.atEnd=String(right);
  for(const b of frame.querySelectorAll('.table-shift'))b.disabled=!overflow||(Number(b.dataset.direction)<0?left:right);
  const track=frame.querySelector('.table-overflow-note i');if(track){track.style.setProperty('--scroll-progress',overflow?Math.max(0,Math.min(100,scroll.scrollLeft/extent*100))+'%':'0%');track.style.setProperty('--scroll-thumb',Math.max(12,Math.min(100,scroll.clientWidth/Math.max(1,scroll.scrollWidth)*100))+'%');}
}
function revealSelectedClasses(root=document){for(const rail of root.querySelectorAll('.class-picker section>div,.audience-strip>.chips')){const active=document.activeElement?.closest('.selected'),selected=active&&rail.contains(active)?active:rail.querySelector('.class-key.selected,.chip.selected');if(!selected||rail.scrollWidth<=rail.clientWidth+1)continue;const target=selected.getBoundingClientRect(),host=rail.getBoundingClientRect();if(target.left<host.left||target.right>host.right)rail.scrollLeft+=target.left-host.left-(host.width-target.width)/2;}}
export function prepareUpdate(){hideTooltip();sampleRails();samplePlots();for(const rail of document.querySelectorAll('.goal-cards[data-scroll-key]'))galleryOffsets.set(rail.dataset.scrollKey,rail.scrollLeft);}
export function enhance(root=document,{reveal=true}={}) {
  hideTooltip();
  for(const button of root.querySelectorAll('[data-cmd="svg"],[data-cmd="png"]')) {
    const available=Boolean(document.getElementById(button.dataset.id));button.disabled=!available;
    button.setAttribute('aria-label',(button.dataset.cmd==='svg'?'SVG':'PNG')+'图表导出'+(available?'':'，当前没有可绘制的数据'));
    button.closest('.chart-buttons')?.setAttribute('data-empty',String(!available));
  }
  for(const frame of observedTables)if(!frame.isConnected){resizeObserver?.unobserve(frame);observedTables.delete(frame);}
  for(const frame of root.querySelectorAll('.table-frame')){refreshTable(frame);if(!observedTables.has(frame)){observedTables.add(frame);resizeObserver?.observe(frame);}}
  for(const svg of observedPlots)if(!svg.isConnected){plotObserver?.unobserve(svg);observedPlots.delete(svg);}
  for(const svg of root.querySelectorAll('.bars,.trajectory,.spread,.landscape')){refreshPlot(svg);animatePlot(svg);if(!observedPlots.has(svg)){observedPlots.add(svg);plotObserver?.observe(svg);}}
  for(const rail of selectionRails)if(!rail.isConnected){railObserver?.unobserve(rail);selectionRails.delete(rail);}
  for(const rail of root.querySelectorAll('.scene-tabs > .chips,.drawer-tabs'))selectionRail(rail);
  revealSelectedClasses(root);
  for(const rail of root.querySelectorAll('.goal-cards[data-scroll-key]'))rail.scrollLeft=galleryOffsets.get(rail.dataset.scrollKey)||0;
  for(const node of observedReveals)if(!node.isConnected){revealObserver?.unobserve(node);observedReveals.delete(node);}
  if(reveal&&revealObserver&&!motionPreference())for(const node of root.querySelectorAll('.block,.student-scope,.follow-workbench,.knowledge-card,.personal-skills article,.source-launchpad>button,.student-card,.paper-cover,.question-tile'))if(!revealed.has(node)){revealed.add(node);if(node.getBoundingClientRect().top>innerHeight-25){observedReveals.add(node);revealObserver.observe(node);}}
  outline=document.querySelector('#stage .study-outline');
  outlineEntries=outline?[...outline.querySelectorAll('[data-target]')].map(button=>({button,section:document.getElementById(button.dataset.target)})).filter(entry=>entry.section):[];
  refreshOutline();
}
function refreshOutline() {
  if(!outline?.isConnected||!outlineEntries.length)return;
  const edge=Math.max(110,outline.getBoundingClientRect().bottom+26);let selected=outlineEntries[0];
  for(const entry of outlineEntries)if(entry.section.getBoundingClientRect().top<=edge)selected=entry;
  const before=outline.querySelector('[aria-current="location"]');
  for(const entry of outlineEntries)if(entry===selected)entry.button.setAttribute('aria-current','location');else entry.button.removeAttribute('aria-current');
  if(before!==selected.button){const rail=outline.querySelector('.outline-links');rail.scrollTo({left:selected.button.offsetLeft-rail.offsetLeft-(rail.clientWidth-selected.button.offsetWidth)/2,behavior:motionPreference()?'instant':'smooth'});}
  const extent=document.documentElement.scrollHeight-innerHeight;outline.style.setProperty('--reading-progress',extent>0?Math.max(0,Math.min(1,scrollY/extent)):0);
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
  if('ResizeObserver' in window)plotObserver=new ResizeObserver(entries=>{for(const entry of entries)refreshPlot(entry.target);});
  if('ResizeObserver' in window)railObserver=new ResizeObserver(entries=>{for(const entry of entries)if(entry.target.isConnected)selectionRail(entry.target);});
  if('IntersectionObserver' in window)revealObserver=new IntersectionObserver(entries=>{let order=0;for(const entry of entries)if(entry.isIntersecting){revealObserver.unobserve(entry.target);observedReveals.delete(entry.target);if(!motionPreference())entry.target.animate([{opacity:.55,translate:'0px 12px'},{opacity:1,translate:'0px 0px'}],{...motion.arrive,delay:Math.min(order++,3)*22,fill:'backwards'});}},{rootMargin:'0px 0px -25px 0px',threshold:.06});
  document.addEventListener('scroll',event=>{if(event.target?.matches?.('.goal-cards[data-scroll-key]')){galleryOffsets.set(event.target.dataset.scrollKey,event.target.scrollLeft);hideTooltip();}else if(event.target?.matches?.('.table-scroll'))refreshTable(event.target.closest('.table-frame'));else {hideTooltip();if(event.target===document||event.target===document.documentElement){document.body.dataset.scrolled=String(window.scrollY>18);cancelAnimationFrame(outlineFrame);outlineFrame=requestAnimationFrame(refreshOutline);}}},true);
  document.addEventListener('click',event=>{const summary=event.target.closest('summary');if(!summary||event.target.closest('button,a,input'))return;const details=summary.parentElement;if(details.matches('.card-scores,.card-meta,.record-accordion,.method-note,.class-profile')){event.preventDefault();toggleDetails(details);}});
  document.addEventListener('pointerover',event=>{if(event.pointerType==='touch')return;const target=event.target.closest('[data-plot-action],.plot-item,.plot-point,.student-dot,.heat-cell[title],[data-tip]');if(target)showTooltip(target,event.clientX,event.clientY);});
  document.addEventListener('pointermove',event=>{if(!tooltipTarget)return;cancelAnimationFrame(tooltipFrame);tooltipFrame=requestAnimationFrame(()=>placeTooltip(event.clientX,event.clientY));});
  document.addEventListener('pointermove',event=>{
    if(event.pointerType==='touch'||motionPreference())return;
    const dock=event.target.closest('#navigation');
    if(!dock)return;cancelAnimationFrame(pointerFrame);
    pointerFrame=requestAnimationFrame(()=>{
      if(dock){const local=event.clientX-dock.getBoundingClientRect().left;for(const button of dock.querySelectorAll('button')){const proximity=Math.max(0,1-Math.abs(local-button.offsetLeft-button.offsetWidth/2)/120);button.style.setProperty('--dock-lift',-proximity*5+'px');button.style.setProperty('--dock-scale',1+proximity*.045);}}
    });
  },{passive:true});
  document.getElementById('navigation')?.addEventListener('pointerleave',()=>{cancelAnimationFrame(pointerFrame);for(const button of document.querySelectorAll('#navigation button')){button.style.removeProperty('--dock-lift');button.style.removeProperty('--dock-scale');}});
  document.addEventListener('pointerout',event=>{if(tooltipTarget&&!tooltipTarget.contains(event.relatedTarget))hideTooltip();});
  document.addEventListener('focusin',event=>{const target=event.target.closest('[data-plot-action],.student-dot,[data-tip]');if(target){const rect=target.getBoundingClientRect();showTooltip(target,rect.left+rect.width/2,rect.bottom);}});
  document.addEventListener('focusout',event=>{if(tooltipTarget&&!tooltipTarget.contains(event.relatedTarget))hideTooltip();});
  window.addEventListener('resize',()=>{for(const frame of observedTables)refreshTable(frame);for(const svg of observedPlots)refreshPlot(svg);for(const rail of selectionRails)selectionRail(rail);revealSelectedClasses();hideTooltip();refreshOutline();});
}
