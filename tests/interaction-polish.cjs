// Anonymous materials, controlled local latency and storage failures only.
const {chromium,webkit}=require('playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {makeFixture}=require('./fixtures.cjs');
const engine=process.env.AUDIT_BROWSER==='webkit'?webkit:chromium,base=process.env.AUDIT_URL||'http://127.0.0.1:4199';
const out=process.env.AUDIT_OUTPUT||path.join(__dirname,'../.audit-output/interaction-polish-'+engine.name());fs.mkdirSync(out,{recursive:true});
const checks=[];
function record(name,details={}){checks.push({name,...details});fs.writeFileSync(path.join(out,'checks.json'),JSON.stringify({browser:engine.name(),checks},null,2));console.log('PASS '+name);}
async function scenario(browser,name,run){
 const c=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'no-preference'}),p=await c.newPage(),errors=[];
 await c.route('https://**/*',r=>r.abort());p.on('pageerror',e=>errors.push(e.message));
 try{await run(p);assert.deepEqual(errors,[]);}catch(e){await p.screenshot({path:path.join(out,name+'-failure.png')});fs.writeFileSync(path.join(out,name+'-failure.json'),JSON.stringify({error:e.message,errors,text:await p.locator('body').innerText()},null,2));throw e;}finally{await c.close();}
}
async function workspace(p){await p.goto(base);await p.locator('#files').setInputFiles({name:'anonymous-polish.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(makeFixture()))});await p.locator('[data-inbox=commit]').click();await p.locator('#inbox').waitFor({state:'hidden'});}
async function person(p){await p.locator('#navigation [data-scene=class]').click();await p.locator('[data-cmd=class-subject][data-subject=数学]').first().click();await p.locator('#drawer-content [data-cmd=lens-filter][data-value=missing]').click();await p.locator('#drawer-content [data-cmd=peek]').click();}

(async()=>{const browser=await engine.launch();try{
 await scenario(browser,'report',async p=>{
  await workspace(p);await person(p);
  let release,waiting=false;const gate=new Promise(r=>release=r);await p.route('**/*report-reading-*.css',async r=>{waiting=true;await gate;await r.continue();});
  await p.locator('#research-drawer [data-cmd=drawer-export]').click();await p.locator('#report-dialog[open] .surface-loading').waitFor();
  assert(await p.locator('#report-dialog [data-cmd=close-report]').isEnabled());
  await p.waitForFunction(()=>document.querySelector('#report-dialog').dataset.surfacePhase==='open');assert(waiting);const before=await p.locator('#report-dialog').evaluate(n=>n.offsetWidth);await p.screenshot({path:path.join(out,'report-loading.png')});
  await p.keyboard.press('Escape');await p.locator('#report-dialog').waitFor({state:'hidden'});release();await p.waitForTimeout(180);assert(!await p.locator('#report-dialog').isVisible());record('报告慢样式立即显示反馈，Esc取消后迟到结果不重开');
  // Observe content while the arrival is still running, rather than a flaky ms limit.
  await p.evaluate(()=>{const root=document.querySelector('#report-content'),o=new MutationObserver(()=>{if(root.querySelector('.report-workspace-head')){window.reportArrival=document.querySelector('#report-dialog').dataset.surfacePhase;o.disconnect();}});o.observe(root,{childList:true,subtree:true});});
  await p.locator('#research-drawer [data-cmd=drawer-export]').click();await p.locator('#report-dialog .report-workspace-head').waitFor();
  assert.equal(await p.evaluate(()=>window.reportArrival),'entering');
  const after=await p.locator('#report-dialog').evaluate(n=>n.offsetWidth);assert(Math.abs(before-after)<2);assert.equal(await p.locator('#report-dialog').getAttribute('data-report-loading'),null);
  assert.equal(await p.evaluate(()=>document.activeElement.id),'report-dialog-title');record('报告内容在入场结束前可用，加载与成稿窗口宽度一致');
  await p.waitForTimeout(360);await p.locator('#report-dialog [data-cmd=close-report]').click();await p.locator('#report-dialog').waitFor({state:'hidden'});
 });
 await scenario(browser,'report-retry',async p=>{
  await workspace(p);await person(p);let attempts=0;
  await p.route('**/*report-reading-*.css',async r=>{attempts++;if(attempts===1)await r.abort();else await r.continue();});
  await p.locator('#research-drawer [data-cmd=drawer-export]').click();await p.locator('#report-dialog [role=alert]').waitFor();assert(await p.locator('#report-dialog [data-cmd=report-retry]').isEnabled());
  await p.locator('[data-cmd=report-retry]').click();await p.locator('#report-dialog .report-workspace-head').waitFor();assert.equal(attempts,2);assert.match(await p.locator('#report-content').innerText(),/校检4班02/);record('报告样式失败保留窗口与原观察，可直接重试');
 });
 await scenario(browser,'draft-handoff',async p=>{
  await workspace(p);await person(p);
  await p.evaluate(()=>{
   const root=document.querySelector('#exercise-content'),o=new MutationObserver(()=>{const field=root.querySelector('[data-ai-field=focus]'),d=document.querySelector('#exercise-dialog');if(!field)return;o.disconnect();window.handoffPhase=d.dataset.surfacePhase;
    const put=IDBObjectStore.prototype.put;window.restoreWrites=()=>IDBObjectStore.prototype.put=put;IDBObjectStore.prototype.put=function(value,key){if(key==='exerciseComposerDrafts')throw Error('anonymous draft write failure');return put.call(this,value,key);};
    field.value='动画交接时的训练重点';field.dispatchEvent(new Event('input',{bubbles:true}));d.dispatchEvent(new Event('cancel',{cancelable:true}));
   });o.observe(root,{childList:true,subtree:true});
  });
  await p.locator('#research-drawer [data-cmd=exercise-open]').click();await p.locator('.exercise-error').filter({hasText:'本机保存未完成'}).waitFor();assert.equal(await p.evaluate(()=>window.handoffPhase),'entering');assert(await p.locator('#exercise-dialog').isVisible());assert.equal(await p.locator('[data-ai-field=focus]').inputValue(),'动画交接时的训练重点');record('表单刚出现且动画仍在运行时，Esc也等待草稿保存');
  await p.evaluate(()=>window.restoreWrites());await p.keyboard.press('Escape');await p.locator('#exercise-dialog').waitFor({state:'hidden'});
  await p.reload();await p.locator('#research-drawer [data-cmd=exercise-open]').click();await p.waitForFunction(()=>document.querySelector('[data-ai-field=focus]')?.value==='动画交接时的训练重点');record('交接期间保存失败可重试，刷新仍恢复最新文字');
 });
 await scenario(browser,'focus-handoff',async p=>{
  await workspace(p);await person(p);
  await p.evaluate(()=>{const root=document.querySelector('#exercise-content'),o=new MutationObserver(()=>{const f=root.querySelector('[data-ai-field=focus]');if(!f)return;o.disconnect();f.focus();f.value='保持输入不中断';f.dispatchEvent(new Event('input',{bubbles:true}));});o.observe(root,{childList:true,subtree:true});});
  await p.locator('#research-drawer [data-cmd=exercise-open]').click();await p.locator('[data-ai-field=focus]').waitFor();await p.waitForTimeout(450);assert.equal(await p.evaluate(()=>document.activeElement.dataset.aiField),'focus');assert.equal(await p.locator('[data-ai-field=focus]').inputValue(),'保持输入不中断');record('入场结束不抢走已开始编辑的输入焦点');
 });
 await scenario(browser,'center',async p=>{
  await workspace(p);
  await p.evaluate(async()=>{
   const {ensureFeatureStyles}=await import('/app/ui/feature-styles.js');await ensureFeatureStyles('exercises');const {createExerciseCenter}=await import('/app/ui/exercise-center.js');
   const host=document.querySelector('#stage');host.innerHTML='<div class="paper exercise-center" id="polish-center"></div>';
   const rows=Array.from({length:12},(_,i)=>({id:'anonymous-'+i,sid:'test-4-0',exam:'52',createdAt:Date.now()-i*1000,status:'failed',failure:'匿名测试失败记录',student:{name:'匿名学生'+i,classNo:4,examLabel:'匿名考试'},request:{subject:'数学',focus:'函数复核',count:3,minutes:15,difficulty:'基础巩固'}}));
   window.actionCalls=0;const wait=()=>{window.actionCalls++;return new Promise((resolve,reject)=>{window.finishAction=resolve;window.failAction=()=>reject(Error('当前连接暂不可用，请重试'));});};
   window.polishCenter=createExerciseCenter({records:()=>rows,getAtlas:()=>({}),authed:()=>true,onOpen:wait,onNew:wait,onRefresh:wait,onLogin:wait,onDelete:async ids=>{await wait();for(let i=rows.length-1;i>=0;i--)if(ids.includes(rows[i].id))rows.splice(i,1);},onClearCache:wait,onUndo:wait,onSubmit:wait});window.polishCenter.mount(document.querySelector('#polish-center'));
  });
  const open=p.locator('[data-center-card="anonymous-8"] [data-center-action=open]');await open.focus();await open.press('Enter');assert.match(await open.innerText(),/正在打开/);assert.equal(await open.getAttribute('aria-busy'),'true');assert(await p.locator('[data-center-action=new]').isDisabled());
  await p.evaluate(()=>window.polishCenter.render());assert.match(await open.innerText(),/正在打开/);assert.equal(await p.evaluate(()=>window.actionCalls),1);record('试题卡片就地显示忙碌状态，刷新渲染不丢反馈或重复执行');
  const position=await p.evaluate(()=>scrollY);await p.evaluate(()=>window.failAction());await p.locator('[data-center-card="anonymous-8"] [data-center-card-message]').waitFor();assert(Math.abs(await p.evaluate(()=>scrollY)-position)<4);assert(await open.isEnabled());assert.equal(await open.getAttribute('aria-busy'),null);assert.equal(await p.evaluate(()=>document.activeElement.dataset.centerId),'anonymous-8');record('下方卡片失败就地解释、恢复按钮焦点，页面不跳回上方');
  const refresh=p.locator('[data-center-action=refresh]');await refresh.click();assert.match(await refresh.innerText(),/正在同步/);await p.evaluate(()=>window.finishAction());await p.waitForFunction(()=>document.querySelector('[data-center-action=refresh]').textContent==='同步状态');assert(await p.locator('[data-center-message]').isVisible());record('同步操作结束恢复原按钮，结果显示在标题操作附近');
  await p.locator('[data-center-card="anonymous-8"] [data-center-action=delete]').click();const confirm=p.locator('[data-center-action=confirm-removal]');await confirm.focus();await confirm.press('Enter');assert(await confirm.isVisible());assert(await confirm.isDisabled());assert.match(await confirm.innerText(),/正在删除/);await p.evaluate(()=>window.finishAction());await p.locator('[data-center-card="anonymous-8"]').waitFor({state:'detached'});assert.equal(await p.locator('[data-center-confirmation]').innerHTML(),'');assert.equal(await p.evaluate(()=>document.activeElement.dataset.centerAction),'bulk');record('确认删除时保留忙碌反馈，结束后收起确认并恢复整理入口焦点');
  await p.emulateMedia({reducedMotion:'reduce'});for(const width of [320,390,1440]){await p.setViewportSize({width,height:844});assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));}await p.setViewportSize({width:390,height:844});await p.screenshot({path:path.join(out,'center-feedback.png')});record('中心反馈在320/390/1440宽度不溢出，减少动态仍可用');
 });
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
