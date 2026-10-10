import {Atlas} from './engine/atlas.js?v=glass-20261011';
import {normalizeDataset,SUBJECTS} from './data/compat.js?v=glass-20261011';
import {hydrate,save,sample,preference,remember,preserveUndo,previous,emptyDataset,loadNotebook,saveNotebook} from './data/workspace.js?v=glass-20261011';
import {mergeDatasets} from './data/parser.js?v=glass-20261011';
import {Inbox} from './data/inbox.js?v=glass-20261011';
import {esc,button,empty,table} from './ui/html.js?v=glass-20261011';
import {excel,word,print,download,chart,scoreRows,effectiveRows,subjectRows,answerRows,evidence} from './io/exports.js?v=glass-20261011';
import {directoryDefaults} from './engine/directory.js?v=glass-20261011';
import {peekView,compareView,drawerEvidence} from './ui/explorer.js?v=glass-20261011';
import {dockIcon} from './ui/icons.js?v=glass-20261011';

const routes=[['board','年级棋盘','▦'],['class','班级画布','▥'],['papers','试卷地图','▧'],['people','学生档案','◎'],['follow','跟进清单','↗'],['library','资料仓','⊞']];
const defaults={board:{mode:'map',metric:'underRate',historyMetric:'mean',search:'',page:1},class:{tab:'snapshot',value:'score',trendMetric:'mean',matrix:'total',search:'',page:1,matched:false},papers:{key:'',tab:'map',classes:[],question:0,order:'paper',search:'',page:1},people:{sid:'',storyMetric:'total',...directoryDefaults,filtersOpen:innerWidth>760},follow:{tier:'under',band:20,side:'below',classes:[],search:'',page:1},library:{tab:'materials'}};
const saved=preference('books',{}),books=Object.fromEntries(Object.entries(defaults).map(([key,value])=>[key,{...value,...saved[key]}]));
const session={plans:preference('plans',[]),recent:preference('recent',[]),savedPeople:preference('savedPeople',[]),comparePeople:preference('comparePeople',[]),notebook:[]};
let atlas=new Atlas(emptyDataset()),current='board',activeReport=null,exportReport=null,revision=0,paintId=0,searchTimer,noteTimer,inbox;
let drawerState=null,drawerClosing=null,drawerOpener=null,paintedObject='',paintedScrolls=new Map();
const reducedMotion=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
const loaded=new Map();
const num=value=>value===null||String(value).trim()===''?null:Number.isFinite(Number(value))?Number(value):null;
const converted=value=>value==='true'?true:value==='false'?false:value;
const stage=()=>document.getElementById('stage');
function notify(message){const toast=document.getElementById('toast');toast.textContent=message;toast.classList.add('visible');clearTimeout(notify.timer);notify.timer=setTimeout(()=>toast.classList.remove('visible'),4500);}
function persistBooks(){remember('books',books);}
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
function go(scene,values={}) {
  Object.assign(books[scene],values);current=scene;persistBooks();
  const next=path(scene);if(location.hash===next)paint(true);else location.hash=next;
}
function nav() {
  const dock=document.getElementById('navigation');
  if(!dock.children.length)dock.innerHTML='<span class="dock-indicator" aria-hidden="true"></span>'+routes.map(([id,label])=>'<button data-cmd="nav" data-scene="'+id+'"><span class="dock-symbol">'+dockIcon(id)+'</span><span>'+label+'</span><i></i></button>').join('');
  for(const b of dock.querySelectorAll('button'))if(b.dataset.scene===current)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');
  requestAnimationFrame(positionDock);
  document.title=(routes.find(r=>r[0]===current)?.[1]||'教学证据台')+' · 衡迹';
}
function positionDock(){const dock=document.getElementById('navigation'),selected=dock.querySelector('[aria-current="page"]');if(selected){dock.style.setProperty('--dock-x',selected.offsetLeft+'px');dock.style.setProperty('--dock-w',selected.offsetWidth+'px');}}
async function paint(transition=false,focus=null) {
  const serial=++paintId,scene=current;nav();
  try {
    if(!loaded.has(scene))loaded.set(scene,import('./scenes/'+scene+'.js?v=glass-20261011'));
    const module=await loaded.get(scene);if(serial!==paintId)return;
    const view=scene==='class'&&!atlas.classes.length?{html:empty('先带入一个班的材料','从导入原表开始建立班级画布。')+button('导入材料','import',{},'accent'),report:null}:module.render(atlas,books[scene],session);
    const object=scene+'|'+(scene==='people'?books.people.sid:scene==='papers'?books.papers.key:scene==='class'?books.class.no:''),changed=object!==paintedObject,previousScroll=window.scrollY;
    const positions=new Map([...stage().querySelectorAll('[data-motion-key]')].map(el=>[el.dataset.motionKey,el.getBoundingClientRect()]));
    const focused=document.activeElement?.closest('[data-cmd]'),focusedData=focused&&stage().contains(focused)?{...focused.dataset}:null;
    for(const el of stage().querySelectorAll('.table-scroll'))paintedScrolls.set(el.getAttribute('aria-label')||el.querySelector('table')?.getAttribute('aria-label'),el.scrollLeft);
    const apply=()=>{
      if(serial!==paintId)return;
      activeReport=view.report;
      stage().innerHTML=view.html;stage().dataset.scene=scene;stage().dataset.animate=transition||changed?'true':'false';paintedObject=object;
      if(focus){const input=stage().querySelector('[data-field="'+focus.key+'"]');input?.focus({preventScroll:true});if(input&&input.type!=='number')try{input.setSelectionRange(focus.position,focus.position);}catch{}}
      else if(focusedData&&!changed){const next=[...stage().querySelectorAll('[data-cmd]')].find(el=>Object.entries(focusedData).every(([k,v])=>el.dataset[k]===v));next?.focus({preventScroll:true});}
      for(const el of stage().querySelectorAll('.table-scroll'))el.scrollLeft=paintedScrolls.get(el.querySelector('table')?.getAttribute('aria-label'))||0;
      for(const rail of stage().querySelectorAll('.exam-rail')){const selected=rail.querySelector('.selected');if(selected)rail.scrollLeft=selected.offsetLeft-rail.offsetLeft-rail.clientWidth/2+selected.clientWidth/2;}
      if(changed)window.scrollTo({top:0,behavior:'instant'});else window.scrollTo({top:previousScroll,behavior:'instant'});
      if(!reducedMotion()) {
        if(changed&&!document.startViewTransition)stage().animate([{opacity:0,transform:'translateY(14px)'},{opacity:1,transform:'translateY(0)'}],{duration:420,easing:'cubic-bezier(.2,.8,.2,1)'});
        for(const el of stage().querySelectorAll('[data-motion-key]')){const before=positions.get(el.dataset.motionKey),after=el.getBoundingClientRect();if(before&&!changed&&(before.x!==after.x||before.y!==after.y))el.animate([{transform:'translate('+(before.x-after.x)+'px,'+(before.y-after.y)+'px)'},{transform:'translate(0,0)'}],{duration:420,easing:'cubic-bezier(.22,.8,.22,1)'});else if(!before)el.animate([{opacity:0,transform:'translateY(12px)'},{opacity:1,transform:'translateY(0)'}],{duration:420,delay:Math.min([...el.parentElement.children].indexOf(el),9)*22,fill:'backwards',easing:'cubic-bezier(.22,.8,.22,1)'});}
      }
    };
    if(transition&&document.startViewTransition&&!reducedMotion())await document.startViewTransition(apply).updateCallbackDone;else apply();
  }catch(error){if(serial!==paintId)return;stage().innerHTML=empty('这张研究画布暂时没有打开',error.message)+button('重新打开','reload',{},'outline')+button('导入材料','import',{},'accent');activeReport=null;}
}
function update(key,value,toggle=false) {
  const state=books[current];value=converted(value);
  if(['classes','profileNo','band','question','pageSize'].includes(key)&&value!=='all')value=Number(value);
  if(value==='all'&&key==='classes')value=[];
  if(toggle) {
    const before=Array.isArray(state[key])?state[key]:key==='exams'?atlas.classExams(state.no).map(e=>e.id):[];
    value=before.includes(value)?before.filter(v=>v!==value):[...before,value];
    if(key==='exams'&&!value.length){notify('请保留至少一个考次');return;}
  }
  state[key]=value;state.page=1;
  if(current==='people'&&key==='track')state.classes=[];
  if(current==='papers'&&key==='classes')state.question=0;
  if(current==='class'&&key==='tab')history.replaceState(null,'',path());
  persistBooks();paint(['tab','mode','view','exam','directoryExam','key'].includes(key));
}
async function installDataset(dataset,{fresh=false}={}) {
  atlas=new Atlas(dataset);ensureBooks();
  if(fresh){books.board.exam=atlas.latest;books.follow.exam=atlas.latest;books.class.exam=atlas.classExams(books.class.no).at(-1)?.id||atlas.latest;books.class.exams=atlas.classExams(books.class.no).map(e=>e.id);books.papers.key='';books.people.exam=atlas.story(books.people.sid).at(-1)?.exam;}
  document.getElementById('work-status').textContent=atlas.data.anonymous?'匿名成绩样本':atlas.data.scores.length?'本机教学资料':'空白工作区';
  persistBooks();await paint(true);
}
async function store() {try{await save(atlas.data);}catch{notify('本机保存暂时不可用，请下载完整备份保留材料。');}}
async function commitMaterial(incoming,mode) {
  if(atlas.data.anonymous&&!incoming.anonymous&&!incoming.scores.length)throw new Error('请先导入真实姓名的成绩原表，再补充这份小题。');
  revision++;try{await preserveUndo(atlas.data);}catch{}
  const dataset=normalizeDataset(mode==='replace'?incoming:mergeDatasets(atlas.data,incoming));
  if(incoming.plans||incoming.actions)session.plans=(incoming.plans||incoming.actions).map(p=>({...p,status:p.status==='doing'?'active':['new','active','done'].includes(p.status)?p.status:'new'}));
  else session.plans=session.plans.filter(p=>dataset.students.some(person=>person.id===p.sid));
  remember('plans',session.plans);
  if(Array.isArray(incoming.savedPeople)){session.savedPeople=incoming.savedPeople;remember('savedPeople',session.savedPeople);}
  if(Array.isArray(incoming.comparePeople)){session.comparePeople=incoming.comparePeople;remember('comparePeople',session.comparePeople);}
  if(incoming.notebook){session.notebook=incoming.notebook;await saveNotebook(session.notebook);}
  await installDataset(dataset,{fresh:true});await store();notify('材料已加入工作区');
}
function openReport(report) {
  if(!report){notify('先打开一个班级、学生或试卷，再摘录研究结果。');return;}
  exportReport=report;
  const content=document.getElementById('report-content');
  content.innerHTML='<div class="inbox-top"><span class="overline">研究材料出口</span>'+button('×','close-report',{},'icon-only','aria-label="关闭材料出口"')+'</div><h2>'+esc(report.title)+'</h2><p>'+esc(report.subtitle)+'</p><label class="field"><span>教师判断与后续行动</span><textarea id="report-note" placeholder="把你的判断写在证据旁边">'+esc(report.note||'')+'</textarea></label><div class="report-outlets">'+button('下载 Excel','report-excel',{},'accent')+button('下载 Word','report-word',{},'outline')+button('打印 / 保存 PDF','report-print',{},'outline')+'</div><div class="report-preview">'+report.sections.map(section=>'<section><h3>'+esc(section.title)+'</h3><p>'+section.rows.length+' 行记录 · 导出保留完整内容</p>'+table(section.headers,section.rows.slice(0,5).map(row=>row.map(value=>esc(value??'—'))))+'</section>').join('')+'</div>';
  const dialog=document.getElementById('report-dialog');if(!dialog.open)dialog.showModal();
}
async function capture(source=activeReport) {
  if(!source){openReport(null);return;}
  const report={...structuredClone(source),id:'e'+Date.now().toString(36)};session.notebook.unshift(report);
  try{await saveNotebook(session.notebook);}catch{notify('摘录暂时保留在本次页面，请下载备份。');}
  openReport(report);
}
function drawDrawer() {
  const dialog=document.getElementById('research-drawer'),content=document.getElementById('drawer-content'),focus=document.activeElement?.dataset;
  if(!drawerState)return;
  dialog.classList.toggle('comparison-drawer',drawerState.type==='compare');
  content.innerHTML=drawerState.type==='compare'?compareView(atlas,session.comparePeople,drawerState,drawerState.context):peekView(atlas,drawerState.sid,drawerState.exam,session);
  if(focus?.cmd){const target=[...content.querySelectorAll('[data-cmd]')].find(el=>Object.entries(focus).every(([k,v])=>el.dataset[k]===v));target?.focus({preventScroll:true});}
}
function openDrawer(state) {
  const dialog=document.getElementById('research-drawer');if(drawerClosing)return;
  drawerState=state;drawDrawer();
  if(!dialog.open){drawerOpener=document.activeElement;dialog.showModal();document.body.classList.add('drawer-open');dialog.scrollTop=0;if(!reducedMotion())dialog.animate([{opacity:0,transform:'translateX(64px)'},{opacity:1,transform:'translateX(0)'}],{duration:420,easing:'cubic-bezier(.16,1,.3,1)'});}
}
function closeDrawer() {
  const dialog=document.getElementById('research-drawer');if(drawerClosing)return drawerClosing;if(!dialog.open)return Promise.resolve();
  drawerClosing=(async()=>{if(!reducedMotion()){try{await dialog.animate([{opacity:1,transform:'translateX(0)'},{opacity:0,transform:'translateX(52px)'}],{duration:220,easing:'cubic-bezier(.4,0,1,1)'}).finished;}catch{}}dialog.close();document.body.classList.remove('drawer-open');drawerState=null;drawerOpener?.isConnected&&drawerOpener.focus({preventScroll:true});})();
  drawerClosing.finally(()=>{drawerClosing=null;});return drawerClosing;
}
function sourceExam(sid){return current==='papers'?books.papers.key.split('|')[1]:['board','class','follow'].includes(current)?books[current].exam:current==='people'&&!books.people.sid&&books.people.directoryExam!=='latest'?books.people.directoryExam:atlas.story(sid).at(-1)?.exam;}
function addFollow(sid,exam,tier) {
  const row=atlas.story(sid).find(r=>r.exam===exam);if(!row)return;
  const id=sid+'|'+exam+'|'+tier;
  if(session.plans.some(p=>p.id===id)){notify('这条跟进已在看板中');return;}
  const nearest=atlas.critical(exam,{tier,band:10000,side:'both'}).find(item=>item.row.sid===sid)?.nearest;
  session.plans.unshift({id,sid,exam,tier,classNo:row.classNo,subject:nearest?.subject||'',status:'new',note:'',created:new Date().toISOString()});remember('plans',session.plans);notify('已加入跟进看板');if(current==='follow')paint();
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
  if(event.target.closest('#inbox'))return;
  const b=event.target.closest('[data-cmd]');if(!b||b.disabled)return;
  const d=b.dataset,state=books[current];
  try {
    if(d.cmd==='nav')go(d.scene);
    else if(d.cmd==='set'||d.cmd==='toggle')update(d.key,d.value,d.cmd==='toggle');
    else if(d.cmd==='import')inbox.choose();
    else if(d.cmd==='find'){go('people',{sid:'',...directoryDefaults});setTimeout(()=>stage().querySelector('[data-field="search"]')?.focus(),100);}
    else if(d.cmd==='class') {
      const no=Number(d.no),exam=current==='board'?books.board.exam:books.class.exam;
      go('class',{no,exam:atlas.classAt(no,exam).length?exam:atlas.classExams(no).at(-1)?.id,search:'',page:1,exams:atlas.classExams(no).map(e=>e.id)});
    }
    else if(d.cmd==='person') {
      const exam=d.exam||sourceExam(d.sid);
      session.recent=[d.sid,...session.recent.filter(id=>id!==d.sid)].slice(0,12);remember('recent',session.recent);go('people',{sid:d.sid,exam});
    }
    else if(d.cmd==='person-exam')go('people',{exam:d.exam});
    else if(d.cmd==='person-back')go('people',{sid:''});
    else if(d.cmd==='peek')openDrawer({type:'person',sid:d.sid,exam:d.exam||sourceExam(d.sid)});
    else if(d.cmd==='drawer-stage'){drawerState={type:'person',sid:d.sid,exam:d.exam};drawDrawer();if(!reducedMotion())document.getElementById('drawer-content').animate([{opacity:.4},{opacity:1}],{duration:260});}
    else if(d.cmd==='drawer-close')await closeDrawer();
    else if(d.cmd==='drawer-capture')await capture(drawerEvidence(atlas,drawerState,session.comparePeople));
    else if(d.cmd==='drawer-export')openReport(drawerEvidence(atlas,drawerState,session.comparePeople));
    else if(d.cmd==='drawer-person'){await closeDrawer();session.recent=[d.sid,...session.recent.filter(id=>id!==d.sid)].slice(0,12);remember('recent',session.recent);go('people',{sid:d.sid,exam:d.exam,subject:d.subject});}
    else if(d.cmd==='directory-reset'){const context={directoryExam:state.directoryExam,view:state.view,pageSize:state.pageSize};Object.assign(state,directoryDefaults,context);persistBooks();paint();}
    else if(d.cmd==='save-person'){session.savedPeople=session.savedPeople.includes(d.sid)?session.savedPeople.filter(id=>id!==d.sid):[...session.savedPeople,d.sid];remember('savedPeople',session.savedPeople);await paint();drawDrawer();}
    else if(d.cmd==='compare-toggle') {
      if(session.comparePeople.includes(d.sid))session.comparePeople=session.comparePeople.filter(id=>id!==d.sid);
      else {if(session.comparePeople.length>=4){notify('并排比较最多4人，可以先移除一位。');return;}session.comparePeople.push(d.sid);}
      remember('comparePeople',session.comparePeople);await paint();drawDrawer();
    }
    else if(d.cmd==='compare-clear'){session.comparePeople=[];remember('comparePeople',[]);paint();}
    else if(d.cmd==='compare-open') {if(session.comparePeople.length>=2)openDrawer({type:'compare',metric:'percentile',common:false,context:state.directoryExam||'latest'});}
    else if(d.cmd==='compare-metric'){drawerState.metric=d.value;drawDrawer();}
    else if(d.cmd==='compare-common'){drawerState.common=!drawerState.common;drawDrawer();}
    else if(d.cmd==='paper')go('papers',{key:d.key,classes:[],question:0,tab:'map',page:1});
    else if(d.cmd==='paper-back')go('papers',{key:''});
    else if(d.cmd==='subject-open')go('board',{mode:'subjects',subject:d.subject,exam:d.exam});
    else if(d.cmd==='question'){books.papers.question=Number(d.index);books.papers.tab='map';persistBooks();paint();}
    else if(d.cmd==='page'){state.page=Math.max(1,(state.page||1)+Number(d.step));persistBooks();paint();}
    else if(d.cmd==='capture')await capture();
    else if(d.cmd==='export')openReport(activeReport);
    else if(d.cmd==='close-report')document.getElementById('report-dialog').close();
    else if(d.cmd==='report-excel')await excel({...exportReport.sheets,'教师判断':[['教师判断'],[exportReport.note||'']]},exportReport.title);
    else if(d.cmd==='report-word')await word(exportReport);
    else if(d.cmd==='report-print')print(exportReport);
    else if(d.cmd==='svg'||d.cmd==='png')chart(d.id,d.cmd==='png');
    else if(d.cmd==='backup')download(JSON.stringify({...atlas.data,plans:session.plans,notebook:session.notebook,savedPeople:session.savedPeople,comparePeople:session.comparePeople}),'衡迹-完整工作区-'+new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Shanghai'})+'.json','application/json');
    else if(d.cmd==='template')await template();
    else if(d.cmd==='four-sheets')await excel(fourSheets(),'衡迹-四表分析包');
    else if(d.cmd==='undo'){const dataset=await previous();if(!dataset){notify('没有可撤回的材料替换');return;}revision++;await installDataset(dataset,{fresh:true});await store();notify('已恢复上一次材料');}
    else if(d.cmd==='sample'||d.cmd==='clear'){revision++;try{await preserveUndo(atlas.data);}catch{}await installDataset(d.cmd==='sample'?await sample():emptyDataset(),{fresh:true});await store();}
    else if(d.cmd==='follow-add')addFollow(d.sid,d.exam,d.tier);
    else if(d.cmd==='follow-remove'){session.plans=session.plans.filter(p=>p.id!==d.id);remember('plans',session.plans);paint();}
    else if(d.cmd==='follow-status'){const plan=session.plans.find(p=>p.id===d.id);if(plan){plan.status=d.status;remember('plans',session.plans);paint();}}
    else if(d.cmd==='notebook-open')openReport(session.notebook.find(note=>note.id===d.id));
    else if(d.cmd==='notebook-remove'){session.notebook=session.notebook.filter(note=>note.id!==d.id);await saveNotebook(session.notebook);paint();}
    else if(d.cmd==='notebook-export') {
      if(!session.notebook.length){notify('还没有保存的摘录');return;}
      const sections=session.notebook.flatMap(note=>[...note.sections.map(section=>({...section,title:note.title+' / '+section.title})),{title:note.title+' / 教师判断',headers:['记录'],rows:[[note.note||'']]}]);
      const sheets=Object.fromEntries(session.notebook.flatMap((note,i)=>Object.entries(note.sheets).map(([name,rows])=>[(i+1)+'-'+name,rows])));
      openReport(evidence('衡迹 · 教学证据摘录',atlas.data.school||'',sections,sheets));
    }
    else if(d.cmd==='reload')location.reload();
  }catch(error){notify(error.message);}
}
async function forms(event) {
  const form=event.target;if(!form.dataset.form)return;event.preventDefault();
  const f=new FormData(form),data=atlas.data;
  try {
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
  inbox=new Inbox(commitMaterial,notify,()=>atlas.data);
  document.addEventListener('click',commands);document.addEventListener('submit',forms);
  const drawer=document.getElementById('research-drawer');drawer.addEventListener('cancel',event=>{event.preventDefault();closeDrawer();});drawer.addEventListener('click',event=>{if(event.target!==drawer)return;const bounds=drawer.getBoundingClientRect();if(event.clientX<bounds.left||event.clientX>bounds.right||event.clientY<bounds.top||event.clientY>bounds.bottom)closeDrawer();});
  document.addEventListener('toggle',event=>{if(event.target.matches('.directory-filters')){books.people.filtersOpen=event.target.open;persistBooks();}},true);
  window.addEventListener('resize',positionDock);
  document.addEventListener('keydown',event=>{if(event.target.matches('.student-dot')&&['Enter',' '].includes(event.key)){event.preventDefault();event.target.dispatchEvent(new MouseEvent('click',{bubbles:true}));}});
  document.addEventListener('input',event=>{
    const target=event.target;
    if(target.dataset.field) {
      const scene=current,key=target.dataset.field,position=target.selectionStart;books[scene][key]=target.value;books[scene].page=1;persistBooks();clearTimeout(searchTimer);
      searchTimer=setTimeout(()=>{if(current===scene)paint(false,{key,position});},160);
    }
    if(target.dataset.planNote){const plan=session.plans.find(p=>p.id===target.dataset.planNote);if(plan){plan.note=target.value;remember('plans',session.plans);}}
    if(target.dataset.evidenceNote){const note=session.notebook.find(n=>n.id===target.dataset.evidenceNote);if(note){note.note=target.value;clearTimeout(noteTimer);noteTimer=setTimeout(()=>saveNotebook(session.notebook).catch(()=>notify('请下载备份以保留摘录')),400);}}
    if(target.id==='report-note'&&exportReport){exportReport.note=target.value;if(exportReport.id){const note=session.notebook.find(n=>n.id===exportReport.id);if(note){note.note=target.value;clearTimeout(noteTimer);noteTimer=setTimeout(()=>saveNotebook(session.notebook).catch(()=>{}),400);}}}
  });
  document.addEventListener('keydown',async event=>{if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='k'){event.preventDefault();await closeDrawer();go('people',{sid:'',...directoryDefaults});setTimeout(()=>stage().querySelector('[data-field="search"]')?.focus(),100);}});
  document.addEventListener('dragstart',event=>{const card=event.target.closest('[data-plan]');if(card)event.dataTransfer.setData('text/plain',card.dataset.plan);});
  document.addEventListener('dragover',event=>{if(event.target.closest('.follow-lane'))event.preventDefault();});
  document.addEventListener('dragenter',event=>event.target.closest('.follow-lane')?.classList.add('dragover'));
  document.addEventListener('dragleave',event=>{const lane=event.target.closest('.follow-lane');if(lane&&!lane.contains(event.relatedTarget))lane.classList.remove('dragover');});
  document.addEventListener('drop',event=>{
    const lane=event.target.closest('.follow-lane');if(!lane)return;event.preventDefault();
    const plan=session.plans.find(p=>p.id===event.dataTransfer.getData('text/plain'));if(plan){plan.status=['new','active','done'][[...lane.parentElement.children].indexOf(lane)];remember('plans',session.plans);paint();}
  });
  window.addEventListener('hashchange',async()=>{await closeDrawer();readRoute();if(atlas.exams.length)ensureBooks();persistBooks();paint(true);});
  readRoute();nav();window.dispatchEvent(new Event('hengji:ready'));
  const startRevision=revision;
  try {
    const [materials,notebook]=await Promise.all([hydrate(),loadNotebook().catch(()=>[])]);
    if(startRevision!==revision)return;
    session.notebook=notebook||[];
    if(!session.plans.length){try{session.plans=(JSON.parse(localStorage.getItem('jianwei:actions'))||[]).map(p=>({...p,status:p.status==='done'?'done':'active'}));}catch{}}
    await installDataset(materials.dataset);if(materials.origin==='migrated')notify('原工作区材料已带入衡迹');
  }catch(error){if(startRevision!==revision)return;await paint();notify('材料尚未载入：'+error.message+'，可直接导入原表。');}
}
