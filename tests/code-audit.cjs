const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {makeFixture}=require('./fixtures.cjs');
const output=path.join(__dirname,'../.audit-output/code');fs.mkdirSync(output,{recursive:true});
const fixture=makeFixture();fixture.plans=['under','top'].map(tier=>({id:'test-4-0|52|'+tier,sid:'test-4-0',classNo:4,exam:'52',tier,status:'new',note:'分别保留的匿名教学记录'}));
fixture.research={saved:[{id:'first-study',name:'先选的4班',scene:'class',values:{no:4,exam:'52',tab:'snapshot'},drawer:{type:'person',sid:'test-4-0',exam:'52',tab:'overview'}},{id:'second-study',name:'后选的7班',scene:'class',values:{no:7,exam:'52',tab:'snapshot'}}],recent:[]};
fixture.notebook=[{id:'existing-note',title:'已经保存的匿名摘录',subtitle:'匿名审核',created:'2026/10/11',note:'旧判断',sections:[],sheets:{}}];
const file=path.join(output,'anonymous-code-audit.json');fs.writeFileSync(file,JSON.stringify(fixture));
const url=process.env.AUDIT_URL||'http://127.0.0.1:4173';
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||(fs.existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),args:['--no-sandbox']}),results=[];
 async function test(name,fn,{empty=false}={}){
  if(process.argv[2]&&!name.includes(process.argv[2]))return;
  const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'}),page=await context.newPage(),errors=[];page.setDefaultTimeout(7000);page.on('pageerror',e=>errors.push(e.message));
  const click=async selector=>{await page.locator(selector).first().click();await page.waitForTimeout(100);};
  try{
   await page.goto(url);await page.waitForSelector('#navigation button');await page.waitForTimeout(150);
   if(!empty){await page.locator('#files').setInputFiles(file);await page.locator('[data-inbox="commit"]').click();await page.waitForSelector('body[data-workspace="ready"]');await page.waitForSelector('#inbox:not([open])',{state:'attached'});}
   await fn({page,click});assert.deepEqual(errors,[]);results.push({name,ok:true});console.log('PASS '+name);
  }catch(error){results.push({name,ok:false,error:error.message,errors});console.log('FAIL '+name+' '+error.message.slice(0,900));await page.screenshot({path:path.join(output,'failure-'+results.length+'.png')});}
  await context.close();
 }
 await test('同一学生的本科和特控跟进在更新名单后都保留',async({page,click})=>{
  await click('[data-cmd="nav"][data-scene="follow"]');await click('[data-key="followView"][data-value="list"]');
  assert.equal(await page.locator('.follow-list tbody tr').count(),2);
  await click('.follow-list [data-cmd="follow-status"][data-id="test-4-0|52|under"][data-status="active"]');
  assert.equal(await page.locator('.follow-list tbody tr').count(),2);
  assert.equal(await page.locator('.follow-list [data-plan-note]').count(),2);
  await click('.follow-list [data-cmd="follow-status"][data-id="test-4-0|52|top"][data-status="done"]');
  assert.equal(await page.locator('.follow-list tbody tr').count(),2);
 });
 await test('取消尚未读取完的文件不会重新打开导入窗',async({page})=>{
  await page.evaluate(()=>{const read=File.prototype.arrayBuffer;File.prototype.arrayBuffer=async function(){await new Promise(r=>setTimeout(r,300));return read.call(this);};});
  await page.locator('#files').setInputFiles({name:'anonymous-delayed.csv',mimeType:'text/csv',buffer:Buffer.from('姓名,班级,考试,总分\n匿名学生,4,53,400')});await page.locator('[data-inbox="close"]').click();await page.waitForTimeout(700);
  assert.equal(await page.locator('#inbox').evaluate(d=>d.open),false);
  assert.equal(await page.locator('body').getAttribute('data-workspace'),'empty');
  await page.locator('#files').setInputFiles(file);await page.waitForSelector('[data-inbox="commit"]');
 },{empty:true});
 await test('导入提交后其他提交按钮与关闭入口被锁定',async({page})=>{
  await page.evaluate(()=>{const put=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(...args){const req=put.apply(this,args);if(args[1]==='previous')window.__undoWrites=(window.__undoWrites||0)+1;return req;};});
  await page.locator('#files').setInputFiles(file);await page.waitForSelector('[data-inbox="commit"][data-mode="merge"]');
  const locked=await page.evaluate(()=>{document.querySelector('[data-inbox="commit"][data-mode="merge"]').click();return [...document.querySelectorAll('[data-inbox="commit"],[data-inbox="close"]')].every(b=>b.disabled);});
  assert.equal(locked,true);
  await page.waitForSelector('#inbox:not([open])',{state:'attached'});assert.equal(await page.evaluate(()=>window.__undoWrites),1);
 });
 await test('保存失败不会被已保存提示覆盖，当前修改仍能备份',async({page,click})=>{
  await click('[data-cmd="nav"][data-scene="library"]');await click('[data-key="tab"][data-value="classes"]');
  await page.locator('[name="lead"]').fill('匿名教师的新修改');
  await page.evaluate(()=>{const put=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(value,key){if(key==='dataset')throw new DOMException('模拟空间不足','QuotaExceededError');return put.call(this,value,key);};});
  await click('[data-form="profile"] [type="submit"]');await page.waitForTimeout(350);
  const message=await page.locator('#toast').textContent();assert.match(message,/未保存|保存.*不可用|保存.*失败/);assert.doesNotMatch(message,/已保存到本机/);
  assert.equal(await page.locator('[name="lead"]').inputValue(),'匿名教师的新修改');
 });
 await test('主动中止IndexedDB事务会报告失败且不写入',async({page})=>{
  const result=await page.evaluate(async()=>{
   const workspace=await import(new URL('app/data/workspace.js',location.href)),put=IDBObjectStore.prototype.put;
   IDBObjectStore.prototype.put=function(...args){const req=put.apply(this,args);this.transaction.abort();return req;};
   try{await workspace.saveNotebook([{id:'aborted'}]);return {rejected:false};}catch(error){return {rejected:true,message:error.message};}finally{IDBObjectStore.prototype.put=put;}
  });assert.equal(result.rejected,true);
 });
 await test('并发保存按发起顺序写入，异步等待不改变保存快照',async({page})=>{
  const result=await page.evaluate(async()=>{
   const workspace=await import(new URL('app/data/workspace.js',location.href)),open=indexedDB.open.bind(indexedDB);let calls=0;
   indexedDB.open=function(...args){const req=open(...args);if(++calls===1)Object.defineProperty(req,'onsuccess',{set(fn){req.addEventListener('success',event=>setTimeout(()=>fn(event),180));}});return req;};
   const first=[{id:'first',note:'初始内容'}],a=workspace.saveNotebook(first);first[0].note='调用后修改';
   await a;const snapshot=await workspace.loadNotebook();
   calls=0;const older=workspace.saveNotebook([{id:'older'}]),newer=workspace.saveNotebook([{id:'newer'}]);await Promise.all([older,newer]);
   const latest=await workspace.loadNotebook();return {snapshot,latest};
  });assert.equal(result.snapshot[0].note,'初始内容');assert.equal(result.latest[0].id,'newer');
 });
 await test('工作区写入中途失败时材料、撤回快照和摘录一起回滚',async({page})=>{
  const result=await page.evaluate(async()=>{
   const workspace=await import(new URL('app/data/workspace.js',location.href));
   const before=await workspace.hydrate(),prior=await workspace.previous(),notebook=await workspace.loadNotebook(),put=IDBObjectStore.prototype.put;let rejected=false;
   IDBObjectStore.prototype.put=function(value,key){if(key==='notebook')throw new DOMException('模拟空间不足','QuotaExceededError');return put.call(this,value,key);};
   try{await workspace.saveWorkspace({...before.dataset,title:'不能写入的新材料'},{title:'不能写入的撤回'},[{id:'不能写入的摘录'}]);}catch{rejected=true;}finally{IDBObjectStore.prototype.put=put;}
   return {rejected,old:JSON.stringify([before.dataset,prior,notebook]),current:JSON.stringify([(await workspace.hydrate()).dataset,await workspace.previous(),await workspace.loadNotebook()])};
  });assert.equal(result.rejected,true);assert.equal(result.current,result.old);
 });
 await test('导出组件首载失败后可以直接重试',async({page})=>{
  let failed=false;await page.route('**/vendor/jszip.min.js',route=>{if(!failed){failed=true;return route.abort();}return route.continue();});
  const first=await page.evaluate(async()=>{const io=await import(new URL('app/io/exports.js',location.href));try{await io.vendors();return true;}catch{return false;}});assert.equal(first,false);
  const retry=await page.evaluate(async()=>{const io=await import(new URL('app/io/exports.js',location.href));const {XLSX,JSZip}=await io.vendors();return Boolean(XLSX&&JSZip);});assert.equal(retry,true);
 });
 await test('连续恢复同一场景的不同线索只保留最后的对象和抽屉',async({page,click})=>{
  await click('.research-button');await page.evaluate(()=>{document.querySelector('[data-cmd="research-open"][data-id="first-study"]').click();document.querySelector('[data-cmd="research-open"][data-id="second-study"]').click();});
  await page.waitForFunction(()=>document.getElementById('stage').dataset.scene==='class'&&document.getElementById('stage').getAttribute('aria-busy')==='false');await page.waitForTimeout(250);
  assert.match(await page.locator('#stage h1').textContent(),/7班/);assert.equal(await page.locator('#research-drawer').evaluate(d=>d.open),false);
 });
 await test('资料仓直接编辑判断后立即刷新不丢失新文字',async({page,click})=>{
  await click('[data-cmd="nav"][data-scene="library"]');await click('[data-key="tab"][data-value="notebook"]');
  await page.evaluate(()=>{const put=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(value,key){if(key==='notebook')throw new DOMException('模拟摘录保存失败','QuotaExceededError');return put.call(this,value,key);};const input=document.querySelector('[data-evidence-note="existing-note"]');input.value='刷新前的新匿名判断';input.dispatchEvent(new Event('input',{bubbles:true}));location.reload();});
  await page.waitForSelector('body[data-workspace="ready"]');await page.waitForSelector('[data-evidence-note="existing-note"]');
  assert.equal(await page.locator('[data-evidence-note="existing-note"]').inputValue(),'刷新前的新匿名判断');
 });
 await test('新预览尚未完成保存时刷新可恢复完整摘录和判断',async({page,click})=>{
  await click('[data-cmd="nav"][data-scene="people"]');await click('#stage [data-cmd="export"]');
  await page.waitForSelector('#report-note');
  await page.evaluate(()=>{const put=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(value,key){if(key==='notebook')throw new DOMException('模拟摘录保存失败','QuotaExceededError');return put.call(this,value,key);};const input=document.getElementById('report-note');input.value='新预览刷新前的匿名判断';input.dispatchEvent(new Event('input',{bubbles:true}));location.reload();});
  await page.waitForSelector('body[data-workspace="ready"]');
  await click('[data-cmd="nav"][data-scene="library"]');await click('[data-key="tab"][data-value="notebook"]');
  const draft=page.locator('[data-evidence-note]').filter({visible:true});
  assert.equal(await draft.count(),2);
  const restored=await page.evaluate(async()=>{const workspace=await import(new URL('app/data/workspace.js',location.href));return (await workspace.loadNotebook()).find(note=>note.note==='新预览刷新前的匿名判断');});
  assert.ok(restored?.sections?.length);assert.ok(Object.keys(restored.sheets||{}).length);
  assert.equal(await draft.first().inputValue(),'新预览刷新前的匿名判断');
 });
 fs.writeFileSync(path.join(output,'results.json'),JSON.stringify(results,null,2));await browser.close();if(results.some(r=>!r.ok))process.exitCode=1;
})();
