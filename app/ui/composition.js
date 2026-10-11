import {button,esc} from './html.js?v=clarity-20261011e';

export function composeScene(html) {
  const template=document.createElement('template');template.innerHTML=html;
  const root=template.content,head=root.querySelector('.scene-head');if(!head)return html;
  const sections=[...root.querySelectorAll('.overview-hero,.source-section,.inquiry-section,.research-brief,.block,.follow-workbench,.directory-results,.record-accordion')].filter(node=>!node.parentElement?.closest('.block,.follow-workbench,.record-accordion'));
  const entries=sections.map((node,index)=>{
    const heading=node.querySelector('h2')||node.querySelector('summary span'),title=node.dataset.studyTitle||heading?.textContent;if(!title)return null;
    node.id||='study-section-'+index;node.dataset.studySection='true';
    return {id:node.id,title};
  }).filter(Boolean);
  if(entries.length<3)return html;
  const nav=document.createElement('nav');nav.className='study-outline';nav.setAttribute('aria-label','本页研究章节');nav.dataset.renderKey='study-outline';
  nav.innerHTML='<div class="outline-caption"><i aria-hidden="true"></i><span>本页研究</span></div><div class="outline-links">'+entries.map((entry,index)=>button('<span>'+String(index+1).padStart(2,'0')+'</span>'+esc(entry.title),'section-jump',{target:entry.id},'outline-link')).join('')+'</div>'+button('↑','section-top',{},'outline-top','aria-label="回到页首"')+'<i class="outline-progress" aria-hidden="true"></i>';
  head.after(nav);return template.innerHTML;
}
