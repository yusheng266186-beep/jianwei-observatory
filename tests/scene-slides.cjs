const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {makeFixture}=require('./fixtures.cjs');
const out=path.join(__dirname,'../.audit-output/slides');fs.mkdirSync(out,{recursive:true});
const fixture=makeFixture();fixture.exams[0].label='高三第一阶段诊断考试';fixture.exams[1].label='高三第二阶段质量监测（2026年10月）';
const material=path.join(out,'anonymous-slides.json');fs.writeFileSync(material,JSON.stringify(fixture));
const scenes=['board','class','papers','people','follow','library'],url=process.env.AUDIT_URL||'http://127.0.0.1:4173';
(async()=>{
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox'],ignoreDefaultArgs:['--hide-scrollbars']}),results=[];
async function test(name,fn,{width=1440,reduce=false,empty=false,data=material}={}) {
 if(process.argv[2]&&!name.includes(process.argv[2]))return;
 const context=await browser.newContext({viewport:{width,height:1000},reducedMotion:reduce?'reduce':'no-preference'}),p=await context.newPage(),errors=[];p.setDefaultTimeout(15000);p.on('pageerror',e=>errors.push(e.message));
 const settle=()=>p.waitForFunction(()=>!document.querySelector('.scene-leaving-viewport')&&document.getAnimations().every(a=>a.effect?.getTiming().iterations===Infinity||(!a.pending&&a.playState!=='running')));
 const nav=async scene=>{await p.locator(`[data-cmd="nav"][data-scene="${scene}"]`).click();await p.waitForFunction(scene=>document.querySelector('#stage').dataset.scene===scene&&document.querySelector('#stage').getAttribute('aria-busy')==='false',scene);await settle();};
 try {
  await p.goto(url);await p.waitForSelector('#navigation button');await settle();
  if(!empty){await p.locator('#files').setInputFiles(data);await p.locator('[data-inbox="commit"]').click();await p.waitForSelector('body[data-workspace=ready]');await p.waitForSelector('#inbox:not([open])',{state:'attached'});await settle();}
  await fn(p,nav,settle);assert.deepEqual(errors,[]);results.push({name,ok:true});console.log('PASS '+name);
 }catch(e){results.push({name,ok:false,error:e.message,errors});console.log('FAIL '+name+' '+e.message.slice(0,1800));await p.screenshot({path:path.join(out,'failure-'+results.length+'.png')});}
 await context.close();
}
for(const width of [1440,390])await test((width===1440?'桌面':'手机')+'六个板块正反切换：整页横移、退出入场、控件可用且没有越界',async(p,nav,settle)=>{
 const frames=[];
 for(const scene of scenes)await nav(scene);
 for(const scene of [...scenes.slice(0,5)].reverse().concat(scenes.slice(1))) {
  const before=await p.evaluate(()=>({scene:document.querySelector('#stage').dataset.scene,header:document.querySelector('.masthead').getBoundingClientRect().x,dock:document.querySelector('#navigation').getBoundingClientRect().x}));
  await p.locator(`[data-cmd="nav"][data-scene="${scene}"]`).click();
  await p.waitForFunction(scene=>document.querySelector('#stage').dataset.scene===scene&&document.querySelector('#stage').getAnimations().some(a=>a.currentTime>35&&a.currentTime<200),scene);
  const sample=await p.evaluate(()=>{
   const main=document.querySelector('#stage'),old=document.querySelector('.scene-leaving-canvas'),host=old?.parentElement,a=main.getAnimations()[0],head=main.querySelector('.scene-head'),cards=[...main.querySelectorAll('.block,.number-ribbon,.paper-cover,.student-card')].slice(0,4),ids=[...document.querySelectorAll('[id]')].map(e=>e.id);
   return {scene:main.dataset.scene,old:old?.dataset.scene,x:new DOMMatrixReadOnly(getComputedStyle(main).transform).m41,oldX:old?new DOMMatrixReadOnly(getComputedStyle(old).transform).m41:0,headX:head?.getBoundingClientRect().x,cards:cards.map(e=>({x:e.getBoundingClientRect().x,transform:getComputedStyle(e).transform,opacity:getComputedStyle(e).opacity})),frames:a?.effect.getKeyframes().map(f=>f.transform),hostInert:host?.inert,hostHidden:host?.getAttribute('aria-hidden'),busy:main.getAttribute('aria-busy'),inert:main.inert,idsUnique:ids.length===new Set(ids).size,overflow:document.documentElement.scrollWidth>innerWidth+1,header:document.querySelector('.masthead').getBoundingClientRect().x,dock:document.querySelector('#navigation').getBoundingClientRect().x,direction:document.documentElement.dataset.transitionDirection};
  });
  assert.equal(sample.old,before.scene);assert.ok(Math.abs(sample.x)>20,'entire main should still be travelling');assert.ok(Math.abs(sample.oldX)>20,'old pane must exit horizontally');assert.equal(Math.sign(sample.x),sample.direction==='forward'?1:-1);assert.equal(Math.sign(sample.oldX),-Math.sign(sample.x));assert.equal(sample.inert,false);assert.equal(sample.busy,'false');assert.equal(sample.hostInert,true);assert.equal(sample.hostHidden,'true');assert.equal(sample.idsUnique,true);assert.equal(sample.overflow,false);assert.ok(Math.abs(sample.header-before.header)<1);assert.ok(Math.abs(sample.dock-before.dock)<1);assert.ok(sample.cards.every(c=>c.transform==='none'&&c.opacity==='1'));
  const exported=await p.evaluate(()=>[...document.querySelectorAll('#stage [data-cmd=svg]')].every(b=>Boolean(document.getElementById(b.dataset.id))));assert.equal(exported,true);
  if(scene==='class')await p.evaluate(()=>document.querySelector('#stage [data-key=tab][data-value=history]').click());
  await settle();assert.equal(await p.locator('.scene-leaving-viewport').count(),0);assert.equal(await p.locator('#stage').evaluate(e=>getComputedStyle(e).transform),'none');frames.push(sample);
 }
 fs.writeFileSync(path.join(out,'frames-'+width+'.json'),JSON.stringify(frames,null,2));
},{width});
await test('快速改向与旧页点击：衔接当前帧、末次操作生效、不残留退出页面',async(p,nav,settle)=>{
 for(const scene of scenes)await nav(scene);await nav('class');
 await p.evaluate(()=>document.querySelector('[data-cmd=nav][data-scene=people]').click());
 await p.waitForFunction(()=>document.querySelector('#stage').dataset.scene==='people'&&document.querySelector('#stage').getAnimations().some(a=>a.currentTime>45&&a.currentTime<180));
 const continuity=await p.evaluate(async()=>{
  const main=document.querySelector('#stage'),before=main.getBoundingClientRect().left;
  document.querySelector('[data-cmd=nav][data-scene=papers]').click();
  await new Promise(resolve=>new MutationObserver((_,observer)=>{if(main.dataset.scene==='papers'){observer.disconnect();resolve();}}).observe(main,{attributes:true,attributeFilter:['data-scene']}));
  const leaving=document.querySelector('.scene-leaving-canvas');return {before,after:leaving.getBoundingClientRect().left,count:document.querySelectorAll('.scene-leaving-viewport').length};
 });
 assert.ok(Math.abs(continuity.after-continuity.before)<3,'interrupt must start at the visible frame');assert.equal(continuity.count,1);
 for(const scene of ['board','people','follow','library','papers','class']){await p.evaluate(scene=>document.querySelector(`[data-cmd=nav][data-scene=${scene}]`).click(),scene);await p.waitForTimeout(30);}
 await p.waitForFunction(()=>document.querySelector('#stage').dataset.scene==='class');
 await p.evaluate(()=>document.querySelector('.scene-leaving-canvas [data-cmd=set]')?.click());
 await settle();assert.equal(await p.locator('#navigation [aria-current=page]').getAttribute('data-scene'),'class');assert.match(await p.evaluate(()=>location.hash),/^#class\//);assert.equal(await p.locator('.scene-leaving-viewport').count(),0);
});
await test('滚动中的页面保留退出位置，尺寸与动效偏好变化能立即收尾',async(p,nav,settle)=>{
 await nav('class');await p.evaluate(()=>window.scrollTo({top:540,behavior:'instant'}));await p.waitForTimeout(80);
 const old=await p.locator('#stage .scene-head').boundingBox();
 const sticky=await p.locator('#stage .study-outline').boundingBox();
 await p.evaluate(()=>document.querySelector('[data-cmd=nav][data-scene=people]').click());await p.waitForFunction(()=>document.querySelector('#stage').dataset.scene==='people'&&document.querySelector('.scene-leaving-canvas'));
 const outgoing=await p.locator('.scene-leaving-canvas .scene-head').boundingBox();assert.ok(Math.abs(outgoing.y-old.y)<2,'leaving content jumps vertically');assert.equal(await p.evaluate(()=>scrollY),0);
 const exitingSticky=await p.locator('.scene-leaving-canvas .study-outline').boundingBox();assert.ok(Math.abs(exitingSticky.y-sticky.y)<2,'sticky chapter bar jumps during exit');
 await p.setViewportSize({width:820,height:1000});await settle();assert.equal(await p.locator('#stage').evaluate(e=>getComputedStyle(e).transform),'none');assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 await p.evaluate(()=>document.querySelector('[data-cmd=nav][data-scene=class]').click());await p.waitForFunction(()=>document.querySelector('.scene-leaving-canvas'));await p.emulateMedia({reducedMotion:'reduce'});await settle();assert.equal(await p.locator('.scene-leaving-viewport').count(),0);
 await p.emulateMedia({reducedMotion:'no-preference'});await nav('people');await p.evaluate(()=>document.querySelector('[data-cmd=nav][data-scene=class]').click());await p.waitForFunction(()=>document.querySelector('.scene-leaving-canvas'));await p.locator('.reading-button').press('Enter');await p.locator('[data-cmd=reading-set][data-key=motion][data-value=calm]').press('Enter');await settle();assert.equal(await p.locator('.scene-leaving-viewport').count(),0);await p.locator('[data-cmd=reading-close]').first().press('Enter');await nav('papers');assert.equal(await p.locator('#stage').evaluate(e=>getComputedStyle(e).transform),'none');
});
await test('考试入口显示真实名称、编号与最新标记，长名称手机可完整阅读并可切换',async(p,nav)=>{
 for(const width of [1440,820,390,320]){
  await p.setViewportSize({width,height:1000});await nav('papers');const latest=p.locator('[data-key=shelfExam][data-value="52"]'),early=p.locator('[data-key=shelfExam][data-value="51"]');
  assert.equal(await latest.locator('.exam-choice-name').textContent(),fixture.exams[1].label);assert.match(await latest.locator('.exam-choice-meta').textContent(),/52.*最新/);assert.equal(await latest.getAttribute('aria-pressed'),'true');assert.equal(await early.locator('.exam-choice-name').textContent(),fixture.exams[0].label);
  for(const label of [latest,early])assert.equal(await label.locator('.exam-choice-name').evaluate(e=>e.scrollWidth<=e.clientWidth+1),true);
  await early.click();assert.equal(await early.getAttribute('aria-pressed'),'true');assert.equal(await p.locator('.paper-cover').count(),0);await latest.click();assert.equal(await p.locator('.paper-cover').count(),3);
  await p.screenshot({path:path.join(out,'exam-names-'+width+'.png')});assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await nav('people');assert.equal(await p.locator('[data-key=directoryExam][data-value="52"] .exam-choice-name').textContent(),fixture.exams[1].label);await nav('class');assert.equal(await p.locator('.exam-stop[data-value="52"] small').textContent(),fixture.exams[1].label);
 }
},{reduce:true});
const comparison=structuredClone(fixture);comparison.comparePeople=['test-4-0','test-4-2'];const comparisonMaterial=path.join(out,'anonymous-comparison.json');fs.writeFileSync(comparisonMaterial,JSON.stringify(comparison));
await test('学生对比浮栏随整页进出，动画结束后恢复固定位置',async(p,nav,settle)=>{
 await nav('class');await p.evaluate(()=>document.querySelector('[data-cmd=nav][data-scene=people]').click());await p.waitForFunction(()=>document.querySelector('#stage').dataset.scene==='people'&&document.querySelector('#stage').getAnimations().some(a=>a.currentTime>50&&a.currentTime<200));
 const moving=await p.locator('#stage .compare-tray').boundingBox();assert.ok(moving.y>750&&moving.y<950,'incoming fixed tray must remain near the bottom');await settle();const fixed=await p.locator('#stage .compare-tray').boundingBox();assert.ok(Math.abs(fixed.y-moving.y)<2);assert.equal(await p.locator('#stage .compare-tray').evaluate(e=>getComputedStyle(e).position),'fixed');
 await p.evaluate(()=>document.querySelector('[data-cmd=nav][data-scene=class]').click());await p.waitForFunction(()=>document.querySelector('.scene-leaving-canvas .compare-tray'));const leaving=await p.locator('.scene-leaving-canvas .compare-tray').boundingBox();assert.ok(Math.abs(leaving.y-fixed.y)<2);await settle();assert.equal(await p.locator('.compare-tray').count(),0);
},{data:comparisonMaterial});
await test('未导入和减少动态模式不产生退出层，命名特殊字符只作为文本呈现',async(p,nav)=>{
 for(const scene of scenes)await nav(scene);assert.equal(await p.locator('.scene-leaving-viewport').count(),0);
 const special=makeFixture();special.exams[1].label='高三 <script> & "阶段" 诊断';const data=path.join(out,'anonymous-escaped.json');fs.writeFileSync(data,JSON.stringify(special));await p.locator('#files').setInputFiles(data);await p.locator('[data-inbox=commit]').click();await p.waitForSelector('#inbox:not([open])',{state:'attached'});await nav('papers');assert.equal(await p.locator('[data-key=shelfExam][data-value="52"] .exam-choice-name').textContent(),special.exams[1].label);assert.equal(await p.locator('#stage script').count(),0);
},{empty:true,reduce:true});
const legacyRanks=structuredClone(fixture);legacyRanks.exams.forEach((e,i)=>e.order=11+i);legacyRanks.exams.unshift({id:'4册',label:'高二下零诊',scope:'city',order:10});legacyRanks.scores.unshift({...structuredClone(legacyRanks.scores.find(r=>r.sid==='test-4-2'&&r.exam==='51')),exam:'4册',total:450,cityRank:1400,schoolRank:null});const legacyMaterial=path.join(out,'anonymous-legacy-ranks.json');fs.writeFileSync(legacyMaterial,JSON.stringify(legacyRanks));
await test('原表重新合并补回4册校排名，目录、观察窗、完整档案与备份一致',async(p,nav)=>{
 await nav('people');await p.locator('[data-key=directoryExam][data-value="4册"]').click();assert.match(await p.locator('.student-rank').textContent(),/未提供/);
 await p.addScriptTag({url:new URL('vendor/xlsx.full.min.js',url).href});const bytes=await p.evaluate(()=>{const book=XLSX.utils.book_new(),row=Array(39).fill(null);Object.assign(row,{0:'4册物',1:'荣县一中',2:4,3:'校检4班03',5:450,7:1400,9:28,10:90});XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet([['考试','学校','班级','姓名','原分','总分','辅助','市排名','辅助','校排名'],row]),'学生基础');return Array.from(new Uint8Array(XLSX.write(book,{type:'array',bookType:'xlsx'})));});
 await p.locator('#files').setInputFiles({name:'anonymous-rank-repair.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:Buffer.from(bytes)});await p.locator('[data-inbox=commit][data-mode=merge]').click();await p.waitForSelector('#inbox:not([open])',{state:'attached'});await nav('people');await p.locator('[data-key=directoryExam][data-value="4册"]').click();assert.match(await p.locator('.student-rank').textContent(),/第 28 名/);await p.locator('.student-name').click();await p.waitForSelector('#research-drawer[open]');assert.match(await p.locator('#drawer-content .number-ribbon').textContent(),/年级排名28/);await p.locator('[data-cmd=drawer-person]').click();await p.waitForSelector('#stage .number-ribbon');assert.match(await p.locator('#stage .number-ribbon').textContent(),/年级排名28/);
 await nav('library');const pending=p.waitForEvent('download');await p.locator('[data-cmd=backup]').click();const file=path.join(out,'anonymous-repaired-backup.json');await (await pending).saveAs(file);const backup=JSON.parse(fs.readFileSync(file,'utf8')),row=backup.scores.find(r=>r.exam==='4册');assert.equal(row.schoolRank,28);assert.equal(row.cityRank,1400);assert.equal(row.sid,'test-4-2');assert.equal(backup.students.length,fixture.students.length);
},{data:legacyMaterial,reduce:true});
await browser.close();fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(results,null,2));if(results.some(r=>!r.ok))process.exitCode=1;
})();
