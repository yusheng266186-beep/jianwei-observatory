import {questionView,questionEvidence} from './ui/question.js?v=surface-20261011j';
import {subjectView,knowledgeView,lensEvidence} from './ui/lenses.js?v=surface-20261011j';
import {subjectLens,skillLens,questionLens} from './engine/lenses.js?v=surface-20261011j';
import {directoryFilterView} from './scenes/directory.js?v=surface-20261011j';
import {renderInto} from './ui/render.js?v=surface-20261011j';
import {installInteractions,enhance,prepareUpdate,shiftTable} from './ui/interactions.js?v=surface-20261011j';
import {readingDefaults,readingView,applyReading} from './ui/reading.js?v=surface-20261011j';
import {reportView} from './ui/report.js?v=surface-20261011j';
import {welcomeView} from './ui/welcome.js?v=surface-20261011j';
import {composeScene} from './ui/composition.js?v=surface-20261011j';
import {researchView,studyDescription,studyAvailable,studyKey} from './ui/research.js?v=surface-20261011j';
import {Atlas} from './engine/atlas.js?v=surface-20261011j';
import {normalizeDataset,SUBJECTS} from './data/compat.js?v=surface-20261011j';
import {hydrate,save,restoreDataset,hasMaterials,preference,remember,preserveUndo,previous,emptyDataset,loadNotebook,saveNotebook} from './data/workspace.js?v=surface-20261011j';
import {mergeDatasets} from './data/parser.js?v=surface-20261011j';
import {Inbox} from './data/inbox.js?v=surface-20261011j';
import {esc,button,empty,table} from './ui/html.js?v=surface-20261011j';
import {excel,word,print,download,chart,scoreRows,effectiveRows,subjectRows,answerRows,evidence} from './io/exports.js?v=surface-20261011j';
import {directoryDefaults,lensValues,queryDirectory,directoryViewValues,directoryViewName} from './engine/directory.js?v=surface-20261011j';
import {peekView,compareView,drawerEvidence} from './ui/explorer.js?v=surface-20261011j';
import {dockIcon} from './ui/icons.js?v=surface-20261011j';

const routes=[['board','年级总览','▦'],['class','班级研究','▥'],['papers','试卷研究','▧'],['people','学生研究','◎'],['follow','教学跟进','↗'],['library','资料与报告','⊞']];
const defaults={board:{mode:'overview',metric:'underRate',historyMetric:'mean',search:'',page:1},class:{tab:'snapshot',value:'score',trendMetric:'mean',matrix:'total',search:'',page:1,matched:false},papers:{key:'',tab:'map',classes:[],question:0,order:'paper',search:'',page:1},people:{sid:'',storyMetric:'total',...directoryDefaults,filtersOpen:innerWidth>760},follow:{tier:'under',band:20,side:'below',classes:[],search:'',page:1},library:{tab:'materials'}};
const saved=preference('books',{}),books=Object.fromEntries(Object.entries(defaults).map(([key,value])=>[key,{...value,...saved[key]}]));
const session={plans:preference('plans',[]),recent:preference('recent',[]),savedPeople:preference('savedPeople',[]),comparePeople:preference('comparePeople',[]),directoryViews:preference('directoryViews',[]),notebook:[]};
const savedResearch=preference('research',{}),research={saved:Array.isArray(savedResearch.saved)?savedResearch.saved:[],recent:Array.isArray(savedResearch.recent)?savedResearch.recent.slice(0,24):[]},researchScope={tab:'saved',search:'',rename:''};
const reading={...readingDefaults,...preference('reading',{})};applyReading(reading);
if(preference('interfaceRevision','')!=='study-20261011b'){books.board.mode='overview';books.people.lens='all';books.people.view='cards';books.people.filtersOpen=true;remember('interfaceRevision','study-20261011b');}
let atlas=new Atlas(emptyDataset()),current='board',activeReport=null,exportReport=null,reportScope={section:0,page:1,search:''},revision=0,paintId=0,searchTimer,drawerTimer,reportTimer,noteTimer,inbox;
let drawerState=null,drawerClosing=null,drawerOpener=null,drawerTrail=[],paintedObject='',paintedScrolls=new Map(),pagePositions=new Map(),scrollResets=new Set(),sceneTransition=null,pendingUndo=null;
let paintedStudy=null,researchTrail=[],researchTimer,researchSearchTimer,closedStudy=null,reportOrigin=null,reportNoteState='preview',reportNoteRevision=0,modalOrder=[];
const reducedMotion=()=>reading.motion==='calm'||matchMedia('(prefers-reduced-motion: reduce)').matches;
const loaded=new Map();
const num=value=>value===null||String(value).trim()===''?null:Number.isFinite(Number(value))?Number(value):null;
const converted=value=>value==='true'?true:value==='false'?false:value;
const stage=()=>document.getElementById('stage');
function placeNotification() {
  const toast=document.getElementById('toast'),focused=document.activeElement?.closest('dialog[open]');
  modalOrder=modalOrder.filter(dialog=>dialog.open);
  const host=focused||modalOrder.at(-1)||document.body;if(toast.parentElement===host)return;
  const shown=Boolean(toast.showPopover)&&toast.matches(':popover-open');if(shown)toast.hidePopover();
  host.append(toast);if(shown)toast.showPopover();
}
function notify(message,action={}) {
  placeNotification();
  const toast=document.getElementById('toast');pendingUndo=action.undo||null;
  toast.innerHTML='<span>'+esc(message)+'</span>'+((action.undo||action.cmd)?button(esc(action.label||'撤销'),action.undo?'undo-action':action.cmd,{},'toast-action'):'')+button('×','toast-close',{},'toast-dismiss','aria-label="关闭提示"');
  if(toast.showPopover){if(toast.matches(':popover-open'))toast.hidePopover();toast.showPopover();}
  toast.classList.add('visible');clearTimeout(notify.timer);notify.timer=setTimeout(()=>{toast.classList.remove('visible');if(toast.hidePopover&&toast.matches(':popover-open'))toast.hidePopover();pendingUndo=null;},action.undo||action.cmd?9000:4500);
}
const tablePositionKey=el=>paintedObject+'|'+(el.closest('.block')?.querySelector('h2')?.textContent||'')+'|'+(el.closest('.table-frame')?.dataset.tableKey||el.querySelector('table')?.getAttribute('aria-label'));
function closeReader(){const dialog=document.getElementById('table-reader');if(dialog.open)dialog.close();}
async function dismissDialog(id){const dialog=document.getElementById(id);if(!dialog.open)return;if(!reducedMotion())try{await dialog.animate([{opacity:1,transform:'translateY(0) scale(1)'},{opacity:0,transform:'translateY(7px) scale(.985)'}],{duration:180,easing:'cubic-bezier(.4,0,1,1)'}).finished;}catch{}dialog.close();}
function persistBooks(){remember('books',books);}
function revealResults(root) {
  const target=root.querySelector('.directory-controls,.lens-roster-tools,.roster-bar,.report-query,.table-frame');if(!target)return;
  target.tabIndex=-1;target.focus({preventScroll:true});
  const dialog=root.closest('dialog');
  if(dialog){const offset=(dialog.querySelector('.drawer-top')?.clientHeight||0)+(dialog.querySelector('.drawer-tabs')?.clientHeight||0)+24;dialog.scrollTo({top:Math.max(0,dialog.scrollTop+target.getBoundingClientRect().top-dialog.getBoundingClientRect().top-offset),behavior:'instant'});}
  else {const head=document.querySelector('.masthead').getBoundingClientRect(),outline=stage().querySelector('.study-outline'),offset=Math.max(head.bottom,outline?.getBoundingClientRect().bottom||0)+18;window.scrollTo({top:Math.max(0,scrollY+target.getBoundingClientRect().top-offset),behavior:'instant'});}
}
function drawerTablePositions(){return [...document.querySelectorAll('#drawer-content .table-frame')].map(el=>({key:el.dataset.tableKey,left:el.querySelector('.table-scroll')?.scrollLeft||0}));}
function restoreDrawerPosition(state){document.getElementById('research-drawer').scrollTop=state.scrollTop||0;for(const item of state.tablePositions||[]){const frame=[...document.querySelectorAll('#drawer-content .table-frame')].find(el=>el.dataset.tableKey===item.key);if(frame)frame.querySelector('.table-scroll').scrollLeft=item.left;}enhance(document.getElementById('drawer-content'));}
function comparisonContext() {
  if(drawerState?.type==='person'||drawerState?.type==='subject')return drawerState.exam||'latest';
  if(['question','knowledge'].includes(drawerState?.type))return drawerState.key.split('|')[1]||'latest';
  if(drawerState?.type==='compare')return drawerState.context||'latest';
  if(current==='people')return books.people.sid?(atlas.materialAt(books.people.sid,books.people.exam)?.exam||'latest'):books.people.directoryExam||'latest';
  if(current==='papers')return books.papers.key.split('|')[1]||'latest';
  return books[current].exam||'latest';
}
function persistResearch(){remember('research',research);}
function compactDrawer(state){if(!state||!['person','question','compare','subject','knowledge'].includes(state.type))return null;const {queue,cursor,queueLabel,...rest}=state;return structuredClone(rest);}
function studyNow() {
  if(!paintedStudy||!hasMaterials(atlas.data))return null;
  const study=structuredClone(paintedStudy),nodes=[...stage().querySelectorAll('[data-study-section]')],section=nodes.filter(node=>node.getBoundingClientRect().top<=140).at(-1);
  study.position={top:window.scrollY,section:section?.id||'',offset:section?.getBoundingClientRect().top||0,details:[...stage().querySelectorAll('details')].map((el,index)=>({index,open:el.open})),tables:[...stage().querySelectorAll('.table-frame')].map(el=>({key:el.dataset.tableKey,left:el.querySelector('.table-scroll')?.scrollLeft||0}))};
  if(document.getElementById('research-drawer').open){study.drawer=compactDrawer(drawerState);study.trail=drawerTrail.map(compactDrawer).filter(Boolean).slice(-6);study.drawerTop=document.getElementById('research-drawer').scrollTop;study.drawerTables=[...document.getElementById('drawer-content').querySelectorAll('.table-frame')].map(el=>({key:el.dataset.tableKey,left:el.querySelector('.table-scroll')?.scrollLeft||0}));study.comparePeople=[...session.comparePeople];}
  return study;
}
function archiveStudy(study=studyNow()) {
  if(!study)return;
  const key=studyKey(study),old=research.recent.find(entry=>studyKey(entry)===key),{title,scope}=studyDescription(atlas,study),entry={...study,title,scope,id:old?.id||'r-'+crypto.randomUUID(),updated:new Date().toISOString()};
  research.recent=[entry,...research.recent.filter(e=>e.id!==entry.id)].slice(0,24);persistResearch();
}
function scheduleResearch(){clearTimeout(researchTimer);researchTimer=setTimeout(()=>archiveStudy(),500);}
function leaveStudy() {
  const study=closedStudy&&Date.now()-closedStudy.closedAt<1500?closedStudy.study:studyNow();closedStudy=null;
  if(study){archiveStudy(study);researchTrail.push(study);researchTrail=researchTrail.slice(-10);}return study;
}
function drawResearch(){const content=document.getElementById('research-content');prepareUpdate();renderInto(content,researchView(atlas,research,researchScope,studyNow()));enhance(content);}
function openResearch(){if(!hasMaterials(atlas.data))return;archiveStudy();researchScope.rename='';drawResearch();const dialog=document.getElementById('research-dialog');if(!dialog.open)dialog.showModal();}
function pinStudy(study=studyNow()) {
  if(!study)return;
  const key=studyKey(study),existing=research.saved.find(entry=>studyKey(entry)===key),description=studyDescription(atlas,study),entry={...study,title:description.title,scope:description.scope,id:existing?.id||'s-'+crypto.randomUUID(),name:existing?.name||description.title,updated:new Date().toISOString()};
  research.saved=[entry,...research.saved.filter(e=>e.id!==entry.id)];persistResearch();
  if(document.getElementById('research-dialog').open){researchScope.tab='saved';researchScope.search='';researchScope.rename=entry.id;drawResearch();document.querySelector('#research-content [name="study-name"]')?.focus({preventScroll:true});}
  else notify('已留在研究夹',{label:'查看线索',cmd:'research'});
}
async function restoreStudy(study,{returning=false}={}) {
  if(!hasMaterials(atlas.data)||!studyAvailable(atlas,study)){notify('对应班级、考次、学生或试题尚未导入，保留这条线索，补齐材料后再打开。');return;}
  const present=studyNow();if(!returning&&(!present||studyKey(present)!==studyKey(study)))leaveStudy();else archiveStudy();
  await closeDrawer();closedStudy=null;closeReader();
  for(const id of ['research-dialog','report-dialog']){const dialog=document.getElementById(id);if(dialog.open)dialog.close();}
  current=study.scene;books[current]={...structuredClone(defaults[current]),...structuredClone(study.values)};persistBooks();history.pushState(null,'',path());
  await paint(true);if(current!==study.scene)return;
  const details=[...stage().querySelectorAll('details')];for(const item of study.position?.details||[])if(details[item.index])details[item.index].open=item.open;
  for(const item of study.position?.tables||[]){const frame=[...stage().querySelectorAll('.table-frame')].find(el=>el.dataset.tableKey===item.key);if(frame)frame.querySelector('.table-scroll').scrollLeft=item.left;}
  const section=study.position?.section&&document.getElementById(study.position.section),top=section?window.scrollY+section.getBoundingClientRect().top-(study.position.offset||0):study.position?.top||0;window.scrollTo({top:Math.max(0,top),behavior:'instant'});
  if(study.drawer){if(study.comparePeople&&(study.drawer.type==='compare'||study.trail?.some(d=>d.type==='compare'))){session.comparePeople=[...study.comparePeople];remember('comparePeople',session.comparePeople);}
    drawerState=study.trail?.at(-1)||null;const restored=structuredClone(study.drawer);if(restored.type==='person')Object.assign(restored,personQueue(restored.sid,restored.exam));drawerState=null;openDrawer(restored);drawerTrail=structuredClone(study.trail||[]);drawDrawer();document.getElementById('research-drawer').scrollTop=study.drawerTop||0;
    for(const item of study.drawerTables||[]){const frame=[...document.getElementById('drawer-content').querySelectorAll('.table-frame')].find(el=>el.dataset.tableKey===item.key);if(frame)frame.querySelector('.table-scroll').scrollLeft=item.left;}
  }
  enhance(stage());scheduleResearch();
}
function ensureBooks() {
  for(const key of ['board','follow'])if(!atlas.exams.some(e=>e.id===books[key].exam))books[key].exam=atlas.latest;
  if(!atlas.classes.includes(Number(books.class.no)))books.class.no=atlas.classes.includes(4)?4:atlas.classes[0];
  if(!atlas.classExams(books.class.no).some(e=>e.id===books.class.exam))books.class.exam=atlas.classExams(books.class.no).at(-1)?.id||atlas.latest;
  if(!atlas.papers().some(p=>p.key===books.papers.key))books.papers.key='';
  if(!atlas.people.has(books.people.sid))books.people.sid='';
  if(books.people.directoryExam!=='latest'&&!atlas.exams.some(e=>e.id===books.people.directoryExam))books.people.directoryExam='latest';
  books.people.language='all';
  for(const [scene,key] of [['people','storyMetric'],['class','trendMetric'],['class','matrix'],['board','subject']])if(['英语','日语'].includes(books[scene][key]))books[scene][key]='外语';
  session.comparePeople=session.comparePeople.filter(sid=>atlas.people.has(sid)).slice(0,4);
  session.savedPeople=session.savedPeople.filter(sid=>atlas.people.has(sid));
}
function path(scene=current) {
  const state=books[scene];
  if(scene==='class')return '#class/'+(state.no||'')+'/'+state.tab;
  if(scene==='papers'&&state.key)return '#papers/'+encodeURIComponent(state.key);
  if(scene==='people'&&state.sid)return '#people/'+encodeURIComponent(state.sid)+(state.exam?'/'+encodeURIComponent(state.exam):'');
  return '#'+scene;
}
function readRoute() {
  try {
    const [name,object,focus]=location.hash.slice(1).split('/').map(decodeURIComponent);
    current=routes.some(r=>r[0]===name)?name:'board';
    if(current==='class'&&object){books.class.no=Number(object);if(['snapshot','history','targets'].includes(focus))books.class.tab=focus;}
    if(current==='papers')books.papers.key=object||'';
    if(current==='people'){books.people.sid=object||'';if(focus)books.people.exam=focus;}
  }catch{current='board';}
}
function go(scene,values={},resetScroll=false) {
  const before=studyNow(),nextValues={...books[scene],...values};if(before&&(before.scene!==scene||studyKey({...before,values:nextValues,drawer:null})!==studyKey({...before,drawer:null})))leaveStudy();
  closeReader();if(resetScroll){pagePositions.delete(scene+'|');scrollResets.add(scene+'|');}
  Object.assign(books[scene],values);current=scene;persistBooks();
  const next=path(scene);if(location.hash===next)paint(true);else location.hash=next;
}
function nav() {
  const dock=document.getElementById('navigation');
  if(!dock.children.length)dock.innerHTML='<span class="dock-indicator" aria-hidden="true"></span>'+routes.map(([id,label])=>'<button data-cmd="nav" data-scene="'+id+'"><span class="dock-symbol">'+dockIcon(id)+'</span><span>'+label+'</span><i></i></button>').join('');
  for(const b of dock.querySelectorAll('button'))if(b.dataset.scene===current)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');
  requestAnimationFrame(positionDock);
  document.title=(routes.find(r=>r[0]===current)?.[1]||'教学证据台')+' · 衡迹';
  const state=books[current],breadcrumb=document.getElementById('workspace-location');
  const available=hasMaterials(atlas.data);
  document.body.dataset.workspace=available?'ready':'empty';
  document.querySelector('.masthead [data-cmd="find"]').hidden=!available;
  document.querySelector('.masthead [data-cmd="research"]').hidden=!available;
  breadcrumb.textContent=(routes.find(r=>r[0]===current)?.[1]||'研究台')+(available?(current==='class'?' / '+(state.no||'')+'班':current==='papers'&&state.key?' / '+state.key.split('|').join(' · '):current==='people'&&state.sid?' / '+atlas.name(state.sid):''):'');
}
function positionDock(){const dock=document.getElementById('navigation'),selected=dock.querySelector('[aria-current="page"]');if(selected){dock.style.setProperty('--dock-x',selected.offsetLeft+'px');dock.style.setProperty('--dock-w',selected.offsetWidth+'px');}}
async function paint(transition=false,focus=null) {
  const serial=++paintId,scene=current;nav();
  try {
    const available=hasMaterials(atlas.data);let view;
    if(!available)view=welcomeView();
    else {
      if(!loaded.has(scene))loaded.set(scene,import('./scenes/'+scene+'.js?v=surface-20261011j'));
      const module=await loaded.get(scene);if(serial!==paintId)return;
      view=scene==='class'&&!atlas.classes.length?{html:empty('先带入一个班的材料','从导入原表开始建立班级画布。')+button('导入材料','import',{},'accent'),report:null}:module.render(atlas,books[scene],session);
    }
    if(available)view.html=composeScene(view.html,{back:researchTrail.at(-1)?studyDescription(atlas,researchTrail.at(-1)).title:''});
    const object=available?scene+'|'+(scene==='people'?books.people.sid:scene==='papers'?books.papers.key:scene==='class'?books.class.no:''):'empty',changed=object!==paintedObject,previousScroll=window.scrollY;
    const oldScene=stage().dataset.scene,direction=oldScene===scene?'focus':routes.findIndex(r=>r[0]===scene)>routes.findIndex(r=>r[0]===oldScene)?'forward':'backward';
    document.documentElement.dataset.transitionDirection=direction;
    const positions=new Map([...stage().querySelectorAll('[data-motion-key]')].map(el=>[el.dataset.motionKey,el.getBoundingClientRect()]));
    const focused=document.activeElement?.closest('[data-cmd]'),focusedData=focused&&stage().contains(focused)?{...focused.dataset}:null;
    for(const el of stage().querySelectorAll('.table-scroll'))paintedScrolls.set(tablePositionKey(el),el.scrollLeft);
    if(changed&&paintedObject)pagePositions.set(paintedObject,previousScroll);
    const apply=()=>{
      if(serial!==paintId)return;
      activeReport=view.report;
      prepareUpdate();renderInto(stage(),view.html,{replace:changed});stage().dataset.scene=scene;stage().dataset.animate=transition||changed?'true':'false';paintedObject=object;
      if(focus){const root=focus.inDrawer?document.getElementById('drawer-content'):stage(),input=root.querySelector('[data-field="'+focus.key+'"]');input?.focus({preventScroll:true});if(input&&input.type!=='number')try{input.setSelectionRange(focus.position,focus.position);}catch{}}
      else if(focusedData&&!changed){const next=[...stage().querySelectorAll('[data-cmd]')].find(el=>Object.entries(focusedData).every(([k,v])=>el.dataset[k]===v));next?.focus({preventScroll:true});}
      for(const el of stage().querySelectorAll('.table-scroll'))el.scrollLeft=paintedScrolls.get(tablePositionKey(el))||0;
      for(const rail of stage().querySelectorAll('.exam-rail')){const selected=rail.querySelector('.selected');if(selected)rail.scrollLeft=selected.offsetLeft-rail.offsetLeft-rail.clientWidth/2+selected.clientWidth/2;}
      if(changed||scrollResets.has(object))window.scrollTo({top:scrollResets.has(object)?0:pagePositions.get(object)||0,behavior:'instant'});else window.scrollTo({top:previousScroll,behavior:'instant'});scrollResets.delete(object);
      enhance(stage());
      paintedStudy=available?{scene,values:structuredClone(books[scene])}:null;scheduleResearch();
      if(!reducedMotion()) {
        if(changed&&!document.startViewTransition)stage().animate([{opacity:0,transform:'translateY(14px)'},{opacity:1,transform:'translateY(0)'}],{duration:420,easing:'cubic-bezier(.2,.8,.2,1)'});
        for(const el of stage().querySelectorAll('[data-motion-key]')){const before=positions.get(el.dataset.motionKey),after=el.getBoundingClientRect();if(after.bottom<72||after.top>innerHeight)continue;if(before&&!changed&&(before.x!==after.x||before.y!==after.y))el.animate([{transform:'translate('+(before.x-after.x)+'px,'+(before.y-after.y)+'px)'},{transform:'translate(0,0)'}],{duration:420,easing:'cubic-bezier(.22,.8,.22,1)'});else if(!before)el.animate([{opacity:0,transform:'translateY(12px)'},{opacity:1,transform:'translateY(0)'}],{duration:420,delay:Math.min([...el.parentElement.children].indexOf(el),9)*22,fill:'backwards',easing:'cubic-bezier(.22,.8,.22,1)'});}
      }
    };
    if((changed||transition)&&document.startViewTransition&&!reducedMotion()){sceneTransition?.skipTransition();const next=document.startViewTransition(apply);sceneTransition=next;next.ready.catch(()=>{});next.finished.catch(()=>{}).finally(()=>{if(sceneTransition===next)sceneTransition=null;});await next.updateCallbackDone;}else apply();
  }catch(error){if(serial!==paintId)return;stage().innerHTML=empty('这张研究画布暂时没有打开',error.message)+button('重新打开','reload',{},'outline')+button('导入材料','import',{},'accent');activeReport=null;}
}
function update(key,value,toggle=false) {
  archiveStudy();
  const state=books[current];value=converted(value);
  if(['classes','profileNo','band','question','pageSize','planClass'].includes(key)&&value!=='all')value=Number(value);
  if(value==='all'&&key==='classes')value=[];
  if(toggle) {
    const before=Array.isArray(state[key])?state[key]:key==='exams'?atlas.classExams(state.no).map(e=>e.id):[];
    value=before.includes(value)?before.filter(v=>v!==value):[...before,value];
    if(key==='exams'&&!value.length){notify('请保留至少一个考次');return;}
  }
  state[key]=value;state.page=1;
  if(current==='people'&&['standing','trend','records','focusSubject','focusStatus','savedOnly'].includes(key))state.lens='custom';
  if(current==='people'&&key==='track')state.classes=[];
  if(current==='papers'&&key==='classes')state.question=0;
  if(current==='class'&&key==='tab')history.replaceState(null,'',path());
  persistBooks();paint(['tab','mode','view','exam','directoryExam','key'].includes(key)).then(()=>{if(drawerState?.type==='filters')drawDrawer();});
}
async function installDataset(dataset,{fresh=false}={}) {
  await closeDrawer();const shelf=document.getElementById('research-dialog');if(shelf.open)shelf.close();
  clearTimeout(researchTimer);paintedStudy=null;closedStudy=null;researchTrail=[];
  atlas=new Atlas(restoreDataset(dataset));const available=hasMaterials(atlas.data);
  if(available)ensureBooks();
  if(fresh&&available){books.board.exam=atlas.latest;books.follow.exam=atlas.latest;books.class.exam=atlas.classExams(books.class.no).at(-1)?.id||atlas.latest;books.class.exams=atlas.classExams(books.class.no).map(e=>e.id);books.papers.key='';books.people.exam=atlas.materialAt(books.people.sid)?.exam;}
  if(!available){await closeDrawer();closeReader();for(const id of ['report-dialog','research-dialog']){const dialog=document.getElementById(id);if(dialog.open)dialog.close();}exportReport=null;document.getElementById('report-content').replaceChildren();document.getElementById('research-content').replaceChildren();}
  document.getElementById('work-status').textContent=available?'本机教学资料':'等待导入材料';
  persistBooks();await paint(true);
}
async function store() {try{await save(atlas.data);}catch{notify('本机保存暂时不可用，请下载完整备份保留材料。');}}
function workspaceSnapshot(){return structuredClone({...atlas.data,plans:session.plans,notebook:session.notebook,savedPeople:session.savedPeople,comparePeople:session.comparePeople,directoryViews:session.directoryViews,research});}
async function restoreContext(incoming) {
  if(incoming.plans||incoming.actions)session.plans=(incoming.plans||incoming.actions).map(p=>({...p,status:p.status==='doing'?'active':['new','active','done'].includes(p.status)?p.status:'new'}));
  else session.plans=session.plans.filter(p=>incoming.students.some(person=>person.id===p.sid));
  remember('plans',session.plans);
  for(const key of ['savedPeople','comparePeople','directoryViews'])if(Array.isArray(incoming[key])){session[key]=structuredClone(incoming[key]);remember(key,session[key]);}
  if(incoming.research){research.saved=structuredClone(Array.isArray(incoming.research.saved)?incoming.research.saved:[]);research.recent=structuredClone(Array.isArray(incoming.research.recent)?incoming.research.recent.slice(0,24):[]);persistResearch();}
  if(Array.isArray(incoming.notebook)){session.notebook=structuredClone(incoming.notebook);await saveNotebook(session.notebook);}
}
async function commitMaterial(incoming,mode) {
  if(atlas.data.anonymous&&!incoming.anonymous&&!incoming.scores.length)throw new Error('请先导入真实姓名的成绩原表，再补充这份小题。');
  revision++;await closeDrawer();archiveStudy();const before=workspaceSnapshot();try{await preserveUndo(before);}catch{}
  const dataset=normalizeDataset(mode==='replace'?incoming:mergeDatasets(before,incoming));
  dataset.userImported=true;
  await restoreContext(dataset);
  await installDataset(dataset,{fresh:true});await store();notify('材料已加入工作区',{label:'撤回材料更新',cmd:'undo'});
}
function sameReport(a,b){return a.title===b.title&&a.subtitle===b.subtitle&&JSON.stringify(a.sections)===JSON.stringify(b.sections)&&JSON.stringify(a.sheets)===JSON.stringify(b.sheets);}
function openReport(report,{fresh=false}={}) {
  if(!report){notify('先打开一个班级、学生或试卷，再摘录研究结果。');return;}
  if(!report.id&&!fresh)report=session.notebook.find(note=>note.autoSaved&&sameReport(note,report))||report;
  if(exportReport?.id)saveNotebook(session.notebook).catch(()=>{});reportNoteRevision++;
  clearTimeout(noteTimer);exportReport=structuredClone(report);reportOrigin=report.id?(report.study||null):studyNow();
  if(reportOrigin&&!exportReport.study){exportReport.study=structuredClone(reportOrigin);exportReport.studyTitle=studyDescription(atlas,reportOrigin).title;}
  reportNoteState=report.id?'saved':'preview';reportScope={section:0,page:1,search:''};drawReport();
  const dialog=document.getElementById('report-dialog');if(!dialog.open)dialog.showModal();dialog.scrollTop=0;enhance(dialog);
}
function drawReport(){prepareUpdate();const content=document.getElementById('report-content');renderInto(content,reportView(exportReport,reportScope,{noteState:reportNoteState,canReturn:Boolean(reportOrigin&&studyAvailable(atlas,reportOrigin))}));enhance(content);}
function showNoteState(state){reportNoteState=state;const el=document.getElementById('report-note-state');if(el){el.dataset.state=state;el.textContent={preview:'写下判断后自动留存，空白预览不新增摘录',saving:'正在保存判断…',saved:'已保存到本机摘录',error:'本机保存未完成 · 请下载材料保留判断'}[state];}if(exportReport?.id){const label=document.querySelector('#report-content .inbox-top .overline');if(label)label.textContent=state==='saved'?'教学证据 / 已摘录':'教学证据 / 正在留存';const keep=document.querySelector('#report-content [data-cmd="report-keep"]');if(keep)keep.textContent='保存判断';}}
async function persistReportNote() {
  if(!exportReport?.id){showNoteState('preview');return;}
  const note=session.notebook.find(n=>n.id===exportReport.id);if(!note)return;
  const serial=++reportNoteRevision,id=exportReport.id;note.note=exportReport.note||'';showNoteState('saving');
  try{await saveNotebook(session.notebook);if(serial===reportNoteRevision&&exportReport?.id===id)showNoteState('saved');}
  catch{if(serial===reportNoteRevision&&exportReport?.id===id)showNoteState('error');}
}
async function keepReport() {
  if(!exportReport)return;clearTimeout(noteTimer);
  if(!exportReport.id){exportReport.id='e'+crypto.randomUUID();session.notebook.unshift(structuredClone(exportReport));}
  await persistReportNote();drawReport();
  if(reportNoteState==='saved')notify('证据与判断已留在资料与报告');
}
async function finishReport() {
  clearTimeout(noteTimer);if(exportReport?.id)await persistReportNote();else if(exportReport?.note?.trim())await keepReport();
  if(reportNoteState==='error'){notify('判断尚未成功保存，请先下载这份材料保留记录。');return false;}return true;
}
async function closeReport() {
  if(!await finishReport())return;
  await dismissDialog('report-dialog');
  if(current==='library'&&books.library.tab==='notebook')await paint();
}
async function capture(source=activeReport) {
  if(!source){openReport(null);return;}
  openReport(source,{fresh:true});await keepReport();document.getElementById('report-note')?.focus({preventScroll:true});
}
function drawDrawer() {
  const dialog=document.getElementById('research-drawer'),content=document.getElementById('drawer-content'),focus=document.activeElement?.dataset;
  if(!drawerState)return;
  const object=[drawerState.type,drawerState.sid||drawerState.no||drawerState.key||'',drawerState.subject||drawerState.knowledge||drawerState.question||'',drawerState.tab||''].join('|'),same=dialog.dataset.object===object,positions=new Map([...content.querySelectorAll('tr[data-motion-key]')].map(el=>[el.dataset.motionKey,el.getBoundingClientRect()]));dialog.dataset.object=object;
  if(drawerState.type==='person'&&!drawerState.queue){const active=drawerState;drawerState=drawerTrail.at(-1)||null;const queue=personQueue(active.sid,active.exam);drawerState=active;Object.assign(active,queue);}
  document.getElementById('drawer-back').hidden=!drawerTrail.length;
  dialog.classList.toggle('comparison-drawer',drawerState.type==='compare');dialog.dataset.kind=drawerState.type;document.getElementById('drawer-context').textContent='衡迹 / '+({person:'学生观察',question:'单题研究',filters:'名单筛选',compare:'并排比较',subject:'班级学科',knowledge:'知识点研究'}[drawerState.type]||'研究观察窗');
  const views={question:()=>questionView(atlas,drawerState),filters:()=>directoryFilterView(atlas,books.people,session),compare:()=>compareView(atlas,session.comparePeople,drawerState,drawerState.context),subject:()=>subjectView(atlas,drawerState),knowledge:()=>knowledgeView(atlas,drawerState),person:()=>peekView(atlas,drawerState.sid,drawerState.exam,session,drawerState)};
  prepareUpdate();renderInto(content,views[drawerState.type]());
  if(drawerState.type!=='filters'){
    const origin=current==='class'?books.class.no+'班':current==='papers'?'当前试卷':current==='people'?(books.people.sid?'学生档案':'学生目录'):routes.find(r=>r[0]===current)?.[1]||'原研究页',ancestors=drawerTrail.map((d,index)=>({index,title:studyDescription(atlas,{scene:current,values:books[current],drawer:d,comparePeople:session.comparePeople}).title})).slice(-3),crumb=document.createElement('nav');crumb.className='drawer-route';crumb.setAttribute('aria-label','当前证据路径');
    crumb.innerHTML=button(esc(origin),'drawer-close',{},'drawer-route-link','title="回到原研究页，保留范围与位置"')+ancestors.map(item=>'<i aria-hidden="true">›</i>'+button(esc(item.title),'drawer-ancestor',{index:item.index},'drawer-route-link','title="'+esc(item.title)+'"')).join('')+'<i aria-hidden="true">›</i><span aria-current="location">'+esc({person:'学生',question:'小题',compare:'对比',subject:'学科',knowledge:'知识点'}[drawerState.type])+'</span>';
    content.prepend(crumb);const actions=content.querySelector('.drawer-actions,.question-stepper');actions?.insertAdjacentHTML('beforeend',button('☆ 留在研究夹','research-pin',{},'quiet'));scheduleResearch();
    requestAnimationFrame(()=>{if(crumb.isConnected)crumb.scrollLeft=crumb.scrollWidth;});
  }
  enhance(content);
  if(same&&!reducedMotion()){let order=0;for(const row of content.querySelectorAll('tr[data-motion-key]')){const after=row.getBoundingClientRect(),before=positions.get(row.dataset.motionKey);if(after.bottom<dialog.getBoundingClientRect().top+65||after.top>innerHeight)continue;if(before&&Math.abs(before.y-after.y)>1)row.animate([{transform:'translateY('+(before.y-after.y)+'px)'},{transform:'translateY(0)'}],{duration:340,easing:'cubic-bezier(.16,1,.3,1)'});else if(!before)row.animate([{opacity:0,transform:'translateY(5px)'},{opacity:1,transform:'translateY(0)'}],{duration:260,delay:Math.min(order++,4)*18,fill:'backwards',easing:'cubic-bezier(.16,1,.3,1)'});}}
  if(focus?.cmd){const target=[...content.querySelectorAll('[data-cmd]')].find(el=>Object.entries(focus).every(([k,v])=>el.dataset[k]===v));target?.focus({preventScroll:true});}
}
function openDrawer(state) {
  const dialog=document.getElementById('research-drawer');if(drawerClosing)return;
  if(dialog.open&&drawerState)drawerTrail.push({...structuredClone(drawerState),scrollTop:dialog.scrollTop,tablePositions:drawerTablePositions()});else drawerTrail=[];
  drawerState=state;drawDrawer();dialog.scrollTop=0;
  if(dialog.open&&!reducedMotion())document.getElementById('drawer-content').animate([{opacity:.45,transform:'translateX(12px)'},{opacity:1,transform:'translateX(0)'}],{duration:260,easing:'cubic-bezier(.22,.8,.22,1)'});
  if(!dialog.open){drawerOpener=document.activeElement;dialog.showModal();document.body.classList.add('drawer-open');dialog.scrollTop=0;if(!reducedMotion())dialog.animate([{opacity:0,transform:'translateX(64px)'},{opacity:1,transform:'translateX(0)'}],{duration:420,easing:'cubic-bezier(.16,1,.3,1)'});}
  const title=document.getElementById('drawer-title');if(title){title.tabIndex=-1;title.focus({preventScroll:true});}
}
function closeDrawer() {
  const dialog=document.getElementById('research-drawer');if(drawerClosing)return drawerClosing;if(!dialog.open)return Promise.resolve();
  const study=studyNow();if(study){archiveStudy(study);closedStudy={study,closedAt:Date.now()};}
  drawerClosing=(async()=>{if(!reducedMotion()){try{await dialog.animate([{opacity:1,transform:'translateX(0)'},{opacity:0,transform:'translateX(52px)'}],{duration:220,easing:'cubic-bezier(.4,0,1,1)'}).finished;}catch{}}dialog.close();document.body.classList.remove('drawer-open');drawerState=null;drawerTrail=[];drawerOpener?.isConnected&&drawerOpener.focus({preventScroll:true});})();
  drawerClosing.finally(()=>{drawerClosing=null;});return drawerClosing;
}
function sourceExam(sid){return current==='papers'?books.papers.key.split('|')[1]:['board','class','follow'].includes(current)?books[current].exam:current==='people'&&!books.people.sid&&books.people.directoryExam!=='latest'?books.people.directoryExam:atlas.materialAt(sid)?.exam;}
function personQueue(sid,exam,trigger) {
  let records=[],label='当前名单';const state=books[current];
  if(drawerState?.type==='subject'){const lens=subjectLens(atlas,drawerState);records=lens.matches.map(e=>({sid:e.row.sid,exam:e.row.exam}));label=lens.no+'班 · '+lens.subject+' · '+lens.selected;}
  else if(drawerState?.type==='knowledge'){const lens=skillLens(atlas,drawerState);records=lens.matches.map(e=>({sid:e.answer.sid,exam:e.answer.exam}));label=drawerState.knowledge+' · '+lens.selected;}
  else if(drawerState?.type==='question') {
    const model=questionLens(atlas,drawerState);records=model.matches.map(a=>({sid:a.sid,exam:model.lens.exam}));label=model.lens.subject+' · '+model.selected;
  } else if(drawerState?.type==='compare') {records=session.comparePeople.map(id=>({sid:id,exam:drawerState.context==='latest'?atlas.materialAt(id)?.exam:drawerState.context}));label='已选对比学生';}
  else if(current==='people'&&!state.sid) {records=queryDirectory(atlas,state,session).matches.map(e=>({sid:e.row.sid,exam:e.row.exam}));label='当前筛选结果';}
  else if(current==='class'||current==='board') {
    const rows=(current==='class'?atlas.classAt(state.no,exam):atlas.rows(exam)).filter(r=>atlas.name(r.sid).includes(state.search||'')).sort((a,b)=>state.sort==='name'?atlas.name(a.sid).localeCompare(atlas.name(b.sid),'zh'):state.sort==='gap'?(atlas.gap(b,'under')??-Infinity)-(atlas.gap(a,'under')??-Infinity):(b.total??-Infinity)-(a.total??-Infinity));records=rows.map(r=>({sid:r.sid,exam:r.exam}));label=current==='class'?state.no+'班 · 本场名单':'本场年级名单';
  } else if(current==='papers'&&state.key) {records=atlas.paper(state.key,state.classes).answers.filter(a=>atlas.name(a.sid).includes(state.search||'')).map(a=>({sid:a.sid,exam:a.exam}));label='当前试卷作答';}
  else if(current==='follow') {
    if(trigger?.closest('.follow-workbench')){const query=state.planSearch||'';records=session.plans.filter(p=>(!state.planClass||state.planClass==='all'||Number(p.classNo)===Number(state.planClass))&&(!state.planStatus||state.planStatus==='all'||p.status===state.planStatus)&&(!query||[atlas.name(p.sid),p.subject,p.note].some(v=>String(v||'').includes(query)))).map(p=>({sid:p.sid,exam:p.exam}));label='当前跟进记录';}
    else {records=atlas.critical(state.exam,{tier:state.tier||'under',band:Number(state.band)||20,side:state.side||'below',classes:state.classes||[]}).filter(item=>atlas.name(item.row.sid).includes(state.search||'')).map(item=>({sid:item.row.sid,exam:item.row.exam}));label='当前临界名单';}
  }
  const seen=new Set(),queue=records.filter(r=>{const key=r.sid+'|'+r.exam;if(!atlas.people.has(r.sid)||seen.has(key))return false;seen.add(key);return true;}),cursor=queue.findIndex(r=>r.sid===sid&&r.exam===exam);
  return cursor>=0?{queue,cursor,queueLabel:label}:{queue:[{sid,exam}],cursor:0,queueLabel:label};
}
function animateDrawer(direction=1) {if(!reducedMotion())document.getElementById('drawer-content').animate([{opacity:.45,transform:'translateX('+(direction*12)+'px)'},{opacity:1,transform:'translateX(0)'}],{duration:280,easing:'cubic-bezier(.22,.8,.22,1)'});}
function drawerReport(){return drawerState.type==='question'?questionEvidence(atlas,drawerState):['subject','knowledge'].includes(drawerState.type)?lensEvidence(atlas,drawerState):drawerEvidence(atlas,drawerState,session.comparePeople);}
function addFollow(sid,exam,tier) {
  const row=atlas.story(sid).find(r=>r.exam===exam);if(!row)return;
  const id=sid+'|'+exam+'|'+tier;
  if(session.plans.some(p=>p.id===id)){notify('这条跟进已在看板中');return;}
  const nearest=atlas.critical(exam,{tier,band:10000,side:'both'}).find(item=>item.row.sid===sid)?.nearest;
  session.plans.unshift({id,sid,exam,tier,classNo:row.classNo,subject:nearest?.subject||'',status:'new',note:'',created:new Date().toISOString()});remember('plans',session.plans);notify('已加入跟进看板',{label:'查看跟进',cmd:'follow-open'});if(current==='follow')paint();
}
function fourSheets() {
  const exam=atlas.latest,comparison=atlas.exams.at(-2)?.id||'';
  const multi=[['班级','姓名',...atlas.exams.map(e=>e.label)]];
  for(const no of atlas.classes)for(const sid of new Set(atlas.data.scores.filter(r=>r.classNo===no).map(r=>r.sid)))multi.push([no,atlas.name(sid),...atlas.exams.map(e=>atlas.classAt(no,e.id).find(r=>r.sid===sid)?.total??null)]);
  const banks=[['学科','考试','题序','题号','满分','知识点'],...atlas.papers().flatMap(p=>p.questions.map((q,i)=>[p.subject,p.exam,i+1,q.label,q.max,q.knowledge]))];
  return {'班级有效人':effectiveRows(atlas,exam,comparison),'个人学科小题得分':answerRows(atlas,atlas.data.answers),'班级多次考试对比':multi,'班级成绩分析单次':scoreRows(atlas,atlas.rows(exam)),'学科有效与双上线':subjectRows(atlas,exam),'题目目录':banks};
}
async function template() {
  const headers=['考试(如53物/53历)','学校','班级','姓名','原始总分','赋分总分','原分市排名','赋分市排名','原分校排名','赋分校排名','语文','语文市排名','语文校排名','数学','数学市排名','数学校排名','外语','外语市排名','外语校排名','物理/历史','首选科市排名','首选科校排名','政治原分','政治赋分','政治原分排名','政治赋分排名','地理原分','地理赋分','地理原分排名','地理赋分排名','化学原分','化学赋分','化学原分排名','化学赋分排名','生物原分(9班为地理)','生物赋分(9班为地理)','生物原分排名','生物赋分排名','外语语种'];
  await excel({'学生基础':[headers],'语文':[[null,'53','题号','1','2','3'],[null,null,'分值',5,5,10],[null,null,'知识点','现代文阅读','文言基础','表达与写作'],['53物',4,'请填写姓名',null,null,null]],'填写说明':[['项目','说明'],['成绩','考试代码以物或历结尾，原分与赋分分别填写，缺失留空。'],['小题','复制语文表并改为对应学科名，保留题号、分值、知识点三行。'],['联结','不同考试与小题表的姓名保持一致，班级填写当次实际班级。'],['有效线','在衡迹资料仓按考次设置物理、历史两类有效线。']]},'衡迹-成绩与小题录入模板');
}
async function commands(event) {
  if(event.target.closest('#inbox')&&!event.target.closest('#toast'))return;
  const b=event.target.closest('[data-cmd]');if(!b||b.disabled)return;
  const d=b.dataset,state=books[current];
  try {
    if(d.cmd.startsWith('research')) {
      if(!hasMaterials(atlas.data))return;
      if(d.cmd==='research')openResearch();
      else if(d.cmd==='research-close')await dismissDialog('research-dialog');
      else if(d.cmd==='research-tab'){researchScope.tab=d.tab;researchScope.rename='';drawResearch();}
      else if(d.cmd==='research-pin')pinStudy();
      else if(d.cmd==='research-pin-entry'){const entry=research.recent.find(e=>e.id===d.id);if(entry)pinStudy(entry);}
      else if(d.cmd==='research-open'){const entry=research[d.collection]?.find(e=>e.id===d.id);if(entry)await restoreStudy(entry);}
      else if(d.cmd==='research-back'){const entry=researchTrail.at(-1);if(entry&&studyAvailable(atlas,entry)){researchTrail.pop();await restoreStudy(entry,{returning:true});}else notify('原研究范围的材料尚未导入');}
      else if(d.cmd==='research-rename'){researchScope.rename=d.id;drawResearch();document.querySelector('#research-content [name="study-name"]')?.focus({preventScroll:true});}
      else if(d.cmd==='research-name-cancel'){researchScope.rename='';drawResearch();}
      else if(d.cmd==='research-remove'){const collection=research[d.collection],index=collection?.findIndex(e=>e.id===d.id),entry=collection?.[index];if(entry){collection.splice(index,1);persistResearch();drawResearch();notify('已移除研究记录',{undo:()=>{research[d.collection].splice(Math.min(index,research[d.collection].length),0,entry);persistResearch();if(document.getElementById('research-dialog').open)drawResearch();}});}}
      return;
    }
    if(d.cmd==='section-top'){window.scrollTo({top:0,behavior:reducedMotion()?'instant':'smooth'});return;}
    if(d.cmd==='section-jump') {
      const target=document.getElementById(d.target);if(!target)return;
      if(target.matches('details'))target.open=true;
      for(let parent=target.parentElement;parent;parent=parent.parentElement)if(parent.matches('details'))parent.open=true;
      target.scrollIntoView({behavior:reducedMotion()?'instant':'smooth',block:'start'});return;
    }
    if(b.closest('#table-reader')&&!['table-close','table-shift'].includes(d.cmd))closeReader();
    if(d.cmd==='table-open') {
      const frame=b.closest('.table-frame'),copy=frame.cloneNode(true);copy.querySelector('.table-expand')?.remove();
      const content=document.getElementById('table-reader-content'),label=frame.querySelector('table').getAttribute('aria-label');
      content.innerHTML='<header class="reader-head"><div><span class="overline">展开阅读</span><h2 id="table-reader-title">'+esc(label)+'</h2><p>保留当前表格的全部行与列，点击姓名可打开学生观察。</p></div>'+button('收起 ×','table-close',{},'outline')+'</header><div class="reader-canvas"></div>';content.querySelector('.reader-canvas').append(copy);document.getElementById('table-reader').showModal();enhance(content);return;
    }
    if(d.cmd==='table-close'){await dismissDialog('table-reader');return;}
    if(d.cmd==='table-shift'){shiftTable(b);return;}
    if(d.cmd==='reading'){const dialog=document.getElementById('reading-dialog');renderInto(document.getElementById('reading-content'),readingView(reading));if(!dialog.open)dialog.showModal();return;}
    if(d.cmd==='reading-close'){await dismissDialog('reading-dialog');return;}
    if(d.cmd==='reading-set'||d.cmd==='reading-reset'){if(d.cmd==='reading-reset')Object.assign(reading,readingDefaults);else if(Object.hasOwn(readingDefaults,d.key))reading[d.key]=d.value;remember('reading',reading);applyReading(reading);if(reducedMotion())for(const animation of document.getAnimations())animation.cancel();renderInto(document.getElementById('reading-content'),readingView(reading));enhance();positionDock();return;}
    if(d.cmd==='undo-action'){const undo=pendingUndo;pendingUndo=null;if(undo){await undo();notify('已撤销刚才的操作');}return;}
    if(b.closest('#research-drawer')&&['nav','class','paper','lens-paper','subject-open','people-lens','inspect-bin','workbook-open','library-open'].includes(d.cmd))await closeDrawer();
    if(d.cmd==='toast-close'){const toast=document.getElementById('toast');clearTimeout(notify.timer);toast.classList.remove('visible');if(toast.hidePopover&&toast.matches(':popover-open'))toast.hidePopover();pendingUndo=null;}
    else if(d.cmd==='nav')go(d.scene);
    else if(d.cmd==='set'||d.cmd==='toggle')update(d.key,d.value,d.cmd==='toggle');
    else if(d.cmd==='import')inbox.choose();
    else if(d.cmd==='find'){if(!hasMaterials(atlas.data)){notify('导入成绩材料后即可查找学生');return;}go('people',{sid:'',...directoryDefaults},true);setTimeout(()=>stage().querySelector('[data-field="search"]')?.focus(),100);}
    else if(d.cmd==='class') {
      const no=Number(d.no),exam=d.exam||(current==='board'?books.board.exam:current==='papers'?books.papers.key.split('|')[1]:books.class.exam);
      go('class',{no,exam:atlas.classAt(no,exam).length?exam:atlas.classExams(no).at(-1)?.id,search:'',page:1,exams:atlas.classExams(no).map(e=>e.id)});
    }
    else if(d.cmd==='person') {
      const exam=d.exam||sourceExam(d.sid);
      session.recent=[d.sid,...session.recent.filter(id=>id!==d.sid)].slice(0,12);remember('recent',session.recent);go('people',{sid:d.sid,exam});
    }
    else if(d.cmd==='class-exam')go('class',{exam:d.exam,tab:'snapshot'});
    else if(d.cmd==='person-exam')go('people',{exam:d.exam});
    else if(d.cmd==='person-back')go('people',{sid:''});
    else if(d.cmd==='peek'){const exam=d.exam||sourceExam(d.sid),queue=personQueue(d.sid,exam,b);session.recent=[d.sid,...session.recent.filter(id=>id!==d.sid)].slice(0,12);remember('recent',session.recent);openDrawer({type:'person',sid:d.sid,exam,tab:'overview',...queue});}
    else if(d.cmd==='class-subject')openDrawer({type:'subject',no:Number(d.no||books.class.no),subject:['英语','日语'].includes(d.subject)?'外语':d.subject,exam:d.exam||books.class.exam,tab:'students',tier:'under',filter:'all',sort:'low',search:'',page:1});
    else if(d.cmd==='knowledge-open'){const classes=d.no?[Number(d.no)]:d.classes!==undefined?d.classes.split(',').filter(Boolean).map(Number):[...(books.papers.classes||[])],key=d.key||books.papers.key;if(!atlas.paper(key,classes).skills.some(s=>s.name===d.knowledge)){notify('这个知识点还没有题目材料');return;}openDrawer({type:'knowledge',key,knowledge:d.knowledge,classes,tab:'questions',filter:'all',sort:'low',search:'',page:1});}
    else if(d.cmd==='lens-filter'||d.cmd==='lens-sort'||d.cmd==='lens-tier'){drawerState[d.cmd==='lens-filter'?'filter':d.cmd==='lens-sort'?'sort':'tier']=d.value;drawerState.page=1;drawDrawer();}
    else if(d.cmd==='lens-page'){drawerState.page=Math.max(1,(drawerState.page||1)+Number(d.step));drawDrawer();revealResults(document.getElementById('drawer-content'));}
    else if(d.cmd==='lens-exam'){drawerState.exam=d.exam;drawerState.page=1;drawerState.search='';drawDrawer();animateDrawer();}
    else if(d.cmd==='knowledge-class')openDrawer({...structuredClone(drawerState),classes:[Number(d.no)],tab:'students',filter:'all',search:'',page:1});
    else if(d.cmd==='question-all')openDrawer({...structuredClone(drawerState),classes:[],filter:'all',search:'',page:1});
    else if(d.cmd==='question-class')openDrawer({...structuredClone(drawerState),classes:[Number(d.no)],filter:'all',search:'',page:1});
    else if(d.cmd==='question-unfocus'){delete drawerState.focusSid;drawDrawer();}
    else if(d.cmd==='answer-question'){if(current==='papers'&&books.papers.key===d.key){books.papers.question=Number(d.index);persistBooks();await paint();}openDrawer({type:'question',key:d.key,question:Number(d.index),classes:d.classes?.split(',').filter(Boolean).map(Number)||[],focusSid:d.sid,filter:'all',page:1,search:''});}
    else if(d.cmd==='drawer-stage'){Object.assign(drawerState,{sid:d.sid,exam:d.exam});drawDrawer();animateDrawer();}
    else if(d.cmd==='drawer-tab'){drawerState.tab=d.value;drawDrawer();animateDrawer();}
    else if(d.cmd==='drawer-question-subject'||d.cmd==='drawer-question-filter'){drawerState[d.cmd==='drawer-question-subject'?'subject':'questionFilter']=d.value;drawDrawer();}
    else if(d.cmd==='drawer-person-step'){const cursor=(drawerState.cursor||0)+Number(d.step),next=drawerState.queue?.[cursor];if(next){Object.assign(drawerState,next,{cursor});session.recent=[next.sid,...session.recent.filter(id=>id!==next.sid)].slice(0,12);remember('recent',session.recent);drawDrawer();document.getElementById('research-drawer').scrollTop=0;animateDrawer(Number(d.step));}}
    else if(d.cmd==='drawer-question-step'){const qs=atlas.paper(drawerState.key,drawerState.classes).questions,index=qs.findIndex(q=>q.index===drawerState.question)+Number(d.step);if(qs[index]){drawerState.question=qs[index].index;drawerState.page=1;drawerState.search='';if(current==='papers'&&books.papers.key===drawerState.key){books.papers.question=drawerState.question;persistBooks();paint();}drawDrawer();}}
    else if(d.cmd==='drawer-question-page'){drawerState.page=Math.max(1,(drawerState.page||1)+Number(d.step));drawDrawer();revealResults(document.getElementById('drawer-content'));}
    else if(d.cmd==='person-section'){const section=document.getElementById(d.id);section?.scrollIntoView({behavior:reducedMotion()?'instant':'smooth',block:'start'});}
    else if(d.cmd==='drawer-back'){if(drawerTrail.length){drawerState=drawerTrail.pop();drawDrawer();restoreDrawerPosition(drawerState);if(!reducedMotion())document.getElementById('drawer-content').animate([{opacity:.45,transform:'translateX(-12px)'},{opacity:1,transform:'translateX(0)'}],{duration:260,easing:'cubic-bezier(.22,.8,.22,1)'});}}
    else if(d.cmd==='drawer-ancestor'){const index=Number(d.index),ancestor=drawerTrail[index];if(ancestor){drawerState=ancestor;drawerTrail=drawerTrail.slice(0,index);drawDrawer();restoreDrawerPosition(ancestor);animateDrawer(-1);}}
    else if(d.cmd==='drawer-close')await closeDrawer();
    else if(d.cmd==='drawer-capture')await capture(drawerReport());
    else if(d.cmd==='drawer-export')openReport(drawerReport());
    else if(d.cmd==='drawer-person'){await closeDrawer();session.recent=[d.sid,...session.recent.filter(id=>id!==d.sid)].slice(0,12);remember('recent',session.recent);go('people',{sid:d.sid,exam:d.exam,subject:d.subject});}
    else if(d.cmd==='directory-reset'){const context={directoryExam:state.directoryExam,view:state.view,pageSize:state.pageSize};Object.assign(state,directoryDefaults,context);persistBooks();await paint();drawDrawer();}
    else if(d.cmd==='directory-clear'){if(d.key==='range')Object.assign(state,{minScore:'',maxScore:'',maxExclusive:false});else state[d.key]=directoryDefaults[d.key];state.page=1;state.lens='custom';persistBooks();await paint();drawDrawer();}
    else if(d.cmd==='directory-lens'){Object.assign(state,lensValues(d.lens));persistBooks();paint(true);}
    else if(d.cmd==='directory-apply'){await closeDrawer();revealResults(stage());}
    else if(d.cmd==='directory-scope'){state.scopeExpanded=!state.scopeExpanded;persistBooks();await paint();}
    else if(d.cmd==='directory-filters'){openDrawer({type:'filters'});if(d.focus)document.querySelector('#drawer-content [data-field="'+d.focus+'"]')?.focus();}
    else if(d.cmd==='directory-save'){openDrawer({type:'filters'});const input=document.querySelector('#drawer-content [name="view-name"]');input?.focus({preventScroll:true});input?.scrollIntoView({behavior:reducedMotion()?'instant':'smooth',block:'center'});}
    else if(d.cmd==='directory-restore'){const view=session.directoryViews.find(v=>v.id===d.id);if(view){if(view.values.directoryExam!=='latest'&&!atlas.exams.some(e=>e.id===view.values.directoryExam)){notify('这组筛选对应的考试尚未导入');return;}Object.assign(books.people,directoryDefaults,structuredClone(view.values),{sid:'',page:1,lens:'custom'});persistBooks();await closeDrawer();pagePositions.delete('people|');window.scrollTo({top:0,behavior:'instant'});await paint(true);notify('已打开“'+view.name+'”');}}
    else if(d.cmd==='directory-view-remove'){const index=session.directoryViews.findIndex(v=>v.id===d.id),view=session.directoryViews[index];if(view){session.directoryViews.splice(index,1);remember('directoryViews',session.directoryViews);await paint();notify('已移除常用筛选',{undo:async()=>{session.directoryViews.splice(Math.min(index,session.directoryViews.length),0,view);remember('directoryViews',session.directoryViews);await paint();}});}}
    else if(d.cmd==='people-lens')go('people',{sid:'',...directoryDefaults,...lensValues(d.lens),directoryExam:d.exam||atlas.latest,classes:d.no?[Number(d.no)]:[],focusSubject:d.subject||'all',focusStatus:d.status||'below'},true);
    else if(d.cmd==='inspect-bin')go('people',{sid:'',...directoryDefaults,directoryExam:d.exam||state.exam||atlas.latest,track:d.track||'all',classes:d.classes?d.classes.split(',').map(Number):current==='class'?[Number(state.no)]:[],minScore:d.min,maxScore:d.max,maxExclusive:true,lens:'custom'},true);
    else if(d.cmd==='workbook-open') {
      if(d.target==='papers')go('papers',{key:'',shelfExam:d.exam||atlas.latest});
      else if(d.target==='history')go('class',{tab:'history',exams:atlas.classExams(books.class.no).map(e=>e.id)});
      else go('board',{mode:d.target,exam:d.exam||books.board.exam});
    }
    else if(d.cmd==='library-open')go('library',{tab:d.tab||'materials',...(d.exam?{lineExam:d.exam}:{})});
    else if(d.cmd==='save-person'){session.savedPeople=session.savedPeople.includes(d.sid)?session.savedPeople.filter(id=>id!==d.sid):[...session.savedPeople,d.sid];remember('savedPeople',session.savedPeople);await paint();drawDrawer();}
    else if(d.cmd==='compare-toggle') {
      if(session.comparePeople.includes(d.sid))session.comparePeople=session.comparePeople.filter(id=>id!==d.sid);
      else {if(session.comparePeople.length>=4){notify('并排比较最多4人，可以先移除一位。');return;}session.comparePeople.push(d.sid);}
      remember('comparePeople',session.comparePeople);await paint();drawDrawer();
    }
    else if(d.cmd==='compare-clear'){session.comparePeople=[];remember('comparePeople',[]);paint();}
    else if(d.cmd==='compare-open') {if(session.comparePeople.length>=2)openDrawer({type:'compare',metric:'percentile',common:false,context:comparisonContext()});}
    else if(d.cmd==='compare-metric'){drawerState.metric=d.value;drawDrawer();}
    else if(d.cmd==='compare-common'){drawerState.common=!drawerState.common;drawDrawer();}
    else if(d.cmd==='paper')go('papers',{key:d.key,classes:[],question:0,tab:'map',page:1});
    else if(d.cmd==='lens-paper')go('papers',{key:d.key,classes:[Number(d.no)],question:0,tab:'map',page:1});
    else if(d.cmd==='paper-back')go('papers',{key:''});
    else if(d.cmd==='subject-open')go('board',{mode:'subjects',subject:d.subject,exam:d.exam});
    else if(d.cmd==='question'){const key=d.key||books.papers.key,classes=d.no?[Number(d.no)]:d.classes!==undefined?d.classes.split(',').filter(Boolean).map(Number):[...(books.papers.classes||[])];if(current==='papers'&&books.papers.key===key){books.papers.question=Number(d.index);persistBooks();await paint();}openDrawer({type:'question',key,classes,question:Number(d.index),page:1,search:''});}
    else if(d.cmd==='page'){state.page=Math.max(1,(state.page||1)+Number(d.step));persistBooks();await paint();revealResults(stage());}
    else if(d.cmd==='capture')await capture();
    else if(d.cmd==='export')openReport(activeReport);
    else if(d.cmd==='close-report')await closeReport();
    else if(d.cmd==='report-keep')await keepReport();
    else if(d.cmd==='report-return'){if(await finishReport())if(reportOrigin)await restoreStudy(reportOrigin);}
    else if(d.cmd==='report-section'){Object.assign(reportScope,{section:Number(d.index),page:1,search:''});drawReport();}
    else if(d.cmd==='report-page'){reportScope.page=Math.max(1,reportScope.page+Number(d.step));drawReport();revealResults(document.getElementById('report-content'));}
    else if(d.cmd==='report-excel'){const noteSheet=Object.hasOwn(exportReport.sheets,'教师判断')?'本份报告说明':'教师判断';await excel({...exportReport.sheets,[noteSheet]:[['摘录时间','研究来源','教师判断'],[exportReport.created||'',exportReport.studyTitle||exportReport.subtitle||'',exportReport.note||'']]},exportReport.title);}
    else if(d.cmd==='report-word')await word(exportReport);
    else if(d.cmd==='report-print')print(exportReport);
    else if(d.cmd==='svg'||d.cmd==='png')chart(d.id,d.cmd==='png');
    else if(d.cmd==='backup'){archiveStudy();download(JSON.stringify({...atlas.data,plans:session.plans,notebook:session.notebook,savedPeople:session.savedPeople,comparePeople:session.comparePeople,directoryViews:session.directoryViews,research}),'衡迹-完整工作区-'+new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Shanghai'})+'.json','application/json');}
    else if(d.cmd==='template')await template();
    else if(d.cmd==='four-sheets')await excel(fourSheets(),'衡迹-四表分析包');
    else if(d.cmd==='undo'){const dataset=await previous();if(!dataset){notify('没有可撤回的材料替换');return;}revision++;await closeDrawer();await restoreContext(dataset);await installDataset(dataset,{fresh:true});await store();notify(hasMaterials(atlas.data)?'已恢复上一次材料':'已恢复空白工作区');}
    else if(d.cmd==='clear'){revision++;await closeDrawer();archiveStudy();try{await preserveUndo(workspaceSnapshot());}catch{}await installDataset(emptyDataset(),{fresh:true});await store();notify('当前工作区已清空',{label:'撤回材料替换',cmd:'undo'});}
    else if(d.cmd==='follow-add')addFollow(d.sid,d.exam,d.tier);
    else if(d.cmd==='follow-open'){await closeDrawer();go('follow');}
    else if(d.cmd==='follow-remove'){const index=session.plans.findIndex(p=>p.id===d.id),plan=session.plans[index];if(plan){session.plans.splice(index,1);remember('plans',session.plans);await paint();notify('已移除跟进记录',{undo:async()=>{if(!session.plans.some(p=>p.id===plan.id))session.plans.splice(Math.min(index,session.plans.length),0,plan);remember('plans',session.plans);await paint();}});}}
    else if(d.cmd==='follow-status'){const plan=session.plans.find(p=>p.id===d.id);if(plan){plan.status=d.status;remember('plans',session.plans);paint();}}
    else if(d.cmd==='notebook-open')openReport(session.notebook.find(note=>note.id===d.id));
    else if(d.cmd==='notebook-return'){const note=session.notebook.find(note=>note.id===d.id);if(note?.study)await restoreStudy(note.study);}
    else if(d.cmd==='notebook-remove'){const index=session.notebook.findIndex(n=>n.id===d.id),note=session.notebook[index];if(note){session.notebook.splice(index,1);await saveNotebook(session.notebook);await paint();notify('已移除证据摘录',{undo:async()=>{session.notebook.splice(Math.min(index,session.notebook.length),0,note);await saveNotebook(session.notebook);await paint();}});}}
    else if(d.cmd==='notebook-export') {
      if(!session.notebook.length){notify('还没有保存的摘录');return;}
      const sections=session.notebook.flatMap(note=>[...note.sections.map(section=>({...section,title:note.title+' / '+section.title})),{title:note.title+' / 教师判断',headers:['记录'],rows:[[note.note||'']]}]);
      const sheets=Object.fromEntries(session.notebook.flatMap((note,i)=>Object.entries(note.sheets).map(([name,rows])=>[(i+1)+'-'+name,rows])));
      sheets['教师判断']=[['证据标题','摘录时间','研究来源','教师判断'],...session.notebook.map(note=>[note.title,note.created,note.studyTitle||note.subtitle||'',note.note||''])];
      openReport(evidence('衡迹 · 教学证据摘录',atlas.data.school||'',sections,sheets));
    }
    else if(d.cmd==='reload')location.reload();
  }catch(error){notify(error.message);}
}
async function forms(event) {
  const form=event.target;if(!form.dataset.form)return;event.preventDefault();
  const f=new FormData(form),data=atlas.data;
  try {
    if(form.dataset.form==='research-name'){const entry=research.saved.find(e=>e.id===form.dataset.id);if(entry){entry.name=String(f.get('study-name')||entry.title).trim().slice(0,100);persistResearch();researchScope.rename='';drawResearch();notify('已保存线索名字');}return;}
    if(form.dataset.form==='directory-view') {
      const values=directoryViewValues(books.people),name=String(f.get('view-name')||directoryViewName(books.people)).trim().slice(0,80),existing=session.directoryViews.find(v=>JSON.stringify(v.values)===JSON.stringify(values));
      if(existing)existing.name=name;else session.directoryViews.unshift({id:'view-'+Date.now().toString(36),name,values});remember('directoryViews',session.directoryViews);form.reset();await paint();drawDrawer();notify('已保留“'+name+'”');return;
    }
    if(form.dataset.form==='targets')for(const no of atlas.classes)data.profiles[no]={...atlas.profile(no),manuallyConfigured:true,targets:{top:num(f.get('top-'+no)),under:num(f.get('under-'+no))}};
    if(form.dataset.form==='profile') {
      const no=Number(form.dataset.no),profile=atlas.profile(no);
      data.profiles[no]={...profile,manuallyConfigured:true,lead:f.get('lead'),type:f.get('type'),combination:f.get('combination'),foreignLanguage:f.get('foreignLanguage'),track:f.get('track'),cohort:f.get('cohort'),teachers:Object.fromEntries(SUBJECTS.map(s=>[s,f.get('teacher-'+s)||'']))};
      for(const row of [...data.scores,...data.answers])if(Number(row.classNo)===no)row.track=data.profiles[no].track;
    }
    if(form.dataset.form==='lines')for(const track of ['physics','history']) {
      const exam=form.dataset.exam,line={exam,track,top:num(f.get(track+'-总分-top')),under:num(f.get(track+'-总分-under')),subjects:{...(atlas.lines.get(exam+'|'+track)?.subjects||{}),...Object.fromEntries([...new Set(SUBJECTS.map(s=>['英语','日语'].includes(s)?'外语':s))].map(s=>[s,{top:num(f.get(track+'-'+s+'-top')),under:num(f.get(track+'-'+s+'-under'))}]))}};
      const index=data.lines.findIndex(l=>l.exam===exam&&l.track===track);if(index===-1)data.lines.push(line);else data.lines[index]=line;
    }
    if(form.dataset.form==='bank')data.banks[form.dataset.key]=data.banks[form.dataset.key].map((q,i)=>({...q,label:f.get('label-'+i)||q.label,max:num(f.get('max-'+i)),knowledge:f.get('knowledge-'+i)||'',maxNote:num(f.get('max-'+i))===null?'满分待补充':''}));
    if(form.dataset.form==='exams')for(const exam of data.exams){exam.label=f.get('label-'+exam.id)||exam.id;exam.order=num(f.get('order-'+exam.id))??99;exam.scope=f.get('scope-'+exam.id)||'school';}
    if(form.dataset.form==='rules') {
      const low=Math.max(0,Math.min(1,(num(f.get('lowRate'))??50)/100));
      data.rules={criticalWindow:Math.max(1,num(f.get('criticalWindow'))||20),topFraction:Math.max(.05,Math.min(.5,(num(f.get('topFraction'))??27)/100)),lowRate:low,focusRate:Math.max(low,Math.min(1,(num(f.get('focusRate'))??75)/100))};
      books.follow.band=data.rules.criticalWindow;
    }
    atlas=new Atlas(data);await store();ensureBooks();paint();notify('已保存到本机工作区');
  }catch(error){notify(error.message);}
}
export async function mount() {
  const shortcut=document.getElementById('find-shortcut');if(shortcut)shortcut.textContent=/Mac|iPhone|iPad/.test(navigator.platform)?'⌘ K':'Ctrl K';
  inbox=new Inbox(commitMaterial,notify,()=>atlas.data);
  installInteractions({reducedMotion});
  document.addEventListener('click',commands);document.addEventListener('submit',forms);
  const syncOverlays=event=>{const dialog=event.target;if(dialog?.matches?.('dialog')){modalOrder=modalOrder.filter(item=>item!==dialog&&item.open);if(dialog.open)modalOrder.push(dialog);}document.body.classList.toggle('modal-open',Boolean(document.querySelector('dialog[open]')));placeNotification();};
  for(const dialog of document.querySelectorAll('dialog')){dialog.addEventListener('toggle',syncOverlays);dialog.addEventListener('close',syncOverlays);}
  document.getElementById('table-reader').addEventListener('close',()=>document.getElementById('table-reader-content').replaceChildren());
  const drawer=document.getElementById('research-drawer');drawer.addEventListener('cancel',event=>{event.preventDefault();closeDrawer();});drawer.addEventListener('click',event=>{if(event.target!==drawer)return;const bounds=drawer.getBoundingClientRect();if(event.clientX<bounds.left||event.clientX>bounds.right||event.clientY<bounds.top||event.clientY>bounds.bottom)closeDrawer();});
  document.addEventListener('toggle',event=>{if(event.target.matches('.directory-filters')){books.people.filtersOpen=event.target.open;persistBooks();}},true);
  window.addEventListener('resize',positionDock);
  document.addEventListener('scroll',()=>{if(hasMaterials(atlas.data))scheduleResearch();},{passive:true,capture:true});
  window.addEventListener('pagehide',()=>{archiveStudy();if(exportReport?.id)saveNotebook(session.notebook).catch(()=>{});});
  document.getElementById('report-dialog').addEventListener('cancel',async event=>{event.preventDefault();await closeReport();});
  document.addEventListener('keydown',event=>{if(event.target.matches('.student-dot,[data-plot-action]')&&['Enter',' '].includes(event.key)){event.preventDefault();event.target.dispatchEvent(new MouseEvent('click',{bubbles:true}));}});
  document.addEventListener('keydown',event=>{if(!drawer.open||event.altKey||event.ctrlKey||event.metaKey||!['ArrowLeft','ArrowRight'].includes(event.key)||event.target.closest('input,textarea,select,.table-scroll,.drawer-stages,.drawer-tabs'))return;const cmd=drawerState?.type==='person'?'drawer-person-step':drawerState?.type==='question'?'drawer-question-step':null,button=cmd&&drawer.querySelector('[data-cmd="'+cmd+'"][data-step="'+(event.key==='ArrowLeft'?-1:1)+'"]');if(button&&!button.disabled){event.preventDefault();button.click();}});
  document.addEventListener('compositionend',event=>{if(event.target.matches('[data-field],[data-drawer-field],[data-report-search],[data-research-search]'))event.target.dispatchEvent(new Event('input',{bubbles:true}));});
  document.addEventListener('input',event=>{
    const target=event.target;
    if(event.isComposing)return;
    if(target.dataset.field) {
      const scene=current,key=target.dataset.field,position=target.selectionStart,inDrawer=Boolean(target.closest('#research-drawer'));books[scene][key]=target.value;books[scene].page=1;if(scene==='people')books[scene].lens='custom';if(['minScore','maxScore'].includes(key))books[scene].maxExclusive=false;persistBooks();clearTimeout(searchTimer);
      searchTimer=setTimeout(()=>{if(current===scene){if(inDrawer)drawDrawer();paint(false,{key,position,inDrawer});}},130);
    }
    if(target.dataset.drawerField&&drawerState){drawerState[target.dataset.drawerField]=target.value;drawerState.page=1;clearTimeout(drawerTimer);drawerTimer=setTimeout(drawDrawer,130);}
    if(target.dataset.reportSearch&&exportReport){reportScope.search=target.value;reportScope.page=1;clearTimeout(reportTimer);reportTimer=setTimeout(drawReport,130);}
    if(target.dataset.researchSearch){researchScope.search=target.value;clearTimeout(researchSearchTimer);researchSearchTimer=setTimeout(drawResearch,130);}
    if(target.dataset.planNote){const plan=session.plans.find(p=>p.id===target.dataset.planNote);if(plan){plan.note=target.value;remember('plans',session.plans);}}
    if(target.dataset.evidenceNote){const note=session.notebook.find(n=>n.id===target.dataset.evidenceNote);if(note){note.note=target.value;clearTimeout(noteTimer);noteTimer=setTimeout(()=>saveNotebook(session.notebook).catch(()=>notify('请下载备份以保留摘录')),400);}}
    if(target.id==='report-note'&&exportReport){exportReport.note=target.value;if(!exportReport.id&&target.value.trim()){exportReport.id='e'+crypto.randomUUID();exportReport.autoSaved=true;session.notebook.unshift(structuredClone(exportReport));}if(exportReport.id){const note=session.notebook.find(n=>n.id===exportReport.id);if(note){note.note=target.value;showNoteState('saving');clearTimeout(noteTimer);noteTimer=setTimeout(persistReportNote,400);}}else showNoteState('preview');}
  });
  document.addEventListener('keydown',async event=>{if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='k'){event.preventDefault();if(document.getElementById('inbox').open)return;if(!hasMaterials(atlas.data)){notify('导入成绩材料后即可查找学生');return;}if(document.getElementById('report-dialog').open&&!await finishReport())return;await closeDrawer();for(const dialog of document.querySelectorAll('dialog[open]'))if(dialog.id!=='inbox')dialog.close();go('people',{sid:'',...directoryDefaults},true);setTimeout(()=>stage().querySelector('[data-field="search"]')?.focus(),100);}});
  document.addEventListener('dragstart',event=>{const card=event.target.closest('[data-plan]');if(card)event.dataTransfer.setData('text/plain',card.dataset.plan);});
  document.addEventListener('dragover',event=>{if(event.target.closest('.follow-lane'))event.preventDefault();});
  document.addEventListener('dragenter',event=>event.target.closest('.follow-lane')?.classList.add('dragover'));
  document.addEventListener('dragleave',event=>{const lane=event.target.closest('.follow-lane');if(lane&&!lane.contains(event.relatedTarget))lane.classList.remove('dragover');});
  document.addEventListener('drop',event=>{
    const lane=event.target.closest('.follow-lane');if(!lane)return;event.preventDefault();
    const plan=session.plans.find(p=>p.id===event.dataTransfer.getData('text/plain'));if(plan){plan.status=lane.dataset.status;remember('plans',session.plans);paint();}
  });
  window.addEventListener('hashchange',async()=>{archiveStudy();await closeDrawer();readRoute();if(hasMaterials(atlas.data))ensureBooks();persistBooks();paint(true);});
  readRoute();nav();window.dispatchEvent(new Event('hengji:ready'));
  const startRevision=revision;
  await paint();
  try {
    const [materials,notebook]=await Promise.all([hydrate(),loadNotebook().catch(()=>[])]);
    if(startRevision!==revision)return;
    session.notebook=notebook||[];
    if(hasMaterials(materials.dataset)&&!session.plans.length){try{session.plans=(JSON.parse(localStorage.getItem('jianwei:actions'))||[]).map(p=>({...p,status:p.status==='done'?'done':'active'}));}catch{}}
    await installDataset(materials.dataset);if(materials.origin==='migrated')notify('原工作区材料已带入衡迹');
  }catch(error){if(startRevision!==revision)return;await paint();notify('材料尚未载入：'+error.message+'，可直接导入原表。');}
}
