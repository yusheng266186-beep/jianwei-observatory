// A bounded reader owns its scrolling. No sticky layer covers the last record.
export function installReportReading(dialog) {
 let pane=null,paper=null,frame=0;
 const observer=new ResizeObserver(()=>schedule());
 const position=()=>{
  if(!pane)return;
  const maximum=Math.max(0,pane.scrollHeight-pane.clientHeight),end=maximum-pane.scrollTop<=3,start=pane.scrollTop<=3;
  const label=dialog.querySelector('.report-paper-position'),text=!maximum?'完整内容已显示':end?'已到报告末尾':start?'报告开头':'已读 '+Math.round(pane.scrollTop/maximum*100)+'%';
  if(label&&label.textContent!==text)label.textContent=text;
  for(const button of dialog.querySelectorAll('[data-cmd="report-paper-edge"]'))button.disabled=button.dataset.value==='start'?start:end;
 };
 const schedule=()=>{if(!frame)frame=requestAnimationFrame(()=>{frame=0;position();});};
 dialog.addEventListener('scroll',event=>{if(event.target===pane)schedule();},{capture:true,passive:true});
 return {
  snapshot(){return pane?{top:pane.scrollTop,left:pane.scrollLeft,end:pane.scrollHeight>pane.clientHeight+3&&pane.scrollHeight-pane.clientHeight-pane.scrollTop<=3}:null;},
  sync(state,snapshot){
   dialog.classList.toggle('is-reading',Boolean(state.reading&&state.preview==='paper'));
   const next=dialog.querySelector('.report-paper-scroll'),nextPaper=next?.querySelector('.print-paper');
   if(pane!==next||paper!==nextPaper){observer.disconnect();pane=next;paper=nextPaper;if(pane)observer.observe(pane);if(paper)observer.observe(paper);}
   if(pane&&snapshot){pane.scrollTop=snapshot.end?pane.scrollHeight:snapshot.top;pane.scrollLeft=snapshot.left;}
   position();schedule();
  },
  edge(value){
   if(!pane)return;
   // Immediate positioning works equally for mouse, keyboard and touch users.
   pane.scrollTop=value==='end'?pane.scrollHeight:0;
   pane.focus({preventScroll:true});position();
  }
 };
}
