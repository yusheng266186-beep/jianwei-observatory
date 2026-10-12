const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {makeFixture}=require('./fixtures.cjs');
const output=path.join(__dirname,'../.audit-output/directory-tests');fs.mkdirSync(output,{recursive:true});
const url=process.env.AUDIT_URL||'http://127.0.0.1:4173';
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']}),results=[];
 async function test(name,run,fixture=makeFixture()) {
  const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage(),errors=[];page.setDefaultTimeout(7000);page.on('pageerror',e=>errors.push(e.message));
  const settled=()=>page.waitForFunction(()=>document.querySelector('#stage').getAttribute('aria-busy')==='false');
  const click=async selector=>{await page.locator(selector).click();await settled();};
  const pick=label=>page.locator('.directory-materials button').filter({hasText:label});
  const count=async expected=>{await page.waitForFunction(n=>document.querySelector('.directory-controls h2')?.textContent==='找到 '+n+' 位学生',expected);};
  try {
   await page.goto(url);await page.waitForSelector('#navigation button');await page.locator('#files').setInputFiles({name:'anonymous.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(fixture))});await page.locator('[data-inbox="commit"]').click();await page.waitForSelector('#inbox:not([open])',{state:'attached'});await page.locator('#toast [data-cmd="toast-close"]').click();
   await click('[data-cmd="nav"][data-scene="people"]');await click('.scope-class[data-value="4"]');await count(35);
   await run({page,click,pick,count,settled});assert.deepEqual(errors,[]);results.push({name,ok:true});console.log('PASS '+name);
  }catch(error){results.push({name,ok:false,error:error.message,errors});console.log('FAIL '+name+' '+error.message.slice(0,500));await page.screenshot({path:path.join(output,'failure-'+results.length+'.png')});}
  await context.close();
 }
 await test('总分待补与材料条件组合保留班级，卡片新入口沿相同结果打开并返回',async({page,click,pick,count})=>{
  assert.equal(await pick('总分待补').locator('strong').textContent(),'1');await pick('总分待补').click();await count(1);assert.equal(await page.locator('.student-score>strong').textContent(),'—');assert.match(await page.locator('.active-conditions').textContent(),/4班.*总分待补/);
  await pick('多次成绩').click();await count(1);await pick('本场小题').click();await count(1);assert.equal(await pick('多次成绩').getAttribute('aria-pressed'),'false');assert.equal(await pick('本场小题').getAttribute('aria-pressed'),'true');
  await page.locator('.student-open').click();await page.waitForSelector('#research-drawer[open]');assert.equal(await page.locator('#drawer-title').textContent(),'校检4班02');await click('#research-drawer .drawer-top [data-cmd="drawer-close"]');await count(1);assert.match(await page.locator('.active-conditions').textContent(),/总分待补.*本场有小题/);
  await pick('总分待补').click();await count(35);assert.equal(await pick('本场小题').getAttribute('aria-pressed'),'true');
  await page.evaluate(()=>{const buttons=document.querySelectorAll('.directory-materials button');buttons[0].click();buttons[0].click();buttons[1].click();buttons[2].click();buttons[1].click();});await page.waitForFunction(()=>document.querySelector('.material-pick[data-value="history"]')?.getAttribute('aria-pressed')==='true');await count(35);assert.equal(await pick('总分待补').getAttribute('aria-pressed'),'false');
 });
 await test('新筛选保存、刷新、重新打开与实际Excel导出保持相同名单和条件',async({page,click,pick,count})=>{
  await pick('总分待补').click();await count(1);await click('[data-cmd="directory-save"]');await page.locator('[name="view-name"]').fill('四班总分待补');await page.locator('[data-form="directory-view"] [type="submit"]').click();await page.waitForFunction(()=>JSON.parse(localStorage.getItem('hengji:directoryViews')||'[]').some(v=>v.name==='四班总分待补'));await click('#research-drawer .drawer-top [data-cmd="drawer-close"]');
  await click('.result-tools [data-cmd="directory-reset"]');await count(51);await page.reload();await page.waitForSelector('#navigation button');await page.waitForSelector('.directory-controls h2');await page.locator('.directory-lenses .saved-view-link').filter({hasText:'四班总分待补'}).click();await count(1);assert.equal(await pick('总分待补').getAttribute('aria-pressed'),'true');
  await click('.directory-query [data-cmd="export"]');const pending=page.waitForEvent('download');await page.locator('[data-cmd="report-excel"]').click();const file=await pending;assert.equal(await file.failure(),null);const target=path.join(output,'missing-total.xlsx');await file.saveAs(target);const sheets=await page.evaluate(bytes=>{const book=XLSX.read(new Uint8Array(bytes),{type:'array'});return Object.fromEntries(book.SheetNames.map(name=>[name,XLSX.utils.sheet_to_json(book.Sheets[name],{header:1})]));},[...fs.readFileSync(target)]);
  assert.ok(sheets['筛选条件'].some(row=>row[0]==='总分填写状态'&&row[1]==='总分待补'));assert.equal(sheets['学生成绩'].length,2);assert.equal(sheets['学生成绩'][1][sheets['学生成绩'][0].indexOf('姓名')],'校检4班02');
 });
 const missing=makeFixture();missing.lines=[];missing.answers=missing.answers.filter(r=>r.sid!=='test-4-1');missing.scores.find(r=>r.sid==='test-4-0'&&r.exam==='52').total=0;
 await test('条件切换人数准确，真实零分可查，四种宽度的清除按钮和卡片线索可用',async({page,click,pick,count})=>{
  await pick('本场小题').click();await count(34);assert.equal(await pick('总分待补').locator('strong').textContent(),'0');await pick('总分待补').click();await count(0);assert.equal(await pick('多次成绩').locator('strong').textContent(),'1');await pick('多次成绩').click();await count(1);
  await click('.active-conditions [data-key="scoreStatus"]');await count(35);await click('[data-cmd="directory-filters"]');await page.locator('#drawer-content [data-key="scoreStatus"][data-value="present"]').click();await page.locator('[data-cmd="directory-apply"]').click();await count(34);await click('.result-tools [data-key="sort"][data-value="low"]');assert.equal(await page.locator('.student-score>strong').first().textContent(),'0.0');assert.equal(await page.locator('.student-clues').count(),0);assert.ok(await page.locator('.student-clues-empty').count()>0);await page.locator('.student-open').first().click();await page.waitForSelector('.student-stepper');assert.equal(await page.locator('.student-stepper b').textContent(),'1 / 34');await page.locator('[data-cmd="drawer-person-step"][data-step="1"]').click();await page.waitForFunction(()=>document.getElementById('drawer-title').textContent==='校检4班03');await click('#research-drawer .drawer-top [data-cmd="drawer-close"]');
  for(const width of [320,390,820,1440]){await page.setViewportSize({width,height:900});await page.waitForTimeout(100);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));const reset=await page.locator('.result-tools [data-cmd="directory-reset"]').boundingBox(),tools=await page.locator('.result-tools').boundingBox();assert.ok(reset.x>=tools.x-1&&reset.x+reset.width<=tools.x+tools.width+1,'clear button leaves result tools at '+width);for(const button of await page.locator('.directory-materials button').all())assert.ok(await button.evaluate(e=>e.scrollWidth<=e.clientWidth+1));}
 },missing);
 fs.writeFileSync(path.join(output,'results.json'),JSON.stringify({results},null,2));await browser.close();if(results.some(r=>!r.ok))process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});
