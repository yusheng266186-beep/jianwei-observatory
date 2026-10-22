import {installCommittedInput} from './committed-input.js';
import {practiceFeedbackSummary} from '../engine/exercise-feedback.js';
import {exerciseSyncMessage} from '../engine/exercise-sync.js';
import {exerciseIdentity} from '../engine/exercise-identity.js';
import {exerciseSelection,exerciseRemovalPlan} from '../engine/exercise-collection.js';
import {esc,button} from './html.js';
import {renderInto} from './render.js';
import {enhance} from './interactions.js';
import {exerciseChoice,installExerciseChoices} from './exercise-choice.js';
import {jobState,jobStateLabel,jobTiming,jobConnection,filterExerciseJobs} from '../engine/exercise-jobs.js';
const states=[['all','全部'],['pending','进行中'],['ready','待审题'],['done','已生成'],['reviewed','已审题'],['failed','未完成'],['prepared','待提交']];
const text=(node,value)=>{if(node&&node.textContent!==value)node.textContent=value;};
const control=(label,action,kind='outline',extra='')=>'<button type="button" class="button '+kind+'" data-center-action="'+action+'" '+extra+'>'+esc(label)+'</button>';
export function createExerciseCenter({records,getAtlas,authed,onOpen,onNew,onRefresh,onLogin,onDelete,onClearCache,onUndo,onSubmit,canUndo=()=>false}){
 let host=null,limit=24,message='',authState=null,bulk=false,selected=new Set(),confirmation=null,busy=false,choices=null,listeners=null,searchTimer=null;
 const filters={status:'all',query:'',subject:'all',classNo:'all',sort:'priority'};
 const identity=record=>exerciseIdentity(getAtlas(),record);
 function view(){
  const list=records(),people=new Map(list.map(r=>[r,identity(r)])),identify=r=>people.get(r),matched=filterExerciseJobs(list,{...filters,identify}),shown=matched.slice(0,limit);
  selected=new Set(exerciseSelection(matched,selected).map(r=>r.id));
  return {list,identify,matched,shown};
 }
 function times(){
  if(!host?.isConnected)return;const undo=host.querySelector('[data-center-undo]');if(undo)undo.hidden=!canUndo();const list=records(),byId=new Map(list.map(r=>[r.id,r]));
  for(const node of host.querySelectorAll('[data-center-state]')){const r=byId.get(node.dataset.centerState);if(r)text(node,jobStateLabel(r));}
  for(const node of host.querySelectorAll('[data-center-time]')){const r=byId.get(node.dataset.centerTime);if(r)text(node,jobTiming(r,list).label);}
  for(const node of host.querySelectorAll('[data-center-connection]')){const r=byId.get(node.dataset.centerConnection);if(r)text(node,jobConnection(r,navigator.onLine!==false));}
 }
 function tools({list,identify,matched,shown}){
  const classes=[...new Set(list.map(r=>identify(r).classNo).filter(v=>v!=null).map(String))].sort((a,b)=>Number(a)-Number(b)),subjects=[...new Set(list.map(r=>r.request?.subject).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'zh-CN'));
  if(filters.classNo!=='all'&&!classes.includes(filters.classNo))classes.push(filters.classNo);if(filters.subject!=='all'&&!subjects.includes(filters.subject))subjects.push(filters.subject);
  renderInto(host.querySelector('[data-center-scopes]'),exerciseChoice('center-class','班级',filters.classNo,[{value:'all',label:'全部班级'},...classes.map(v=>({value:v,label:v+'班'}))])+exerciseChoice('center-subject','学科',filters.subject,[{value:'all',label:'全部学科'},...subjects.map(v=>({value:v,label:v}))])+exerciseChoice('center-sort','排列方式',filters.sort,[{value:'priority',label:'进行中优先'},{value:'newest',label:'最近创建'},{value:'oldest',label:'较早创建'},{value:'name',label:'学生姓名'}]));
  const failed=matched.filter(r=>jobState(r)==='failed'),prepared=matched.filter(r=>jobState(r)==='prepared'),clear=host.querySelector('[data-center-action=clear-failed]'),submit=host.querySelector('[data-center-action=submit-queue]');
  text(clear,'清理筛选内未完成（'+failed.length+'）');clear.disabled=!failed.length||busy;text(submit,'提交筛选内队列（'+prepared.length+'）');submit.hidden=!prepared.length;
  text(host.querySelector('[data-center-scope-caption]'),[(filters.classNo==='all'?'全部班级':filters.classNo+'班'),filters.subject==='all'?'全部学科':filters.subject,filters.sort==='priority'?'':({newest:'最近创建',oldest:'较早创建',name:'学生姓名'}[filters.sort]||'')].filter(Boolean).join(' · '));
  const filtered=filters.status!=='all'||filters.query.trim()||filters.subject!=='all'||filters.classNo!=='all';host.querySelector('[data-center-action=reset]').hidden=!filtered&&filters.sort==='priority';
  text(host.querySelector('[data-center-range]'),'已显示'+shown.length+' / '+matched.length+'份 · 共'+list.length+'份练习');host.querySelector('[data-center-action=more]').hidden=shown.length>=matched.length;
  const manage=host.querySelector('[data-center-action=bulk]');text(manage,bulk?'结束整理':'批量整理');manage.setAttribute('aria-pressed',String(bulk));manage.disabled=!list.length&&!bulk;
  const toolbar=host.querySelector('[data-center-selection]');toolbar.hidden=!bulk;
  renderInto(toolbar,'<label><input type="checkbox" data-center-select-shown '+(shown.length&&shown.every(r=>selected.has(r.id))?'checked':'')+' '+(!shown.length||busy?'disabled':'')+'><span>选择当前显示的'+shown.length+'份</span></label><span data-center-selected-count>已选'+selected.size+'份</span><div>'+control('删除所选','delete-selected','outline',!selected.size||busy?'disabled':'')+control('取消选择','unselect','quiet',!selected.size||busy?'disabled':'')+'</div><small>选择仅保留当前筛选内的练习。</small>');
  const checkbox=toolbar.querySelector('[data-center-select-shown]');checkbox.indeterminate=shown.some(r=>selected.has(r.id))&&!shown.every(r=>selected.has(r.id));
 }
 function confirmationHTML(list){
  if(!confirmation)return '';const plan=exerciseRemovalPlan(list,confirmation.ids,{failedOnly:confirmation.failedOnly}),names=exerciseSelection(list,plan.ids).slice(0,3).map(r=>identity(r).name+' · '+(r.request?.subject||'专项练习'));
  return '<section class="exercise-center-confirm" aria-label="确认整理任务"><div><b>'+(plan.count?'将删除'+plan.count+'份练习':'所选任务已更新，无需继续清理')+'</b><p>'+esc(names.join('；'))+(plan.count>3?'等':'')+'</p>'+(plan.pending?'<p>其中'+plan.pending+'份正在生成，确认后将移除对应任务。</p>':'')+(plan.reviewed?'<p>其中'+plan.reviewed+'份已经审题。</p>':'')+'<small>同时清理对应导出缓存，12秒内可撤销。原始成绩材料保留。</small></div><div>'+control('取消','cancel-removal','quiet')+control('确认删除'+plan.count+'份','confirm-removal','outline',!plan.count||busy?'disabled':'')+'</div></section>';
 }
 function card(r,list,identify=identity){
  const p=identify(r),state=jobState(r),pending=state==='pending';
  return '<article class="exercise-task-card '+(selected.has(r.id)?'is-selected':'')+'" data-render-key="task-'+esc(r.id)+'" data-center-card="'+esc(r.id)+'">'+(bulk?'<label class="exercise-task-select"><input type="checkbox" data-center-select="'+esc(r.id)+'" aria-label="选择'+esc(p.name)+'的'+esc(r.request?.subject||'专项')+'练习" '+(selected.has(r.id)?'checked':'')+' '+(busy?'disabled':'')+'><span>选择此练习</span></label>':'')+'<header><div><span class="overline">'+esc(r.request?.subject||'专项练习')+(p.classNo?' · '+esc(p.classNo)+'班':'')+(r.localCopyOf?' · 修改副本':'')+'</span><h3>'+esc(p.name)+'</h3><p>'+esc(p.exam)+'</p></div><span class="exercise-task-state is-'+state+'" data-center-state="'+esc(r.id)+'">'+esc(jobStateLabel(r))+'</span></header><h4>'+esc(r.sheet?.title||r.request?.focus||'专项练习')+'</h4><p class="exercise-task-meta">'+esc(r.request?.difficulty||'')+' · '+esc(r.request?.count||r.sheet?.questions?.length||'')+'题 / '+esc(r.request?.minutes||'')+'分钟</p>'+(pending?'<div class="exercise-task-progress"><span data-center-time="'+esc(r.id)+'">'+esc(jobTiming(r,list).label)+'</span><small data-center-connection="'+esc(r.id)+'">'+esc(jobConnection(r,navigator.onLine!==false))+'</small></div>':state==='prepared'?'<p class="report-help">'+esc(r.queueFailure||'设置与个人依据已保存，提交后开始云端生成。')+'</p>':state==='failed'?'<p class="exercise-task-failure">'+esc(r.failure||'本次练习未完成，可调整目标后另行安排。')+'</p>':'<p class="report-help">'+(r.reviewedAt?'已审定，可查看并导出PDF或Word。':'题目已保存在本机，核对后可导出与安排跟进。')+'</p>')+(r.practiceFeedback?'<p class="exercise-feedback-summary">'+esc(practiceFeedbackSummary(r))+'</p>':'')+'<footer><time>'+esc(new Date(r.createdAt).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',year:'numeric',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}))+'</time><button type="button" class="button '+(pending?'outline':'accent')+'" data-center-action="'+(state==='prepared'?'submit':'open')+'" data-center-id="'+esc(r.id)+'">'+(state==='prepared'?'提交这份练习':pending?'查看进度':state==='failed'?'查看任务':'查看试题与导出')+' ↗</button><button type="button" class="button quiet exercise-task-delete" data-center-action="delete" data-center-id="'+esc(r.id)+'" aria-label="删除'+esc(p.name)+'的'+esc(r.request?.subject||'专项')+'练习任务">删除</button></footer></article>';
 }
 function render(){
  if(!host?.isConnected||!host.querySelector('[data-center-results]'))return;
  const v=view(),counts={all:v.list.length,pending:0,done:0,ready:0,reviewed:0,failed:0,prepared:0};
  for(const r of v.list){const state=jobState(r);counts[state==='ready'?'ready':state]++;if(['ready','reviewed'].includes(state))counts.done++;}
  for(const [key,count] of Object.entries(counts))text(host.querySelector('[data-center-count="'+key+'"]'),String(count));
  for(const b of host.querySelectorAll('[data-center-filter]')){const chosen=b.dataset.centerFilter===filters.status;b.classList.toggle('selected',chosen);b.setAttribute('aria-pressed',String(chosen));}
  const signed=!!authed();if(authState!==signed){authState=signed;host.querySelector('[data-center-auth]').innerHTML=signed?'<span class="exercise-center-auth-state">教师访问已验证</span>':'<label class="field"><span>动态验证码</span><input data-center-code inputmode="numeric" maxlength="6" autocomplete="one-time-code" placeholder="认证器中的6位数字"></label>'+control('验证并同步任务','login');}
  tools(v);const notice=host.querySelector('[data-center-message]');notice.hidden=!message;text(notice,message);renderInto(host.querySelector('[data-center-confirmation]'),confirmationHTML(v.list));
  renderInto(host.querySelector('[data-center-results]'),v.shown.map(r=>card(r,v.list,v.identify)).join('')||'<div class="exercise-center-empty"><h3>'+(v.list.length?'没有匹配的试题':'还没有生成的试题')+'</h3><p>'+(v.list.length?'可清除筛选，或调整班级、学科与关键词。':'从教学跟进选择学生，或在这里新建一份专项练习。')+'</p>'+(v.list.length?control('清除筛选','reset'):button('生成新练习','exercise-hub',{},'accent'))+'</div>');
  for(const b of host.querySelectorAll('[data-center-action],[data-center-filter],[data-exercise-choice]'))b.disabled=busy||(['clear-failed','bulk','delete-selected','unselect','confirm-removal'].includes(b.dataset.centerAction)&&b.disabled);
  host.querySelector('[data-center-search]').readOnly=busy;enhance(host,{reveal:false});times();
 }
 function changeFilters(){clearTimeout(searchTimer);searchTimer=null;limit=24;confirmation=null;message='';render();}
 function reveal(node,focus=false){if(!node)return;if(focus){node.tabIndex=-1;node.focus({preventScroll:true});}node.scrollIntoView({block:'nearest',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});}
 function install(root){
  listeners=new AbortController();const signal=listeners.signal,smallScreen=matchMedia('(max-width:600px)');
  smallScreen.addEventListener('change',()=>{if(root!==host)return;const scope=root.querySelector('[data-center-scope-tools]');if(scope)scope.open=!smallScreen.matches;choices?.close(false,true);},{signal});
  choices=installExerciseChoices(root,(id,value)=>{if(root!==host||busy)return;if(id==='center-class')filters.classNo=value;else if(id==='center-subject')filters.subject=value;else if(id==='center-sort')filters.sort=value;changeFilters();});
  installCommittedInput(root,e=>{if(root===host&&!busy){filters.query=e.target.value;clearTimeout(searchTimer);searchTimer=setTimeout(()=>{if(root===host)changeFilters();},90);}},{signal,matches:'[data-center-search]',onCompositionStart:()=>clearTimeout(searchTimer)});
  root.addEventListener('change',e=>{if(root!==host||busy)return;if(e.target.matches('[data-center-select]')){e.target.checked?selected.add(e.target.dataset.centerSelect):selected.delete(e.target.dataset.centerSelect);confirmation=null;render();}if(e.target.matches('[data-center-select-shown]')){for(const r of view().shown)e.target.checked?selected.add(r.id):selected.delete(r.id);confirmation=null;render();}},{signal});
  root.addEventListener('click',async e=>{
   const b=e.target.closest('[data-center-action],[data-center-filter]');if(!b||b.disabled||root!==host||busy)return;
   if(b.dataset.centerFilter){filters.status=b.dataset.centerFilter;changeFilters();return;}
   const action=b.dataset.centerAction;message='';let nextFocus=null,announce=false;
   if(action==='reset'){Object.assign(filters,{status:'all',query:'',subject:'all',classNo:'all',sort:'priority'});root.querySelector('[data-center-search]').value='';changeFilters();return;}
   if(action==='bulk'){bulk=!bulk;selected.clear();confirmation=null;render();return;}
   if(action==='unselect'){selected.clear();confirmation=null;render();return;}
   if(action==='delete'||action==='clear-failed'||action==='delete-selected'){
    const v=view(),ids=action==='delete'?[b.dataset.centerId]:action==='clear-failed'?v.matched.filter(r=>jobState(r)==='failed').map(r=>r.id):[...selected];confirmation={ids,failedOnly:action==='clear-failed',origin:b};render();reveal(root.querySelector('[data-center-confirmation]'),true);return;
   }
   if(action==='cancel-removal'){nextFocus=confirmation?.origin;confirmation=null;render();if(nextFocus?.isConnected)nextFocus.focus({preventScroll:true});return;}
   if(action==='more'){const next=view().matched[limit];limit+=24;render();if(next){const card=[...root.querySelectorAll('[data-center-card]')].find(n=>n.dataset.centerCard===next.id);reveal(card?.querySelector('h3'),true);}return;}
   try{
    if(action==='confirm-removal'){
     if(!confirmation)return;const plan=exerciseRemovalPlan(records(),confirmation.ids,{failedOnly:confirmation.failedOnly});confirmation=null;
     if(!plan.count){message='任务状态已更新，没有需要删除的练习。';render();return;}
     busy=true;render();await onDelete(plan.ids);selected.clear();message='已删除'+plan.count+'份练习，导出缓存已清理；12秒内可撤销。';announce=true;
    }else{
     busy=true;render();
     if(action==='submit'||action==='submit-queue'){const ids=action==='submit'?[b.dataset.centerId]:view().matched.filter(r=>jobState(r)==='prepared').map(r=>r.id),count=await onSubmit(ids);message='本次确认提交'+(count||0)+'份；其余待提交设置保留，可查看卡片中的原因。';announce=true;}
     if(action==='undo'){const restored=await onUndo();message=restored?'已恢复刚才删除的任务。':'本轮删除的撤销时间已结束。';announce=true;}
     if(action==='clear-cache'){await onClearCache();message='全部导出缓存已清理，试题内容仍保留。';announce=true;}
     if(action==='open')await onOpen(b.dataset.centerId);
     if(action==='new')await onNew();
     if(action==='refresh'){text(b,'正在同步…');await onRefresh();message=exerciseSyncMessage(records(),{online:navigator.onLine!==false,authenticated:!!authed()});announce=true;}
     if(action==='login'){await onLogin(root.querySelector('[data-center-code]').value);message='教师访问已验证，任务状态已更新。';announce=true;}
    }
   }catch(error){message=error.message;announce=true;}finally{busy=false;render();if(host===root){if(action==='refresh')text(root.querySelector('[data-center-action=refresh]'),'同步状态');if(announce)reveal(root.querySelector('[data-center-message]'),true);}}
  },{signal});
 }
 return {mount(root){
  if(host===root&&root.querySelector('[data-center-results]')){render();return;}
  clearTimeout(searchTimer);searchTimer=null;if(host!==root){choices?.destroy();listeners?.abort();listeners=null;}else choices?.close(false,true);host=root;authState=null;confirmation=null;
  host.innerHTML='<header class="exercise-center-heading"><div><span class="overline">练习与任务</span><h2>试题中心</h2><p>找到要审阅的练习，也能按班级、学科整理任务。</p></div><div>'+control('同步状态','refresh')+control('生成新练习','new','accent')+'</div></header><div class="exercise-center-summary" aria-label="全部任务概况">'+[['all','全部练习'],['pending','进行中'],['ready','待审题'],['done','已生成'],['failed','未完成'],['prepared','待提交']].map(([id,label])=>'<div><span>'+label+'</span><strong data-center-count="'+id+'">0</strong></div>').join('')+'</div><div class="exercise-center-tools"><label class="field"><span>搜索试题</span><input data-center-search placeholder="姓名、学科、知识点；多个关键词用空格分开" value="'+esc(filters.query)+'"></label><details class="exercise-center-scope-tools" data-center-scope-tools '+(matchMedia('(max-width:600px)').matches?'':'open')+'><summary><b>范围与排列</b><span data-center-scope-caption></span></summary><div class="exercise-center-scopes" data-center-scopes></div></details><div class="chips" role="group" aria-label="试题任务状态">'+states.map(([id,label])=>'<button type="button" class="button chip" data-center-filter="'+id+'">'+label+'</button>').join('')+'</div></div><div class="exercise-center-listbar"><span data-center-range role="status" aria-live="polite"></span><div>'+control('清除筛选','reset','quiet','hidden')+control('批量整理','bulk','quiet','aria-pressed="false"')+'<details class="exercise-center-maintenance"><summary>整理与维护</summary><div><p>批量任务操作遵循当前筛选范围。</p>'+control('提交筛选内队列','submit-queue','outline','hidden')+control('清理筛选内未完成','clear-failed','quiet')+control('清理全部导出缓存','clear-cache','quiet')+'<small>导出缓存可重新生成，不影响试题原文。</small></div></details></div></div><div class="exercise-center-auth" data-center-auth></div><p class="exercise-center-message" role="status" data-center-message hidden></p><button type="button" class="button quiet exercise-center-undo" data-center-action="undo" data-center-undo hidden>撤销本轮删除</button><div class="exercise-center-selection" data-center-selection hidden></div><div data-center-confirmation></div><div class="exercise-task-grid" data-center-results></div><div class="exercise-center-pagination">'+control('再显示24份练习 ↓','more','outline','hidden')+'</div><p class="report-help">预计时间仅供安排使用；任务状态以后台回传为准。已确认提交的任务在云端独立生成，本机保留的练习可随时审阅和导出。</p>';
  if(!listeners)install(host);render();
 },render,times};
}
