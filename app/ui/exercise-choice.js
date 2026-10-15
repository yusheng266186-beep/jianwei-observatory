import {esc} from './html.js';
import {openSurface,closeSurface} from './surface-motion.js';

// The same glass and interruptible motion as the teacher's date/time controls.
export function exerciseChoice(id,label,value,options){
 const selected=options.find(o=>o.value===value)||options[0];
 return `<div class="field exercise-choice" data-render-key="choice-${id}"><span id="exercise-${id}-label">${esc(label)}</span><button type="button" class="exercise-choice-trigger" data-exercise-choice="${id}" role="combobox" aria-haspopup="listbox" aria-expanded="false" aria-labelledby="exercise-${id}-label exercise-${id}-value" aria-controls="exercise-${id}-options"><span id="exercise-${id}-value">${esc(selected?.label||'请选择')}</span><svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="m4 6 4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg></button><div id="exercise-${id}-options" class="exercise-choice-panel" popover="manual" role="listbox" aria-labelledby="exercise-${id}-label">${options.map(o=>`<button type="button" role="option" tabindex="-1" aria-selected="${o.value===value}" data-exercise-option="${esc(o.value)}"><span>${esc(o.label)}</span><i aria-hidden="true">${o.value===value?'✓':''}</i></button>`).join('')}</div></div>`;
}

export function installExerciseChoices(root,onChange){
 let active=null,frame=0;
 const opened=p=>p.matches(':popover-open')||p.classList.contains('choice-fallback-open');
 function position(){
  if(!active)return;const {trigger,panel}=active;if(!trigger.isConnected)return void close(false,true);
  const r=trigger.getBoundingClientRect(),v=window.visualViewport,left=v?.offsetLeft||0,top=v?.offsetTop||0,width=v?.width||innerWidth,height=v?.height||innerHeight;
  const w=Math.min(Math.max(r.width,230),width-24),below=top+height-r.bottom-12,above=r.top-top-12,down=below>=Math.min(230,above),space=Math.max(80,down?below:above);
  panel.style.width=w+'px';panel.style.maxHeight=Math.min(330,space)+'px';panel.style.left=Math.max(left+12,Math.min(r.left,left+width-w-12))+'px';panel.style.top=(down?r.bottom+6:Math.max(top+12,r.top-panel.offsetHeight-6))+'px';
 }
 const schedule=()=>{if(active&&!frame)frame=requestAnimationFrame(()=>{frame=0;position();});};
 function close(focus=false,immediate=false){
  const old=active;if(!old)return Promise.resolve();active=null;old.trigger.setAttribute('aria-expanded','false');
  const hide=()=>{if(old.panel.matches(':popover-open'))old.panel.hidePopover();old.panel.classList.remove('choice-fallback-open');};
  const done=immediate?(hide(),Promise.resolve()):closeSurface(old.panel,{hide,isOpen:()=>opened(old.panel)});
  if(focus&&old.trigger.isConnected)old.trigger.focus({preventScroll:true});return done;
 }
 function open(trigger,last=false){
  if(active?.trigger===trigger){close(true);return;}close(false,true);
  const panel=root.querySelector('#'+trigger.getAttribute('aria-controls'));if(!panel)return;
  active={trigger,panel};trigger.setAttribute('aria-expanded','true');
  openSurface(panel,{show:()=>{try{panel.showPopover();}catch{panel.classList.add('choice-fallback-open');}},isOpen:()=>opened(panel)});position();
  const options=[...panel.querySelectorAll('[role=option]')],selected=panel.querySelector('[aria-selected=true]');(last?options.at(-1):selected||options[0])?.focus({preventScroll:true});selected?.scrollIntoView({block:'nearest'});
 }
 root.addEventListener('click',async event=>{
  const opener=event.target.closest('[data-exercise-choice]');if(opener){open(opener);return;}
  const option=event.target.closest('[data-exercise-option]');if(!option||!active?.panel.contains(option))return;
  const {trigger,panel}=active,value=option.dataset.exerciseOption;for(const item of panel.querySelectorAll('[role=option]')){item.setAttribute('aria-selected',String(item===option));item.querySelector('i').textContent=item===option?'✓':'';}
  // Commit before the exit finishes: a quick reopen or subject switch cannot
  // receive a delayed change from the previous menu.
  const leaving=close(true);await onChange(trigger.dataset.exerciseChoice,value);await leaving;
 });
 root.addEventListener('keydown',event=>{
  const trigger=event.target.closest('[data-exercise-choice]');
  if(trigger&&['ArrowDown','ArrowUp','Home','End'].includes(event.key)){event.preventDefault();open(trigger,event.key==='End'||event.key==='ArrowUp');return;}
  if(!active)return;
  if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();close(true);return;}
  if(event.key==='Tab'){close(true);return;}
  if(!active.panel.contains(event.target))return;
  const options=[...active.panel.querySelectorAll('[role=option]')],at=options.indexOf(event.target),next=event.key==='Home'?0:event.key==='End'?options.length-1:event.key==='ArrowDown'?(at+1)%options.length:event.key==='ArrowUp'?(at+options.length-1)%options.length:-1;
  if(next>=0){event.preventDefault();options[next]?.focus();}
 },true);
 document.addEventListener('pointerdown',event=>{if(active&&!active.panel.contains(event.target)&&!active.trigger.contains(event.target))close();},true);
 root.closest('dialog')?.addEventListener('surfaceclosing',()=>close(false,true));
 window.addEventListener('resize',schedule,{passive:true});window.visualViewport?.addEventListener('resize',schedule,{passive:true});window.visualViewport?.addEventListener('scroll',schedule,{passive:true});document.addEventListener('scroll',schedule,{passive:true,capture:true});
 return {close};
}
