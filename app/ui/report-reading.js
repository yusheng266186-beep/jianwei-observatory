import {pdfBlob,pdfKey} from '../io/exports.js?v=paper-v30';
import {selectedReport} from '../engine/report-selection.js?v=paper-v30';
import {pdfLibrary} from '../io/pdf-viewer-library.js?v=paper-v30';
// A real PDF owns this managed island; form changes never reconcile its canvases.
export function installReportReading(dialog){
 let pane=null,state=null,wanted=null,key='',doc=null,task=null,timer=0,frame=0,epoch=0,busy=false,base=null,scale=1,restore=null;
 const renders=new Map(),pages=new Map();let visibleObserver,loadingTask,pendingChapter='',chapterEpoch=0;
 const resize=new ResizeObserver(()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{if(doc&&pane?.clientWidth&&pane?.clientHeight)layout(snapshot());});});
 const message=(text,error=false)=>{let el=pane?.querySelector('.pdf-status');if(!pane)return;if(!el){el=document.createElement('div');el.className='pdf-status';el.setAttribute('role','status');pane.prepend(el);}el.replaceChildren(document.createTextNode(text));if(error){const b=document.createElement('button');b.className='button outline';b.textContent='重新生成纸面';b.dataset.cmd='report-paper-retry';el.append(b);}el.hidden=!text;};
 function cancelRenders(){for(const job of renders.values())job.cancel();renders.clear();visibleObserver?.disconnect();}
 function dispose(){epoch++;chapterEpoch++;pendingChapter='';clearTimeout(timer);cancelRenders();task?.destroy().catch(()=>{});loadingTask?.destroy().catch(()=>{});loadingTask=null;task=null;doc=null;if(pane){pane.pdfDocument=null;pane.pdfBlob=null;pane.replaceChildren();}pages.clear();key='';base=null;}
 function snapshot(){
  if(!pane)return null;const maximum=Math.max(0,pane.scrollHeight-pane.clientHeight),n=Number(pane.dataset.currentPage)||1,node=pane.querySelector('[data-pdf-page="'+n+'"]');
  return {top:pane.scrollTop,left:pane.scrollLeft,end:maximum>3&&maximum-pane.scrollTop<=3,page:n,ratio:node?(pane.scrollTop-node.offsetTop)/Math.max(1,node.offsetHeight):0};
 }
 function position(){
  if(!pane||!pane.clientWidth||!pane.clientHeight)return;const count=doc?.numPages||0,gap=parseFloat(getComputedStyle(pane.querySelector('.pdf-pages')||pane).rowGap)||20,atEnd=pane.scrollHeight-pane.clientHeight-pane.scrollTop<=3,n=atEnd&&count?count:Math.max(1,Math.min(count||1,Math.floor((pane.scrollTop+Math.min(100,pane.clientHeight*.25))/Math.max(1,(base?.height||1)*scale+gap))+1));
  pane.dataset.currentPage=String(n);if(state)state.pdfPage=n;
  const label=dialog.querySelector('.report-paper-position');if(label)label.textContent=count?'第 '+n+' / '+count+' 页 · PDF纸面':'正在生成PDF纸面';
  const input=dialog.querySelector('[data-report-page-target]');if(input&&document.activeElement!==input)input.value=String(n);
  const total=dialog.querySelector('[data-paper-page-count]');if(total)total.textContent='/ '+(count||'—');
  for(const b of dialog.querySelectorAll('[data-cmd="report-paper-step"]'))b.disabled=!count||(Number(b.dataset.step)<0?n<=1:n>=count);
  for(const b of dialog.querySelectorAll('[data-cmd=report-paper-open]'))b.disabled=!count||pane.dataset.pdfState!=='ready';
  const max=pane.scrollHeight-pane.clientHeight;for(const b of dialog.querySelectorAll('[data-cmd="report-paper-edge"]'))b.disabled=!count||(b.dataset.value==='start'?pane.scrollTop<=2:max-pane.scrollTop<=3);
 }
 async function paintPage(number){
  const item=pages.get(number),version=epoch;if(!item||item.done||renders.has(number)||!doc)return;
  const document=doc,localScale=scale;let job;
  try{
   const page=await document.getPage(number);if(version!==epoch||localScale!==scale||!item.node.isConnected)return;
   const viewport=page.getViewport({scale:localScale}),ratio=Math.min(2,devicePixelRatio||1),canvas=item.node.querySelector('canvas');canvas.width=Math.ceil(viewport.width*ratio);canvas.height=Math.ceil(viewport.height*ratio);
   const render=page.render({canvasContext:canvas.getContext('2d',{alpha:false}),viewport,transform:ratio!==1?[ratio,0,0,ratio,0,0]:undefined});job=render;renders.set(number,render);await render.promise;if(version!==epoch||localScale!==scale)return;
   const text=await page.getTextContent();if(version!==epoch||localScale!==scale)return;const layer=item.node.querySelector('.textLayer');layer.replaceChildren();const module=await pdfLibrary();await new module.TextLayer({textContentSource:text,container:layer,viewport}).render();
   if(version!==epoch||localScale!==scale||!item.node.isConnected)return;item.done=true;item.node.dataset.rendered='true';const r=item.node.getBoundingClientRect(),host=pane?.getBoundingClientRect();if(host&&(r.bottom<host.top-400||r.top>host.bottom+400)){canvas.width=canvas.height=1;item.done=false;item.node.removeAttribute('data-rendered');}
  }catch(error){if(error.name!=='RenderingCancelledException'&&version===epoch){item.node.dataset.rendered='error';const text=item.node.querySelector('.pdf-page-accessible');text.textContent='此页显示失败，可重新生成纸面。';}}
  finally{if(renders.get(number)===job)renders.delete(number);}
 }
 function layout(keep){
  if(!pane||!doc||!base||!state)return;const available=Math.max(120,pane.clientWidth-40),height=Math.max(140,pane.clientHeight-34);
  const next=state.paperWidth==='actual'?96/72:state.paperWidth==='page'?Math.min(available/base.width,height/base.height):state.paperWidth==='custom'?(Number(state.paperZoom)||100)/100*96/72:Math.min(available,1100)/base.width;
  const changed=Math.abs(next-scale)>.003;scale=next;state.paperZoom=Math.round(scale/(96/72)*100);
  const zoom=dialog.querySelector('[data-paper-zoom]');if(zoom)zoom.textContent=state.paperZoom+'%';
  if(changed){cancelRenders();for(const item of pages.values()){item.done=false;item.node.removeAttribute('data-rendered');item.node.querySelector('.textLayer').replaceChildren();}}
  pane.style.setProperty('--scale-factor',String(scale));
  pane.style.setProperty('--pdf-width',base.width*scale+'px');pane.style.setProperty('--pdf-height',base.height*scale+'px');
  visibleObserver?.disconnect();visibleObserver=new IntersectionObserver(entries=>{for(const e of entries){const n=Number(e.target.dataset.pdfPage),item=pages.get(n);if(e.isIntersecting)paintPage(n);else if(item?.done&&!renders.has(n)){item.node.querySelector('canvas').width=1;item.node.querySelector('canvas').height=1;item.done=false;item.node.removeAttribute('data-rendered');}}},{root:pane,rootMargin:'400px 0px'});for(const item of pages.values())visibleObserver.observe(item.node);
  if(keep){if(keep.end)pane.scrollTop=pane.scrollHeight;else {const node=pages.get(keep.page)?.node;pane.scrollTop=node?node.offsetTop+(keep.ratio||0)*node.offsetHeight:keep.top||0;}pane.scrollLeft=keep.left||0;}
  position();paintPage(Number(pane.dataset.currentPage)||1);
 }
 async function generate(){
  if(busy||!wanted||!pane||!dialog.open)return;const request=wanted,version=epoch,keep=restore||snapshot();busy=true;
  try{
   const [blob,module]=await Promise.all([pdfBlob(request.report),pdfLibrary()]);if(version!==epoch||wanted?.key!==request.key||!pane?.isConnected)return;
   const data=await blob.arrayBuffer();if(version!==epoch||wanted?.key!==request.key)return;
   loadingTask=module.getDocument({data,isEvalSupported:false});const loading=loadingTask,next=await loading.promise;if(version!==epoch||wanted?.key!==request.key){await loading.destroy();return;}
   const latestKeep=restore?.reset?restore:doc?snapshot():keep;restore=null;
   cancelRenders();task?.destroy().catch(()=>{});task=loading;loadingTask=null;doc=next;base=(await doc.getPage(1)).getViewport({scale:1});if(version!==epoch||wanted?.key!==request.key)return;
   key=request.key;pages.clear();const paper=document.createElement('div');paper.className='pdf-pages';paper.dataset.pdfPages=String(doc.numPages);
   for(let n=1;n<=doc.numPages;n++){const node=document.createElement('section');node.className='pdf-page';node.dataset.pdfPage=String(n);node.setAttribute('aria-label','第 '+n+' 页');node.innerHTML='<canvas aria-hidden="true" width="1" height="1"></canvas><div class="textLayer"></div><span class="pdf-page-accessible sr-only">第 '+n+' 页</span>';paper.append(node);pages.set(n,{node,done:false});}
   pane.replaceChildren(paper);pane.pdfDocument=doc;pane.pdfBlob=blob;pane.dataset.pdfState='ready';pane.dataset.pdfRevision=String((Number(pane.dataset.pdfRevision)||0)+1);layout(latestKeep);message('');if(pendingChapter){const title=pendingChapter;pendingChapter='';locateChapter(title);}
  }catch(error){if(version===epoch&&wanted?.key===request.key){pane.dataset.pdfState='error';message('纸面暂未生成：'+error.message,true);}}
  finally{busy=false;if(wanted&&wanted.key!==key&&pane?.dataset.pdfState==='pending'&&dialog.open)timer=setTimeout(generate,0);}
 }
 function queue(){clearTimeout(timer);pane.dataset.pdfState='pending';message(doc?'内容已更新，正在重新分页…':'正在生成PDF纸面，首次会加载打印字体…');timer=setTimeout(generate,350);}
 function jump(n){if(!pane||!doc)return;n=Math.max(1,Math.min(doc.numPages,Math.round(Number(n)||1)));const node=pages.get(n)?.node;if(node){pane.scrollTop=node.offsetTop;paintPage(n);position();pane.focus({preventScroll:true});}}
 dialog.addEventListener('scroll',event=>{if(event.target===pane){cancelAnimationFrame(frame);frame=requestAnimationFrame(position);}},{capture:true,passive:true});
 dialog.addEventListener('keydown',event=>{if(event.target.matches('[data-report-page-target]')&&event.key==='Enter'){event.preventDefault();jump(event.target.value);}else if(event.target===pane&&event.key==='Home'){event.preventDefault();pane.scrollTop=0;position();}else if(event.target===pane&&event.key==='End'){event.preventDefault();pane.scrollTop=pane.scrollHeight;position();}});
 dialog.addEventListener('change',event=>{if(event.target.matches('[data-report-page-target]'))jump(event.target.value);});
 dialog.addEventListener('close',()=>{dispose();wanted=null;pane=null;resize.disconnect();});
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
   state=nextState;dialog.classList.toggle('is-reading',Boolean(state.reading));dialog.classList.toggle('is-configuring',Boolean(state.settingsOpen&&!state.reading));
   const next=dialog.querySelector('.report-paper-scroll');if(pane!==next){dispose();resize.disconnect();pane=next;if(pane){pane.replaceChildren();pane.scrollTop=0;resize.observe(pane);}}
   if(!pane){wanted=null;return;}
   const output=selectedReport(report),nextKey=pdfKey(output);wanted={report:output,key:nextKey};if(!output.sections.length&&!output.note?.trim()){dispose();wanted=null;pane.innerHTML='<div class="pdf-empty">勾选要导出的章节，开始纸面预览。</div>';pane.dataset.pdfState='empty';state.pdfPage=1;pane.dataset.currentPage='1';position();return;}
   if(nextKey!==key){restore=keep;queue();}else layout(keep);position();
  },
  open(){if(!pane?.pdfBlob||pane.dataset.pdfState!=='ready')return;const url=URL.createObjectURL(pane.pdfBlob);window.open(url,'_blank','noopener');setTimeout(()=>URL.revokeObjectURL(url),120000);},
  edge(value){if(!pane)return;pane.scrollTop=value==='end'?pane.scrollHeight:0;pane.focus({preventScroll:true});position();},
  step(value){jump((Number(pane?.dataset.currentPage)||1)+value);},
  zoom(value){if(!state||!pane)return;const keep=snapshot();state.paperWidth='custom';state.paperZoom=Math.max(25,Math.min(200,(state.paperZoom||100)+value));layout(keep);},
  retry(){if(wanted&&pane){key='';pane.dataset.pdfState='pending';message('正在重新生成纸面…');clearTimeout(timer);generate();}},
  chapter:locateChapter
 };
}
