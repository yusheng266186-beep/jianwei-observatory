const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {makeFixture}=require('./fixtures.cjs');
const suffix=process.env.SURFACE_RUN?'-'+process.env.SURFACE_RUN.replace(/[^a-z0-9_-]/gi,''):'';
const output=path.join(__dirname,'../.audit-output/surface'+suffix);fs.mkdirSync(output,{recursive:true});
const fixture=makeFixture();
for(const row of fixture.scores){row.rawTotal=row.total===null?null:row.total-12;row.cityRank=row.schoolRank*11;row.rawCityRank=row.schoolRank*12;row.rawSchoolRank=row.schoolRank+2;for(const score of Object.values(row.subjects)){score.cityRank=score.schoolRank*9;score.rawCityRank=score.schoolRank*10;}}
for(const no of [4,7,10,17,18])fixture.profiles[no]={classNo:no,track:[10,18].includes(no)?'history':'physics',cohort:no>=17?'repeat':'regular',lead:'匿名班主任'+no,type:'教学班',combination:[10,18].includes(no)?'史政地':'物化生',foreignLanguage:no===7?'日语':'英语',teachers:{语文:'匿名语文教师',数学:'匿名数学教师',英语:'匿名英语教师',日语:'匿名日语教师'},targets:{top:3,under:10}};
fixture.answers.push(...fixture.answers.map(a=>({...structuredClone(a),exam:'51',values:a.values.map(v=>v===null?null:Math.max(0,v-1))})));
for(const [key,bank] of Object.entries({...fixture.banks}))fixture.banks[key.replace('|52','|51')]=structuredClone(bank);
fixture.scores.push({...structuredClone(fixture.scores[0]),exam:'50',total:360});fixture.exams.unshift({id:'50',label:'仅一班有记录的考试',order:0,scope:'city'});
const material=output+'/material.json';fs.writeFileSync(material,JSON.stringify(fixture));
const results=[],issues=[],views=[],actions=[],forms=[],captures=[],tooltips=[];let page,context,activeGroup;
const errors=[],resources=[];
const flush=()=>fs.writeFileSync(output+'/results.json',JSON.stringify({results,issues,views,actions,forms,captures,tooltips,errors,resources},null,2));
const unique=items=>[...new Set(items)];

(async()=>{
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
async function click(selector,{wait=100}={}){
 let el=typeof selector==='string'?page.locator(selector).filter({visible:true}).first():selector;
 if(typeof selector==='string'){
  const modal=await page.evaluate(()=>document.activeElement?.closest('dialog[open]')?.id);
  if(modal){const local=page.locator('#'+modal).locator(selector).filter({visible:true});if(await local.count())el=local.first();}
 }
 const d=await el.evaluate(e=>({tag:e.tagName,label:e.getAttribute('aria-label')||e.textContent.trim(),data:{...e.dataset}}));
 await el.click();actions.push({group:activeGroup,...d});if(wait)await page.waitForTimeout(wait);
}
const nav=scene=>click(`[data-cmd="nav"][data-scene="${scene}"]`,{wait:180});
const set=(key,value,root='#stage')=>click(`${root} [data-cmd="set"][data-key="${key}"][data-value="${value}"]`);
async function options(key,root='#stage'){
 const values=unique(await page.locator(`${root} [data-cmd="set"][data-key="${key}"]`).evaluateAll(es=>es.map(e=>e.dataset.value)));
 for(const value of values){await set(key,value,root);await layout(`${activeGroup}:${key}=${value}`);}
}
async function closeDrawer(){if(await page.locator('#research-drawer').getAttribute('open')!==null)await click('[data-cmd="drawer-close"]');}
async function layout(name){
 const state=await page.evaluate(()=>{
  const visible=e=>!!e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden';
  const root=document.activeElement?.closest('dialog[open]')||document.getElementById('stage');
  return {width:innerWidth,overflow:document.documentElement.scrollWidth-innerWidth,root:root.id,text:root.textContent,buttons:[...root.querySelectorAll('button,[data-plot-action],.student-dot')].filter(visible).map(e=>({tag:e.tagName,label:e.getAttribute('aria-label')||e.textContent.trim(),data:{...e.dataset},disabled:!!e.disabled})),charts:[...root.querySelectorAll('svg:not(.mini):not(.dock-symbol svg)')].filter(e=>e.id&&visible(e)).map(e=>({id:e.id,width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height,viewBox:e.getAttribute('viewBox')})),forms:[...root.querySelectorAll('form')].map(e=>e.dataset.form||'mapping')};
 });
 delete state.text;
 views.push({name,...state});
 assert.ok(state.overflow<=1,name+' 整页横向溢出 '+state.overflow+'px');
 for(const chart of state.charts)assert.ok(chart.width>10&&chart.height>5,name+' 图表不可见 '+chart.id);
}
async function inspect(name,{tables=true,charts=true,mobile=true}={}){
 const root='#'+await page.evaluate(()=>document.activeElement?.closest('dialog[open]')?.id||'stage');
 const details=page.locator(root+' details');for(let i=0;i<await details.count();i++)if(await details.nth(i).isVisible()&&await details.nth(i).getAttribute('open')===null)await click(details.nth(i).locator('summary'));
 await layout(name);
 if(mobile){for(const width of [390,320,820]){await page.setViewportSize({width,height:900});await layout(name+'@'+width);if(width===390){const mobileCapture=output+'/mobile-'+views.length+'.png';await page.screenshot({path:mobileCapture});captures.push({name,file:path.basename(mobileCapture),viewport:page.viewportSize(),root});}}await page.setViewportSize({width:1440,height:1000});}
 const capture=output+'/view-'+views.length+'.png';await page.screenshot({path:capture,fullPage:false});captures.push({name,file:path.basename(capture),viewport:page.viewportSize(),root});
 if(tables){
  const keys=unique(await page.locator(root+' .table-frame').evaluateAll(es=>es.filter(e=>e.getClientRects().length).map(e=>e.dataset.tableKey)));
  for(const key of keys){const frame=page.locator(`${root} .table-frame[data-table-key="${key}"]`).first();
   for(const direction of ['1','-1']){const b=frame.locator(`[data-cmd="table-shift"][data-direction="${direction}"]`);if(!await b.isDisabled())await click(b);}
   const expand=frame.locator('[data-cmd="table-open"]');if(await expand.count()){
    const rows=await frame.locator('tbody tr').count();await click(expand);
    assert.equal(await page.locator('#table-reader tbody tr').count(),rows);
    await layout(name+':宽表阅读');await click('#table-reader [data-cmd="table-close"]');
   }
  }
 }
 if(charts){
  const ids=unique(await page.locator(root+' [data-cmd="svg"]').evaluateAll(es=>es.map(e=>e.dataset.id)));
  for(const id of ids)for(const kind of ['svg','png'])await attempt(name+' '+id+' '+kind,async()=>{
   const control=page.locator(`${root} [data-cmd="${kind}"][data-id="${id}"]`);
   if(!await page.locator(`[id="${id}"]`).count()){assert.equal(await control.isDisabled(),true,'没有可绘制数据时导出应禁用');assert.match(await control.getAttribute('aria-label'),/没有可绘制/);return;}
   assert.equal(await control.isDisabled(),false);
   const pending=page.waitForEvent('download',{timeout:5000});await click(`${root} [data-cmd="${kind}"][data-id="${id}"]`);
   const download=await pending;assert.equal(await download.failure(),null);await download.saveAs(output+'/'+id+'.'+kind);
   const bytes=fs.readFileSync(output+'/'+id+'.'+kind);assert.ok(bytes.length>100);
   if(kind==='png')assert.equal(bytes.subarray(1,4).toString(),'PNG');else assert.match(bytes.toString(),/<svg/);
  });
 }
}
async function attempt(name,fn){try{await fn();}catch(e){issues.push({group:activeGroup,name,error:e.message});console.log('ISSUE '+name+' '+e.message.slice(0,250));await page.screenshot({path:output+'/issue-'+issues.length+'.png'});}flush();}
async function group(name,fn,{empty=false}={}){
 if(process.argv[2]&&!new RegExp(process.argv[2]).test(name))return;
 activeGroup=name;context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce',acceptDownloads:true});page=await context.newPage();page.setDefaultTimeout(5000);
 page.on('pageerror',e=>errors.push({group:name,error:e.message}));page.on('response',r=>{if(r.status()>=400)resources.push({group:name,status:r.status(),url:r.url()});});
 await page.addInitScript(()=>{window.print=()=>{window.__printCalled=(window.__printCalled||0)+1;};});
 try{await page.goto(process.env.AUDIT_URL||'http://127.0.0.1:4173');await page.waitForSelector('#navigation button');
 if(!empty){await page.locator('#files').setInputFiles(material);await click('[data-inbox="commit"]');await page.waitForSelector('body[data-workspace="ready"]');}
 const before=issues.length;await fn();results.push({name,ok:issues.length===before});console.log((issues.length===before?'PASS ':'FAIL ')+name);
 }catch(e){results.push({name,ok:false,error:e.message});console.log('FAIL '+name+' '+e.message.slice(0,500));await page.screenshot({path:output+'/failure-'+results.length+'.png'});}finally{flush();await context.close();}
}
async function report(cmd='export',root='#stage'){
 await click(root+` [data-cmd="${cmd}"]`);assert.equal(await page.locator('#report-dialog').getAttribute('open'),'');await inspect(activeGroup+':报告',{charts:false});
 for(const index of unique(await page.locator('[data-cmd="report-section"]').evaluateAll(es=>es.map(e=>e.dataset.index)))){await click(`[data-cmd="report-section"][data-index="${index}"]`);await layout(activeGroup+':报告内容'+index);const next=page.locator('#report-dialog [data-cmd="report-page"][data-step="1"]');if(!await next.isDisabled()){await click(next);await click('#report-dialog [data-cmd="report-page"][data-step="-1"]');}}
 await page.locator('[data-report-search]').fill('没有这条匿名记录');await page.waitForTimeout(350);assert.equal(await page.locator('#report-content tbody tr').count(),0);await page.locator('[data-report-search]').fill('');await page.waitForTimeout(350);
 await page.locator('#report-note').fill('全界面检查的匿名判断');await click('[data-cmd="report-keep"]');
 for(const kind of ['excel','word']){const pending=page.waitForEvent('download');await click(`[data-cmd="report-${kind}"]`);const d=await pending;assert.equal(await d.failure(),null);}
 await click('[data-cmd="report-print"]');assert.ok(await page.locator('#print-area tbody tr').count()>0);assert.equal(await page.evaluate(()=>window.__printCalled),1);
 await click('[data-cmd="close-report"]');
}
async function drawerViews(name){
 const values=unique(await page.locator('#drawer-content [data-cmd="drawer-tab"]').evaluateAll(es=>es.map(e=>e.dataset.value)));
 for(const value of values){await click(`#drawer-content [data-cmd="drawer-tab"][data-value="${value}"]`);await inspect(name+':'+value);}
}

await group('01 空白入口和阅读偏好',async()=>{
 for(const scene of ['board','class','papers','people','follow','library']){await nav(scene);assert.equal(await page.locator('#welcome-title').count(),1);await inspect('空白:'+scene,{tables:false,charts:false});}
 await click('[data-cmd="reading"]');
 for(const key of ['density','surface','motion'])for(const value of unique(await page.locator(`[data-cmd="reading-set"][data-key="${key}"]`).evaluateAll(es=>es.map(e=>e.dataset.value)))){await click(`[data-cmd="reading-set"][data-key="${key}"][data-value="${value}"]`);assert.equal(await page.locator('body').getAttribute('data-'+key),value);await layout('阅读:'+key+'='+value);}
 await click('[data-cmd="reading-reset"]');await click('[data-cmd="reading-close"]');
 const fileChooser=page.waitForEvent('filechooser');await click('#stage [data-cmd="import"]');await (await fileChooser).setFiles(material);await click('[data-inbox="close"]');
}, {empty:true});

await group('02 年级六视角和全部图表',async()=>{
 await nav('board');
 for(const mode of ['overview','map','targets','subjects','history','roster']){
  await set('mode',mode);await inspect('年级:'+mode);
  for(const key of {overview:['overviewMetric','comparison'],map:['metric'],targets:['comparison'],subjects:['subject'],history:['historyMetric'],roster:[]}[mode])await options(key);
  await set('exam','51');await layout('年级:'+mode+':旧考次');await set('exam','52');
 }
 await set('mode','overview');
 for(const target of ['targets','papers','history','roster']){await click(`[data-cmd="workbook-open"][data-target="${target}"]`);await layout('四表入口:'+target);await nav('board');await set('mode','overview');}
 for(const lens of ['nearUnder','nearTop','down','questions']){await click(`.inquiry-grid [data-lens="${lens}"]`);assert.equal(await page.locator('#stage').getAttribute('data-scene'),'people');await nav('board');await set('mode','overview');}
 const classes=await page.locator('#stage svg [data-cmd="class"]').evaluateAll(es=>es.map(e=>e.dataset.no));
 for(const no of classes){await click(`#stage svg [data-cmd="class"][data-no="${no}"]`);assert.match(await page.locator('#stage h1').textContent(),new RegExp(no+'班'));await nav('board');await set('mode','overview');}
 await set('mode','map');for(const no of unique(await page.locator('.class-tile').evaluateAll(es=>es.map(e=>e.dataset.no)))){await click(`.class-tile[data-no="${no}"]`);assert.match(await page.locator('#stage h1').textContent(),new RegExp(no+'班'));await nav('board');await set('mode','map');}
 await set('mode','roster');await click('#stage [data-cmd="page"][data-step="1"]');await click('#stage [data-cmd="page"][data-step="-1"]');
 await set('mode','overview');await click('[data-cmd="library-open"]');assert.equal(await page.locator('#stage').getAttribute('data-scene'),'library');await nav('board');await set('mode','history');await report();
});

await group('03 每班三视角和全部成绩展示',async()=>{
 await nav('class');
 for(const no of [4,7,10,17,18]){
  await click(`.class-picker [data-no="${no}"]`);
  for(const tab of ['snapshot','history','targets']){await set('tab',tab);await inspect('班级:'+no+':'+tab);}
 }
 await click('.class-picker [data-no="4"]');await set('tab','snapshot');
 for(const key of ['value','subjectView','sort'])await options(key);
 await set('tab','history');for(const key of ['trendMetric','matrix'])await options(key);
 await set('matched','true');await layout('班级共同参考');await set('growth','true');
 await click('#class-trajectory [data-cmd="class-exam"][data-exam="51"]');assert.equal(await page.locator('#stage [data-key="tab"][data-value="snapshot"]').getAttribute('aria-pressed'),'true');await set('tab','history');
 for(const exam of ['50','51','52'])await click(`[data-cmd="toggle"][data-key="exams"][data-value="${exam}"]`);
 assert.equal(await page.locator('.exam-rail [data-key="exams"][aria-pressed="true"]').count(),1,'至少保留一个考次');
 await layout('取消考次选择');
 await set('tab','targets');await options('tier');await report();
});

await group('04 学科观察所有条件、历次与小题',async()=>{
 await nav('class');await set('tab','snapshot');
 const subjects=unique(await page.locator('#stage [data-cmd="class-subject"]').evaluateAll(es=>es.map(e=>e.dataset.subject)));
 for(const subject of subjects){await click(`#stage [data-cmd="class-subject"][data-subject="${subject}"]`);await drawerViews('学科观察:'+subject);await closeDrawer();}
 await click('#stage [data-cmd="class-subject"][data-subject="数学"]');await click('#drawer-content [data-cmd="drawer-tab"][data-value="students"]');
 for(const tier of ['top','under']){await click(`[data-cmd="lens-tier"][data-value="${tier}"]`);for(const value of unique(await page.locator('[data-cmd="lens-filter"]').evaluateAll(es=>es.filter(e=>!e.disabled).map(e=>e.dataset.value)))){await click(`[data-cmd="lens-filter"][data-value="${value}"]`);await layout('学科条件:'+tier+':'+value);}}
 for(const value of ['low','high','name'])await click(`[data-cmd="lens-sort"][data-value="${value}"]`);
 await click('[data-cmd="lens-filter"][data-value="all"]');await click('[data-cmd="lens-page"][data-step="1"]');await click('[data-cmd="lens-page"][data-step="-1"]');
 await page.locator('[data-drawer-field="search"]').fill('不存在的匿名学生');await page.waitForTimeout(300);await layout('学科空名单');await page.locator('[data-drawer-field="search"]').fill('');await page.waitForTimeout(300);
 await click('#drawer-content [data-cmd="drawer-tab"][data-value="history"]');for(const exam of ['50','51','52'])if(await page.locator(`[data-cmd="lens-exam"][data-exam="${exam}"]`).count())await click(`[data-cmd="lens-exam"][data-exam="${exam}"]`);
 await click('#drawer-content [data-cmd="drawer-tab"][data-value="papers"]');await click('[data-cmd="lens-paper"]');assert.equal(await page.locator('#research-drawer').getAttribute('open'),null);
 await nav('class');await click('#stage [data-cmd="class-subject"][data-subject="数学"]');await report('drawer-export','#drawer-content');await click('[data-cmd="subject-open"]');assert.equal(await page.locator('#stage').getAttribute('data-scene'),'board');
});

await group('05 每张试卷六视角与所有小题卡片',async()=>{
 await nav('papers');await options('shelfSubject');await set('shelfSubject','all');await options('shelfExam');await set('shelfExam','all');await options('shelfView');await set('shelfView','cards');
 const papers=await page.locator('[data-cmd="paper"]').evaluateAll(es=>es.map(e=>e.dataset.key));
 for(const key of papers){await click(`[data-cmd="paper"][data-key="${key}"]`);
  for(const tab of ['map','knowledge','classes','details','students','responses']){await set('tab',tab);await inspect('试卷:'+key+':'+tab);}
  await set('tab','classes');for(const cell of await page.locator('.heatmap [data-cmd="question"]').evaluateAll(es=>es.map(e=>({no:e.dataset.no,index:e.dataset.index})))){await click(`.heatmap [data-no="${cell.no}"][data-index="${cell.index}"]`);assert.match(await page.locator('.lens-scope').textContent(),new RegExp(cell.no+'班'));await closeDrawer();}
  await set('tab','students');
  for(;;){const cells=await page.locator('.answer-cell').evaluateAll(es=>es.map(e=>({sid:e.dataset.sid,index:e.dataset.index,value:e.textContent.trim()})));
   for(const cell of cells){await click(`.answer-cell[data-sid="${cell.sid}"][data-index="${cell.index}"]`);assert.equal(await page.locator('.answer-focus strong').evaluate(e=>e.firstChild.textContent.trim()),cell.value);await closeDrawer();}
   const next=page.locator('#stage [data-cmd="page"][data-step="1"]');if(await next.isDisabled())break;await click(next);
  }
  const previous=page.locator('#stage [data-cmd="page"][data-step="-1"]');if(!await previous.isDisabled())await click(previous);
  await set('tab','map');await options('order');const indices=await page.locator('.question-map [data-cmd="question"]').evaluateAll(es=>es.map(e=>e.dataset.index));
  for(const index of indices){await click(`.question-map [data-index="${index}"]`);await inspect('单题:'+key+':'+index);await closeDrawer();}
  await set('tab','responses');await options('question');await options('answerOrder');
  await click('[data-cmd="paper-back"]');await set('shelfExam','all');
 }
});

await group('06 热力格子、知识点路径与单题所有控件',async()=>{
 await nav('papers');await click('[data-cmd="paper"][data-key="数学|52"]');await set('tab','classes');
 const cells=await page.locator('.heatmap [data-cmd="question"]').evaluateAll(es=>es.map(e=>({no:e.dataset.no,index:e.dataset.index})));
 for(const cell of cells){await click(`.heatmap [data-no="${cell.no}"][data-index="${cell.index}"]`);assert.match(await page.locator('.lens-scope').textContent(),new RegExp(cell.no+'班'));await closeDrawer();}
 await set('tab','students');
 const answers=await page.locator('.answer-cell').evaluateAll(es=>es.map(e=>({sid:e.dataset.sid,index:e.dataset.index})));
 for(const cell of answers){await click(`.answer-cell[data-sid="${cell.sid}"][data-index="${cell.index}"]`);assert.equal(await page.locator('.answer-focus').count(),1);await closeDrawer();}
 await set('tab','knowledge');
 for(const knowledge of ['函数','未标注'])if(await page.locator(`[data-cmd="knowledge-open"][data-knowledge="${knowledge}"]`).count()){
  await click(`[data-cmd="knowledge-open"][data-knowledge="${knowledge}"]`);await drawerViews('知识点:'+knowledge);
  const classes=unique(await page.locator('[data-cmd="knowledge-class"]').evaluateAll(es=>es.map(e=>e.dataset.no)));
  for(const no of classes){await click(`[data-cmd="knowledge-class"][data-no="${no}"]`);await layout('知识点班级:'+no);await click('#drawer-back');}
  await click('#drawer-content [data-cmd="drawer-tab"][data-value="students"]');for(const value of unique(await page.locator('[data-cmd="lens-filter"]').evaluateAll(es=>es.filter(e=>!e.disabled).map(e=>e.dataset.value)))){await click(`[data-cmd="lens-filter"][data-value="${value}"]`);await layout('知识点条件:'+value);}
  await closeDrawer();
 }
 await set('tab','map');await click('.question-map [data-index="0"]');
 for(const value of unique(await page.locator('[data-cmd="lens-filter"]').evaluateAll(es=>es.filter(e=>!e.disabled).map(e=>e.dataset.value)))){await click(`[data-cmd="lens-filter"][data-value="${value}"]`);await layout('单题条件:'+value);}
 await click('[data-cmd="lens-filter"][data-value="all"]');await click('[data-cmd="drawer-question-page"][data-step="1"]');await click('[data-cmd="drawer-question-page"][data-step="-1"]');
 for(const no of unique(await page.locator('[data-cmd="question-class"]').evaluateAll(es=>es.map(e=>e.dataset.no)))){await click(`[data-cmd="question-class"][data-no="${no}"]`);await click('[data-cmd="question-all"]');await click('#drawer-back');await click('#drawer-back');}
 await click('[data-cmd="drawer-question-step"][data-step="1"]');await click('[data-cmd="drawer-question-step"][data-step="-1"]');
 await click('#drawer-content [data-cmd="peek"]');await click('#drawer-content [data-cmd="drawer-tab"][data-value="questions"]');await click('#drawer-content [data-cmd="answer-question"]');await click('[data-cmd="question-unfocus"]');assert.equal(await page.locator('.answer-focus').count(),0);
 await click('[data-cmd="drawer-ancestor"][data-index="0"]');await report('drawer-capture','#drawer-content');
});

await group('07 学生目录、档案、收藏与并排比较全部控件',async()=>{
 await nav('people');
 const materials=await page.locator('[data-cmd="directory-material"]').evaluateAll(es=>es.map(e=>({key:e.dataset.key,value:e.dataset.value})));
 for(const {key,value} of materials){
  const selector=`[data-cmd="directory-material"][data-key="${key}"][data-value="${value}"]`;
  await click(selector);assert.equal(await page.evaluate(key=>JSON.parse(localStorage.getItem('hengji:books')).people[key],key),value);await layout('材料快捷筛选:'+key+'='+value);
  await click(selector);assert.equal(await page.evaluate(key=>JSON.parse(localStorage.getItem('hengji:books')).people[key],key),'all');
 }
 await page.setViewportSize({width:390,height:900});await click('[data-cmd="directory-scope"]');await click('.scope-controls [data-cmd="toggle"][data-value="4"]');await click('[data-cmd="directory-scope"]');await click('[data-cmd="directory-clear"][data-key="classes"]');await page.setViewportSize({width:1440,height:1000});
 for(const key of ['view','columns','sort','pageSize','directoryExam','track','focusSubject']){if(key==='columns')await set('view','table');await options(key);}
 await click('[data-cmd="directory-reset"]');
 for(const lens of unique(await page.locator('[data-cmd="directory-lens"]').evaluateAll(es=>es.map(e=>e.dataset.lens))))await click(`[data-cmd="directory-lens"][data-lens="${lens}"]`);
 await click('[data-cmd="directory-reset"]');await click('[data-cmd="directory-filters"]');
 for(const key of ['scoreStatus','standing','trend','records','focusSubject','focusStatus','sort'])await options(key,'#drawer-content');
 await click('[data-cmd="directory-reset"]');await click('[data-cmd="directory-apply"]');await set('view','cards');
 const people=await page.locator('.student-name').evaluateAll(es=>es.map(e=>e.dataset.sid));
 for(const sid of people){await click(`.student-name[data-sid="${sid}"]`);await layout('学生:'+sid);await closeDrawer();}
 await click('[data-cmd="directory-save"]');await page.locator('[name="view-name"]').fill('全界面检查筛选');await click('[data-form="directory-view"] [type="submit"]');forms.push('directory-view');await closeDrawer();await click('[data-cmd="directory-restore"]');await click('[data-cmd="directory-view-remove"]');await click('[data-cmd="undo-action"]');
 for(const sid of people.slice(0,4))await click(`[data-cmd="compare-toggle"][data-sid="${sid}"]`);await click('[data-cmd="compare-open"]');await inspect('四人比较');
 for(const value of ['total','percentile','under','top'])await click(`[data-cmd="compare-metric"][data-value="${value}"]`);await click('[data-cmd="compare-common"]');await report('drawer-export','#drawer-content');await closeDrawer();await click('[data-cmd="compare-clear"]');
 await click('.student-name');await click('#drawer-content [data-cmd="save-person"]');await drawerViews('学生观察');
 for(const exam of ['51','52'])await click(`#drawer-content .drawer-stages [data-cmd="drawer-stage"][data-exam="${exam}"]`);
 for(const subject of unique(await page.locator('[data-cmd="drawer-question-subject"]').evaluateAll(es=>es.map(e=>e.dataset.value))))await click(`[data-cmd="drawer-question-subject"][data-value="${subject}"]`);
 for(const value of ['all','lost','blank'])await click(`[data-cmd="drawer-question-filter"][data-value="${value}"]`);
 await click('[data-cmd="drawer-person-step"][data-step="1"]');await click('[data-cmd="drawer-person-step"][data-step="-1"]');
 await click('[data-cmd="drawer-person"]');await inspect('完整学生档案');for(const key of ['storyMetric','questionView','questionFilter','questionOrder','subject'])await options(key);
 for(const id of ['person-history','person-subjects','person-questions'])await click(`[data-cmd="person-section"][data-id="${id}"]`);
 for(const exam of ['51','52'])await click(`[data-cmd="person-exam"][data-exam="${exam}"]`);await click('[data-cmd="person-back"]');
});

await group('08 教学跟进看板、名单、拖动与每种状态',async()=>{
 await nav('follow');for(const key of ['tier','band','side','exam'])await options(key);
 await set('exam','52');await set('side','both');await set('tier','under');await set('band','30');
 const candidates=await page.locator('[data-cmd="follow-add"]').evaluateAll(es=>es.map(e=>({sid:e.dataset.sid,exam:e.dataset.exam,tier:e.dataset.tier})));
 for(const p of candidates.slice(0,4))await click(`[data-cmd="follow-add"][data-sid="${p.sid}"]`);
 await click('#toast [data-cmd="follow-open"]');
 assert.ok(await page.locator('.follow-card').count()>0);await inspect('跟进看板');
 const plan=await page.locator('.follow-card').first().getAttribute('data-plan');await page.locator(`[data-plan-note="${plan}"]`).fill('匿名教学记录');
 for(const status of ['active','done','new']){await click(`[data-cmd="follow-status"][data-id="${plan}"][data-status="${status}"]`);assert.equal(await page.locator(`[data-plan="${plan}"]`).evaluate(e=>e.closest('.follow-lane').dataset.status),status);}
 await page.locator(`[data-plan="${plan}"]`).dragTo(page.locator('.follow-lane[data-status="active"]'));await page.waitForTimeout(150);assert.equal(await page.locator(`[data-plan="${plan}"]`).evaluate(e=>e.closest('.follow-lane').dataset.status),'active');
 await options('followView');await inspect('跟进名单');await options('planStatus');await set('planStatus','all');await options('planClass');await set('planClass','all');
 await page.locator('[data-field="planSearch"]').fill('匿名教学记录');await page.waitForTimeout(350);assert.equal(await page.locator('[data-plan-note]').count(),1);await page.locator('[data-field="planSearch"]').fill('');await page.waitForTimeout(350);
 await click('[data-cmd="follow-remove"]');await click('[data-cmd="undo-action"]');await report();
});

await group('09 六个资料面板的所有表单与材料出口',async()=>{
 await nav('library');
 for(const tab of ['materials','classes','lines','papers','exams','notebook']){await set('tab',tab);await inspect('资料:'+tab);}
 await set('tab','classes');
 await page.locator('[name="top-4"]').fill('7');await page.locator('[name="under-4"]').fill('20');await click('[data-form="targets"] [type="submit"]');forms.push('targets');
 await options('profileNo');await set('profileNo','4');await page.locator('[name="lead"]').fill('更改后的匿名班主任');await page.locator('[name="teacher-数学"]').fill('更改后的匿名数学教师');await click('[data-form="profile"] [type="submit"]');forms.push('profile');assert.equal(await page.locator('[name="lead"]').inputValue(),'更改后的匿名班主任');
 await set('tab','lines');await options('lineExam');await set('lineExam','52');await page.locator('[name="physics-总分-under"]').fill('410');await click('[data-form="lines"] [type="submit"]');forms.push('lines');
 await set('tab','papers');await options('bank');await set('bank','数学|52');await page.locator('[name="max-2"]').fill('8');await page.locator('[name="knowledge-2"]').fill('几何,应用');await click('[data-form="bank"] [type="submit"]');forms.push('bank');
 await set('tab','exams');await page.locator('[name="label-52"]').fill('更名后的第二场');await page.locator('[name="scope-52"][value="city"]').check();await click('[data-form="exams"] [type="submit"]');forms.push('exams');
 await page.locator('[name="criticalWindow"]').fill('25');await page.locator('[name="lowRate"]').fill('60');await page.locator('[name="focusRate"]').fill('80');await click('[data-form="rules"] [type="submit"]');forms.push('rules');
 await page.reload();await page.waitForSelector('body[data-workspace="ready"]');await nav('class');assert.match(await page.locator('#stage').textContent(),/更改后的匿名班主任/);await nav('library');await set('tab','materials');
 for(const cmd of ['backup','template','four-sheets']){const pending=page.waitForEvent('download');await click(`[data-cmd="${cmd}"]`);const d=await pending;await d.saveAs(output+'/'+cmd+(cmd==='backup'?'.json':'.xlsx'));assert.equal(await d.failure(),null);}
 const b=JSON.parse(fs.readFileSync(output+'/backup.json'));assert.equal(b.profiles[4].targets.top,7);assert.equal(b.banks['数学|52'][2].max,8);assert.equal(b.rules.lowRate,.6);
 await click('[data-cmd="clear"]');assert.equal(await page.locator('body').getAttribute('data-workspace'),'empty');await click('[data-cmd="undo"]');await page.waitForSelector('body[data-workspace="ready"]');
});

await group('10 研究夹、摘录和本页导航的所有操作',async()=>{
 await nav('class');await set('tab','snapshot');
 for(const target of unique(await page.locator('[data-cmd="section-jump"]').evaluateAll(es=>es.map(e=>e.dataset.target))))await click(`[data-cmd="section-jump"][data-target="${target}"]`);await click('[data-cmd="section-top"]');
 await click('#stage [data-cmd="research-pin"]');await click('.research-button');await inspect('研究夹');await click('[data-cmd="research-rename"]');await page.locator('[name="study-name"]').fill('更名后的班级观察');await click('[data-form="research-name"] [type="submit"]');forms.push('research-name');
 await click('[data-cmd="research-rename"]');await click('[data-cmd="research-name-cancel"]');await click('[data-cmd="research-tab"][data-tab="recent"]');await click('[data-cmd="research-pin-entry"]');await click('[data-cmd="research-tab"][data-tab="saved"]');await click('[data-cmd="research-open"]');
 await click('#stage [data-cmd="capture"]');await page.locator('#report-note').fill('匿名摘录检查');await click('[data-cmd="report-return"]');
 await nav('library');await set('tab','notebook');await inspect('证据卡片');await click('[data-cmd="notebook-open"]');await click('[data-cmd="close-report"]');await click('[data-cmd="notebook-return"]');await click('[data-cmd="research-back"]');
 await nav('library');await set('tab','notebook');await click('[data-cmd="notebook-export"]');await inspect('全部摘录预览');await click('[data-cmd="close-report"]');await click('[data-cmd="notebook-remove"]');await click('[data-cmd="undo-action"]');
 await click('.research-button');await click('[data-cmd="research-remove"]');await click('[data-cmd="undo-action"]');await click('[data-cmd="research-close"]');
 await click('[data-cmd="find"]');assert.equal(await page.locator('#stage').getAttribute('data-scene'),'people');
});

await group('11 导入列对应、取消、替换与合并',async()=>{
 const csv=output+'/mapping.csv';fs.writeFileSync(csv,'列甲,列乙,列丙,列丁\n匿名新学生,4,53物,425\n');
 await page.locator('#files').setInputFiles(csv);await page.waitForSelector('[data-mapping]');
 const fields=page.locator('.mapping-field');for(let i=0;i<await fields.count();i++){const f=fields.nth(i);if(await f.getAttribute('open')===null)await click(f.locator('summary'));const unused=f.locator('input[value=""]');if(await unused.count())await unused.check();}
 await click('[data-mapping] [type="submit"]');assert.match(await page.locator('#toast').textContent(),/对应姓名和班级/);await click('#toast [data-cmd="toast-close"]');
 await page.locator('[data-mapping] input[name="name"][value="0"]').check();await page.locator('[data-mapping] input[name="classNo"][value="1"]').check();await page.locator('[data-mapping] input[name="exam"][value="2"]').check();await page.locator('[data-mapping] input[name="total"][value="3"]').check();await click('[data-mapping] [type="submit"]');forms.push('mapping');await page.waitForSelector('[data-inbox="commit"]');await click('[data-inbox="commit"][data-mode="merge"]');
 await nav('people');await page.locator('[data-field="search"]').fill('匿名新学生');await page.waitForTimeout(400);assert.match(await page.locator('.student-card').textContent(),/425.0/);
 await page.locator('#files').setInputFiles(material);await page.waitForSelector('[data-inbox="commit"]');await page.keyboard.press('Escape');assert.equal(await page.locator('#inbox').getAttribute('open'),null);
 await page.locator('#files').setInputFiles(material);await page.waitForSelector('[data-inbox="commit"]');await click('[data-inbox="commit"][data-mode="replace"]');await nav('library');await click('[data-cmd="undo"]');
 const malformed=output+'/bad.json';fs.writeFileSync(malformed,'{broken');await page.locator('#files').setInputFiles(malformed);await page.getByRole('heading',{name:'材料尚未加入工作区'}).waitFor();await click('[data-inbox="close"]');
});

await group('12 图表提示、每个分布区间和正常动效',async()=>{
 await nav('board');await set('mode','map');
 const descriptors=await page.locator('svg [data-cmd="inspect-bin"]').evaluateAll(es=>es.map(e=>({track:e.dataset.track,min:e.dataset.min,max:e.dataset.max})));
 for(const d of descriptors){await click(`svg [data-cmd="inspect-bin"][data-track="${d.track}"][data-min="${d.min}"]`);assert.equal(await page.locator('#stage').getAttribute('data-scene'),'people');await layout('分布区间:'+d.track+':'+d.min);await click('[data-cmd="research-back"]');}
 for(const scene of ['board','class','papers','people','follow','library']){
  await nav(scene);if(scene==='papers')await click('[data-cmd="paper"][data-key="数学|52"]');
  if(scene==='people')await set('view','landscape');
  for(const chart of await page.locator('#stage svg[id]').evaluateAll(es=>es.map(e=>e.id))){
   const targets=page.locator(`[id="${chart}"] .plot-item,[id="${chart}"] .plot-point,[id="${chart}"] .student-dot`);
   for(const index of unique([0,Math.max(0,await targets.count()-1)]))if(await targets.count()){
    await attempt('图表提示:'+chart+':'+index,async()=>{await targets.nth(index).scrollIntoViewIfNeeded();await page.waitForTimeout(100);await page.mouse.move(1,1);await targets.nth(index).hover();await page.waitForTimeout(80);assert.equal(await page.locator('#chart-tooltip').isVisible(),true);assert.ok((await page.locator('#chart-tooltip').textContent()).length>2);tooltips.push({chart,index,text:await page.locator('#chart-tooltip').textContent()});await page.mouse.move(1,1);});
   }
  }
 }
 await nav('people');await set('view','cards');await page.emulateMedia({reducedMotion:'no-preference'});
 for(const width of [390,1440]){await page.setViewportSize({width,height:900});for(const scene of ['board','class','papers','people','follow','library']){await nav(scene);await page.waitForTimeout(500);await layout('自然过渡:'+scene+':'+width);}}
 await nav('class');await click('[data-cmd="class-subject"][data-subject="数学"]');await page.waitForTimeout(450);await click('[data-cmd="drawer-close"]');await page.waitForTimeout(450);assert.equal(await page.locator('#research-drawer').getAttribute('open'),null);
 await page.keyboard.press('Control+k');await page.waitForTimeout(350);assert.equal(await page.locator('#stage [data-field="search"]').evaluate(e=>document.activeElement===e),true);
});

await group('13 无成绩、无有效线和无满分时的图表与按钮',async()=>{
 const missing=structuredClone(fixture);missing.lines=[];for(const r of missing.scores){r.total=null;r.rawTotal=null;for(const s of Object.values(r.subjects)){s.score=null;s.raw=null;}}
 const file=output+'/missing.json';fs.writeFileSync(file,JSON.stringify(missing));await page.locator('#files').setInputFiles(file);await click('[data-inbox="commit"][data-mode="replace"]');
 await nav('board');for(const mode of ['overview','map','subjects','history']){await set('mode',mode);await inspect('缺成绩年级:'+mode);}
 await nav('class');for(const tab of ['snapshot','history','targets']){await set('tab',tab);await inspect('缺成绩班级:'+tab);}
 await set('tab','snapshot');if(await page.locator('[data-cmd="class-subject"][data-subject="数学"]').count()){await click('[data-cmd="class-subject"][data-subject="数学"]');await drawerViews('缺成绩学科');await closeDrawer();}
 await nav('people');await set('view','cards');const people=await page.locator('.student-name').evaluateAll(es=>es.map(e=>e.dataset.sid));
 for(const sid of people.slice(0,2))await click(`[data-cmd="compare-toggle"][data-sid="${sid}"]`);await click('[data-cmd="compare-open"]');await inspect('缺成绩并排对比');await closeDrawer();
 const qonly={...structuredClone(fixture),scores:[],lines:[],students:fixture.students.slice(0,1),answers:fixture.answers.filter(a=>a.sid===fixture.students[0].id)};fs.writeFileSync(file,JSON.stringify(qonly));await page.locator('#files').setInputFiles(file);await click('[data-inbox="commit"][data-mode="replace"]');await nav('people');await click('.student-name');await drawerViews('仅小题学生');
 await click('[data-cmd="drawer-person"]');await inspect('仅小题完整档案');
});

await group('14 文件拖入、错误恢复与通知关闭',async()=>{
 await nav('library');await page.locator('#drop-zone').evaluate((e,raw)=>{const data=new DataTransfer();data.items.add(new File([raw],'drop.json',{type:'application/json'}));e.dispatchEvent(new DragEvent('dragover',{bubbles:true,dataTransfer:data}));e.dispatchEvent(new DragEvent('drop',{bubbles:true,dataTransfer:data}));},JSON.stringify(fixture));await page.waitForSelector('[data-inbox="commit"]');await click('[data-inbox="close"]');
 await click('#toast [data-cmd="toast-close"]');assert.equal(await page.locator('#toast').evaluate(e=>e.classList.contains('visible')),false);
 let intercepted=false;await page.route('**/app/scenes/papers.js*',async route=>{if(!intercepted){intercepted=true;await route.abort();}else await route.continue();});await nav('papers');await page.waitForSelector('[data-cmd="reload"]');await page.unroute('**/app/scenes/papers.js*');await click('[data-cmd="reload"]');await page.waitForSelector('body[data-workspace="ready"]');await page.waitForSelector('.paper-catalog');
});

await group('15 宽表打印、PDF 与 Word 的全部字段',async()=>{
 await nav('people');await click('#stage [data-cmd="export"]');await click('[data-cmd="report-print"]');
 await page.setViewportSize({width:1030,height:720});await page.emulateMedia({media:'print'});
 const printed=await page.locator('#print-area table').evaluateAll(tables=>tables.map(table=>({cols:table.querySelectorAll('thead th').length,width:table.getBoundingClientRect().width,scroll:table.scrollWidth,area:document.getElementById('print-area').getBoundingClientRect().width})));
 assert.ok(printed.length>5,'宽成绩表应分组');
 for(const table of printed){assert.ok(table.cols<=10);assert.ok(table.width<=table.area+1&&table.scroll<=table.area+1,'纸张宽度内保留全部列');}
 await page.pdf({path:output+'/wide-report.pdf',preferCSSPageSize:true});
 await page.screenshot({path:output+'/print-layout.png'});
 await page.emulateMedia({media:'screen'});await page.setViewportSize({width:1440,height:1000});await click('[data-cmd="close-report"]');
 const report={title:'匿名宽表字段保全',subtitle:'文档导出回归',created:'2026-10-11',note:'保留零分与缺失值',sections:[{title:'完整宽表',headers:['考试','姓名','班级',...Array.from({length:53},(_,i)=>'字段'+i)],rows:[['考试甲','匿名学生',4,...Array.from({length:53},(_,i)=>i===0?0:i===1?null:'值'+i)]]}]};
 await page.evaluate(async report=>{const {reportHTML}=await import('./app/io/exports.js?v=surface-20261011j');document.getElementById('print-area').innerHTML=reportHTML(report);},report);
 const tables=await page.locator('#print-area table').evaluateAll(tables=>tables.map(table=>({headers:[...table.querySelectorAll('th')].map(e=>e.textContent),row:[...table.querySelectorAll('tbody tr:first-child td')].map(e=>e.textContent)})));
 function verify(tables){for(const table of tables){assert.ok(table.headers.length<=10);assert.deepEqual(table.headers.slice(0,3),report.sections[0].headers.slice(0,3));}for(const [index,header] of report.sections[0].headers.entries()){const matches=tables.filter(table=>table.headers.includes(header));assert.ok(matches.length,header+' 导出遗漏');for(const table of matches)assert.equal(table.row[table.headers.indexOf(header)],String(report.sections[0].rows[0][index]??'—'));}}
 verify(tables);
 const pending=page.waitForEvent('download');await page.evaluate(async report=>{const {word}=await import('./app/io/exports.js?v=surface-20261011j');await word(report);},report);const download=await pending;assert.equal(await download.failure(),null);await download.saveAs(output+'/wide-report.docx');
 const word=await page.evaluate(async bytes=>{const zip=await window.JSZip.loadAsync(new Uint8Array(bytes)),xml=await zip.file('word/document.xml').async('string'),doc=new DOMParser().parseFromString(xml,'application/xml'),ns='http://schemas.openxmlformats.org/wordprocessingml/2006/main',content=row=>[...row.getElementsByTagNameNS(ns,'tc')].map(cell=>[...cell.getElementsByTagNameNS(ns,'t')].map(e=>e.textContent).join(''));return {error:!!doc.querySelector('parsererror'),landscape:doc.getElementsByTagNameNS(ns,'pgSz')[0].getAttributeNS(ns,'orient'),tables:[...doc.getElementsByTagNameNS(ns,'tbl')].map(table=>{const rows=[...table.getElementsByTagNameNS(ns,'tr')];return {headers:content(rows[0]),row:content(rows[1]),repeat:!!rows[0].getElementsByTagNameNS(ns,'tblHeader').length};})};},[...fs.readFileSync(output+'/wide-report.docx')]);
 assert.equal(word.error,false);assert.equal(word.landscape,'landscape');verify(word.tables);assert.ok(word.tables.every(table=>table.repeat));
});

await group('16 各类面板反复改变窗口宽度后的玻璃显示',async()=>{
 async function panel(name,dialogId=''){
  const id=dialogId||await page.evaluate(()=>document.activeElement.closest('dialog[open]').id);
  if(dialogId)await page.locator('#'+id).focus();
  assert.equal(await page.locator('#'+id).evaluate(e=>getComputedStyle(e).backdropFilter),'none','内容层应避免重复背景模糊');
  assert.notEqual(await page.locator('#'+id).evaluate(e=>getComputedStyle(e,'::backdrop').backdropFilter),'none','保留玻璃背景');
  await inspect('玻璃面板:'+name,{tables:false,charts:false});
  await page.locator('#'+id).evaluate(e=>{e.scrollTop=Math.min(300,e.scrollHeight-e.clientHeight);});await page.waitForTimeout(180);await layout('玻璃面板滚动:'+name);
  const file=output+'/glass-scroll-'+id+'-'+captures.length+'.png';await page.screenshot({path:file});captures.push({name:name+'滚动',file:path.basename(file),root:'#'+id,viewport:page.viewportSize()});
 }
 await click('[data-cmd="reading"]');await panel('阅读设置');await click('[data-cmd="reading-close"]');
 await click('[data-cmd="research"]');await panel('研究夹');await click('[data-cmd="research-close"]');
 await nav('class');await click('[data-cmd="class-subject"][data-subject="数学"]');await panel('学科');await closeDrawer();
 await nav('papers');await click('[data-cmd="paper"][data-key="数学|52"]');await click('.question-map [data-index="0"]');await panel('单题');await closeDrawer();
 await set('tab','knowledge');await click('[data-cmd="knowledge-open"]');await panel('知识点');await closeDrawer();
 await nav('people');await click('[data-cmd="directory-filters"]');await panel('筛选');await closeDrawer();
 await click('.student-name');await panel('学生');await closeDrawer();
 const ids=await page.locator('[data-cmd="compare-toggle"]').evaluateAll(es=>es.slice(0,2).map(e=>e.dataset.sid));for(const sid of ids)await click(`[data-cmd="compare-toggle"][data-sid="${sid}"]`);await click('[data-cmd="compare-open"]');await panel('对比');await closeDrawer();
 await click('#stage [data-cmd="export"]');await panel('报告');await click('[data-cmd="table-open"]');await panel('宽表');await click('[data-cmd="table-close"]');await click('[data-cmd="close-report"]');
 await nav('library');await set('tab','classes');await inspect('资料编辑缩放',{charts:false});
 await page.locator('#files').setInputFiles(material);await page.waitForSelector('[data-inbox="commit"]');await panel('导入','inbox');await click('[data-inbox="close"]');
});

await group('17 手机条形图字号、行距和点击区域',async()=>{
 for(const scene of ['board','class','papers']){
  await nav(scene);if(scene==='papers'){await click('[data-cmd="paper"][data-key="数学|52"]');await click('.question-map [data-index="0"]');}
  const root=scene==='papers'?'#drawer-content':'#stage';
  for(const width of [390,320,1440]){
   await page.setViewportSize({width,height:1000});await page.waitForTimeout(200);
   const sizes=await page.locator(root+' svg.bars').evaluateAll(charts=>charts.map(svg=>{const scale=svg.getBoundingClientRect().width/svg.viewBox.baseVal.width;return {id:svg.id,width:svg.getBoundingClientRect().width,viewHeight:svg.viewBox.baseVal.height,font:parseFloat(getComputedStyle(svg.querySelector('text')).fontSize)*scale,rows:[...svg.querySelectorAll(':scope>.plot-item')].map(item=>({height:item.getBoundingClientRect().height,hit:item.querySelector('rect:not(.plot-bar)').getBoundingClientRect().height,label:item.querySelector('text').getBoundingClientRect().height}))};}));
   assert.ok(sizes.length);for(const chart of sizes){assert.ok(chart.font>=10,chart.id+' 字号过小');for(const row of chart.rows){assert.ok(row.hit>=28,chart.id+' 点击行过窄');assert.ok(row.label<=row.hit,chart.id+' 标签挤出点击行');}}
   if(width===390&&scene!=='board'){
    const id=sizes[0].id,expected=await page.locator(`[id="${id}"]`).evaluate(svg=>({font:getComputedStyle(svg.querySelector('text')).font,height:Math.trunc(svg.viewBox.baseVal.height*2),width:Math.trunc(svg.viewBox.baseVal.width*2)}));
    for(const kind of ['svg','png']){
     const pending=page.waitForEvent('download',{timeout:15000}).catch(error=>error);await click(`${root} [data-cmd="${kind}"][data-id="${id}"]`);const d=await pending;if(d instanceof Error)throw d;assert.equal(await d.failure(),null);const file=output+'/mobile-'+scene+'.'+kind;await d.saveAs(file);const bytes=fs.readFileSync(file);
     if(kind==='png'){assert.equal(bytes.readUInt32BE(16),expected.width);assert.equal(bytes.readUInt32BE(20),expected.height);}else{const font=await page.evaluate(xml=>new DOMParser().parseFromString(xml,'image/svg+xml').querySelector('text').style.font,bytes.toString());assert.equal(font,expected.font,'独立图表保留当前字号');}
    }
   }
   await layout('条形图行距:'+scene+':'+width);const file=output+'/bars-'+scene+'-'+width+'.png';await page.screenshot({path:file});captures.push({name:'条形图:'+scene,file:path.basename(file),viewport:page.viewportSize(),root});
  }
  if(scene==='papers')await closeDrawer();
 }
});

await group('18 自然动效的中断和连续导航',async()=>{
 await page.emulateMedia({reducedMotion:'no-preference'});
 await page.evaluate(()=>{const start=document.startViewTransition.bind(document);document.startViewTransition=callback=>{const transition=start(callback);transition.skipTransition();return transition;};});
 for(const scene of ['class','papers','people','follow','library','board','class','people'])await nav(scene);
 assert.equal(await page.locator('#stage').getAttribute('data-scene'),'people');
 await page.evaluate(()=>{for(const scene of ['class','papers','board','library'])document.querySelector(`[data-cmd="nav"][data-scene="${scene}"]`).click();});
 await page.waitForFunction(()=>document.getElementById('stage').dataset.scene==='library');await page.waitForTimeout(500);await layout('连续点击最后场景');
 await click('[data-cmd="reading"]');await click('[data-cmd="reading-close"]');await page.waitForTimeout(300);
});

await group('19 统一入口与本轮新增试卷和单题控件',async()=>{
 await click('.brand');assert.equal(await page.locator('.overview-hero').count(),1);
 await nav('papers');await click('[data-cmd="paper"][data-key="数学|52"]');
 await click('[data-cmd="paper-switch"][data-key="英语|52"]');await click('[data-cmd="paper-switch"][data-key="数学|52"]');
 await click('[data-cmd="paper-exam"][data-exam="51"]');await click('[data-cmd="paper-exam"][data-exam="52"]');
 await page.locator('[data-field="questionSearch"]').fill('第1题');await page.waitForTimeout(300);await click('[data-cmd="question-map-reset"]');
 await click('.question-map [data-index="0"]');await click('[data-cmd="question-band"][data-value="zero"]');
 await click('[data-cmd="drawer-section"][data-target="question-classes"]');await click('[data-cmd="drawer-section"][data-target="question-answers"]');
 await page.locator('[data-drawer-field="search"]').fill('校检');await page.waitForTimeout(300);await click('[data-cmd="drawer-search-clear"]');
 await click('[data-cmd="question-sequence-all"]');await closeDrawer();await nav('papers');assert.ok(await page.locator('.paper-cover').count()>1);assert.equal(await page.locator('[data-cmd="research-back"]').count(),0);
});

await browser.close();flush();
const commands=unique(actions.map(a=>a.data.cmd).filter(Boolean)).sort();console.log('COVERAGE '+views.length+' views / '+actions.length+' clicks / '+commands.length+' commands / '+unique(forms).length+' forms');
console.log('COMMANDS '+commands.join(' '));
if(!process.argv[2]){
 const handled=unique([...fs.readFileSync(path.join(__dirname,'../app/main.js'),'utf8').matchAll(/d\.cmd==='([^']+)'/g)].map(match=>match[1]));
 const missing=handled.filter(cmd=>cmd!=='person'&&!commands.includes(cmd));
 if(missing.length){console.log('UNCOVERED '+missing.join(' '));process.exitCode=1;}
}
if(results.some(r=>!r.ok)||issues.length||errors.length||resources.length)process.exitCode=1;
})().catch(e=>{console.error(e);flush();process.exitCode=1;});
