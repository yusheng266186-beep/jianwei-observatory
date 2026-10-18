import {tableReadingPositions,restoreTableReadingPositions,disclosurePositions,restoreDisclosurePositions} from './ui/study-position.js';
import {researchPath,researchHistoryState,researchHistoryStudy} from './engine/research-navigation.js';
import {researchObservationList} from './engine/research-roster.js';
import {syncPracticeFeedbackPlans} from './engine/exercise-feedback.js';
import {recordPageTiming} from './engine/runtime-diagnostics.js';
import {openSurface,closeSurface,prepareBackdrop} from './ui/surface-motion.js?v=runtime-v45';
import {warmReportFonts} from './io/report-fonts.js?v=runtime-v45';
import {warmPDFWorker} from './io/pdf-runtime.js?v=runtime-v45';
import {warmPDFViewer} from './io/pdf-viewer-library.js?v=runtime-v45';
import {installReportReading} from './ui/report-reading.js?v=runtime-v45';
import {selectionFor,fieldsFor,presetSections,selectedReport,transferSelection,teachingFields} from './engine/report-selection.js?v=runtime-v45';
import {installPlanControls} from './ui/plan-controls.js?v=runtime-v45';
import {buildTeachingReport} from './engine/reports.js?v=runtime-v45';
import {fillSavedClassRanks} from './engine/report-ranks.js?v=runtime-v45';
import {reportContext,normalizeReportScope} from './ui/report-context.js?v=runtime-v45';
import {reportSpec} from './ui/report-studio.js?v=runtime-v45';
import {followEditor} from './ui/follow-editor.js?v=runtime-v45';
import {normalizePlan,draftForPlan,questionOptions,snapshotQuestion,materialPeople,validDate,validatePlanReview} from './engine/training.js?v=runtime-v45';
import {questionView,questionEvidence} from './ui/question.js?v=runtime-v45';
import {queryQuestionMap,questionSequence} from './engine/question-map.js?v=runtime-v45';
import {SITE_NAME} from './brand.js?v=runtime-v45';
import {subjectView,knowledgeView,lensEvidence} from './ui/lenses.js?v=runtime-v45';
import {subjectLens,skillLens,questionLens} from './engine/lenses.js?v=runtime-v45';
import {directoryFilterView} from './scenes/directory.js?v=runtime-v45';
import {renderInto} from './ui/render.js?v=runtime-v45';
import {installInteractions,enhance,prepareUpdate,pruneInteractions,shiftTable,openDisclosure} from './ui/interactions.js?v=runtime-v45';
import {readingDefaults,readingView,applyReading} from './ui/reading.js?v=runtime-v45';
import {reportView} from './ui/report.js?v=runtime-v45';
import {reportExams} from './engine/report-scope.js?v=runtime-v45';
import {installNotificationLayout} from './ui/notification-layout.js?v=runtime-v45';
import {welcomeView} from './ui/welcome.js?v=runtime-v45';
import {composeScene} from './ui/composition.js?v=runtime-v45';
import {researchView,studyDescription,studyAvailable,studyKey} from './ui/research.js?v=runtime-v45';
import {Atlas} from './engine/atlas.js?v=runtime-v45';
import {loadScene} from './scenes/load.js?v=runtime-v45';
import {SUBJECTS} from './data/compat.js?v=runtime-v45';
import {access,write,update as updateStored,STORAGE_SCOPE} from './data/storage.js';
import {hydrate,save,saveWorkspace,restoreDataset,hasMaterials,preference,remember,previous,emptyDataset,loadNotebook,saveNotebook} from './data/workspace.js?v=runtime-v45';
import {prepareDataset,prepareMaterial} from './data/preparation.js?v=runtime-v45';
import {remapScopedContext} from './data/identity.js?v=runtime-v45';
import {Inbox} from './data/inbox.js?v=runtime-v45';
import {NoteJournal} from './data/notes.js?v=runtime-v45';
import {installViewportMetrics} from './ui/viewport.js?v=runtime-v45';
import {repairKnowledgeReport} from './engine/knowledge.js?v=runtime-v45';
import {motion,visualFrame,cancelOwnMotion,finishAnimation,enterCanvas,arrangeRows,prepareCanvasSlide,finishCanvasSlide} from './ui/motion.js?v=runtime-v45';
import {esc,button,empty,table} from './ui/html.js?v=runtime-v45';
import {excel,word,pdf,print,download,chart,scoreRows,effectiveRows,subjectRows,answerRows,evidence} from './io/exports.js?v=runtime-v45';
import {directoryDefaults,lensValues,queryDirectory,directoryViewValues,directoryViewName} from './engine/directory.js?v=runtime-v45';
import {peekView,compareView,drawerEvidence} from './ui/explorer.js?v=runtime-v45';
import {dockIcon} from './ui/icons.js?v=runtime-v45';

const routes=[['board','年级总览','▦'],['class','班级研究','▥'],['papers','试卷研究','▧'],['people','学生研究','◎'],['follow','教学跟进','↗'],['library','资料与报告','⊞']];
const defaults={board:{mode:'overview',metric:'underRate',historyMetric:'mean',search:'',page:1},class:{tab:'snapshot',value:'score',trendMetric:'mean',matrix:'total',search:'',page:1,matched:false},papers:{key:'',tab:'map',classes:[],question:0,order:'paper',questionSearch:'',questionFocus:'all',search:'',page:1},people:{sid:'',storyMetric:'total',...directoryDefaults,filtersOpen:innerWidth>760},follow:{tier:'under',band:20,side:'below',classes:[],search:'',page:1},library:{tab:'materials'}};
const saved=preference('books',{}),books=Object.fromEntries(Object.entries(defaults).map(([key,value])=>[key,{...value,...saved[key]}]));
const session={plans:preference('plans',[]).map(normalizePlan),recent:preference('recent',[]),savedPeople:preference('savedPeople',[]),comparePeople:preference('comparePeople',[]),directoryViews:preference('directoryViews',[]),notebook:[]};
const savedResearch=preference('research',{}),research={saved:Array.isArray(savedResearch.saved)?savedResearch.saved:[],recent:Array.isArray(savedResearch.recent)?savedResearch.recent.slice(0,24):[]},researchScope={tab:'saved',search:'',rename:''};
const reading={...readingDefaults,...preference('reading',{})};applyReading(reading);
const noteJournal=new NoteJournal();
if(preference('interfaceRevision','')!=='study-20261011b'){books.board.mode='overview';books.people.lens='all';books.people.view='cards';books.people.filtersOpen=true;remember('interfaceRevision','study-20261011b');}
let atlas=new Atlas(emptyDataset()),current='board',activeReport=null,exportReport=null,reportScope={section:0,page:1,search:''},revision=0,paintId=0,searchTimer,searchPaint,drawerTimer,reportTimer,noteTimer,inbox;
let drawerState=null,drawerClosing=null,drawerMotion=null,drawerContentMotion=null,drawerEpoch=0,observationRequest=0,drawerOpener=null,drawerTrail=[],paintedObject='',paintedScrolls=new Map(),pagePositions=new Map(),scrollResets=new Set(),pendingUndo=null;
let paintedStudy=null,researchTrail=[],researchTimer,researchSearchTimer,closedStudy=null,reportOrigin=null,reportNoteState='preview',reportNoteRevision=0,modalOrder=[];
let navigationScope=preference('navigationScope','')||crypto.randomUUID(),historyRestoring=false,historyTimer,lastHistoryURL='',historyRequest=0;remember('navigationScope',navigationScope);
const reducedMotion=()=>reading.motion==='calm'||matchMedia('(prefers-reduced-motion: reduce)').matches;
const reportJobs=new Set(),sceneViews=new Map();let paintedViewKey='',backgroundGeneration=0;
function viewKey(scene){const context=scene==='people'?[session.savedPeople,session.comparePeople,session.directoryViews]:scene==='follow'?[session.plans,new Date().toDateString()]:scene==='library'?[session.plans,session.notebook.map(n=>[n.id,n.title,n.note])]:[];return JSON.stringify([scene,books[scene],context,researchTrail.at(-1)?studyDescription(atlas,researchTrail.at(-1)).title:'']);}
function invalidateViews(){sceneViews.clear();paintedViewKey='';backgroundGeneration++;}
function retainView(key,view){sceneViews.delete(key);sceneViews.set(key,{view,nodes:null});while(sceneViews.size>8)sceneViews.delete(sceneViews.keys().next().value);return view;}
function warmWorkspace(){
 const generation=++backgroundGeneration,scenes=routes.map(([scene])=>scene).filter(scene=>scene!==current);
 async function next(deadline){
  if(generation!==backgroundGeneration||!hasMaterials(atlas.data)||document.hidden)return;
  if(navigator.scheduling?.isInputPending?.()){schedule(next);return;}
  const scene=scenes.shift();if(!scene)return;
  try{const module=await loadScene(scene);if(generation!==backgroundGeneration)return;const key=viewKey(scene);if(!sceneViews.has(key))retainView(key,module.render(atlas,structuredClone(books[scene]),session));}catch{}
  if(scenes.length)schedule(next);
 }
 function schedule(job){if('requestIdleCallback' in window)requestIdleCallback(job);else setTimeout(job,100);}
 schedule(next);
}
let sceneLoadingTimer;
let materialBusy=false,inMemoryUndo=null,navigationEpoch=0;
const num=value=>value===null||String(value).trim()===''?null:Number.isFinite(Number(value))?Number(value):null;
const converted=value=>value==='true'?true:value==='false'?false:value;
const stage=()=>document.getElementById('stage');
const notificationLayout=installNotificationLayout(document.getElementById('toast'));
function placeNotification(preferredHost=null) {
  const toast=document.getElementById('toast'),focused=document.activeElement?.closest('dialog[open]');
  modalOrder=modalOrder.filter(dialog=>dialog.open);
  const host=preferredHost||focused||modalOrder.at(-1)||document.body;if(toast.parentElement===host){notificationLayout.refresh();return;}
  const shown=Boolean(toast.showPopover)&&toast.matches(':popover-open');if(shown)toast.hidePopover();
  host.append(toast);if(shown)toast.showPopover();notificationLayout.refresh();
}
function notify(message,action={}) {
  placeNotification();
  const toast=document.getElementById('toast');pendingUndo=action.undo||null;
  toast.innerHTML='<span>'+esc(message)+'</span>'+((action.undo||action.cmd)?button(esc(action.label||'撤销'),action.undo?'undo-action':action.cmd,{},'toast-action'):'')+button('×','toast-close',{},'toast-dismiss','aria-label="关闭提示"');
  if(toast.showPopover){if(toast.matches(':popover-open'))toast.hidePopover();toast.showPopover();}
  toast.classList.add('visible');notificationLayout.refresh();clearTimeout(notify.timer);notify.timer=setTimeout(()=>{toast.classList.remove('visible');if(toast.hidePopover&&toast.matches(':popover-open'))toast.hidePopover();pendingUndo=null;},action.undo||action.cmd?9000:4500);
}
const tablePositionKey=el=>paintedObject+'|'+(el.closest('.block')?.querySelector('h2')?.textContent||'')+'|'+(el.closest('.table-frame')?.dataset.tableKey||el.querySelector('table')?.getAttribute('aria-label'));
function closeReader(){return dismissDialog('table-reader');}
function showDialog(dialog){observationRequest++;const opened=openSurface(dialog,{reducedMotion});modalOrder=modalOrder.filter(item=>item!==dialog&&item.open);modalOrder.push(dialog);placeNotification(dialog);Promise.resolve(opened).then(()=>{if(dialog.open&&document.getElementById('toast').parentElement===dialog)notificationLayout.refresh();});return opened;}
function dismissDialog(id){
  if(id==='plan-dialog')planControls?.close();
  if(id==='report-dialog')reportRequest++;
  return closeSurface(document.getElementById(id),{reducedMotion});
}
function sceneObject(scene=current){return hasMaterials(atlas.data)?scene+'|'+(scene==='people'?books.people.sid:scene==='papers'?books.papers.key:scene==='class'?books.class.no:''):'empty';}
function scenePending(serial,scene){
  clearTimeout(sceneLoadingTimer);document.getElementById('scene-status').hidden=true;
  const pending=sceneObject(scene)!==paintedObject;stage().inert=pending;stage().setAttribute('aria-busy',String(pending));
  if(pending)sceneLoadingTimer=setTimeout(()=>{if(serial!==paintId)return;const status=document.getElementById('scene-status');status.textContent='正在打开'+routes.find(r=>r[0]===scene)[1]+'…';status.hidden=false;stage().dataset.loading='true';},180);
}
function sceneReady(serial){if(serial!==paintId)return;clearTimeout(sceneLoadingTimer);document.getElementById('scene-status').hidden=true;stage().inert=false;stage().setAttribute('aria-busy','false');delete stage().dataset.loading;}
function staleStage(target){return Boolean(target.closest('.scene-leaving-viewport'))||stage().contains(target)&&(stage().inert||sceneObject()!==paintedObject);}

function persistBooks(){remember('books',books);}
async function flushSearch(){if(searchTimer){clearTimeout(searchTimer);searchTimer=null;searchPaint=paint();}const pending=searchPaint;if(pending)await pending;if(searchPaint===pending)searchPaint=null;}
function revealResults(root) {
  const target=root.querySelector('.directory-controls,.lens-roster-tools,.roster-bar,.report-query,.table-frame');if(!target)return;
  target.tabIndex=-1;target.focus({preventScroll:true});
  const dialog=root.closest('dialog');
  if(dialog){const scroller=dialog.id==='research-drawer'?drawerScroll():dialog;scroller.scrollTo({top:Math.max(0,scroller.scrollTop+target.getBoundingClientRect().top-scroller.getBoundingClientRect().top-24),behavior:'instant'});}
  else {const head=document.querySelector('.masthead').getBoundingClientRect(),outline=stage().querySelector('.study-outline'),offset=Math.max(head.bottom,outline?.getBoundingClientRect().bottom||0)+18;window.scrollTo({top:Math.max(0,scrollY+target.getBoundingClientRect().top-offset),behavior:'instant'});}
}
function drawerTablePositions(){return tableReadingPositions(document.getElementById('drawer-content'));}
function drawerScroll(){return document.querySelector('#drawer-content>.drawer-body')||document.getElementById('research-drawer');}
function restoreDrawerScroll(top){
  const body=drawerScroll(),epoch=drawerEpoch;body.scrollTop=top;
  // WebKit can reset descendant scrolling after the modal's native focus settles.
  requestAnimationFrame(()=>{if(document.getElementById('research-drawer').open&&drawerEpoch===epoch&&drawerScroll()===body)body.scrollTop=top;});
}
function restoreDrawerPosition(state){restoreDrawerScroll(state.scrollTop||0);restoreTableReadingPositions(document.getElementById('drawer-content'),state.tablePositions);enhance(document.getElementById('drawer-content'));}
function comparisonContext() {
  if(drawerState?.type==='person'||drawerState?.type==='subject')return drawerState.exam||'latest';
  if(['question','knowledge'].includes(drawerState?.type))return drawerState.key.split('|')[1]||'latest';
  if(drawerState?.type==='compare')return drawerState.context||'latest';
  if(current==='people')return books.people.sid?(atlas.materialAt(books.people.sid,books.people.exam)?.exam||'latest'):books.people.directoryExam||'latest';
  if(current==='papers')return books.papers.key.split('|')[1]||'latest';
  return books[current].exam||'latest';
}
function persistResearch(){remember('research',research);}
function compactDrawer(state){if(!state||!['person','question','compare','subject','knowledge'].includes(state.type))return null;if(state.type==='question')return structuredClone(state);const {queue,cursor,queueLabel,...rest}=state;return structuredClone(rest);}
function studyNow() {
  if(!paintedStudy||!hasMaterials(atlas.data))return null;
  const study=structuredClone(paintedStudy),nodes=[...stage().querySelectorAll('[data-study-section]')],section=nodes.filter(node=>node.getBoundingClientRect().top<=140).at(-1);
  study.position={top:window.scrollY,section:section?.id||'',offset:section?.getBoundingClientRect().top||0,details:disclosurePositions(stage()),tables:tableReadingPositions(stage())};
  if(document.getElementById('research-drawer').open){study.drawer=compactDrawer(drawerState);study.trail=drawerTrail.map(compactDrawer).filter(Boolean).slice(-6);study.drawerTop=drawerScroll().scrollTop;study.drawerTables=drawerTablePositions();study.drawerDetails=disclosurePositions(document.getElementById('drawer-content'));study.comparePeople=[...session.comparePeople];}
  return study;
}
function archiveStudy(study=studyNow()) {
  if(!study)return;
  const key=studyKey(study),old=research.recent.find(entry=>studyKey(entry)===key),{title,scope}=studyDescription(atlas,study),entry={...study,title,scope,id:old?.id||'r-'+crypto.randomUUID(),updated:new Date().toISOString()};
  research.recent=[entry,...research.recent.filter(e=>e.id!==entry.id)].slice(0,24);persistResearch();
}
function checkpointNavigation(study=studyNow()) {
  if(historyRestoring||!study||researchPath(study.scene,study.values)!==location.hash)return;
  try{history.replaceState(researchHistoryState(history.state,{scope:navigationScope,hash:location.hash,study,trail:researchTrail}),'',location.href);}catch{/* Browser history quotas must not interrupt research or local saves. */}
}
function scheduleResearch(){clearTimeout(researchTimer);researchTimer=setTimeout(()=>archiveStudy(),500);clearTimeout(historyTimer);historyTimer=setTimeout(checkpointNavigation,120);}
function leaveStudy() {
  const samePage=closedStudy&&closedStudy.study.scene===current&&studyKey({scene:current,values:books[current]})===studyKey({scene:closedStudy.study.scene,values:closedStudy.study.values});
  const study=samePage&&Date.now()-closedStudy.closedAt<1500?closedStudy.study:studyNow();closedStudy=null;
  if(study){checkpointNavigation(study);archiveStudy(study);researchTrail.push(study);researchTrail=researchTrail.slice(-10);}return study;
}
function drawResearch(){const content=document.getElementById('research-content');prepareUpdate();renderInto(content,researchView(atlas,research,researchScope,studyNow()));enhance(content);}
function openResearch(){if(!hasMaterials(atlas.data))return;archiveStudy();researchScope.rename='';drawResearch();const dialog=document.getElementById('research-dialog');showDialog(dialog);dialog.scrollTop=0;}
function pinStudy(study=studyNow()) {
  if(!study)return;
  const key=studyKey(study),existing=research.saved.find(entry=>studyKey(entry)===key),description=studyDescription(atlas,study),entry={...study,title:description.title,scope:description.scope,id:existing?.id||'s-'+crypto.randomUUID(),name:existing?.name||description.title,updated:new Date().toISOString()};
  research.saved=[entry,...research.saved.filter(e=>e.id!==entry.id)];persistResearch();
  if(document.getElementById('research-dialog').open){researchScope.tab='saved';researchScope.search='';researchScope.rename=entry.id;drawResearch();document.querySelector('#research-content [name="study-name"]')?.focus({preventScroll:true});}
  else notify('已留在研究夹',{label:'查看线索',cmd:'research'});
}
async function restoreStudy(study,{returning=false,fromHistory=false,trail=[]}={}) {
  if(!hasMaterials(atlas.data)||!studyAvailable(atlas,study)){notify('对应班级、考次、学生或试题尚未导入，保留这条线索，补齐材料后再打开。');return;}
  const navigation=++navigationEpoch;
  if(!fromHistory){historyRequest++;historyRestoring=false;checkpointNavigation();}
  const present=studyNow();if(!returning&&(!present||studyKey(present)!==studyKey(study)))leaveStudy();else archiveStudy();
  if(!await closeDrawer()||navigation!==navigationEpoch)return;closedStudy=null;await closeReader();
  for(const id of ['research-dialog','report-dialog']){const dialog=document.getElementById(id);if(dialog.open)await dismissDialog(id);}
  if(navigation!==navigationEpoch)return;
  current=study.scene;books[current]={...structuredClone(defaults[current]),...structuredClone(study.values)};persistBooks();
  if(fromHistory){researchTrail=structuredClone(trail);scrollResets.delete(sceneObject());}else history.pushState(null,'',path());
  const render=paintId+1;await paint(true);if(navigation!==navigationEpoch||paintId!==render||current!==study.scene)return;
  restoreDisclosurePositions(stage(),study.position?.details);restoreTableReadingPositions(stage(),study.position?.tables);
  const section=study.position?.section&&document.getElementById(study.position.section),top=section?window.scrollY+section.getBoundingClientRect().top-(study.position.offset||0):study.position?.top||0;window.scrollTo({top:Math.max(0,top),behavior:'instant'});
  if(study.drawer){if(study.comparePeople&&(study.drawer.type==='compare'||study.trail?.some(d=>d.type==='compare'))){session.comparePeople=[...study.comparePeople];remember('comparePeople',session.comparePeople);}
    drawerState=study.trail?.at(-1)||null;const restored=structuredClone(study.drawer);if(restored.type==='person')Object.assign(restored,personQueue(restored.sid,restored.exam));drawerState=null;openDrawer(restored,{focusTitle:false});drawerTrail=structuredClone(study.trail||[]);drawDrawer();restoreDrawerScroll(study.drawerTop||0);
    restoreDisclosurePositions(document.getElementById('drawer-content'),study.drawerDetails);restoreTableReadingPositions(document.getElementById('drawer-content'),study.drawerTables);
  }
  enhance(stage());checkpointNavigation();scheduleResearch();
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
  return researchPath(scene,books[scene]);
}
function readRoute() {
  try {
    const [name,object,focus]=location.hash.slice(1).split('/').map(decodeURIComponent);
    current=routes.some(r=>r[0]===name)?name:'board';
    if(!name)books.board.mode='overview';
    if(current==='class'&&object){books.class.no=Number(object);if(['snapshot','history','targets'].includes(focus))books.class.tab=focus;}
    if(current==='papers')books.papers.key=object||'';
    if(current==='people'){books.people.sid=object||'';if(focus)books.people.exam=focus;}
  }catch{current='board';}
}
async function restoreNavigationEntry() {
  const request=++historyRequest,saved=researchHistoryStudy(history.state,{scope:navigationScope,hash:location.hash});
  historyRestoring=true;clearTimeout(historyTimer);clearTimeout(searchTimer);searchTimer=null;searchPaint=null;clearTimeout(drawerTimer);
  try{
    if(saved&&hasMaterials(atlas.data)&&studyAvailable(atlas,saved.study))await restoreStudy(saved.study,{returning:true,fromHistory:true,trail:saved.trail.filter(entry=>studyAvailable(atlas,entry))});
    else {
      const navigation=++navigationEpoch;archiveStudy();if(!await closeDrawer()||navigation!==navigationEpoch)return;
      researchTrail=[];closedStudy=null;readRoute();if(hasMaterials(atlas.data))ensureBooks();persistBooks();await paint(true);
    }
  }finally{if(request===historyRequest){historyRestoring=false;checkpointNavigation();}}
}
function go(scene,values={},resetScroll=false,{root=false,recordTrail=true}={}) {
  if(scene===current&&!root&&!resetScroll&&!Object.keys(values).length&&sceneObject()===paintedObject&&stage().dataset.scene===scene)return;
  navigationEpoch++;clearTimeout(searchTimer);searchTimer=null;searchPaint=null;
  const before=studyNow(),nextValues={...books[scene],...values};
  checkpointNavigation(before);historyRequest++;historyRestoring=false;
  if(root){archiveStudy(before);researchTrail=[];closedStudy=null;}
  else if(!recordTrail){archiveStudy(before);closedStudy=null;}
  else if(before&&(before.scene!==scene||studyKey({...before,values:nextValues,drawer:null})!==studyKey({...before,drawer:null})))leaveStudy();
  const object=scene+'|'+(scene==='people'?nextValues.sid:scene==='papers'?nextValues.key:scene==='class'?nextValues.no:'');
  closeReader();if(resetScroll||scene!==current||object!==sceneObject(scene)){pagePositions.delete(object);scrollResets.add(object);}
  Object.assign(books[scene],values);current=scene;persistBooks();
  const next=path(scene);if(location.hash!==next)history.pushState(null,'',next);paint(true);
}
function warmScene(scene){if(hasMaterials(atlas.data)){loadScene(scene).catch(()=>{});if(scene==='follow')exerciseModule().catch(()=>{});}}
function prepareReports(){warmReportFonts().catch(()=>{});warmPDFWorker();warmPDFViewer().catch(()=>{});}
function openEntry(scene){
  const values={board:{mode:'overview',search:'',page:1},class:{tab:'snapshot',search:'',page:1},papers:{key:'',shelfExam:atlas.latest,shelfSubject:'all'},people:{sid:'',...directoryDefaults},library:{tab:'materials'}}[scene]||{};
  go(scene,values,true,{root:true});
}
function nav() {
  const dock=document.getElementById('navigation');
  if(!dock.children.length)dock.innerHTML='<span class="dock-indicator" aria-hidden="true"></span>'+routes.map(([id,label])=>'<button data-cmd="nav" data-scene="'+id+'"><span class="dock-symbol">'+dockIcon(id)+'</span><span>'+label+'</span><i></i></button>').join('');
  for(const b of dock.querySelectorAll('button'))if(b.dataset.scene===current)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');
  requestAnimationFrame(positionDock);
  document.title=SITE_NAME+' · '+(routes.find(r=>r[0]===current)?.[1]||'成绩研究');
  const state=books[current],breadcrumb=document.getElementById('workspace-location');
  const available=hasMaterials(atlas.data);
  document.body.dataset.workspace=available?'ready':'empty';
  document.querySelector('.masthead [data-cmd="find"]').hidden=!available;
  document.querySelector('.masthead [data-cmd="research"]').hidden=!available;
  breadcrumb.textContent=(routes.find(r=>r[0]===current)?.[1]||'研究台')+(available?(current==='class'?' / '+(state.no||'')+'班':current==='papers'&&state.key?' / '+state.key.split('|').join(' · '):current==='people'&&state.sid?' / '+atlas.name(state.sid):''):'');
}
function positionDock(){const dock=document.getElementById('navigation'),selected=dock.querySelector('[aria-current="page"]');if(selected){dock.style.setProperty('--dock-x',selected.offsetLeft+'px');dock.style.setProperty('--dock-w',selected.offsetWidth+'px');}}
async function paint(transition=false,focus=null) {
  const started=performance.now(),serial=++paintId,scene=current;nav();scenePending(serial,scene);
  try {
    const available=hasMaterials(atlas.data);let view,key='';
    if(!available)view=welcomeView();
    else {
      const module=await loadScene(scene);if(serial!==paintId)return;
      if(sceneObject(scene)!==paintedObject&&!stage().dataset.sliding&&!reducedMotion())await foregroundFrame();if(serial!==paintId)return;
      key=viewKey(scene);
      if(key===paintedViewKey&&sceneObject(scene)===paintedObject&&!focus){
        if(scene==='library'&&books.library.tab==='exercises')mountExerciseCenter();sceneReady(serial);recordPageTiming(scene,performance.now()-started,{cached:true});const object=sceneObject(scene);
        if(scrollResets.has(object)){window.scrollTo({top:0,behavior:'instant'});scrollResets.delete(object);}
        return;
      }
      view=sceneViews.get(key)?.view||retainView(key,scene==='class'&&!atlas.classes.length?{html:empty('先带入一个班的材料','从导入原表开始建立班级画布。')+button('导入材料','import',{},'accent'),report:null}:module.render(atlas,structuredClone(books[scene]),session));
    }
    const entry=sceneViews.get(key),html=available?(entry.html||=composeScene(view.html,{back:researchTrail.at(-1)?studyDescription(atlas,researchTrail.at(-1)).title:''})):view.html;
    const object=sceneObject(scene),changed=object!==paintedObject,previousScroll=window.scrollY;
    const oldScene=stage().dataset.scene,direction=oldScene===scene?'focus':routes.findIndex(r=>r[0]===scene)>routes.findIndex(r=>r[0]===oldScene)?'forward':'backward';
    document.documentElement.dataset.transitionDirection=direction;
    const positions=new Map((changed?[]:[...stage().querySelectorAll('[data-motion-key]')]).map(el=>[el,el.getBoundingClientRect()]));
    const focused=document.activeElement?.closest('[data-cmd]'),focusedData=focused&&stage().contains(focused)?{...focused.dataset}:null;
    for(const el of stage().querySelectorAll('.table-scroll'))paintedScrolls.set(tablePositionKey(el),el.scrollLeft);
    if(changed&&paintedObject)pagePositions.set(paintedObject,previousScroll);
    const apply=()=>{
      if(serial!==paintId)return;
      activeReport=()=>view.report;sceneReady(serial);
      prepareUpdate({replacing:changed});
      const slide=available&&transition&&oldScene&&oldScene!==scene&&!reducedMotion()?prepareCanvasSlide(stage(),direction,{onCleanup:pruneInteractions}):null;
      if(!slide)finishCanvasSlide();
      if(!changed)for(const el of stage().querySelectorAll('[data-motion-key]'))cancelOwnMotion(el);
      if(changed&&!slide&&paintedViewKey&&sceneViews.has(paintedViewKey)){const fragment=document.createDocumentFragment();for(const node of [...stage().childNodes])fragment.append(node);sceneViews.get(paintedViewKey).nodes=fragment;}
      const retained=changed&&sceneViews.get(key)?.nodes;
      if(retained){stage().replaceChildren(retained);sceneViews.get(key).nodes=null;}
      else if(changed&&entry){if(!entry.template){const template=document.createElement('template');template.innerHTML=html;entry.template=template.content;}stage().replaceChildren(entry.template.cloneNode(true));}
      else renderInto(stage(),html,{replace:changed});
      paintedViewKey=key;stage().dataset.scene=scene;stage().dataset.animate=!changed&&transition&&!reducedMotion()?'true':'false';paintedObject=object;
      if(focus){const root=focus.inDrawer?document.getElementById('drawer-content'):stage(),input=root.querySelector('[data-field="'+focus.key+'"]');input?.focus({preventScroll:true});if(input&&input.type!=='number')try{input.setSelectionRange(focus.position,focus.position);}catch{}}
      else if(focusedData&&!changed){const next=[...stage().querySelectorAll('[data-cmd]')].find(el=>Object.entries(focusedData).every(([k,v])=>el.dataset[k]===v));next?.focus({preventScroll:true});}
      for(const el of stage().querySelectorAll('.table-scroll'))el.scrollLeft=paintedScrolls.get(tablePositionKey(el))||0;
      for(const rail of stage().querySelectorAll('.exam-rail')){const selected=rail.querySelector('.selected');if(selected)rail.scrollLeft=selected.offsetLeft-rail.offsetLeft-rail.clientWidth/2+selected.clientWidth/2;}
      enhance(stage(),{reveal:!slide});
      if(changed||scrollResets.has(object))window.scrollTo({top:scrollResets.has(object)?0:pagePositions.get(object)||0,behavior:'instant'});else window.scrollTo({top:previousScroll,behavior:'instant'});scrollResets.delete(object);
      paintedStudy=available?{scene,values:structuredClone(books[scene])}:null;checkpointNavigation();scheduleResearch();
      if(!reducedMotion()) {
        if(slide)slide();
        else if(changed)enterCanvas(stage(),direction);
        else arrangeRows(stage(),positions);
      }
    };
    apply();if(serial===paintId)recordPageTiming(scene,performance.now()-started);if(scene==='library'&&books.library.tab==='exercises')mountExerciseCenter();
  }catch(error){if(serial!==paintId)return;recordPageTiming(scene,performance.now()-started,{failed:true});finishCanvasSlide();sceneReady(serial);stage().dataset.scene=scene;paintedObject=sceneObject(scene);stage().innerHTML=empty('这张研究画布暂时没有打开',error.message)+button('重新打开','reload',{},'outline')+button('导入材料','import',{},'accent');activeReport=null;}
}
function update(key,value,toggle=false) {
  if(current==='library'&&key==='tab'&&value==='reports')prepareReports();
  archiveStudy();
  const state=books[current];value=converted(value);
  if(['classes','profileNo','band','question','pageSize','planClass'].includes(key)&&value!=='all')value=Number(value);
  if(value==='all'&&key==='classes')value=[];
  if(toggle) {
    const before=Array.isArray(state[key])?state[key]:key==='exams'?atlas.classExams(state.no).map(e=>e.id):[];
    value=before.includes(value)?before.filter(v=>v!==value):[...before,value];
    if(key==='exams'&&!value.length){notify('请保留至少一个考次');return;}
  }
  const openingLibraryCollection=current==='library'&&key==='tab'&&['exercises','notebook'].includes(value)&&state.tab!==value;
  state[key]=value;state.page=1;if(key.startsWith('notebook')&&key!=='notebookLimit')state.notebookLimit=24;if(openingLibraryCollection)scrollResets.add(sceneObject('library'));
  if(current==='people'&&['standing','scoreStatus','trend','records','focusSubject','focusStatus','savedOnly'].includes(key))state.lens='custom';
  if(current==='people'&&key==='track')state.classes=[];
  if(current==='papers'&&key==='classes')state.question=0;
  if(current==='class'&&key==='tab')history.replaceState(null,'',path());
  persistBooks();paint(['tab','mode','view','exam','directoryExam','key'].includes(key)).then(()=>{if(drawerState?.type==='filters')drawDrawer();});
}
async function installDataset(dataset,{fresh=false,prepared=false,index=null}={}) {
  invalidateViews();
  if(fresh){navigationScope=crypto.randomUUID();remember('navigationScope',navigationScope);}historyRequest++;historyRestoring=false;clearTimeout(historyTimer);
  navigationEpoch++;
  const planDialog=document.getElementById('plan-dialog');if(planDialog?.open){await dismissDialog('plan-dialog');planDraft=null;}
  await closeDrawer();const shelf=document.getElementById('research-dialog');if(shelf.open)await dismissDialog('research-dialog');
  clearTimeout(researchTimer);paintedStudy=null;closedStudy=null;researchTrail=[];
  performance.mark('workspace-index-start');atlas=new Atlas(prepared?dataset:restoreDataset(dataset),{prepared:true,index});performance.measure('workspace-index','workspace-index-start');const available=hasMaterials(atlas.data);
  if(atlas.data.identityScopes){
   session.plans=remapScopedContext(session.plans,atlas.data).map(normalizePlan);session.notebook=remapScopedContext(session.notebook,atlas.data);
   session.directoryViews=remapScopedContext(session.directoryViews,atlas.data);
   for(const key of ['plans','directoryViews'])remember(key,session[key]);
   const draft=preference('followDraft',null);if(draft)remember('followDraft',remapScopedContext(draft,atlas.data));
   Object.assign(books.people,remapScopedContext(books.people,atlas.data));
   Object.assign(research,remapScopedContext(research,atlas.data));
  }
  if(available)ensureBooks();
  if(fresh&&available){books.board.exam=atlas.latest;books.follow.exam=atlas.latest;books.class.exam=atlas.classExams(books.class.no).at(-1)?.id||atlas.latest;books.class.exams=atlas.classExams(books.class.no).map(e=>e.id);books.papers.key='';books.people.exam=atlas.materialAt(books.people.sid)?.exam;}
  if(!available){await closeDrawer();await closeReader();for(const id of ['report-dialog','research-dialog']){const dialog=document.getElementById(id);if(dialog.open)await dismissDialog(id);}exportReport=null;document.getElementById('report-content').replaceChildren();document.getElementById('research-content').replaceChildren();}
  document.getElementById('work-status').textContent=available?'本机教学资料':'等待导入材料';
  persistBooks();const savedNavigation=!fresh&&researchHistoryStudy(history.state,{scope:navigationScope,hash:location.hash});
  if(available&&savedNavigation&&studyAvailable(atlas,savedNavigation.study))await restoreNavigationEntry();else await paint(true);
  if(available)warmWorkspace();
}
async function store() {try{await save(workspaceSnapshot(),{prepared:true});return true;}catch{notify('修改已保留在当前页面，本机未保存，请下载完整备份。');return false;}}
function workspaceSnapshot(){return structuredClone({...atlas.data,plans:session.plans,notebook:session.notebook,savedPeople:session.savedPeople,comparePeople:session.comparePeople,directoryViews:session.directoryViews,research});}
function recordNoteDraft(note){if(!noteJournal.record(note))notify('判断仍在当前页面，本机草稿未保存，请下载材料保留记录。');}
function evidenceSaveState(note,value,error=false){for(const button of stage().querySelectorAll('[data-cmd=notebook-retry]'))if(button.dataset.id===note.id)button.hidden=!error;const count=stage().querySelector('[data-notebook-written]');if(count)count.textContent=session.notebook.filter(n=>n.note?.trim()).length+'份已有教师判断';for(const node of stage().querySelectorAll('[data-evidence-save]'))if(node.dataset.evidenceSave===note.id){node.textContent=value;node.dataset.state=error?'error':value==='已保存到本机'?'saved':'saving';}}
async function persistNotebook(){const snapshot=structuredClone(session.notebook),generation=revision;try{await saveNotebook(snapshot);if(generation===revision){noteJournal.persisted(snapshot);for(const saved of snapshot){const current=session.notebook.find(n=>n.id===saved.id);if(current&&current.note===saved.note)evidenceSaveState(current,'已保存到本机');}}}catch(error){if(generation===revision)for(const saved of snapshot){const current=session.notebook.find(n=>n.id===saved.id);if(current&&current.note===saved.note)evidenceSaveState(current,'本机保存未完成，可重试或下载备份',true);}throw error;}}
async function restoreContext(incoming) {
  if(incoming.plans||incoming.actions)session.plans=(incoming.plans||incoming.actions).map(normalizePlan);
  else session.plans=session.plans.filter(p=>incoming.students.some(person=>person.id===p.sid));
  remember('plans',session.plans);
  for(const key of ['savedPeople','comparePeople','directoryViews'])if(Array.isArray(incoming[key])){session[key]=structuredClone(incoming[key]);remember(key,session[key]);}
  if(incoming.research){research.saved=structuredClone(Array.isArray(incoming.research.saved)?incoming.research.saved:[]);research.recent=structuredClone(Array.isArray(incoming.research.recent)?incoming.research.recent.slice(0,24):[]);persistResearch();}
  if(Array.isArray(incoming.notebook))session.notebook=structuredClone(incoming.notebook);
  if(Array.isArray(incoming.exerciseSavedSetups)){const {mergeExerciseSetupArchive}=await import('./engine/exercise-setups.js');await updateStored('exerciseSavedSetups',previous=>mergeExerciseSetupArchive(previous,incoming.exerciseSavedSetups));}
  if(Array.isArray(incoming.exercises)){const previous=await access('exercises')||[],byId=new Map(previous.map(r=>[r.id,r]));for(const record of incoming.exercises)if(record?.id&&record.sid)byId.set(record.id,structuredClone(record));if(exerciseStudioTask)await(await exerciseStudioTask).reset();await write([['exercises',[...byId.values()]]]);remember('exercisePending',[...byId.values()].some(r=>['submitting','unconfirmed','queued','running'].includes(r.status)||Object.values(r.imageJobs||{}).some(j=>['submitting','unconfirmed','queued','running'].includes(j.status))));}
}
async function changeMaterials(operation) {
  if(materialBusy)throw new Error('当前材料仍在更新，请完成后再操作');
  materialBusy=true;revision++;try{return await operation();}finally{materialBusy=false;}
}
async function applyMaterials(dataset,before,message,{undo=true,prepared=false,index=null}={}) {
  if(!prepared)dataset=await prepareDataset(dataset);
  await closeDrawer();inMemoryUndo=before;
  let stored=false;
  try{await saveWorkspace(dataset,before,Array.isArray(dataset.notebook)?dataset.notebook:session.notebook,{prepared:true});stored=true;}catch{}
  await restoreContext(dataset);
  if(stored)noteJournal.reset(session.notebook);
  await installDataset(dataset,{fresh:true,prepared:true,index});
  notify(stored?message+'，已保存到本机':message+'，本机未保存，请下载完整备份。',undo?{label:'撤回材料更新',cmd:'undo'}:{});
}
async function commitMaterial(incoming,mode) {
  return changeMaterials(async()=>{
    if(atlas.data.anonymous&&!incoming.anonymous&&!incoming.scores.length)throw new Error('请先导入真实姓名的成绩原表，再补充这份小题。');
    archiveStudy();const before=workspaceSnapshot(),{dataset,index}=await prepareMaterial(before,incoming,mode);
    await applyMaterials(dataset,before,'材料已加入工作区',{prepared:true,index});
  });
}
let reportRequest=0;
const foregroundFrame=()=>new Promise(resolve=>{if(document.hidden){setTimeout(resolve,0);return;}requestAnimationFrame(()=>setTimeout(resolve,0));});
function sameReport(a,b){return a.title===b.title&&a.subtitle===b.subtitle&&JSON.stringify(a.sections)===JSON.stringify(b.sections)&&JSON.stringify(a.sheets)===JSON.stringify(b.sheets);}
function refreshSavedReport(report){
 report=fillSavedClassRanks(repairKnowledgeReport(report),atlas);
 if(!report?.spec||!['class','subject','student'].includes(report.kind)||report.rankingVersion==='source-scopes-v2')return report;
 try{const refreshed=teachingReport(report.spec);refreshed.outputSelection=transferSelection(report,refreshed);return {...report,...refreshed,id:report.id,created:report.created||refreshed.created,note:report.note||'',study:report.study,studyTitle:report.studyTitle};}catch{return report;}
}
async function openReport(report,{fresh=false}={}) {
  const request=++reportRequest;
  if(typeof report==='function'){
    const dialog=document.getElementById('report-dialog');
    document.getElementById('report-content').innerHTML='<div class="surface-loading" role="status"><span class="overline">整理打印材料</span><h2 id="report-dialog-title">正在准备这次观察的报告</h2><p>仅在打开报告时整理完整记录。</p>'+button('关闭 ×','close-report',{},'outline')+'</div>';
    if(exportReport?.id)persistNotebook().catch(()=>{});clearTimeout(noteTimer);
    exportReport=null;reportNoteState='preview';reportScope.reading=false;const opening=showDialog(dialog);await foregroundFrame();await opening;
    if(request!==reportRequest||!dialog.open||dialog.dataset.surfacePhase==='leaving')return false;
    try{report=report();}catch(error){notify('报告暂时未能整理：'+error.message);await dismissDialog('report-dialog');return false;}
    if(request!==reportRequest)return false;
  }
  if(!report){notify('先打开一个班级、学生或试卷，再摘录研究结果。');if(document.getElementById('report-dialog').open)await dismissDialog('report-dialog');return false;}
  report=refreshSavedReport(report);
  if(!report.id&&!fresh)report=session.notebook.find(note=>note.autoSaved&&sameReport(note,report))||report;
  if(exportReport?.id)persistNotebook().catch(()=>{});reportNoteRevision++;
  clearTimeout(noteTimer);exportReport=structuredClone(report);reportOrigin=report.id?(report.study||null):studyNow();
  if(reportOrigin&&!exportReport.study){exportReport.study=structuredClone(reportOrigin);exportReport.studyTitle=studyDescription(atlas,reportOrigin).title;}
  reportNoteState=report.id?'saved':'preview';reportScope={section:0,page:1,search:'',preview:'paper',settingsOpen:false,reading:false,paperWidth:'fit',paperZoom:100,pdfPage:1};drawReport({reset:true});
  const dialog=document.getElementById('report-dialog');showDialog(dialog);dialog.scrollTop=0;reportReader?.sync(reportScope,exportReport,{top:0,left:0,end:false,page:1,ratio:0});enhance(dialog);
}
function drawReport({reset=false}={}){const snapshot=reset?{top:0,left:0,end:false,page:1,ratio:0,reset:true}:reportReader?.snapshot();prepareUpdate({replacing:true});const content=document.getElementById('report-content');renderInto(content,reportView(exportReport,reportScope,{context:reportContext(atlas,exportReport,reportScope),jobs:reportJobs,noteState:reportNoteState,availableKinds:['class','subject','student','follow'].filter(kind=>kind==='follow'||reportExams(atlas,kind).length),canReturn:Boolean(reportOrigin&&studyAvailable(atlas,reportOrigin))}));reportReader?.sync(reportScope,exportReport,snapshot);enhance(content);notificationLayout.refresh();}
let reportSettingsIntent=null;
async function toggleReportSettings(){
 const wanted=reportScope.reading?true:!(reportSettingsIntent?.wanted??reportScope.settingsOpen),intent={wanted,report:exportReport};reportSettingsIntent=intent;
 const panel=document.getElementById('report-settings');
 if(wanted){
  const wasOpen=Boolean(reportScope.settingsOpen);reportScope.settingsOpen=true;reportScope.reading=false;drawReport();
  openSurface(document.getElementById('report-settings'),{isOpen:()=>wasOpen,show:()=>{},reducedMotion,from:{opacity:.12,transform:'translateX('+ (innerWidth<=1000?18:-18)+'px)'}});
 }else if(panel){
  await closeSurface(panel,{isOpen:()=>Boolean(reportScope.settingsOpen),reducedMotion,hide:()=>{if(reportSettingsIntent!==intent||exportReport!==intent.report)return;reportScope.settingsOpen=false;drawReport();}});
 }
 if(reportSettingsIntent===intent)reportSettingsIntent=null;
 document.querySelector('.report-head-actions [data-cmd=report-settings]')?.focus({preventScroll:true});
}
function updateReportSelection(change,{render=true}={}){
 if(!exportReport)return;const selection=selectionFor(exportReport);change(selection);exportReport.outputSelection=selection;
 if(exportReport.id){const note=session.notebook.find(n=>n.id===exportReport.id);if(note){note.outputSelection=structuredClone(selection);recordNoteDraft(note);showNoteState('saving');clearTimeout(noteTimer);noteTimer=setTimeout(persistReportNote,400);}}
 clearTimeout(reportTimer);if(render)drawReport();else {reportReader?.invalidate(exportReport);reportTimer=setTimeout(drawReport,160);}
}
function reportSnapshot(){
 // Commit the visible inputs too: export must include a just-typed value even
 // during IME composition or before the debounced preview has repainted.
 const selection=selectionFor(exportReport),root=document.getElementById('report-content');
 for(const input of root.querySelectorAll('[data-report-output-filter]'))selection.filters[Number(input.dataset.reportOutputFilter)]=input.value;
 const search=root.querySelector('[data-report-search]');if(search)selection.filters[reportScope.section]=search.value;
 const title=root.querySelector('[data-report-output-title]'),note=root.querySelector('#report-note');if(title)selection.title=title.value;if(note)exportReport.note=note.value;
 clearTimeout(reportTimer);exportReport.outputSelection=selection;
 if(exportReport.id){const saved=session.notebook.find(n=>n.id===exportReport.id);if(saved){saved.outputSelection=structuredClone(selection);saved.note=exportReport.note;recordNoteDraft(saved);}}
 return structuredClone(selectedReport(exportReport));
}
function changeReportScope(key,value){
 if(!exportReport?.spec)return;reportSnapshot();const previous=exportReport,spec=normalizeReportScope(atlas,previous.spec,{[key]:converted(value)}),next=teachingReport(spec);
 if(previous.id)persistNotebook().catch(()=>{});
 next.outputSelection=transferSelection(previous,next);next.note=previous.note||'';next.study=previous.study;next.studyTitle=previous.studyTitle;
 exportReport=next;reportNoteRevision++;clearTimeout(noteTimer);reportNoteState='preview';
 Object.assign(reportScope,{section:0,page:1,search:'',preview:'paper',personSearch:key==='sid'?reportScope.personSearch:''});drawReport({reset:true});
}
function teachingReport(spec){const raw=Boolean(spec.includeRaw),report=buildTeachingReport(atlas,{...spec,includeRaw:['class','subject'].includes(spec.kind)?true:spec.includeRaw},session.plans);report.spec.includeRaw=raw;if(!raw&&['class','subject','student'].includes(spec.kind))report.outputSelection={...selectionFor(report),selected:presetSections(report,'teaching'),fields:teachingFields(report)};return report;}
function showNoteState(state){reportNoteState=state;const el=document.getElementById('report-note-state');if(el){el.dataset.state=state;el.textContent={preview:'组合可保存到摘录；教师判断会自动留存',saving:'正在保存判断…',saved:'已保存到本机摘录',error:'本机保存未完成 · 请下载材料保留判断'}[state];}if(exportReport?.id){const label=document.querySelector('#report-content .inbox-top .overline');if(label)label.textContent=state==='saved'?'教学证据 / 已摘录':'教学证据 / 正在留存';const keep=document.querySelector('#report-content [data-cmd="report-keep"]');if(keep)keep.textContent='保存组合修改';}}
async function persistReportNote() {
  if(!exportReport?.id){showNoteState('preview');return;}
  const note=session.notebook.find(n=>n.id===exportReport.id);if(!note)return;
  const serial=++reportNoteRevision,id=exportReport.id;note.note=exportReport.note||'';showNoteState('saving');
  try{await persistNotebook();if(serial===reportNoteRevision&&exportReport?.id===id)showNoteState('saved');}
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
  const report=exportReport;if(!await finishReport()||report!==exportReport)return;
  await dismissDialog('report-dialog');
  if(current==='library'&&books.library.tab==='notebook')await paint();
}
async function capture(source=activeReport) {
  if(!source){openReport(null);return;}
  if(await openReport(source,{fresh:true})===false)return;await keepReport();document.getElementById('report-note')?.focus({preventScroll:true});
}
function drawDrawer() {
  const dialog=document.getElementById('research-drawer'),content=document.getElementById('drawer-content'),active=document.activeElement,focus=active?.dataset,focusId=active?.id,restoreFocus=content.contains(active);
  if(!drawerState)return;
  const scrollTop=drawerScroll().scrollTop;
  drawerContentMotion?.cancel();drawerContentMotion=null;
  const object=[drawerState.type,drawerState.sid||drawerState.no||drawerState.key||'',drawerState.subject||drawerState.knowledge||drawerState.question||'',drawerState.tab||''].join('|'),same=dialog.dataset.object===object,positions=new Map((same?[...content.querySelectorAll('tr[data-motion-key]')]:[]).map(el=>[el,el.getBoundingClientRect()]));dialog.dataset.object=object;
  if(drawerState.type==='person'&&!drawerState.queue){const active=drawerState;drawerState=drawerTrail.at(-1)||null;const queue=personQueue(active.sid,active.exam);drawerState=active;Object.assign(active,queue);}
  document.getElementById('drawer-back').hidden=!drawerTrail.length;
  dialog.classList.toggle('comparison-drawer',drawerState.type==='compare');dialog.dataset.kind=drawerState.type;document.getElementById('drawer-context').textContent=SITE_NAME+' / '+({person:'学生观察',question:'单题研究',filters:'名单筛选',compare:'并排比较',subject:'班级学科',knowledge:'知识点研究'}[drawerState.type]||'研究观察窗');
  const views={question:()=>questionView(atlas,drawerState),filters:()=>directoryFilterView(atlas,books.people,session),compare:()=>compareView(atlas,session.comparePeople,drawerState,drawerState.context),subject:()=>subjectView(atlas,drawerState),knowledge:()=>knowledgeView(atlas,drawerState),person:()=>peekView(atlas,drawerState.sid,drawerState.exam,session,drawerState)};
  const template=document.createElement('template');template.innerHTML=views[drawerState.type]();
  const navigation=template.content.querySelector('.drawer-tabs,.drawer-section-nav');navigation?.remove();
  prepareUpdate();for(const row of content.querySelectorAll('tr[data-motion-key]'))cancelOwnMotion(row);
  // Navigation has its own row; preserve the scrolling evidence body across updates.
  renderInto(content,(navigation?.outerHTML||'')+'<div class="drawer-body" data-render-key="drawer-body">'+template.innerHTML+'</div>');
  if(['person','subject','question'].includes(drawerState.type)){
    const tools=document.createElement('div');tools.className='drawer-actions teaching-outlets';
    if(drawerState.type==='person')tools.innerHTML=button('学生打印报告','teaching-report-entry',{kind:'student',sid:drawerState.sid,exam:drawerState.exam},'outline')+button('新建训练计划','plan-open',{sid:drawerState.sid,exam:drawerState.exam},'outline')+button('生成专项练习','exercise-open',{sid:drawerState.sid,exam:drawerState.exam},'outline');
    else if(drawerState.type==='subject')tools.innerHTML=button('学科打印报告','teaching-report-entry',{kind:'subject',no:drawerState.no,subject:drawerState.subject,exam:drawerState.exam},'outline');
    else if(drawerState.focusSid)tools.innerHTML=button('按这道题安排训练','plan-open',{sid:drawerState.focusSid,exam:drawerState.key.split('|')[1],key:drawerState.key,question:drawerState.question},'outline');
    content.querySelector('header')?.append(tools);
  }
  if(drawerState.type!=='filters'){
    const origin=current==='class'?books.class.no+'班':current==='papers'?'当前试卷':current==='people'?(books.people.sid?'学生档案':'学生目录'):routes.find(r=>r[0]===current)?.[1]||'原研究页',ancestors=drawerTrail.map((d,index)=>({index,title:studyDescription(atlas,{scene:current,values:books[current],drawer:d,comparePeople:session.comparePeople}).title})).slice(-3),crumb=document.createElement('nav');crumb.className='drawer-route';crumb.setAttribute('aria-label','当前证据路径');
    crumb.innerHTML=button(esc(origin),'drawer-close',{},'drawer-route-link','title="回到原研究页，保留范围与位置"')+ancestors.map(item=>'<i aria-hidden="true">›</i>'+button(esc(item.title),'drawer-ancestor',{index:item.index},'drawer-route-link','title="'+esc(item.title)+'"')).join('')+'<i aria-hidden="true">›</i><span aria-current="location">'+esc({person:'学生',question:'小题',compare:'对比',subject:'学科',knowledge:'知识点'}[drawerState.type])+'</span>';
    content.querySelector('.drawer-body').prepend(crumb);const actions=content.querySelector('.drawer-actions,.question-stepper');actions?.insertAdjacentHTML('beforeend',button('☆ 留在研究夹','research-pin',{},'quiet'));scheduleResearch();
    requestAnimationFrame(()=>{if(crumb.isConnected)crumb.scrollLeft=crumb.scrollWidth;});
  }
  content.querySelector('.drawer-body').scrollTop=scrollTop;
  enhance(content);
  if(same&&!reducedMotion())arrangeRows(content,positions,{edge:dialog.getBoundingClientRect().top+65});
  let target=focus?.cmd?[...content.querySelectorAll('[data-cmd]')].find(el=>Object.entries(focus).every(([k,v])=>el.dataset[k]===v)):null;
  if(restoreFocus&&!target&&focusId){const candidate=document.getElementById(focusId);if(candidate&&content.contains(candidate))target=candidate;}
  if(restoreFocus&&(target?.disabled||!target&&!content.contains(document.activeElement)))target=content.querySelector('#drawer-title');
  if(target){if(target.matches('h1,h2,h3'))target.tabIndex=-1;target.focus({preventScroll:true});}
}
function openDrawer(state,{focusTitle=true}={}) {
  observationRequest++;
  const dialog=document.getElementById('research-drawer'),reopening=Boolean(drawerClosing),wasOpen=dialog.open,from=wasOpen?visualFrame(dialog):{opacity:.16,transform:'translateX(32px)'};
  ++drawerEpoch;if(!wasOpen||reopening)drawerMotion?.cancel();drawerClosing=null;
  if(wasOpen&&!reopening&&drawerState)drawerTrail.push({...structuredClone(drawerState),scrollTop:drawerScroll().scrollTop,tablePositions:drawerTablePositions()});else drawerTrail=[];
  drawerState=state;drawDrawer();drawerScroll().scrollTop=0;
  if(!wasOpen||reopening)prepareBackdrop(dialog,'entering');
  if(!wasOpen){drawerOpener=document.activeElement;dialog.showModal();document.body.classList.add('drawer-open');}
  if(!reducedMotion()){
    if(!wasOpen||reopening)drawerMotion=dialog.animate([from,{opacity:1,transform:'translateX(0)'}],motion.arrive);
    else animateDrawer();
  }
  const title=document.getElementById('drawer-title');if(focusTitle&&title){title.tabIndex=-1;title.focus({preventScroll:true});}
  else dialog.querySelector('[data-cmd=drawer-close]')?.focus({preventScroll:true});
}
// A cancelled exit returns false so a pending navigation cannot override a new observation.
function closeDrawer() {
  observationRequest++;
  const dialog=document.getElementById('research-drawer');if(drawerClosing)return drawerClosing;if(!dialog.open)return Promise.resolve(true);
  const study=studyNow();if(study){archiveStudy(study);closedStudy={study,closedAt:Date.now()};}
  const epoch=++drawerEpoch,from=visualFrame(dialog);drawerMotion?.cancel();drawerContentMotion?.cancel();
  prepareBackdrop(dialog,'leaving');
  const closing=(async()=>{
    if(!reducedMotion())try{drawerMotion=dialog.animate([from,{opacity:0,transform:'translateX(20px)'}],motion.leave);await finishAnimation(drawerMotion,motion.leave.duration);}catch{}
    if(epoch!==drawerEpoch)return false;
    dialog.close();document.body.classList.remove('drawer-open');drawerState=null;drawerTrail=[];drawerOpener?.isConnected&&drawerOpener.focus({preventScroll:true});return true;
  })();
  drawerClosing=closing;closing.finally(()=>{if(drawerClosing===closing)drawerClosing=null;});return closing;
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
    const list=researchObservationList(atlas,current,state,exam);records=list.records;label=list.label;
  } else if(current==='papers'&&state.key) {records=atlas.paper(state.key,state.classes).answers.filter(a=>atlas.name(a.sid).includes(state.search||'')).map(a=>({sid:a.sid,exam:a.exam}));label='当前试卷作答';}
  else if(current==='follow') {
    if(trigger?.closest('.follow-workbench')){const query=state.planSearch||'';records=session.plans.filter(p=>(!state.planClass||state.planClass==='all'||Number(p.classNo)===Number(state.planClass))&&(!state.planStatus||state.planStatus==='all'||p.status===state.planStatus)&&(!query||[atlas.name(p.sid),p.subject,p.note].some(v=>String(v||'').includes(query)))).map(p=>({sid:p.sid,exam:p.exam}));label='当前跟进记录';}
    else {records=atlas.critical(state.exam,{tier:state.tier||'under',band:Number(state.band)||20,side:state.side||'below',classes:state.classes||[]}).filter(item=>atlas.name(item.row.sid).includes(state.search||'')).map(item=>({sid:item.row.sid,exam:item.row.exam}));label='当前临界名单';}
  }
  const seen=new Set(),queue=records.filter(r=>{const key=r.sid+'|'+r.exam;if(!atlas.people.has(r.sid)||seen.has(key))return false;seen.add(key);return true;}),cursor=queue.findIndex(r=>r.sid===sid&&r.exam===exam);
  return cursor>=0?{queue,cursor,queueLabel:label}:{queue:[{sid,exam}],cursor:0,queueLabel:label};
}
function animateDrawer(direction=1) {drawerContentMotion?.cancel();if(!reducedMotion())drawerContentMotion=document.getElementById('drawer-content').animate([{opacity:.94,transform:'translateX('+(direction*6)+'px)'},{opacity:1,transform:'translateX(0)'}],motion.control);}
function drawerReport(){return drawerState.type==='question'?questionEvidence(atlas,drawerState):['subject','knowledge'].includes(drawerState.type)?lensEvidence(atlas,drawerState):drawerEvidence(atlas,drawerState,session.comparePeople);}
function addFollow(sid,exam,tier) {
  const row=atlas.story(sid).find(r=>r.exam===exam);if(!row)return;
  const id=sid+'|'+exam+'|'+tier;
  if(session.plans.some(p=>p.id===id)){notify('这条跟进已在看板中');return;}
  const nearest=atlas.critical(exam,{tier,band:10000,side:'both'}).find(item=>item.row.sid===sid)?.nearest;
  session.plans.unshift({id,sid,exam,tier,classNo:row.classNo,subject:nearest?.subject||'',status:'new',note:'',created:new Date().toISOString()});remember('plans',session.plans);notify('已加入跟进看板',{label:'查看跟进',cmd:'follow-open'});if(current==='follow')paint();
}
let planDraft=null,planUI={},planSearchTimer,planControls,reportReader;
let exerciseStudioTask,exerciseModuleTask,exerciseOpenRequest=0;
function exerciseModule(){if(!exerciseModuleTask){const task=import('./ui/exercise-studio.js');exerciseModuleTask=task;task.catch(()=>{if(exerciseModuleTask===task)exerciseModuleTask=null;});}return exerciseModuleTask;}

function exerciseStudio(){
 if(!exerciseStudioTask){const task=exerciseModule().then(({createExerciseStudio})=>createExerciseStudio({notify,show:showDialog,close:dialog=>dismissDialog(dialog.id),getAtlas:()=>atlas,onFeedback:async record=>{const synced=syncPracticeFeedbackPlans(session.plans,record);session.plans=synced.plans;if(planDraft){const draft=syncPracticeFeedbackPlans([planDraft],record);if(draft.linked){planDraft=draft.plans[0];rememberPlanDraft();if(document.getElementById('plan-dialog').open)drawPlan();}}if(synced.linked){remember('plans',session.plans);const saved=await store();if(current==='follow')await paint();notify(saved?'练后结果已同步至'+synced.linked+'条教学跟进。':'练后结果已保存，跟进记录暂留当前页面，请下载备份。');}else notify('练后结果已保存，可通过“加入教学跟进”关联训练安排。');},onAttach(record,source){
  if(!atlas.materialAt(source.sid,source.exam)){notify('该学生材料已更换，练习仍保存在本机。');return;}
  const subject=record.request.subject,key=subject+'|'+source.exam;
  if(!planDraft||planDraft.sid!==source.sid||planDraft.exam!==source.exam||planDraft.id&&planDraft.training.key!==key)openPlan({sid:source.sid,exam:source.exam,id:source.plan?.training?.key===key?source.plan.id:undefined,key});
  if(planDraft.training.key!==key)setPlanValue('training.key',key);
  planDraft.subject=subject;planDraft.training.key=key;planDraft.training.exercise=record;planDraft.training.goal=record.request.focus;planDraft.training.count=record.sheet.questions.length;planDraft.schedule.duration=record.request.minutes;rememberPlanDraft();drawPlan();showDialog(document.getElementById('plan-dialog'));notify('已加入训练草稿，请确认日期与复核安排后保存。');
 }}));exerciseStudioTask=task;task.catch(()=>{if(exerciseStudioTask===task)exerciseStudioTask=null;});}
 return exerciseStudioTask;
}
async function mountExerciseCenter(){const host=stage().querySelector('#exercise-center');if(!host)return;try{const studio=await exerciseStudio();if(host.isConnected)await studio.mountCenter(host);}catch(error){if(host.isConnected)host.innerHTML='<h2>试题中心暂时未能打开</h2><p>'+esc(error.message)+'</p>'+button('重新打开','exercise-center',{},'outline');}}

async function openExercises(context={}){
 const attempt=++exerciseOpenRequest,dialog=document.getElementById('exercise-dialog'),content=document.getElementById('exercise-content');
 if(!dialog.open){dialog.dataset.loading='true';content.innerHTML='<header class="exercise-heading"><span class="overline">个性化辅导中心</span><h2 id="exercise-title">正在打开辅导中心</h2><p role="status">正在读取本机练习与学生列表…</p></header><button class="button outline" data-cmd="exercise-loading-close">关闭</button>';showDialog(dialog);}
 try{
 const studio=await exerciseStudio();if(attempt!==exerciseOpenRequest||!dialog.open)return;const sid=context.hub?null:context.sid||planDraft?.sid,exam=context.exam||planDraft?.exam||atlas.latest;await studio.open({sid,exam,subject:context.subject,plan:!context.hub&&planDraft?.sid===sid&&planDraft.exam===exam?planDraft:null},{shouldOpen:()=>attempt===exerciseOpenRequest&&dialog.open});delete dialog.dataset.loading;
 }catch(error){if(attempt!==exerciseOpenRequest||!dialog.open)return;delete dialog.dataset.loading;content.innerHTML='<header class="exercise-heading"><h2 id="exercise-title">辅导中心暂时未能打开</h2><p role="alert">'+esc(error.message)+'</p></header><button class="button accent" data-cmd="exercise-hub">重新打开</button><button class="button outline" data-cmd="exercise-loading-close">关闭</button>';}
}
const planPaths=new Set(['sid','exam','teacher','note','reviewDate','result','review.correct','review.total','training.key','training.tasks','training.method','training.count','training.targetRate','training.goal','schedule.date','schedule.slot','schedule.period','schedule.time','schedule.duration','ui.no','ui.search','ui.questionFilter','ui.knowledge']);
function rememberPlanDraft(){if(!remember('followDraft',planDraft?{plan:planDraft,ui:planUI}:null))notify('训练草稿本机保存未完成，当前页面仍保留，请保存计划或下载备份');}
function drawPlan(){planControls?.close();const root=document.getElementById('plan-content');renderInto(root,followEditor(atlas,planDraft,planUI));enhance(root);notificationLayout.refresh();}
function openPlan(context={}){
 clearTimeout(planSearchTimer);const existing=context.id?session.plans.find(p=>p.id===context.id):null,stored=planDraft?{plan:planDraft,ui:planUI}:preference('followDraft',null),resume=stored?.plan&&(context.id?stored.plan.id===context.id:!context.sid&&!stored.plan.id);
 if(resume&&atlas.materialAt(stored.plan.sid,stored.plan.exam)&&(!stored.plan.id||session.plans.some(p=>p.id===stored.plan.id))){planDraft=draftForPlan(atlas,{},stored.plan);planUI=stored.ui||{};}
 else {const exam=context.exam||atlas.latest,sid=context.sid||materialPeople(atlas,exam)[0]?.sid;planDraft=draftForPlan(atlas,{...context,exam,sid},existing);planUI={questionFilter:'weak',no:'all'};}
 if(!planDraft.sid){notify('请先导入学生材料');return;}drawPlan();rememberPlanDraft();const dialog=document.getElementById('plan-dialog');showDialog(dialog);dialog.scrollTop=0;
 if(existing&&existing.status!=='new')requestAnimationFrame(()=>dialog.querySelector('[data-plan-field="reviewDate"]')?.closest('.plan-editor-section')?.scrollIntoView({block:'start'}));
}
function setPlanValue(path,value){
 if(!planDraft||!planPaths.has(path))return;const [group,key]=path.split('.'),root=group==='ui'?planUI:planDraft;
 const previous=key?root[group]?.[key]:root[group];
 if(planDraft.id&&['sid','exam'].includes(path)&&String(planDraft[path])!==String(value)){notify('这条计划已关联学生与考试，其他对象请新建训练计划。');return;}
 if(group==='ui')root[key]=value;else if(key)root[group][key]=value;else root[group]=value;
 if(['sid','exam','training.key'].includes(path)&&String(previous)!==String(value)){
  delete planDraft.training.exercise;
  planDraft.training.questions=[];planDraft.teacher='';planDraft=draftForPlan(atlas,{key:planDraft.training.key},planDraft);
  const qs=questionOptions(atlas,{...planDraft,key:planDraft.training.key});planDraft.training.questions=qs.filter(q=>q.weak).sort((a,b)=>a.rate-b.rate).slice(0,3).map(snapshotQuestion);planUI.knowledge='all';
 }
 if(path==='schedule.slot'&&!['lesson','break'].includes(value))planDraft.schedule.period='';
 rememberPlanDraft();
}
async function saveTrainingPlan(){
 if(!planDraft||!atlas.materialAt(planDraft.sid,planDraft.exam))throw new Error('请选择有材料的学生与考试');
 const p=normalizePlan(structuredClone(planDraft));
 for(const path of ['training.count','training.targetRate','schedule.duration']){const [g,k]=path.split('.'),v=Number(p[g][k]),max=k==='duration'?180:100;if(!Number.isInteger(v)||v<1||v>max)throw new Error('请填写有效题量、目标百分比和训练时长');p[g][k]=v;}
 if(!p.training.questions.length&&!p.training.goal?.trim())throw new Error('请选择训练题目，或填写具体训练重点');
 if(!p.training.tasks.length)throw new Error('请至少选择一项训练任务');
 if(p.schedule.date&&!validDate(p.schedule.date))throw new Error('请选择有效的训练日期');
 if(p.reviewDate&&!validDate(p.reviewDate))throw new Error('请选择有效的复核日期');
 validatePlanReview(p);
 if(p.schedule.date&&!p.schedule.slot)throw new Error('已选日期，请再选择课内、课间等时段');
 if(['lesson','break'].includes(p.schedule.slot)&&(!Number.isInteger(Number(p.schedule.period))||Number(p.schedule.period)<1||Number(p.schedule.period)>9))throw new Error('请选择第几节课');
 if(p.schedule.slot==='custom'&&!p.schedule.time)throw new Error('自定时刻需要填写具体时间');
 if(p.reviewDate&&p.schedule.date&&p.reviewDate<p.schedule.date)throw new Error('复核日期不能早于训练日期');
 if(p.id&&!session.plans.some(item=>item.id===p.id))throw new Error('原计划已移除，请重新新建训练计划');
 p.id=p.id||'p'+crypto.randomUUID();p.created=p.created||new Date().toISOString();p.updated=new Date().toISOString();const index=session.plans.findIndex(item=>item.id===p.id);if(index>=0){p.status=session.plans[index].status;session.plans[index]=p;}else session.plans.unshift(p);
 const remembered=remember('plans',session.plans);planDraft=null;rememberPlanDraft();await dismissDialog('plan-dialog');const stored=await store();await paint();notify(stored?'训练计划已保存，可在教学跟进查看或导出':'计划保留在当前页面，请下载完整备份',{cmd:'follow-open',label:'查看计划'});
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
  await excel({'学生基础':[headers],'语文':[[null,'53','题号','1','2','3'],[null,null,'分值',5,5,10],[null,null,'知识点','现代文阅读','文言基础','表达与写作'],['53物',4,'请填写姓名',null,null,null]],'填写说明':[['项目','说明'],['成绩','考试代码以物或历结尾，原分与赋分分别填写，缺失留空。'],['小题','复制语文表并改为对应学科名，保留题号、分值、知识点三行。'],['联结','不同考试与小题表的姓名保持一致，班级填写当次实际班级。'],['有效线','在资料与报告中按考次设置物理、历史两类有效线。']]},SITE_NAME+'-成绩与小题录入模板');
}
async function commands(event) {
  const target=event.target instanceof Element?event.target:event.target?.parentElement;if(!target)return;
  if(target.closest('#inbox')&&!target.closest('#toast'))return;
  const b=target.closest('[data-cmd]');if(!b||b.disabled||staleStage(b))return;
  const d=b.dataset,state=books[current];
  if(/^(plan-|follow-|notebook-|reading-)|^(clear|undo|undo-action|capture)$/.test(d.cmd))invalidateViews();
  try {
    if(d.cmd==='exercise-loading-close'){exerciseOpenRequest++;delete document.getElementById('exercise-dialog').dataset.loading;await dismissDialog('exercise-dialog');return;}
    if(d.cmd==='exercise-center'){await dismissDialog('exercise-dialog');go('library',{tab:'exercises'},true);mountExerciseCenter();return;}
    if(d.cmd==='exercise-hub'){await openExercises({hub:true});return;}
    if(d.cmd==='exercise-record'){await (await exerciseStudio()).openRecord(d.id);return;}
    if(d.cmd==='exercise-open'){await openExercises(d);return;}
    if(d.cmd.startsWith('plan-')){
      if(d.cmd==='plan-open')openPlan(d);
      else if(d.cmd==='plan-discard'){planDraft=null;rememberPlanDraft();await dismissDialog('plan-dialog');notify('未保存草稿已清除');}
      else if(d.cmd==='plan-close')await dismissDialog('plan-dialog');
      else if(d.cmd==='plan-set'){setPlanValue(d.key,d.value);drawPlan();}
      else if(d.cmd==='plan-toggle'){const tasks=planDraft.training.tasks;planDraft.training.tasks=tasks.includes(d.value)?tasks.filter(v=>v!==d.value):[...tasks,d.value];rememberPlanDraft();drawPlan();}
      else if(d.cmd==='plan-question'){const q=questionOptions(atlas,{...planDraft,key:planDraft.training.key}).find(q=>q.index===Number(d.index));if(q){const list=planDraft.training.questions;planDraft.training.questions=list.some(item=>String(item.label)===String(q.label))?list.filter(item=>String(item.label)!==String(q.label)):[...list,snapshotQuestion(q)];rememberPlanDraft();drawPlan();}}
      else if(d.cmd==='plan-weak'){planDraft.training.questions=questionOptions(atlas,{...planDraft,key:planDraft.training.key}).filter(q=>q.weak).sort((a,b)=>a.rate-b.rate).slice(0,3).map(snapshotQuestion);rememberPlanDraft();drawPlan();}
      else if(d.cmd==='plan-clear-questions'){planDraft.training.questions=[];rememberPlanDraft();drawPlan();}return;
    }
    if(d.cmd==='teaching-report-entry'){
      prepareReports();
      const source=drawerState||{},key=d.key||source.key||books.papers.key||'',values={tab:'reports',reportKind:d.kind||'class',reportExam:d.exam||source.exam||(current==='papers'?key.split('|')[1]:books[current].exam)||atlas.latest,reportNo:d.no||source.no||books.class.no||atlas.classes[0],reportSid:d.sid||source.sid||books.people.sid||'',reportSubject:d.subject||source.subject||key.split('|')[0]||'数学',reportSubjectClass:d.no||source.no||(current==='papers'&&books.papers.classes?.length===1?books.papers.classes[0]:'all')};
      if(!await closeDrawer())return;go('library',values);return;
    }
    if(d.cmd==='teaching-report-build'){openReport(()=>teachingReport(reportSpec(atlas,books.library)),{fresh:true});return;}
    if(d.cmd==='report-preset'){updateReportSelection(s=>{s.selected=presetSections(exportReport,d.preset);if(d.preset==='teaching')s.fields=teachingFields(exportReport);if(d.preset==='all'){s.fields={};s.filters={};}});return;}
    if(d.cmd==='report-scope'){changeReportScope(d.key,d.value);return;}
    if(d.cmd==='report-part-edit'){Object.assign(reportScope,{section:Number(d.index),page:1,search:'',settingsOpen:true});drawReport();openDisclosure(document.querySelector('.report-field-options'));document.querySelector('.report-field-options')?.scrollIntoView({block:'nearest',behavior:reducedMotion()?'instant':'smooth'});return;}
    if(d.cmd==='report-part-toggle'){reportScope.section=Number(d.index);updateReportSelection(s=>{const i=Number(d.index);s.selected=s.selected.includes(i)?s.selected.filter(v=>v!==i):[...s.selected,i];});return;}
    if(d.cmd==='report-part-move'){updateReportSelection(s=>{const from=s.order.indexOf(Number(d.index)),to=from+Number(d.step);if(from>=0&&to>=0&&to<s.order.length)[s.order[from],s.order[to]]=[s.order[to],s.order[from]];});return;}
    if(d.cmd==='report-field-toggle'){const index=Number(d.index),fields=fieldsFor(exportReport,index),column=Number(d.column);if(fields.includes(column)&&fields.length===1){notify('表格至少保留一个字段');return;}updateReportSelection(s=>{s.fields[index]=fields.includes(column)?fields.filter(i=>i!==column):[...fields,column].sort((a,b)=>a-b);});return;}
    if(d.cmd==='report-extra-toggle'){if(['includeNote','includeMeta'].includes(d.key))updateReportSelection(s=>{s[d.key]=!s[d.key];});return;}
    if(d.cmd==='report-settings'){await toggleReportSettings();return;}
    if(d.cmd==='report-paper-setting'){updateReportSelection(s=>{s.paper={...s.paper,[d.key]:converted(d.value)};});return;}
    if(d.cmd==='report-paper-open'){reportReader.open();return;}
    if(d.cmd==='report-paper-step'){reportReader.step(Number(d.step));return;}
    if(d.cmd==='report-paper-zoom'){reportReader.zoom(Number(d.step));return;}
    if(d.cmd==='report-paper-retry'){reportReader.retry();return;}
    if(d.cmd==='report-paper-chapter'){reportReader.chapter(exportReport.sections[Number(d.index)]?.title||'');return;}
    if(d.cmd==='report-preview-mode'){reportScope.preview=d.value;reportScope.reading=false;drawReport();return;}
    if(d.cmd==='report-reading'){reportScope.reading=!reportScope.reading;drawReport();document.querySelector('[data-cmd=report-reading]')?.focus({preventScroll:true});return;}
    if(d.cmd==='report-paper-width'){reportScope.paperWidth=['actual','page'].includes(d.value)?d.value:'fit';drawReport();return;}
    if(d.cmd==='report-paper-edge'){reportReader.edge(d.value);return;}
    if(d.cmd==='follow-report'){await flushSearch();openReport(()=>buildTeachingReport(atlas,{kind:'follow',exam:'all',no:'all',planState:structuredClone(books.follow)},session.plans),{fresh:true});return;}
    if(['capture','export','research','research-pin'].includes(d.cmd)){
      const scene=current,epoch=navigationEpoch;await flushSearch();if(scene!==current||epoch!==navigationEpoch)return;
      // Follow editors keep focus without repainting. Build a fresh evidence
      // snapshot before capture/export so their newest records are included.
      if(scene==='follow'&&['capture','export'].includes(d.cmd)){await paint();if(scene!==current||epoch!==navigationEpoch)return;}
    }
    if(d.cmd.startsWith('research')) {
      if(d.cmd==='research-close'){await dismissDialog('research-dialog');return;}
      if(!hasMaterials(atlas.data))return;
      if(d.cmd==='research')openResearch();
      else if(d.cmd==='research-tab'){researchScope.tab=d.tab;researchScope.rename='';drawResearch();}
      else if(d.cmd==='research-search-clear'){clearTimeout(researchSearchTimer);researchScope.search='';drawResearch();document.querySelector('[data-research-search]')?.focus({preventScroll:true});}
      else if(d.cmd==='research-pin')pinStudy();
      else if(d.cmd==='research-pin-entry'){const entry=research.recent.find(e=>e.id===d.id);if(entry)pinStudy(entry);}
      else if(d.cmd==='research-open'){const entry=research[d.collection]?.find(e=>e.id===d.id);if(entry)await restoreStudy(entry);}
      else if(d.cmd==='research-back'){const entry=researchTrail.at(-1);if(entry&&studyAvailable(atlas,entry)){checkpointNavigation();researchTrail.pop();await restoreStudy(entry,{returning:true});}else notify('原研究范围的材料尚未导入');}
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
      content.innerHTML='<header class="reader-head"><div><span class="overline">展开阅读</span><h2 id="table-reader-title">'+esc(label)+'</h2><p>保留当前表格的全部行与列，点击姓名可打开学生观察。</p></div>'+button('收起 ×','table-close',{},'outline')+'</header><div class="reader-canvas"></div>';content.querySelector('.reader-canvas').append(copy);showDialog(document.getElementById('table-reader'));enhance(content);return;
    }
    if(d.cmd==='table-close'){await dismissDialog('table-reader');return;}
    if(d.cmd==='table-shift'){shiftTable(b);return;}
    if(d.cmd==='reading'){const dialog=document.getElementById('reading-dialog');renderInto(document.getElementById('reading-content'),readingView(reading));showDialog(dialog);return;}
    if(d.cmd==='reading-close'){await dismissDialog('reading-dialog');return;}
    if(d.cmd==='reading-set'||d.cmd==='reading-reset'){if(d.cmd==='reading-reset')Object.assign(reading,readingDefaults);else if(Object.hasOwn(readingDefaults,d.key))reading[d.key]=d.value;remember('reading',reading);applyReading(reading);if(reducedMotion()){finishCanvasSlide();for(const animation of document.getAnimations())animation.cancel();}renderInto(document.getElementById('reading-content'),readingView(reading));enhance();positionDock();return;}
    if(d.cmd==='undo-action'){const undo=pendingUndo;pendingUndo=null;if(undo){await undo();notify('已撤销刚才的操作');}return;}
    if(b.closest('#research-drawer')&&['nav','class','paper','lens-paper','subject-open','people-lens','inspect-bin','workbook-open','library-open'].includes(d.cmd)&&!await closeDrawer())return;
    if(d.cmd==='toast-close'){const toast=document.getElementById('toast');clearTimeout(notify.timer);toast.classList.remove('visible');if(toast.hidePopover&&toast.matches(':popover-open'))toast.hidePopover();pendingUndo=null;}
    else if(d.cmd==='nav'||d.cmd==='home'){if(d.cmd==='home')event.preventDefault();openEntry(d.cmd==='home'?'board':d.scene);}
    else if(d.cmd==='set'||d.cmd==='toggle')update(d.key,d.value,d.cmd==='toggle');
    else if(d.cmd==='directory-material'&&current==='people'){
      if((d.key==='scoreStatus'&&d.value==='missing')||(d.key==='records'&&['history','questions'].includes(d.value)))update(d.key,state[d.key]===d.value?'all':d.value);
    }
    else if(d.cmd==='import'){observationRequest++;inbox.choose();}
    else if(d.cmd==='find'){if(!hasMaterials(atlas.data)){notify('导入成绩材料后即可查找学生');return;}go('people',{sid:'',...directoryDefaults},true);setTimeout(()=>stage().querySelector('[data-field="search"]')?.focus(),100);}
    else if(d.cmd==='class') {
      const no=Number(d.no),exam=d.exam||(current==='board'?books.board.exam:current==='papers'?books.papers.key.split('|')[1]:books.class.exam);
      go('class',{no,exam:atlas.classAt(no,exam).length?exam:atlas.classExams(no).at(-1)?.id,search:'',page:1,exams:atlas.classExams(no).map(e=>e.id),...(['snapshot','history','targets'].includes(d.tab)?{tab:d.tab}:{})},false,{recordTrail:current!=='class'});
    }
    else if(d.cmd==='person') {
      const exam=d.exam||sourceExam(d.sid);
      session.recent=[d.sid,...session.recent.filter(id=>id!==d.sid)].slice(0,12);remember('recent',session.recent);go('people',{sid:d.sid,exam});
    }
    else if(d.cmd==='class-exam')go('class',{exam:d.exam,tab:'snapshot'},false,{recordTrail:current!=='class'});
    else if(d.cmd==='person-exam')go('people',{exam:d.exam},false,{recordTrail:false});
    else if(d.cmd==='person-back')go('people',{sid:''},true,{root:true});
    else if(d.cmd==='peek'){const exam=d.exam||sourceExam(d.sid),queue=personQueue(d.sid,exam,b);session.recent=[d.sid,...session.recent.filter(id=>id!==d.sid)].slice(0,12);remember('recent',session.recent);openDrawer({type:'person',sid:d.sid,exam,tab:'overview',...queue});}
    else if(d.cmd==='class-subject')openDrawer({type:'subject',no:Number(d.no||books.class.no),subject:['英语','日语'].includes(d.subject)?'外语':d.subject,exam:d.exam||books.class.exam,tab:'students',tier:'under',filter:'all',sort:'low',search:'',page:1});
    else if(d.cmd==='knowledge-open'){const classes=d.no?[Number(d.no)]:d.classes!==undefined?d.classes.split(',').filter(Boolean).map(Number):[...(books.papers.classes||[])],key=d.key||books.papers.key;if(!atlas.paper(key,classes).skills.some(s=>s.name===d.knowledge)){notify('这个知识点还没有题目材料');return;}openDrawer({type:'knowledge',key,knowledge:d.knowledge,classes,tab:'questions',filter:'all',sort:'low',search:'',page:1});}
    else if(d.cmd==='lens-filter'||d.cmd==='question-band'||d.cmd==='lens-sort'||d.cmd==='lens-tier'){const fromStructure=Boolean(b.closest('.score-structure'));drawerState[['lens-filter','question-band'].includes(d.cmd)?'filter':d.cmd==='lens-sort'?'sort':'tier']=d.value;drawerState.page=1;drawDrawer();if(fromStructure)revealResults(document.getElementById('drawer-content'));}
    else if(d.cmd==='drawer-search-clear'){clearTimeout(drawerTimer);drawerState.search='';drawerState.page=1;drawDrawer();document.querySelector('#drawer-content [data-drawer-field="search"]')?.focus({preventScroll:true});}
    else if(d.cmd==='drawer-section'){const dialog=document.getElementById('research-drawer'),target=document.getElementById(d.target);if(target&&dialog.contains(target)){const scroller=drawerScroll();scroller.scrollTo({top:d.target==='drawer-title'?0:Math.max(0,scroller.scrollTop+target.getBoundingClientRect().top-scroller.getBoundingClientRect().top-24),behavior:reducedMotion()?'instant':'smooth'});const heading=target.matches('h2')?target:target.querySelector('h2');if(heading){heading.tabIndex=-1;heading.focus({preventScroll:true});}}}
    else if(d.cmd==='lens-page'){drawerState.page=Math.max(1,(drawerState.page||1)+Number(d.step));drawDrawer();revealResults(document.getElementById('drawer-content'));}
    else if(d.cmd==='lens-exam'){drawerState.exam=d.exam;drawerState.page=1;drawerState.search='';drawDrawer();animateDrawer();}
    else if(d.cmd==='knowledge-class')openDrawer({...structuredClone(drawerState),classes:[Number(d.no)],tab:'students',filter:'all',search:'',page:1});
    else if(d.cmd==='question-all')openDrawer({...structuredClone(drawerState),classes:[],filter:'all',search:'',page:1});
    else if(d.cmd==='question-class')openDrawer({...structuredClone(drawerState),classes:[Number(d.no)],filter:'all',search:'',page:1});
    else if(d.cmd==='question-unfocus'){delete drawerState.focusSid;drawDrawer();}
    else if(d.cmd==='answer-question'){
      const request=++observationRequest,navigation=navigationEpoch;
      if(current==='papers'&&books.papers.key===d.key){books.papers.question=Number(d.index);persistBooks();await paint();}
      if(request!==observationRequest||navigation!==navigationEpoch)return;
      openDrawer({type:'question',key:d.key,question:Number(d.index),classes:d.classes?.split(',').filter(Boolean).map(Number)||[],focusSid:d.sid,filter:'all',page:1,search:''});
    }
    else if(d.cmd==='drawer-stage'){Object.assign(drawerState,{sid:d.sid,exam:d.exam});drawDrawer();animateDrawer();}
    else if(d.cmd==='drawer-tab'){drawerState.tab=d.value;drawDrawer();drawerScroll().scrollTop=0;animateDrawer();}
    else if(d.cmd==='drawer-question-subject'||d.cmd==='drawer-question-filter'){drawerState[d.cmd==='drawer-question-subject'?'subject':'questionFilter']=d.value;drawDrawer();}
    else if(d.cmd==='drawer-person-step'){const cursor=(drawerState.cursor||0)+Number(d.step),next=drawerState.queue?.[cursor];if(next){Object.assign(drawerState,next,{cursor});session.recent=[next.sid,...session.recent.filter(id=>id!==next.sid)].slice(0,12);remember('recent',session.recent);drawDrawer();drawerScroll().scrollTop=0;animateDrawer(Number(d.step));}}
    else if(d.cmd==='drawer-question-step'){const qs=questionSequence(atlas.paper(drawerState.key,drawerState.classes),drawerState).questions,index=qs.findIndex(q=>q.index===Number(drawerState.question))+Number(d.step);if(qs[index]){drawerState.question=qs[index].index;drawerState.page=1;drawerState.search='';if(current==='papers'&&books.papers.key===drawerState.key){books.papers.question=drawerState.question;persistBooks();paint();}drawDrawer();drawerScroll().scrollTop=0;animateDrawer(Number(d.step));}}
    else if(d.cmd==='question-sequence-all'){delete drawerState.queue;delete drawerState.queueScope;drawDrawer();}
    else if(d.cmd==='drawer-question-page'){drawerState.page=Math.max(1,(drawerState.page||1)+Number(d.step));drawDrawer();revealResults(document.getElementById('drawer-content'));}
    else if(d.cmd==='person-section'){const section=document.getElementById(d.id);section?.scrollIntoView({behavior:reducedMotion()?'instant':'smooth',block:'start'});}
    else if(d.cmd==='drawer-back'){if(drawerTrail.length){drawerState=drawerTrail.pop();drawDrawer();restoreDrawerPosition(drawerState);animateDrawer(-1);}}
    else if(d.cmd==='drawer-ancestor'){const index=Number(d.index),ancestor=drawerTrail[index];if(ancestor){drawerState=ancestor;drawerTrail=drawerTrail.slice(0,index);drawDrawer();restoreDrawerPosition(ancestor);animateDrawer(-1);}}
    else if(d.cmd==='drawer-close')await closeDrawer();
    else if(d.cmd==='drawer-capture')await capture(()=>drawerReport());
    else if(d.cmd==='drawer-export')openReport(()=>drawerReport());
    else if(d.cmd==='drawer-person'){if(!await closeDrawer())return;session.recent=[d.sid,...session.recent.filter(id=>id!==d.sid)].slice(0,12);remember('recent',session.recent);go('people',{sid:d.sid,exam:d.exam,subject:d.subject});}
    else if(d.cmd==='directory-reset'){const context={directoryExam:state.directoryExam,view:state.view,pageSize:state.pageSize};Object.assign(state,directoryDefaults,context);persistBooks();await paint();drawDrawer();}
    else if(d.cmd==='directory-clear'){if(d.key==='range')Object.assign(state,{minScore:'',maxScore:'',maxExclusive:false});else state[d.key]=directoryDefaults[d.key];state.page=1;state.lens='custom';persistBooks();await paint();drawDrawer();}
    else if(d.cmd==='directory-lens'){Object.assign(state,lensValues(d.lens));persistBooks();paint(true);}
    else if(d.cmd==='directory-apply'){if(!await closeDrawer())return;revealResults(stage());}
    else if(d.cmd==='directory-scope'){state.scopeExpanded=!state.scopeExpanded;persistBooks();await paint();}
    else if(d.cmd==='directory-filters'){openDrawer({type:'filters'});if(d.focus)document.querySelector('#drawer-content [data-field="'+d.focus+'"]')?.focus();}
    else if(d.cmd==='directory-save'){openDrawer({type:'filters'});const input=document.querySelector('#drawer-content [name="view-name"]');input?.focus({preventScroll:true});input?.scrollIntoView({behavior:reducedMotion()?'instant':'smooth',block:'center'});}
    else if(d.cmd==='directory-restore'){const view=session.directoryViews.find(v=>v.id===d.id);if(view){if(view.values.directoryExam!=='latest'&&!atlas.exams.some(e=>e.id===view.values.directoryExam)){notify('这组筛选对应的考试尚未导入');return;}if(!await closeDrawer())return;Object.assign(books.people,directoryDefaults,structuredClone(view.values),{sid:'',page:1,lens:'custom'});persistBooks();pagePositions.delete('people|');window.scrollTo({top:0,behavior:'instant'});await paint(true);notify('已打开“'+view.name+'”');}}
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
    else if(d.cmd==='compare-open') {if(session.comparePeople.length>=2)openDrawer({type:'compare',metric:'gradeRank',common:false,context:comparisonContext()});}
    else if(d.cmd==='compare-metric'){drawerState.metric=d.value;drawDrawer();}
    else if(d.cmd==='compare-common'){drawerState.common=!drawerState.common;drawDrawer();}
    else if(d.cmd==='paper-switch'){
      const target=atlas.papers().find(p=>p.key===d.key);if(!target||state.key===target.key)return;
      go('papers',{key:target.key,classes:(state.classes||[]).filter(no=>target.classes.includes(no)),question:0,tab:state.tab||'map',page:1,questionSearch:'',questionFocus:'all',order:'paper',search:''},true,{recordTrail:false});
    }
    else if(d.cmd==='paper-exam'){
      if(state.key.split('|')[1]===d.exam)return;
      const subject=state.key.split('|')[0],target=atlas.papers().find(p=>p.exam===d.exam&&p.subject===subject);
      if(target)go('papers',{key:target.key,classes:(state.classes||[]).filter(no=>target.classes.includes(no)),question:0,page:1,questionSearch:'',questionFocus:'all',search:''},true,{recordTrail:false});
      else go('papers',{key:'',shelfExam:d.exam,shelfSubject:'all'},true,{recordTrail:false});
    }
    else if(d.cmd==='paper')go('papers',{key:d.key,classes:[],question:0,tab:'map',page:1,questionSearch:'',questionFocus:'all',order:'paper',search:''});
    else if(d.cmd==='lens-paper')go('papers',{key:d.key,classes:[Number(d.no)],question:0,tab:'map',page:1,questionSearch:'',questionFocus:'all',order:'paper',search:''});
    else if(d.cmd==='paper-back')go('papers',{key:'',shelfExam:state.key.split('|')[1]||atlas.latest,shelfSubject:'all'},true,{root:true});
    else if(d.cmd==='paper-focus'&&current==='papers'&&['all','low','missing','max'].includes(d.value)){archiveStudy();const key=state.key;Object.assign(state,{tab:'map',questionSearch:'',questionFocus:d.value,page:1});persistBooks();await paint();if(current==='papers'&&books.papers.key===key&&state.questionFocus===d.value&&!state.questionSearch){const target=document.getElementById('paper-question-evidence');target?.scrollIntoView({behavior:reducedMotion()?'instant':'smooth',block:'start'});stage().querySelector('.question-focus[data-value="'+d.value+'"]')?.focus({preventScroll:true});}}
    else if(d.cmd==='question-map-reset'){Object.assign(state,{questionSearch:'',questionFocus:'all',page:1});persistBooks();await paint();}
    else if(d.cmd==='subject-open')go('board',{mode:'subjects',subject:d.subject,exam:d.exam});
    else if(d.cmd==='question'){
      const request=++observationRequest,navigation=navigationEpoch,key=d.key||books.papers.key,classes=d.no?[Number(d.no)]:d.classes!==undefined?d.classes.split(',').filter(Boolean).map(Number):[...(books.papers.classes||[])];let sequence={};
      if(current==='papers'&&books.papers.key===key){
        if(b.closest('.question-map')){const model=queryQuestionMap(atlas.paper(key,classes),books.papers,atlas.data.rules);sequence={queue:model.matches.map(q=>q.index),queueScope:model.label+(model.query?' · 检索 '+model.query:'')+' · '+model.orderLabel};}
        books.papers.question=Number(d.index);persistBooks();await paint();
        if(current!=='papers'||books.papers.key!==key||books.papers.question!==Number(d.index))return;
      }
      if(request!==observationRequest||navigation!==navigationEpoch)return;
      openDrawer({type:'question',key,classes,question:Number(d.index),page:1,search:'',...sequence});
    }
    else if(d.cmd==='page'){state.page=Math.max(1,(state.page||1)+Number(d.step));persistBooks();await paint();revealResults(stage());}
    else if(d.cmd==='capture')await capture();
    else if(d.cmd==='export')openReport(activeReport);
    else if(d.cmd==='close-report')await closeReport();
    else if(d.cmd==='report-keep')await keepReport();
    else if(d.cmd==='report-return'){if(await finishReport())if(reportOrigin)await restoreStudy(reportOrigin);}
    else if(d.cmd==='report-section'){Object.assign(reportScope,{section:Number(d.index),page:1,search:'',preview:'details'});drawReport();}
    else if(d.cmd==='report-page'){reportScope.page=Math.max(1,reportScope.page+Number(d.step));drawReport();revealResults(document.getElementById('report-content'));}
    else if(['report-excel','report-word','report-pdf','report-print'].includes(d.cmd)){
      if(reportJobs.has(d.cmd))return;
      const report=reportSnapshot();if(!report.sections.length&&!report.note?.trim()){notify('先勾选需要导出的章节');return;}
      reportJobs.add(d.cmd);drawReport();
      try{
        if(d.cmd==='report-excel'){const sheets={...report.sheets};if(report.note?.trim())sheets[Object.hasOwn(sheets,'教师判断')?'本份报告说明':'教师判断']=[['摘录时间','研究来源','教师判断'],[report.created||'',report.studyTitle||report.subtitle||'',report.note]];await excel(sheets,report.title);}
        else if(d.cmd==='report-print')await print(report,reportReader.blob(report));
        else await (d.cmd==='report-pdf'?pdf(report,reportReader.blob(report)):word(report));
        if(d.cmd!=='report-print')notify('已按下载时的选择生成文件 · '+report.sections.length+'章');
      }finally{reportJobs.delete(d.cmd);if(exportReport&&document.getElementById('report-dialog').open)drawReport();}
    }
    else if(d.cmd==='svg'||d.cmd==='png'){
      const label=b.textContent,description=b.getAttribute('aria-label');b.disabled=true;b.setAttribute('aria-busy','true');b.setAttribute('aria-label','正在生成 '+d.cmd.toUpperCase()+' 图表');b.textContent=d.cmd.toUpperCase()+'…';
      try{await chart(d.id,d.cmd==='png');}
      finally{if(b.isConnected&&b.getAttribute('aria-busy')==='true'){b.disabled=false;b.removeAttribute('aria-busy');b.textContent=label;if(description===null)b.removeAttribute('aria-label');else b.setAttribute('aria-label',description);}}
    }
    else if(d.cmd==='backup'){archiveStudy();const saved=await access(['exercises','exerciseSavedSetups']),{savedExerciseSetups}=await import('./engine/exercise-setups.js');download(JSON.stringify({...workspaceSnapshot(),exercises:saved.exercises||[],exerciseSavedSetups:savedExerciseSetups(saved.exerciseSavedSetups)}),SITE_NAME+'-完整工作区-'+new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Shanghai'})+'.json','application/json');}
    else if(d.cmd==='template')await template();
    else if(d.cmd==='four-sheets')await excel(fourSheets(),SITE_NAME+'-四表分析包');
    else if(d.cmd==='undo')await changeMaterials(async()=>{const dataset=inMemoryUndo||await previous();if(!dataset){notify('没有可撤回的材料替换');return;}await applyMaterials(dataset,workspaceSnapshot(),hasMaterials(dataset)?'已恢复上一次材料':'已恢复空白工作区',{undo:false});});
    else if(d.cmd==='clear')await changeMaterials(async()=>{archiveStudy();await applyMaterials(emptyDataset(),workspaceSnapshot(),'当前工作区已清空');});
    else if(d.cmd==='follow-add')addFollow(d.sid,d.exam,d.tier);
    else if(d.cmd==='follow-open'){if(!await closeDrawer())return;go('follow');}
    else if(d.cmd==='follow-remove'){const index=session.plans.findIndex(p=>p.id===d.id),plan=session.plans[index];if(plan){session.plans.splice(index,1);remember('plans',session.plans);await paint();notify('已移除跟进记录',{undo:async()=>{if(!session.plans.some(p=>p.id===plan.id))session.plans.splice(Math.min(index,session.plans.length),0,plan);remember('plans',session.plans);await paint();}});}}
    else if(d.cmd==='follow-status'){const plan=session.plans.find(p=>p.id===d.id);if(plan){plan.status=d.status;remember('plans',session.plans);paint();}}
    else if(d.cmd==='notebook-retry'){const note=session.notebook.find(n=>n.id===d.id);if(note){evidenceSaveState(note,'正在保存判断…');await persistNotebook();}}
    else if(d.cmd==='notebook-reset'){clearTimeout(searchTimer);state.notebookQuery='';state.notebookSource='all';state.notebookJudgment='all';state.notebookLimit=24;persistBooks();await paint();}
    else if(d.cmd==='notebook-more'){await flushSearch();const before=Number(state.notebookLimit)||24;state.notebookLimit=before+24;persistBooks();await paint();const next=stage().querySelectorAll('[data-evidence-card]')[before]?.querySelector('h2');if(next){next.focus({preventScroll:true});next.scrollIntoView({block:'nearest',behavior:'instant'});}}
    else if(d.cmd==='notebook-open')openReport(session.notebook.find(note=>note.id===d.id));
    else if(d.cmd==='notebook-return'){const note=session.notebook.find(note=>note.id===d.id);if(note?.study)await restoreStudy(note.study);}
    else if(d.cmd==='notebook-remove'){const index=session.notebook.findIndex(n=>n.id===d.id),note=session.notebook[index];if(note){session.notebook.splice(index,1);noteJournal.remove(note.id);await persistNotebook();await paint();notify('已移除证据摘录',{undo:async()=>{if(!session.notebook.some(n=>n.id===note.id))session.notebook.splice(Math.min(index,session.notebook.length),0,note);await persistNotebook();await paint();}});}}
    else if(d.cmd==='notebook-export') {
      if(!session.notebook.length){notify('还没有保存的摘录');return;}
      const notes=session.notebook.map(note=>selectedReport(refreshSavedReport(note)));
      const sections=notes.flatMap(note=>[...note.sections.map(section=>({...section,title:note.title+' / '+section.title})),...(note.note?[{title:note.title+' / 教师判断',headers:['记录'],rows:[[note.note]]}]:[])]);
      const sheets=Object.fromEntries(notes.flatMap((note,i)=>Object.entries(note.sheets).map(([name,rows])=>[(i+1)+'-'+name,rows])));
      if(notes.some(note=>note.note))sheets['教师判断']=[['证据标题','摘录时间','研究来源','教师判断'],...notes.filter(note=>note.note).map(note=>[note.title,note.created,note.studyTitle||note.subtitle||'',note.note||''])];
      openReport(evidence(SITE_NAME+' · 教学证据摘录',atlas.data.school||'',sections,sheets));
    }
    else if(d.cmd==='reload')location.reload();
  }catch(error){notify(error.message);}
}
async function forms(event) {
  invalidateViews();
  const form=event.target;if(!form.dataset.form)return;event.preventDefault();if(staleStage(form))return;
  if(materialBusy){notify('当前材料仍在更新，请完成后再保存');return;}
  const f=new FormData(form),data=atlas.data;
  try {
    if(form.dataset.form==='training-plan'){for(const input of form.querySelectorAll('[data-plan-field]'))setPlanValue(input.dataset.planField,input.value);await saveTrainingPlan();return;}
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
    atlas=new Atlas(data);const stored=await store();ensureBooks();await paint();if(stored)notify('已保存到本机工作区');
  }catch(error){notify(error.message);}
}
export async function mount(boot=null) {
  history.scrollRestoration='manual';
  const shortcut=document.getElementById('find-shortcut');if(shortcut)shortcut.textContent=/Mac|iPhone|iPad/.test(navigator.platform)?'⌘ K':'Ctrl K';
  inbox=new Inbox(commitMaterial,notify,()=>atlas.data,()=>{loadScene(current).catch(()=>{});},boot?.importReader);
  window.addEventListener('hengji:import-files',event=>inbox.read(event.detail));
  installViewportMetrics();
  installInteractions({reducedMotion});
  planControls=installPlanControls({reducedMotion});
  reportReader=installReportReading(document.getElementById('report-dialog'));
  window.addEventListener('resize',finishCanvasSlide,{passive:true});
  matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change',event=>{if(event.matches)finishCanvasSlide();});
  document.addEventListener('click',commands);document.addEventListener('submit',forms);
  const syncOverlays=event=>{const dialog=event.target;if(dialog?.matches?.('dialog')){modalOrder=modalOrder.filter(item=>item!==dialog&&item.open);if(dialog.open)modalOrder.push(dialog);}document.body.classList.toggle('modal-open',Boolean(document.querySelector('dialog[open]')));placeNotification();};
  for(const dialog of document.querySelectorAll('dialog')){dialog.addEventListener('toggle',syncOverlays);dialog.addEventListener('close',syncOverlays);}
  for(const id of ['reading-dialog','research-dialog','table-reader','plan-dialog'])document.getElementById(id).addEventListener('cancel',event=>{event.preventDefault();dismissDialog(id);});
  document.getElementById('table-reader').addEventListener('close',event=>{if(!event.target.open)document.getElementById('table-reader-content').replaceChildren();});
  document.getElementById('exercise-dialog').addEventListener('cancel',event=>{if(!event.currentTarget.dataset.loading)return;event.preventDefault();event.stopImmediatePropagation();exerciseOpenRequest++;delete event.currentTarget.dataset.loading;dismissDialog('exercise-dialog');});
  const drawer=document.getElementById('research-drawer');drawer.addEventListener('cancel',event=>{event.preventDefault();closeDrawer();});drawer.addEventListener('click',event=>{if(event.target!==drawer)return;const bounds=drawer.getBoundingClientRect();if(event.clientX<bounds.left||event.clientX>bounds.right||event.clientY<bounds.top||event.clientY>bounds.bottom)closeDrawer();});
  document.addEventListener('toggle',event=>{if(event.target.matches?.('.directory-filters')){books.people.filtersOpen=event.target.open;persistBooks();}},true);
  window.addEventListener('resize',positionDock);
  for(const type of ['pointerover','focusin','pointerdown'])document.getElementById('navigation').addEventListener(type,event=>{const button=event.target.closest?.('[data-scene]');if(button)warmScene(button.dataset.scene);},{passive:true});
  document.addEventListener('scroll',()=>{if(hasMaterials(atlas.data))scheduleResearch();},{passive:true,capture:true});
  window.addEventListener('pagehide',()=>{checkpointNavigation();archiveStudy();if(session.notebook.length)persistNotebook().catch(()=>{});});
  document.getElementById('report-dialog').addEventListener('cancel',async event=>{event.preventDefault();if(reportScope.reading){reportScope.reading=false;drawReport();document.querySelector('[data-cmd=report-reading]')?.focus({preventScroll:true});}else await closeReport();});
  document.addEventListener('keydown',event=>{if(event.target.matches?.('.student-dot,[data-plot-action]')&&['Enter',' '].includes(event.key)){event.preventDefault();event.target.dispatchEvent(new MouseEvent('click',{bubbles:true}));}});
  document.addEventListener('keydown',event=>{if(event.defaultPrevented||event.target.closest?.('dialog')!==drawer||!drawer.open||event.altKey||event.ctrlKey||event.metaKey||!['ArrowLeft','ArrowRight'].includes(event.key)||event.target.closest?.('input,textarea,select,.table-scroll,.trajectory-scroll,.drawer-stages,.drawer-tabs,.drawer-section-nav'))return;const cmd=drawerState?.type==='person'?'drawer-person-step':drawerState?.type==='question'?'drawer-question-step':null,button=cmd&&drawer.querySelector('[data-cmd="'+cmd+'"][data-step="'+(event.key==='ArrowLeft'?-1:1)+'"]');if(button){event.preventDefault();if(!button.disabled)button.click();}});
  document.addEventListener('compositionend',event=>{if(event.target.matches?.('[data-field],[data-drawer-field],[data-report-search],[data-report-output-filter],[data-report-output-title],[data-report-person-search],[data-research-search],[data-plan-note],[data-plan-field],[data-evidence-note],#report-note'))event.target.dispatchEvent(new Event('input',{bubbles:true}));});
  document.addEventListener('input',event=>{
    if(event.target.matches('[data-plan-field],[data-plan-note],[data-evidence-note],#report-note'))invalidateViews();
    const target=event.target;
    if(staleStage(target))return;
    if(target.matches('[data-report-output-filter],[data-report-search]')){const index=target.dataset.reportOutputFilter??reportScope.section;for(const input of document.querySelectorAll('[data-report-output-filter="'+index+'"],[data-report-search]'))if(input!==target&&Number(index)===reportScope.section)input.value=target.value;}
    if(event.isComposing)return;
    if(target.dataset.reportPersonSearch!==undefined){reportScope.personSearch=target.value;clearTimeout(reportTimer);reportTimer=setTimeout(drawReport,160);return;}
    if(target.dataset.reportOutputFilter!==undefined&&exportReport){const i=Number(target.dataset.reportOutputFilter);updateReportSelection(s=>{s.filters[i]=target.value;},{render:false});return;}
    if(target.dataset.reportOutputTitle!==undefined&&exportReport){updateReportSelection(s=>{s.title=target.value;},{render:false});return;}
    if(target.dataset.planField){setPlanValue(target.dataset.planField,target.value);if(target.dataset.planField==='ui.search'){clearTimeout(planSearchTimer);planSearchTimer=setTimeout(drawPlan,180);}return;}
    if(target.dataset.field) {
      const scene=current,key=target.dataset.field,position=target.selectionStart,inDrawer=Boolean(target.closest('#research-drawer'));books[scene][key]=target.value;books[scene].page=1;if(key==='notebookQuery')books[scene].notebookLimit=24;if(scene==='people')books[scene].lens='custom';if(['minScore','maxScore'].includes(key))books[scene].maxExclusive=false;persistBooks();clearTimeout(searchTimer);
      searchTimer=setTimeout(()=>{searchTimer=null;if(current===scene){if(inDrawer)drawDrawer();searchPaint=paint(false,{key,position,inDrawer});}},130);
    }
    if(target.dataset.drawerField&&drawerState){drawerState[target.dataset.drawerField]=target.value;drawerState.page=1;clearTimeout(drawerTimer);drawerTimer=setTimeout(drawDrawer,130);}
    if(target.dataset.reportSearch&&exportReport){reportScope.search='';reportScope.page=1;const index=reportScope.section;updateReportSelection(s=>{s.filters[index]=target.value;},{render:false});return;}
    if(target.dataset.researchSearch){researchScope.search=target.value;clearTimeout(researchSearchTimer);researchSearchTimer=setTimeout(drawResearch,130);}
    if(target.dataset.planNote){const plan=session.plans.find(p=>p.id===target.dataset.planNote);if(plan){plan.note=target.value;remember('plans',session.plans);}}
    if(target.dataset.evidenceNote){const note=session.notebook.find(n=>n.id===target.dataset.evidenceNote);if(note){note.note=target.value;recordNoteDraft(note);evidenceSaveState(note,'正在保存判断…');clearTimeout(noteTimer);noteTimer=setTimeout(()=>persistNotebook().catch(()=>notify('请下载备份以保留摘录')),400);}}
    if(target.id==='report-note'&&exportReport){clearTimeout(reportTimer);reportTimer=setTimeout(drawReport,160);exportReport.note=target.value;reportReader?.invalidate(exportReport);if(!exportReport.id&&target.value.trim()){exportReport.id='e'+crypto.randomUUID();exportReport.autoSaved=true;session.notebook.unshift(structuredClone(exportReport));}if(exportReport.id){const note=session.notebook.find(n=>n.id===exportReport.id);if(note){note.note=target.value;recordNoteDraft(note);showNoteState('saving');clearTimeout(noteTimer);noteTimer=setTimeout(persistReportNote,400);}}else showNoteState('preview');}
  });
  document.addEventListener('keydown',async event=>{if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='k'){event.preventDefault();if(document.getElementById('inbox').open)return;if(!hasMaterials(atlas.data)){notify('导入成绩材料后即可查找学生');return;}if(document.getElementById('report-dialog').open&&!await finishReport())return;if(!await closeDrawer())return;for(const dialog of document.querySelectorAll('dialog[open]'))if(dialog.id!=='inbox')await dismissDialog(dialog.id);go('people',{sid:'',...directoryDefaults},true);setTimeout(()=>stage().querySelector('[data-field="search"]')?.focus(),100);}});
  document.addEventListener('change',event=>{if(['schedule.date','schedule.time','reviewDate','training.count','training.targetRate','schedule.duration','review.correct','review.total'].includes(event.target.dataset?.planField)&&planDraft)drawPlan();});
  document.addEventListener('dragstart',event=>{const card=event.target.closest?.('[data-plan]');if(card)event.dataTransfer.setData('text/plain',card.dataset.plan);});
  document.addEventListener('dragover',event=>{if(event.target.closest?.('.follow-lane'))event.preventDefault();});
  document.addEventListener('dragenter',event=>event.target.closest?.('.follow-lane')?.classList.add('dragover'));
  document.addEventListener('dragleave',event=>{const lane=event.target.closest?.('.follow-lane');if(lane&&!lane.contains(event.relatedTarget))lane.classList.remove('dragover');});
  document.addEventListener('drop',event=>{
    const lane=event.target.closest?.('.follow-lane');if(!lane)return;event.preventDefault();
    const plan=session.plans.find(p=>p.id===event.dataTransfer.getData('text/plain'));if(plan){plan.status=lane.dataset.status;remember('plans',session.plans);paint();}
  });
  window.addEventListener('popstate',()=>{lastHistoryURL=location.href;restoreNavigationEntry();});
  window.addEventListener('hashchange',event=>{if(event.newURL!==location.href)return;if(lastHistoryURL===event.newURL){lastHistoryURL='';return;}lastHistoryURL='';restoreNavigationEntry();});
  readRoute();nav();window.dispatchEvent(new Event('hengji:ready'));
  const startRevision=revision;
  stage().setAttribute('aria-busy','true');
  try {
    const [materials,notebook]=await Promise.all([hydrate(boot),loadNotebook().catch(()=>[])]);
    if(startRevision!==revision)return;
    session.notebook=noteJournal.restore(notebook||[]);
    if(preference('plans',null)===null&&Array.isArray(materials.dataset?.plans))session.plans=materials.dataset.plans.map(normalizePlan);
    if(!STORAGE_SCOPE&&hasMaterials(materials.dataset)&&!session.plans.length){try{session.plans=(JSON.parse(localStorage.getItem('jianwei:actions'))||[]).map(p=>({...p,status:p.status==='done'?'done':'active'}));}catch{}}
    if(materials.needsSave)save(materials.dataset,{prepared:true}).catch(()=>{});
    await installDataset(materials.dataset,{prepared:true,index:materials.index});if(Object.keys(noteJournal.drafts).length){persistNotebook().catch(()=>notify('教师判断已从本机草稿恢复，请下载材料保留记录。'));}if(materials.origin==='migrated')notify('原工作区材料已恢复');
    window.dispatchEvent(new Event('hengji:workspace-ready'));
    if(preference('exercisePending',false))setTimeout(()=>exerciseStudio().then(studio=>studio.resume()).catch(()=>{}),0);
  }catch(error){if(startRevision!==revision)return;await paint();notify('材料尚未载入：'+error.message+'，可直接导入原表。');}
}
