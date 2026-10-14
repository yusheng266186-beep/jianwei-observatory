import {button,esc} from './html.js?v=runtime-v34';

export function composeScene(html,{back=''}={}) {
  const template=document.createElement('template');template.innerHTML=html;
  const root=template.content,head=root.querySelector('.scene-head');if(!head)return html;
  const actions=head.querySelector('.head-actions');if(actions)actions.insertAdjacentHTML('beforeend',button('☆','research-pin',{},'study-save','aria-label="把当前范围与阅读位置留在研究夹" title="留在研究夹"'));
  const icons={capture:'M8 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3 M9 15l1-4 9-9 3 3-9 9-4 1Z',export:'M12 3v12m-5-5 5 5 5-5M4 16v4h16v-4',import:'M12 4v16M4 12h16','research-pin':'m12 3 2.8 5.7 6.3.9-4.6 4.5 1.1 6.3-5.6-3-5.6 3 1.1-6.3L2.9 9.6l6.3-.9L12 3Z','person-back':'M20 12H4m7-7-7 7 7 7','paper-back':'M20 12H4m7-7-7 7 7 7'};
  for(const control of actions?.querySelectorAll('button')||[]){const path=icons[control.dataset.cmd];if(!path)continue;const label=control.textContent.trim().replace(/^←\s*/,'');control.classList.add('head-action');control.setAttribute('aria-label',control.getAttribute('aria-label')||label);control.setAttribute('title',control.getAttribute('title')||label);control.innerHTML='<svg class="head-action-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="'+path+'"/></svg><span class="head-action-label">'+esc(label)+'</span>';}
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
  const overview=root.querySelector('.overview-hero'),metrics=root.querySelector('.number-ribbon');
  (overview||metrics||head).after(nav);return template.innerHTML;
}
