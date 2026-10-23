// Twelve-step smoke journey through the current, import-first product flow.
// Requires a local static server; AUDIT_URL and CHROMIUM_PATH are optional.
const {settings:openReportSettings}=require('./paper-preview-helpers.cjs');
const {chromium,webkit}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {makeFixture}=require('./fixtures.cjs');
const fixture=makeFixture(),originalTotal=fixture.scores[0].total;
// Exercise the actual source-confirmation gate without changing fixture values.
fixture.scores.push({...structuredClone(fixture.scores[0]),total:originalTotal+100});
const output=path.join(__dirname,'../.audit-output');fs.mkdirSync(output,{recursive:true});
const material=path.join(output,'hengji-fixture.json');
fs.writeFileSync(material,JSON.stringify(fixture));

async function run(){
 const engine=process.env.AUDIT_BROWSER==='webkit'?webkit:chromium;
 const browser=await engine.launch(engine===webkit?{headless:true}:{headless:true,executablePath:process.env.CHROMIUM_PATH||(fs.existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),args:['--no-sandbox']});
 const checks=[],errors=[],failed=[];let page;
 try{
  const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce',acceptDownloads:true});
  page=await context.newPage();page.setDefaultTimeout(10000);
  page.on('pageerror',e=>errors.push(e.message));
  page.on('response',r=>{if(r.status()>=400)failed.push(r.status()+' '+r.url());});
  const stageReady=scene=>page.waitForFunction(scene=>{const stage=document.getElementById('stage');return stage?.dataset.scene===scene&&stage.getAttribute('aria-busy')==='false';},scene);
  const click=selector=>page.locator(selector).first().click();
  const nav=async scene=>{await click(`#navigation [data-cmd="nav"][data-scene="${scene}"]`);await stageReady(scene);};
  const drawerTitle=async text=>{await page.locator('#research-drawer[open]').waitFor();await page.waitForFunction(text=>document.getElementById('drawer-title')?.textContent.includes(text),text);};
  const closeDrawer=async()=>{await click('#research-drawer [data-cmd="drawer-close"]');await page.locator('#research-drawer').waitFor({state:'hidden'});};
  const closeReport=async()=>{await click('#report-dialog [data-cmd="close-report"]');await page.locator('#report-dialog').waitFor({state:'hidden'});};
  const check=async(name,fn)=>{try{await fn();checks.push({name,ok:true});console.log('PASS '+checks.length+'/12 '+name);}catch(error){checks.push({name,ok:false,error:error.message});await page.screenshot({path:output+'/hengji-failure-'+checks.length+'.png'}).catch(()=>{});throw error;}};
  const download=async(selector,name)=>{const pending=page.waitForEvent('download',{timeout:90000});await click(selector);const file=path.join(output,name);await(await pending).saveAs(file);assert(fs.statSync(file).size>0);return file;};
  const notebook=async()=>{await nav('library');await click('#stage [data-cmd="set"][data-key="tab"][data-value="notebook"]');await click('#stage [data-cmd="notebook-open"]');await page.locator('#report-dialog[open]').waitFor();};

  await check('空状态展示导入首页，研究导航按设计隐藏',async()=>{
   await page.goto(process.env.AUDIT_URL||'http://127.0.0.1:4173');
   await page.locator('body[data-workspace="empty"] #welcome-title').waitFor();
   assert.equal(await page.locator('#welcome-title').count(),1);
   assert.equal(await page.locator('#navigation').isVisible(),false);
   assert.equal(await page.locator('.research-button').isVisible(),false);
   await page.locator('#drop-zone').waitFor();
   await page.screenshot({path:output+'/hengji-empty-desktop.png'});
  });
  await check('Worker导入，先确认冲突来源再加入工作区',async()=>{
   await page.locator('#files').setInputFiles(material);
   const commit=page.locator('[data-inbox="commit"][data-mode="replace"]');await commit.waitFor();
   assert.equal(await commit.isDisabled(),true);
   await click('[data-inbox="resolve"][data-index="all"][data-value="previous"]');
   await page.waitForFunction(()=>!document.querySelector('[data-inbox="commit"]')?.disabled);
   await commit.click();await page.locator('body[data-workspace="ready"]').waitFor();
   await page.locator('#inbox').waitFor({state:'hidden'});await page.locator('#navigation').waitFor();
  });
  await check('六个研究场景正常切换',async()=>{
   for(const scene of ['board','class','papers','people','follow','library']){await nav(scene);assert.equal(await page.locator('#stage .startup').count(),0);}
  });
  await check('班级学科→缺分学生→返回，保存指定考次研究',async()=>{
   await nav('class');await click('[data-cmd="class-subject"][data-subject="数学"]');await drawerTitle('数学');
   await click('#drawer-content [data-cmd="lens-filter"][data-value="missing"]');
   await page.locator('#drawer-content [data-cmd="peek"]').waitFor();
   assert.equal(await page.locator('#drawer-content [data-cmd="peek"]').count(),1);
   assert.match(await page.locator('#drawer-content').textContent(),/校检4班02/);
   await click('#drawer-content [data-cmd="peek"]');await drawerTitle('校检4班02');
   assert.equal(await page.locator('#drawer-content [data-cmd="drawer-person-step"]').count(),0);
   await click('#drawer-back');await drawerTitle('数学');
   await click('#drawer-content [data-cmd="drawer-tab"][data-value="history"]');
   await click('#drawer-content [data-cmd="lens-exam"][data-exam="51"]');
   await click('#drawer-content [data-cmd="drawer-tab"][data-value="students"]');
   await click('#drawer-content [data-cmd="research-pin"]');
   // Wait for the durable navigation checkpoint, not a fixed delay.
   await page.waitForFunction(()=>history.state?.jianweiResearch?.study?.drawer?.exam==='51');
   // Leave open deliberately: refresh now restores the active drawer.
  });
  await check('刷新自动恢复抽屉，再从研究夹恢复同一考次',async()=>{
   await page.reload();await page.locator('body[data-workspace="ready"]').waitFor();await drawerTitle('数学');
   assert.match(await page.locator('#drawer-content').textContent(),/测试第一场/);
   await closeDrawer();await click('.research-button');
   await click('[data-cmd="research-open"][data-collection="saved"]');await drawerTitle('数学');
   assert.match(await page.locator('#drawer-content').textContent(),/测试第一场/);await closeDrawer();
  });
  await check('知识点→单题→学生逐层返回；未知满分不伪装已知',async()=>{
   await nav('papers');await click('[data-cmd="paper"][data-key="数学|52"]');
   await click('#stage [data-cmd="set"][data-key="tab"][data-value="knowledge"]');
   await click('[data-cmd="knowledge-open"][data-knowledge="函数"]');await drawerTitle('函数');
   await click('#drawer-content [data-cmd="drawer-tab"][data-value="students"]');
   await click('#drawer-content [data-cmd="lens-filter"][data-value="missing"]');
   assert.ok(await page.locator('#drawer-content [data-cmd="peek"]').count()>0);
   await click('#drawer-content [data-cmd="drawer-tab"][data-value="questions"]');await click('#drawer-content [data-cmd="question"]');await drawerTitle('第 1 题');
   await click('#drawer-content [data-cmd="lens-filter"][data-value="zero"]');await click('#drawer-content [data-cmd="peek"]');
   await click('#drawer-back');await drawerTitle('第 1 题');await click('#drawer-back');await drawerTitle('函数');await closeDrawer();
   await click('#stage [data-cmd="set"][data-key="tab"][data-value="map"]');await click('#stage [data-cmd="question"][data-index="2"]');await drawerTitle('第 3 题');
   for(const filter of ['full','partial'])assert.equal(await page.locator(`#drawer-content [data-value="${filter}"][data-cmd="lens-filter"]`).isDisabled(),true);
   await click('#drawer-content [data-cmd="lens-filter"][data-value="missing"]');assert.equal(await page.locator('#drawer-content [data-cmd="peek"]').count(),10);await closeDrawer();
  });
  await check('摘录先展开报告设置，判断关闭保存且刷新保留',async()=>{
   await click('#stage [data-cmd="question"][data-index="0"]');await drawerTitle('第 1 题');
   await click('#drawer-content [data-cmd="lens-filter"][data-value="zero"]');await click('#drawer-content [data-cmd="drawer-capture"]');
   await openReportSettings(page);await page.locator('#report-note').fill('匿名校检：真实零分单独跟进。');await closeReport();
   if(await page.locator('#research-drawer').isVisible())await closeDrawer();
   await page.reload();await page.locator('body[data-workspace="ready"]').waitFor();
   // An active source may be restored; dismiss it before navigating the page.
   if(await page.locator('#research-drawer').isVisible())await closeDrawer();
   await notebook();await openReportSettings(page);
   assert.equal(await page.locator('#report-note').inputValue(),'匿名校检：真实零分单独跟进。');
   await click('#report-dialog [data-cmd="report-return"]');await drawerTitle('第 1 题');
   assert.equal(await page.locator('#drawer-content [data-cmd="lens-filter"][data-value="zero"]').getAttribute('aria-pressed'),'true');await closeDrawer();
  });
  await check('Excel与Word实际下载保留零分名单和教师判断',async()=>{
   await notebook();
   const file=await download('[data-cmd="report-excel"]','hengji-report.xlsx');
   const result=await page.evaluate(bytes=>{const wb=XLSX.read(new Uint8Array(bytes),{type:'array'});return {rows:wb.SheetNames.map(name=>XLSX.utils.sheet_to_json(wb.Sheets[name],{header:1})).find(rows=>rows[0]?.includes('学生')&&rows[0]?.includes('得分')&&rows[0]?.includes('知识点'))||[],notes:XLSX.utils.sheet_to_json(wb.Sheets['教师判断'],{header:1})};},Array.from(fs.readFileSync(file)));
   assert.equal(result.rows.length,11);assert.ok(result.rows.slice(1).every(r=>r[2]===0));assert.equal(result.notes[1][2],'匿名校检：真实零分单独跟进。');
   const word=await download('[data-cmd="report-word"]','hengji-report.docx');
   const xml=await page.evaluate(async bytes=>{const zip=await JSZip.loadAsync(new Uint8Array(bytes));return zip.file('word/document.xml').async('string');},Array.from(fs.readFileSync(word)));
   assert.match(xml,/匿名校检：真实零分单独跟进。/);await closeReport();
  });
  await check('学生目录卡片、表格和分布均可切换',async()=>{
   await nav('people');for(const view of ['table','landscape','cards'])await click(`#stage [data-cmd="set"][data-key="view"][data-value="${view}"]`);
   await page.locator('.student-card').first().waitFor();await page.screenshot({path:output+'/hengji-directory-desktop.png'});
  });
  await check('完整备份保留来源决策、研究夹与摘录',async()=>{
   await nav('library');await click('#stage [data-cmd="set"][data-key="tab"][data-value="materials"]');
   const file=await download('[data-cmd="backup"]','hengji-backup.json'),backup=JSON.parse(fs.readFileSync(file));
   assert.equal(backup.students.length,51);assert.equal(backup.research.saved.length,1);assert.equal(backup.notebook[0].note,'匿名校检：真实零分单独跟进。');
   const source=fixture.scores[0];assert.equal(backup.scores.find(r=>r.sid===source.sid&&r.exam===source.exam&&r.classNo===source.classNo).total,originalTotal);
  });
  await check('移动端六场景不横向溢出，抽屉返回与关闭可触达',async()=>{
   await page.setViewportSize({width:390,height:844});
   for(const scene of ['board','class','papers','people','follow','library']){await nav(scene);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),scene+' page overflow');}
   await nav('class');await click('[data-cmd="class-subject"][data-subject="数学"]');await drawerTitle('数学');
   await page.screenshot({path:output+'/hengji-drawer-mobile.png'});
   await click('#drawer-content [data-cmd="lens-filter"][data-value="missing"]');await click('#drawer-content [data-cmd="peek"]');await click('#drawer-back');await drawerTitle('数学');await closeDrawer();
  });
  await check('正常动画连续导航可操作，控制台与资源无错误',async()=>{
   await page.emulateMedia({reducedMotion:'no-preference'});await page.setViewportSize({width:1280,height:900});
   for(const scene of ['people','papers','board','class'])await page.locator(`#navigation [data-cmd="nav"][data-scene="${scene}"]`).click();
   await stageReady('class');await page.waitForFunction(()=>!document.querySelector('.scene-leaving-viewport')&&document.getAnimations().every(a=>a.effect?.getTiming().iterations===Infinity||(!a.pending&&a.playState!=='running')));await click('[data-cmd="class-subject"][data-subject="数学"]');await drawerTitle('数学');await closeDrawer();
   await page.waitForFunction(()=>!document.body.classList.contains('modal-open'));
   assert.deepEqual(errors,[]);assert.deepEqual(failed,[]);
  });
 }finally{
  fs.writeFileSync(output+'/hengji-audit-results.json',JSON.stringify({checks,errors,failed},null,2));await browser.close();
 }
 assert.equal(checks.length,12);
}
run().catch(error=>{console.error(error);process.exitCode=1;});
