import {button,esc} from './html.js?v=surface-20261011j';

export function composeScene(html,{back=''}={}) {
  const template=document.createElement('template');template.innerHTML=html;
  const root=template.content,head=root.querySelector('.scene-head');if(!head)return html;
  const actions=head.querySelector('.head-actions');if(actions)actions.insertAdjacentHTML('beforeend',button('☆','research-pin',{},'study-save','aria-label="把当前范围与阅读位置留在研究夹" title="留在研究夹"'));
  if(back){const trail=document.createElement('div');trail.className='study-return';trail.dataset.renderKey='study-return';trail.innerHTML=button('<span aria-hidden="true">←</span><span>返回 '+esc(back)+'</span>','research-back',{},'study-return-button')+'<span>接着刚才的研究</span>';head.before(trail);}
  const sections=[...root.querySelectorAll('.overview-hero,.source-section,.inquiry-section,.research-brief,.block,.follow-workbench,.directory-results,.record-accordion')].filter(node=>!node.parentElement?.closest('.block,.follow-workbench,.record-accordion'));
  const entries=sections.map((node,index)=>{
    const heading=node.querySelector('h2')||node.querySelector('summary span'),title=node.dataset.studyTitle||heading?.textContent;if(!title)return null;
    node.id||='study-section-'+index;node.dataset.studySection='true';
    return {id:node.id,title};
  }).filter(Boolean);
  if(entries.length<3)return template.innerHTML;
  const nav=document.createElement('nav');nav.className='study-outline';nav.setAttribute('aria-label','本页研究章节');nav.dataset.renderKey='study-outline';
  nav.innerHTML='<div class="outline-caption"><i aria-hidden="true"></i><span>本页研究</span></div><div class="outline-links">'+entries.map((entry,index)=>button('<span>'+String(index+1).padStart(2,'0')+'</span>'+esc(entry.title),'section-jump',{target:entry.id},'outline-link')).join('')+'</div>'+button('↑','section-top',{},'outline-top','aria-label="回到页首"')+'<i class="outline-progress" aria-hidden="true"></i>';
  head.after(nav);return template.innerHTML;
}
