import {motion} from './motion.js?v=controls-v25';
import {positionSpreadLabels} from './plots.js?v=controls-v25';
import {paperMapLayout} from '../engine/paper-structure.js?v=controls-v25';
let motionPreference=()=>false,resizeObserver,plotObserver,railObserver,drawerHeaderObserver,revealObserver,tooltipTarget=null,tooltipOriginal=null,tooltipFrame=0,outlineFrame=0,drawerOutlineFrame=0,pointerFrame=0,outline=null,outlineEntries=[];
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
  const scale=viewWidth/width,size=Math.max(12,svg.classList.contains('spread')?12*scale:svg.classList.contains('bars')?11.5*scale:Math.min(34,11.5*scale));svg.style.setProperty('--plot-label-size',size+'px');
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
  if(svg.classList.contains('spread')){
    const markers=[...svg.querySelectorAll('.spread-threshold')],margin=11*scale,labelX=margin;
    const sizes=markers.map((marker,index)=>{
      const main=marker.querySelector('.spread-threshold-label'),detail=marker.querySelector('.spread-threshold-detail'),range=marker.querySelector('.spread-threshold-range');
      main.style.fontSize=13*scale+'px';detail.style.fontSize=11*scale+'px';if(range)range.style.fontSize=10.5*scale+'px';
      main.setAttribute('x',labelX);main.setAttribute('y',margin+17*scale*.85);detail.setAttribute('x',margin);detail.setAttribute('y',margin+17*scale+7*scale+11*scale*.85);
      if(range){range.setAttribute('x',margin);range.setAttribute('y',margin+17*scale+7*scale+11*scale+5*scale+10.5*scale*.85);}
      const width=Math.max(main.getBBox().width+labelX+margin,detail.getBBox().width+2*margin,range?range.getBBox().width+2*margin:0),height=margin*2+17*scale+7*scale+11*scale+(range?15.5*scale:0);
      return {index,x:Number(marker.dataset.x),width,height};
    }),placed=positionSpreadLabels(sizes),cardHeight=Math.max(0,...sizes.map(s=>s.height)),lanes=placed.length?Math.max(...placed.map(s=>s.lane))+1:0;
    const top=markers.length?8*scale+lanes*(cardHeight+8*scale)+24*scale:Math.max(40,25*scale),height=Math.max(155,110*scale),bottom=top+height;
    svg.dataset.plotTop=top;svg.dataset.plotBottom=bottom;svg.viewBox.baseVal.height=bottom+34*scale;
    for(const {index,left,width,lane} of placed){
      const marker=markers[index],y=8*scale+lane*(cardHeight+8*scale),card=marker.querySelector('.spread-threshold-card'),rect=card.querySelector('rect'),sample=card.querySelector('.spread-threshold-swatch'),anchor=Number(marker.dataset.x),start=Math.max(left+margin,Math.min(left+width-margin,anchor));
      card.setAttribute('transform','translate('+left+','+y+')');rect.setAttribute('width',width);rect.setAttribute('height',cardHeight);rect.setAttribute('rx',8*scale);
      sample.setAttribute('x1',margin);sample.setAttribute('x2',Math.min(width-margin,margin+32*scale));sample.setAttribute('y1',6*scale);sample.setAttribute('y2',6*scale);
      marker.querySelector('.spread-threshold-leader').setAttribute('d','M'+start+','+(y+cardHeight)+' L'+anchor+','+(top-18*scale));
      marker.querySelector('.spread-threshold-pin').setAttribute('cy',top-18*scale);marker.querySelector('.spread-threshold-pin').setAttribute('r',3*scale);
      for(const line of marker.querySelectorAll('.spread-threshold-line,.spread-threshold-halo')){line.setAttribute('y1',top-18*scale);line.setAttribute('y2',bottom);}
      const outside=marker.querySelector('.spread-threshold-outside');if(outside){const leftSide=marker.dataset.outside.startsWith('低');outside.setAttribute('d','M'+(anchor+(leftSide?12:-12)*scale)+','+(top-18*scale)+' h'+(leftSide?-12:12)*scale+' m'+(leftSide?4:-4)*scale+','+(-4*scale)+' l'+(leftSide?-4:4)*scale+','+(4*scale)+' l'+(leftSide?4:-4)*scale+','+(4*scale));}
    }
    svg.querySelectorAll('.plot-grid').forEach((line,i)=>{line.setAttribute('y1',top+i*height/2);line.setAttribute('y2',top+i*height/2);});
    for(const band of svg.querySelectorAll('.spread-score-band')){band.setAttribute('y',top);band.setAttribute('height',height);}
    const columns=[...svg.querySelectorAll('.plot-column')],maximum=Math.max(1,...columns.map(column=>Number(column.dataset.count)));
    for(const column of columns){const h=Number(column.dataset.count)/maximum*height;column.setAttribute('y',bottom-h);column.setAttribute('height',h);const hit=column.parentElement.querySelector('rect:not(.plot-column)');hit.setAttribute('y',top);hit.setAttribute('height',height);}
    let tickEdge=-Infinity;
    for(const tick of svg.querySelectorAll('.spread-tick')){
      tick.setAttribute('y',bottom+27*scale);tick.style.fontSize=11.5*scale+'px';tick.style.removeProperty('display');tick.setAttribute('text-anchor','middle');
      let box=tick.getBBox();if(box.x<4){tick.setAttribute('text-anchor','start');box=tick.getBBox();}else if(box.x+box.width>viewWidth-4){tick.setAttribute('text-anchor','end');box=tick.getBBox();}
      if(box.x<tickEdge+6*scale)tick.style.display='none';else tickEdge=box.x+box.width;
    }
    const countPlacements=[],overlaps=(a,b)=>a.x<b.x+b.width+2&&a.x+a.width+2>b.x&&a.y<b.y+b.height+2&&a.y+a.height+2>b.y;
    for(const text of svg.querySelectorAll('.spread-counts .plot-value')){
      const column=columns[Number(text.dataset.bin)],base=Number(column.getAttribute('y'))-7*scale;text.setAttribute('y',base);
      let box=text.getBBox();
      for(let lane=1;lane<=6&&countPlacements.some(previous=>overlaps(box,previous));lane++){const inside=Number(column.getAttribute('y'))+size*(1.05+(lane-1)*1.3);const y=inside<=bottom-3*scale?inside:Math.max(top-7*scale,base-size*1.3*lane);text.setAttribute('y',y);box=text.getBBox();}
      countPlacements.push({x:box.x,y:box.y,width:box.width,height:box.height});
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
export function prepareUpdate(){hideTooltip();sampleRails();samplePlots();for(const rail of document.querySelectorAll('.goal-cards[data-scroll-key]'))if(!rail.closest('.scene-leaving-viewport'))galleryOffsets.set(rail.dataset.scrollKey,rail.scrollLeft);}
export function pruneInteractions() {
  for(const frame of observedTables)if(!frame.isConnected){resizeObserver?.unobserve(frame);observedTables.delete(frame);}
  for(const svg of observedPlots)if(!svg.isConnected){plotObserver?.unobserve(svg);observedPlots.delete(svg);}
  for(const rail of selectionRails)if(!rail.isConnected){railObserver?.unobserve(rail);selectionRails.delete(rail);}
  for(const node of observedReveals)if(!node.isConnected){revealObserver?.unobserve(node);observedReveals.delete(node);}
}
function refreshPaperProfiles(root=document){
  for(const svg of root.querySelectorAll('.paper-score-atlas')){
    const width=svg.getBoundingClientRect().width;if(!width)continue;
    const items=[...svg.querySelectorAll('.profile-question')],layout=paperMapLayout(items.length,width);
    svg.setAttribute('viewBox','0 0 '+width+' '+layout.height);
    const background=svg.querySelector('.profile-background');background.setAttribute('width',width);background.setAttribute('height',layout.height);
    items.forEach((item,index)=>{
      const p=layout.position(index);item.setAttribute('transform','translate('+p.x+','+p.y+')');
      item.querySelector('.profile-tile').setAttribute('width',layout.cellWidth-1);
      item.querySelector('.profile-edge').setAttribute('d','M10,2 H'+(layout.cellWidth-10));
    });
  }
}
export function enhance(root=document,{reveal=true}={}) {
  refreshPaperProfiles(root);
  hideTooltip();
  pruneInteractions();
  for(const button of root.querySelectorAll('[data-cmd="svg"],[data-cmd="png"]')) {
    const available=Boolean(document.getElementById(button.dataset.id));button.disabled=!available;
    button.setAttribute('aria-label',(button.dataset.cmd==='svg'?'SVG':'PNG')+'图表导出'+(available?'':'，当前没有可绘制的数据'));
    button.closest('.chart-buttons')?.setAttribute('data-empty',String(!available));
  }
  for(const frame of root.querySelectorAll('.table-frame')){refreshTable(frame);if(!observedTables.has(frame)){observedTables.add(frame);resizeObserver?.observe(frame);}}
  for(const svg of root.querySelectorAll('.bars,.trajectory,.spread,.landscape')){refreshPlot(svg);animatePlot(svg);if(!observedPlots.has(svg)){observedPlots.add(svg);plotObserver?.observe(svg);}}
  for(const rail of root.querySelectorAll('.scene-tabs > .chips,.drawer-tabs'))selectionRail(rail);
  revealSelectedClasses(root);
  for(const rail of root.querySelectorAll('.goal-cards[data-scroll-key]'))rail.scrollLeft=galleryOffsets.get(rail.dataset.scrollKey)||0;
  if(reveal&&revealObserver&&!motionPreference())for(const node of root.querySelectorAll('.block,.student-scope,.follow-workbench,.knowledge-card,.personal-skills article,.source-launchpad>button,.student-card,.paper-cover,.question-tile'))if(!revealed.has(node)){revealed.add(node);if(node.getBoundingClientRect().top>innerHeight-25){observedReveals.add(node);revealObserver.observe(node);}}
  outline=document.querySelector('#stage .study-outline');
  outlineEntries=outline?[...outline.querySelectorAll('[data-target]')].map(button=>({button,section:document.getElementById(button.dataset.target)})).filter(entry=>entry.section):[];
  refreshOutline();
  refreshDrawerSections();
}
function refreshDrawerSections(){
  const dialog=document.getElementById('research-drawer'),nav=dialog?.querySelector('.drawer-section-nav');if(!nav)return;
  nav.style.setProperty('--drawer-header-height',Math.max(66,dialog.querySelector('.drawer-top')?.getBoundingClientRect().height||0)+'px');
  const entries=[...nav.querySelectorAll('.drawer-section-link[data-target]')].map(button=>({button,section:document.getElementById(button.dataset.target)})).filter(e=>e.section&&dialog.contains(e.section));if(!entries.length)return;
  let selected=entries[0];if(dialog.open){const edge=nav.getBoundingClientRect().bottom+24;selected=entries.find(entry=>entry.section.getBoundingClientRect().bottom>edge)||entries.at(-1);}
  for(const entry of entries)if(entry===selected)entry.button.setAttribute('aria-current','location');else entry.button.removeAttribute('aria-current');
}
function refreshOutline() {
  if(!outline?.isConnected||!outlineEntries.length)return;
  const edge=Math.max(110,outline.getBoundingClientRect().bottom+26);let selected=outlineEntries[0];
  for(const entry of outlineEntries)if(entry.section.getBoundingClientRect().top<=edge)selected=entry;
  const before=outline.querySelector('[aria-current="location"]');
  if(before!==selected.button)for(const entry of outlineEntries)if(entry===selected)entry.button.setAttribute('aria-current','location');else entry.button.removeAttribute('aria-current');
  if(before!==selected.button){const rail=outline.querySelector('.outline-links');rail.scrollTo({left:selected.button.offsetLeft-rail.offsetLeft-(rail.clientWidth-selected.button.offsetWidth)/2,behavior:motionPreference()?'instant':'smooth'});}
  const extent=document.documentElement.scrollHeight-innerHeight;outline.style.setProperty('--reading-progress',extent>0?Math.max(0,Math.min(1,scrollY/extent)):0);
}
export function shiftTable(button) {
  const frame=button.closest('.table-frame'),scroll=frame?.querySelector('.table-scroll');scroll?.scrollBy({left:Number(button.dataset.direction)*scroll.clientWidth*.8,behavior:motionPreference()?'instant':'smooth'});
}
function hideTooltip() {
  cancelAnimationFrame(tooltipFrame);const tooltip=document.getElementById('chart-tooltip');if(tooltip){if(tooltip.hidePopover&&tooltip.matches(':popover-open'))tooltip.hidePopover();if(!tooltip.hidden)tooltip.hidden=true;}
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
  const fontsReady=()=>{pruneInteractions();refreshPaperProfiles();for(const svg of observedPlots)refreshPlot(svg);for(const rail of selectionRails)selectionRail(rail);refreshOutline();refreshDrawerSections();};
  document.fonts?.addEventListener('loadingdone',fontsReady);
  document.fonts?.ready.then(fontsReady);
  if('ResizeObserver' in window)resizeObserver=new ResizeObserver(entries=>{for(const entry of entries)refreshTable(entry.target);});
  if('ResizeObserver' in window)plotObserver=new ResizeObserver(entries=>{for(const entry of entries)refreshPlot(entry.target);});
  if('ResizeObserver' in window)railObserver=new ResizeObserver(entries=>{for(const entry of entries)if(entry.target.isConnected)selectionRail(entry.target);});
  if('ResizeObserver' in window){drawerHeaderObserver=new ResizeObserver(refreshDrawerSections);const header=document.querySelector('#research-drawer .drawer-top');if(header)drawerHeaderObserver.observe(header);}
  if('IntersectionObserver' in window)revealObserver=new IntersectionObserver(entries=>{let order=0;for(const entry of entries)if(entry.isIntersecting){revealObserver.unobserve(entry.target);observedReveals.delete(entry.target);if(!motionPreference())entry.target.animate([{opacity:entry.target.matches('.block,.follow-workbench')?1:.9,translate:'0px 8px'},{opacity:1,translate:'0px 0px'}],{...motion.arrive,delay:Math.min(order++,3)*22,fill:'backwards'});}},{rootMargin:'0px 0px -25px 0px',threshold:.06});
  document.addEventListener('scroll',event=>{if(event.target?.matches?.('.goal-cards[data-scroll-key]')){galleryOffsets.set(event.target.dataset.scrollKey,event.target.scrollLeft);hideTooltip();}else if(event.target?.matches?.('.paper-profile-scroll')){refreshPaperProfiles();hideTooltip();}else if(event.target?.matches?.('.table-scroll'))refreshTable(event.target.closest('.table-frame'));else {hideTooltip();if(event.target?.id==='research-drawer'){cancelAnimationFrame(drawerOutlineFrame);drawerOutlineFrame=requestAnimationFrame(refreshDrawerSections);}else if(event.target===document||event.target===document.documentElement){cancelAnimationFrame(outlineFrame);outlineFrame=requestAnimationFrame(()=>{const scrolled=String(window.scrollY>18);if(document.body.dataset.scrolled!==scrolled)document.body.dataset.scrolled=scrolled;refreshOutline();});}}},{capture:true,passive:true});
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
  window.addEventListener('resize',()=>{refreshPaperProfiles();for(const frame of observedTables)refreshTable(frame);for(const svg of observedPlots)refreshPlot(svg);for(const rail of selectionRails)selectionRail(rail);revealSelectedClasses();hideTooltip();refreshOutline();refreshDrawerSections();});
}
