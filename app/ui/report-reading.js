import {pdfBlob,pdfKey,idlePDFWorker} from '../io/exports.js?v=runtime-v45';
import {selectedReport} from '../engine/report-selection.js?v=runtime-v45';
import {pdfLibrary} from '../io/pdf-viewer-library.js?v=runtime-v45';
import {pendingReportBrief} from './report-brief.js?v=runtime-v45';
import {reportOverlayMode,createReportOverlayController} from './report-overlay.js?v=runtime-v45';
// A real PDF owns this managed island; form changes never reconcile its canvases.
export function installReportReading(dialog){
 let pane=null,state=null,wanted=null,key='',doc=null,task=null,timer=0,frame=0,epoch=0,busy=null,base=null,scale=1,restore=null,suspended=false,previewAbort=null,pinnedEnd=false;
 const renders=new Map(),pages=new Map();let visibleObserver,loadingTask,pendingChapter='',chapterEpoch=0;
 let overlayState=null;
 const overlay=createReportOverlayController({
  setInert(value){const preview=dialog.querySelector('.report-preview');if(preview&&preview.inert!==value)preview.inert=value;},
  isOpen:()=>dialog.open,
  isPanelFocused:()=>{const panel=dialog.querySelector('#report-settings');return !!panel&&panel.contains(document.activeElement);},
  focusPanel(){const panel=dialog.querySelector('#report-settings');if(!panel)return;const first=panel.querySelector('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),summary');(first||(panel.tabIndex=-1,panel)).focus({preventScroll:true});},
  focusTrigger(){dialog.querySelector('.report-head-actions [data-cmd=report-settings]')?.focus({preventScroll:true});}
 });
 const narrowReport=matchMedia('(max-width:1000px)');
 const syncOverlay=nextState=>{
  if(nextState)overlayState=nextState;
  overlay.sync(reportOverlayMode(overlayState,innerWidth),{restoreFocus:!overlayState?.reading});
 };
 narrowReport.addEventListener('change',()=>{if(dialog.open&&overlayState)syncOverlay(overlayState);else overlay.reset();});
 const resize=new ResizeObserver(()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{if(doc&&pane?.clientWidth&&pane?.clientHeight)layout(snapshot());});});
 const message=(text,error=false)=>{let el=pane?.querySelector('.pdf-status');if(!pane)return;const keep=doc?snapshot():null;if(!el){el=document.createElement('div');el.className='pdf-status';el.setAttribute('role','status');pane.prepend(el);}el.replaceChildren(document.createTextNode(text));if(error){const b=document.createElement('button');b.className='button outline';b.textContent='重新生成纸面';b.dataset.cmd='report-paper-retry';el.append(b);}el.hidden=!text;if(keep){if(keep.end)pane.scrollTop=pane.scrollHeight;else if(keep.top<=3)pane.scrollTop=0;else {const anchor=pages.get(keep.page)?.node;if(anchor)pane.scrollTop=anchor.offsetTop+(keep.ratio||0)*anchor.offsetHeight;}}};
 function cancelRenders(){for(const job of renders.values())job.cancel();renders.clear();visibleObserver?.disconnect();}
 function dispose(){previewAbort?.abort();previewAbort=null;busy=null;idlePDFWorker();pinnedEnd=false;epoch++;chapterEpoch++;pendingChapter='';clearTimeout(timer);cancelRenders();task?.destroy().catch(()=>{});loadingTask?.destroy().catch(()=>{});loadingTask=null;task=null;doc=null;if(pane){pane.pdfDocument=null;pane.pdfBlob=null;pane.replaceChildren();}pages.clear();key='';base=null;}
 function snapshot(){
  if(!pane)return null;const maximum=Math.max(0,pane.scrollHeight-pane.clientHeight),n=Number(pane.dataset.currentPage)||1,node=pane.querySelector('[data-pdf-page="'+n+'"]');
  return {top:pane.scrollTop,left:pane.scrollLeft,end:pinnedEnd||maximum>3&&maximum-pane.scrollTop<=3,page:n,ratio:node?(pane.scrollTop-node.offsetTop)/Math.max(1,node.offsetHeight):0};
 }
 function releasePage(item){
  if(!item?.done)return;
  const layer=item.node.querySelector('.textLayer'),selection=document.getSelection();
  // A selection may cross a page boundary while the reader scrolls. Keep those
  // pages intact until copying finishes or the selection is collapsed.
  if(selection&&!selection.isCollapsed)for(let i=0;i<selection.rangeCount;i++)if(selection.getRangeAt(i).intersectsNode(layer))return;
  const canvas=item.node.querySelector('canvas');canvas.width=canvas.height=1;layer.replaceChildren();item.done=false;item.node.removeAttribute('data-rendered');
 }
 function trimPages(){
  if(!pane||!doc)return;const host=pane.getBoundingClientRect();
  for(const [number,item] of pages){const r=item.node.getBoundingClientRect();if(r.bottom<host.top-400||r.top>host.bottom+400){if(item.done&&!renders.has(number))releasePage(item);}else paintPage(number);}
 }
 function position(){
  if(!pane||!pane.clientWidth||!pane.clientHeight)return;
  // A changed toolbar height or pending status must not undo an explicit
  // "到末尾" intent. A new gesture / keyboard move releases the end anchor.
  if(pinnedEnd&&pane.scrollHeight-pane.clientHeight-pane.scrollTop>3)pane.scrollTop=pane.scrollHeight;
  const count=doc?.numPages||0,gap=parseFloat(getComputedStyle(pane.querySelector('.pdf-pages')||pane).rowGap)||20,atEnd=pane.scrollHeight-pane.clientHeight-pane.scrollTop<=3,n=atEnd&&count?count:Math.max(1,Math.min(count||1,Math.floor((pane.scrollTop+Math.min(100,pane.clientHeight*.25))/Math.max(1,(base?.height||1)*scale+gap))+1));
  pane.dataset.currentPage=String(n);if(state)state.pdfPage=n;
  const label=dialog.querySelector('.report-paper-position');if(label)label.textContent=count?'第 '+n+' / '+count+' 页 · PDF纸面':pane.dataset.pdfState==='empty'?'尚无导出正文':pane.dataset.pdfState==='error'?'纸面暂未生成':'正在生成PDF纸面';
  const input=dialog.querySelector('[data-report-page-target]');if(input&&document.activeElement!==input)input.value=String(n);
  const total=dialog.querySelector('[data-paper-page-count]');if(total)total.textContent='/ '+(count||'—');
  for(const b of dialog.querySelectorAll('[data-cmd="report-paper-step"]'))b.disabled=!count||(Number(b.dataset.step)<0?n<=1:n>=count);
  for(const b of dialog.querySelectorAll('[data-cmd=report-paper-open]'))b.disabled=!count||pane.dataset.pdfState!=='ready';
  const max=pane.scrollHeight-pane.clientHeight;for(const b of dialog.querySelectorAll('[data-cmd="report-paper-edge"]'))b.disabled=!count||(b.dataset.value==='start'?pane.scrollTop<=2:max-pane.scrollTop<=3);
  trimPages();
 }
 async function paintPage(number){
  const item=pages.get(number),version=epoch;if(suspended||globalThis.document.hidden||!item||item.done||renders.has(number)||!doc||pane?.pdfDocument!==doc)return;
  const sourceDocument=doc,localScale=scale;let render,textLayer,cancelled=false;
  const job={cancel(){cancelled=true;render?.cancel();textLayer?.cancel();}};renders.set(number,job);
  try{
   const page=await sourceDocument.getPage(number);if(cancelled||version!==epoch||localScale!==scale||!item.node.isConnected)return;
   const viewport=page.getViewport({scale:localScale}),ratio=Math.min(2,devicePixelRatio||1),canvas=item.node.querySelector('canvas');canvas.width=Math.ceil(viewport.width*ratio);canvas.height=Math.ceil(viewport.height*ratio);
   render=page.render({canvasContext:canvas.getContext('2d',{alpha:false}),viewport,transform:ratio!==1?[ratio,0,0,ratio,0,0]:undefined});await render.promise;if(version!==epoch||localScale!==scale)return;
   const text=await page.getTextContent();if(version!==epoch||localScale!==scale)return;const previousLayer=item.node.querySelector('.textLayer'),layer=document.createElement('div');layer.className='textLayer';previousLayer.replaceWith(layer);
   const module=await pdfLibrary();if(version!==epoch||localScale!==scale)return;
   textLayer=new module.TextLayer({textContentSource:text,container:layer,viewport});await textLayer.render();
   if(version!==epoch||localScale!==scale||!item.node.isConnected)return;item.done=true;item.node.dataset.rendered='true';const r=item.node.getBoundingClientRect(),host=pane?.getBoundingClientRect();if(host&&(r.bottom<host.top-400||r.top>host.bottom+400))releasePage(item);
  }catch(error){if(!['RenderingCancelledException','AbortException'].includes(error.name)&&version===epoch&&localScale===scale&&item.node.isConnected){item.node.dataset.rendered='error';const text=item.node.querySelector('.pdf-page-accessible');text.textContent='此页显示失败，可重新生成纸面。';}}
  finally{if(renders.get(number)===job)renders.delete(number);}
 }
 function layout(keep){
  if(suspended||!pane||!doc||!base||!state)return;const style=getComputedStyle(pane),available=Math.max(80,pane.clientWidth-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight)),height=Math.max(140,pane.clientHeight-34);
  const next=state.paperWidth==='actual'?96/72:state.paperWidth==='page'?Math.min(available/base.width,height/base.height):state.paperWidth==='custom'?(Number(state.paperZoom)||100)/100*96/72:Math.min(available,1100)/base.width;
  const changed=Math.abs(next-scale)>.003;scale=next;state.paperZoom=Math.round(scale/(96/72)*100);
  const zoom=dialog.querySelector('[data-paper-zoom]');if(zoom)zoom.textContent=state.paperZoom+'%';
  if(changed){cancelRenders();for(const item of pages.values()){item.done=false;item.node.removeAttribute('data-rendered');item.node.querySelector('.textLayer').replaceChildren();}}
  pane.style.setProperty('--scale-factor',String(scale));
  pane.style.setProperty('--pdf-width',base.width*scale+'px');pane.style.setProperty('--pdf-height',base.height*scale+'px');
  visibleObserver?.disconnect();visibleObserver=new IntersectionObserver(entries=>{for(const e of entries){const n=Number(e.target.dataset.pdfPage),item=pages.get(n);if(e.isIntersecting)paintPage(n);else if(item?.done&&!renders.has(n))releasePage(item);}},{root:pane,rootMargin:'400px 0px'});for(const item of pages.values())visibleObserver.observe(item.node);
  if(keep){pinnedEnd=Boolean(keep.end);if(keep.end)pane.scrollTop=pane.scrollHeight;else {const node=pages.get(keep.page)?.node;pane.scrollTop=node?node.offsetTop+(keep.ratio||0)*node.offsetHeight:keep.top||0;}pane.scrollLeft=keep.left||0;}
  position();paintPage(Number(pane.dataset.currentPage)||1);
 }
 async function generate(){
  if(suspended||document.hidden||busy||!wanted||!pane||!dialog.open)return;
  // Let the window settle before print fonts, layout and PDF parsing compete
  // for the foreground thread. Exit pauses work immediately, not after fadeout.
  if(dialog.dataset.surfacePhase==='entering'){timer=setTimeout(generate,60);return;}
  const request=wanted,version=epoch,keep=restore||snapshot(),owner={};busy=owner;
  try{
   previewAbort?.abort();const controller=new AbortController();previewAbort=controller;
   const [blob,module]=await Promise.all([pdfBlob(request.report,{signal:controller.signal}),pdfLibrary()]);if(version!==epoch||wanted?.key!==request.key||!pane?.isConnected)return;
   const data=await blob.arrayBuffer();if(version!==epoch||wanted?.key!==request.key)return;
   loadingTask=module.getDocument({data,isEvalSupported:false});const loading=loadingTask,next=await loading.promise;if(version!==epoch||wanted?.key!==request.key){await loading.destroy();return;}
   const latestKeep=restore?.reset?restore:doc?snapshot():keep;restore=null;
   cancelRenders();task?.destroy().catch(()=>{});task=loading;loadingTask=null;doc=next;base=(await doc.getPage(1)).getViewport({scale:1});if(version!==epoch||wanted?.key!==request.key)return;
   key=request.key;pages.clear();const paper=document.createElement('div');paper.className='pdf-pages';paper.dataset.pdfPages=String(doc.numPages);
   for(let n=1;n<=doc.numPages;n++){const node=document.createElement('section');node.className='pdf-page';node.dataset.pdfPage=String(n);node.setAttribute('aria-label','第 '+n+' 页');node.innerHTML='<canvas aria-hidden="true" width="1" height="1"></canvas><div class="textLayer"></div><span class="pdf-page-accessible sr-only">第 '+n+' 页</span>';paper.append(node);pages.set(n,{node,done:false});}
   pane.replaceChildren(paper);pane.pdfDocument=doc;pane.pdfBlob=blob;pane.dataset.pdfState='ready';pane.dataset.pdfRevision=String((Number(pane.dataset.pdfRevision)||0)+1);layout(latestKeep);message('');if(pendingChapter){const title=pendingChapter;pendingChapter='';locateChapter(title);}
  }catch(error){if(version===epoch&&wanted?.key===request.key){pane.dataset.pdfState='error';message('纸面暂未生成：'+error.message,true);}}
  finally{if(busy===owner){busy=null;if(!suspended&&wanted&&wanted.key!==key&&pane?.dataset.pdfState==='pending'&&dialog.open)timer=setTimeout(generate,0);}}
 }
 function queue(delay=160){previewAbort?.abort();previewAbort=null;clearTimeout(timer);pane.dataset.pdfState='pending';if(!doc){pane.querySelector('.pdf-pending-brief')?.remove();pane.insertAdjacentHTML('beforeend',pendingReportBrief(wanted.report));}message(doc?'内容已更新，正在重新分页…':'关键内容已就绪，PDF纸面正在排版…');timer=setTimeout(generate,delay);}
 function jump(n){if(!pane||!doc)return;pinnedEnd=false;n=Math.max(1,Math.min(doc.numPages,Math.round(Number(n)||1)));const node=pages.get(n)?.node;if(node){pane.scrollTop=node.offsetTop;paintPage(n);position();pane.focus({preventScroll:true});}}
 dialog.addEventListener('scroll',event=>{if(event.target===pane){cancelAnimationFrame(frame);frame=requestAnimationFrame(position);}},{capture:true,passive:true});
 document.addEventListener('selectionchange',()=>{if(pane&&dialog.open){cancelAnimationFrame(frame);frame=requestAnimationFrame(position);}});
 for(const type of ['wheel','touchstart','pointerdown'])dialog.addEventListener(type,event=>{if(pane?.contains(event.target))pinnedEnd=false;},{capture:true,passive:true});
 dialog.addEventListener('keydown',event=>{if(event.target===pane&&['Home','PageUp','PageDown','ArrowUp','ArrowDown'].includes(event.key))pinnedEnd=false;if(event.target.matches('[data-report-page-target]')&&event.key==='Enter'){event.preventDefault();jump(event.target.value);}else if(event.target===pane&&event.key==='Home'){event.preventDefault();pane.scrollTop=0;position();}else if(event.target===pane&&event.key==='End'){event.preventDefault();pinnedEnd=true;pane.scrollTop=pane.scrollHeight;position();}});
 dialog.addEventListener('change',event=>{if(event.target.matches('[data-report-page-target]'))jump(event.target.value);});
 const closed=()=>{if(dialog.open)return;overlay.reset();overlayState=null;dispose();wanted=null;pane=null;resize.disconnect();};
 dialog.addEventListener('close',closed);dialog.addEventListener('surfaceclosed',closed);
 function suspend(){previewAbort?.abort();previewAbort=null;busy=null;idlePDFWorker();suspended=true;epoch++;chapterEpoch++;clearTimeout(timer);cancelRenders();loadingTask?.destroy().catch(()=>{});loadingTask=null;}
 function resume(){suspended=false;if(!pane||!dialog.open)return;if(wanted&&wanted.key!==key)queue();else if(doc)layout(snapshot());}
 dialog.addEventListener('surfaceclosing',suspend);dialog.addEventListener('surfaceopening',resume);
 document.addEventListener('visibilitychange',()=>{if(document.hidden)suspend();else if(dialog.open&&dialog.dataset.surfacePhase!=='leaving')resume();});
 async function locateChapter(title){
  if(!doc||pane?.dataset.pdfState!=='ready'){pendingChapter=title;if(pane)message('纸面更新后将定位到此章节…');return;}
  const target=String(title).replace(/\s/g,''),version=++chapterEpoch,document=doc;message('正在定位章节…');
  try{for(let n=1;n<=document.numPages;n++){const text=await (await document.getPage(n)).getTextContent();if(version!==chapterEpoch||doc!==document)return;if(text.items.map(t=>t.str).join('').replace(/\s/g,'').includes(target)){jump(n);message('');return;}}message('当前纸面未包含这个章节。');}
  catch{if(version===chapterEpoch)message('纸面更新中，请完成后再定位。');}
 }
 return {
  snapshot,
  blob(report){return pane?.dataset.pdfState==='ready'&&key===pdfKey(report)?pane.pdfBlob:null;},
  invalidate(report){if(!pane)return;chapterEpoch++;const output=selectedReport(report),nextKey=pdfKey(output);if(nextKey===key)return;wanted={report:output,key:nextKey};restore=snapshot();queue();position();},
  sync(nextState,report,keep){
   if(!dialog.open||dialog.dataset.surfacePhase==='leaving'){suspend();return;}
   suspended=false;
   state=nextState;dialog.classList.toggle('is-reading',Boolean(state.reading));dialog.classList.toggle('is-configuring',Boolean(state.settingsOpen&&!state.reading));
   syncOverlay(nextState);
   const next=dialog.querySelector('.report-paper-scroll');if(pane!==next){dispose();wanted=null;resize.disconnect();pane=next;if(pane){pane.replaceChildren();pane.scrollTop=0;resize.observe(pane);}}
   if(!pane){wanted=null;return;}
   const output=selectedReport(report),nextKey=pdfKey(output),previousWanted=wanted?.key;wanted={report:output,key:nextKey};if(!output.sections.length&&!output.note?.trim()){dispose();wanted=null;pane.innerHTML='<div class="pdf-empty" role="status">当前没有可导出的正文。请勾选章节、调整记录筛选，或加入教师判断。</div>';pane.dataset.pdfState='empty';state.pdfPage=1;pane.dataset.currentPage='1';position();return;}
   // Form / button redraws of the same pending paper must not cancel its
   // worker, particularly when a download is claiming that preview's result.
   if(nextKey!==key){restore=keep;if(previousWanted!==nextKey)queue(!doc||keep?.reset?0:160);}else layout(keep);position();
  },
  open(){if(!pane?.pdfBlob||pane.dataset.pdfState!=='ready')return;const url=URL.createObjectURL(pane.pdfBlob);window.open(url,'_blank','noopener');setTimeout(()=>URL.revokeObjectURL(url),120000);},
  edge(value){if(!pane)return;pinnedEnd=value==='end';pane.scrollTop=pinnedEnd?pane.scrollHeight:0;pane.focus({preventScroll:true});position();},
  step(value){jump((Number(pane?.dataset.currentPage)||1)+value);},
  zoom(value){if(!state||!pane)return;const keep=snapshot();state.paperWidth='custom';state.paperZoom=Math.max(25,Math.min(200,(state.paperZoom||100)+value));layout(keep);},
  retry(){if(wanted&&pane){key='';pane.dataset.pdfState='pending';message('正在重新生成纸面…');clearTimeout(timer);generate();}},
  chapter:locateChapter
 };
}
