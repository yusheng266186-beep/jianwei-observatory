// Anonymous local fixtures and mocked services only; no paid model requests.
const {chromium,webkit}=require('playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {makeFixture}=require('./fixtures.cjs');
const engine=process.env.AUDIT_BROWSER==='webkit'?webkit:chromium;
const base=process.env.AUDIT_URL||'http://127.0.0.1:4199';
const out=process.env.AUDIT_OUTPUT||path.join(__dirname,'../.audit-output/continuation-reliability-'+engine.name());
fs.mkdirSync(out,{recursive:true});
const checks=[];
const record=(name,details={})=>{checks.push({name,...details});fs.writeFileSync(path.join(out,'checks.json'),JSON.stringify({browser:engine.name(),checks},null,2));console.log('PASS '+engine.name()+' '+name);};
async function context(browser){const c=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'});await c.route('https://**/*',r=>r.abort());return c;}
async function scenario(browser,name,run){const c=await context(browser),p=await c.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));try{await run(p);assert.deepEqual(errors,[]);}catch(e){await p.screenshot({path:path.join(out,name+'-failure.png')});fs.writeFileSync(path.join(out,name+'-failure.json'),JSON.stringify({error:e.message,errors,text:await p.locator('body').innerText()},null,2));throw e;}finally{await c.close();}}

(async()=>{const browser=await engine.launch();try{
 await scenario(browser,'probe',async p=>{
  await p.addInitScript({content:fs.readFileSync(path.join(__dirname,'fixtures/model-workbench-demo-mock.js'),'utf8')});
  await p.addInitScript(()=>{
   const real=fetch.bind(window),json=(v,status=200)=>Promise.resolve(new Response(JSON.stringify(v),{status}));
   window.auditProbe={mode:'network',posts:[],gets:[]};
   window.fetch=(input,init={})=>{
    const u=String(input),a=window.auditProbe;
    if(u.includes('/admin/probes')){a.posts.push(init.headers['X-Request-ID']);return a.mode==='denied'?json({error:'PROBE_LIMIT'},429):Promise.reject(new TypeError('anonymous lost response'));}
    if(u.includes('/jobs/')){a.gets.push(u.split('/').at(-1));if(a.mode==='missing')return json({error:'JOB_NOT_FOUND'},404);if(a.mode==='denied')return json({error:'JOB_NOT_FOUND'},404);return json({status:'ready',probe:{latencyMs:100}});}
    if(u.includes('/admin/codex/accounts'))return json({enabled:false,accounts:[]});
    if(u.includes('/admin/pelican'))return json({runs:[]});return real(input,init);
   };
  });
  await p.goto(base+'/model-workbench.html');await p.locator('#workspace:not([hidden])').waitFor();
  await p.locator('#probe').click();await p.waitForFunction(()=>document.querySelector('#probe-state').textContent.includes('连接通过'));
  let calls=await p.evaluate(()=>auditProbe);assert.equal(calls.posts.length,1);assert.deepEqual(calls.gets,[calls.posts[0]]);
  assert.equal(await p.evaluate(()=>sessionStorage.getItem('jianwei-model-probe')),null);
  record('提交响应丢失后查询同一测试，不重复提交');
  await p.evaluate(()=>{auditProbe.mode='denied';});await p.locator('#probe').click();await p.waitForFunction(()=>document.querySelector('#probe-state').textContent.includes('次数已用完'));assert(await p.locator('#probe').isEnabled());assert.equal((await p.evaluate(()=>auditProbe.gets)).length,1);assert.equal(await p.evaluate(()=>sessionStorage.getItem('jianwei-model-probe')),null);record('明确限额拒绝结束提交，不查询未创建任务');
  await p.evaluate(()=>{auditProbe.mode='missing';});await p.locator('#probe').click();
  await p.waitForFunction(()=>document.querySelector('#probe-state').textContent.includes('提交结果尚未确认'));
  assert(await p.locator('#probe').isDisabled());assert(await p.locator('#probe-stop').isVisible());
  const pending=await p.evaluate(()=>JSON.parse(sessionStorage.getItem('jianwei-model-probe')));
  assert(pending.unconfirmedUntil>Date.now());assert.equal((await p.evaluate(()=>auditProbe.posts)).length,3);
  await p.reload();await p.waitForFunction(()=>window.auditProbe.gets.length>0);
  assert.equal((await p.evaluate(()=>auditProbe.posts)).length,0); // Reload queries the saved ID only.
  assert.equal((await p.evaluate(()=>auditProbe.gets))[0],pending.id);
  record('未确认测试短暂404保留查询，刷新沿用原任务');
 });

 await scenario(browser,'draft',async p=>{
  await p.addInitScript(()=>{window.auditReady=false;addEventListener('hengji:workspace-ready',()=>window.auditReady=true);});
  await p.goto(base);await p.locator('#files').setInputFiles({name:'anonymous-draft.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(makeFixture()))});
  await p.locator('[data-inbox=commit]').click();await p.locator('#inbox').waitFor({state:'hidden'});
  await p.locator('#navigation [data-scene=class]').click();await p.locator('[data-cmd=class-subject][data-subject=数学]').first().click();
  await p.locator('#drawer-content [data-cmd=lens-filter][data-value=missing]').click();await p.locator('#drawer-content [data-cmd=peek]').click();
  await p.locator('#research-drawer [data-cmd=exercise-open]').click();await p.locator('[data-ai-field=focus]').waitFor();
  await p.evaluate(()=>{const put=IDBObjectStore.prototype.put;window.restoreDraftWrites=()=>IDBObjectStore.prototype.put=put;IDBObjectStore.prototype.put=function(value,key){if(key==='exerciseComposerDrafts')throw Error('anonymous draft write failure');return put.call(this,value,key);};});
  const text='保存恢复前保留的训练重点';await p.locator('[data-ai-field=focus]').fill(text);await p.keyboard.press('Escape');
  await p.locator('.exercise-error').filter({hasText:'本机保存未完成'}).waitFor();assert(await p.locator('#exercise-dialog').isVisible());assert.equal(await p.locator('[data-ai-field=focus]').inputValue(),text);
  await p.screenshot({path:path.join(out,'draft-retained.png')});record('Esc关闭遇到草稿保存失败时保留窗口和输入');
  await p.evaluate(()=>window.restoreDraftWrites());await p.keyboard.press('Escape');await p.locator('#exercise-dialog').waitFor({state:'hidden'});
  await p.reload();await p.waitForFunction(()=>window.auditReady);await p.locator('#research-drawer [data-cmd=exercise-open]').click();
  await p.waitForFunction(t=>document.querySelector('[data-ai-field=focus]')?.value===t,text);
  record('保存恢复后可重试关闭，刷新后训练草稿完整');
 });

 await scenario(browser,'pelican',async p=>{
  await p.goto(base);
  await p.evaluate(async()=>{
   const root=document.createElement('section');
   root.innerHTML=['add','run','cancel','refresh','reset-prompt'].map(n=>'<button data-pelican-'+n+'>'+n+'</button>').join('')+'<textarea data-pelican-prompt></textarea>'+['candidates','results','history','message'].map(n=>'<div data-pelican-'+n+'></div>').join('');document.body.replaceChildren(root);
   const selection={provider:'demo',model:'demo',effort:'low'},run=(id,status)=>({id,status,createdAt:Date.now(),candidates:[{id:'candidate-'+id,label:id,selection,status,...(id==='B'?{html:'<!doctype html><html><body><h1>匿名模型动画</h1></body></html>',kind:'html',output:'匿名原文'}:{})}]});
   window.auditPelican={mode:'cancel',calls:[]};
   const api=async(url,options={})=>{
    auditPelican.calls.push(url);
    if(url.endsWith('/cancel'))return new Promise(resolve=>{const id=url.split('/').at(-2);window.cancelReplies||={};window.cancelReplies[id]=()=>resolve(run(id,'cancelled'));if(id==='A')window.releaseCancel=window.cancelReplies[id];});
    if(url==='/admin/pelican'&&options.method==='POST')return new Promise(resolve=>window.releaseSubmit=()=>resolve(run('new','running')));
    if(url==='/admin/pelican')return {runs:[run('A','running'),run('B','ready'),run('C','running')]};
    if(url.endsWith('/A')&&auditPelican.mode==='missing')return new Promise((_,reject)=>window.rejectOld=()=>reject(Object.assign(Error('anonymous missing run'),{code:'PELICAN_NOT_FOUND'})));
    return run(url.split('/').at(-1),url.endsWith('/A')||url.endsWith('/C')?'running':'ready');
   };
   const {createPelicanPanel}=await import('/assets/workbench-pelican.js');window.panel=createPelicanPanel({root,api,session:()=>true,getSelection:()=>selection,getCatalog:()=>[]});await panel.load();
  });
  const results=p.locator('[data-pelican-results]');
  await p.locator('[data-pelican-open=A]').click();await p.locator('[data-pelican-cancel]').click();await p.waitForFunction(()=>!!window.releaseCancel);
  await p.locator('[data-pelican-open=B]').click();await results.getByRole('heading',{name:'B',exact:true}).waitFor();
  await p.evaluate(()=>window.releaseCancel());await p.waitForTimeout(100);assert.equal(await results.locator('h3').innerText(),'B');record('旧比较停止响应不覆盖新打开的结果');
  await p.evaluate(()=>auditPelican.mode='missing');await p.locator('[data-pelican-open=A]').click();await p.waitForFunction(()=>!!window.rejectOld);assert.equal(await results.locator('h3').count(),0);assert(await p.locator('[data-pelican-cancel]').isHidden());assert(await p.locator('[data-pelican-run]').isDisabled());
  await p.locator('[data-pelican-open=B]').click();await p.evaluate(()=>window.rejectOld());await p.waitForTimeout(100);assert.equal(await results.locator('h3').innerText(),'B');record('旧比较查询404不清空新结果');
  await p.locator('[data-pelican-add]').click();await p.locator('[data-pelican-run]').click();await p.waitForFunction(()=>!!window.releaseSubmit);
  await p.locator('[data-pelican-open=B]').click();await p.evaluate(()=>window.releaseSubmit());await p.waitForTimeout(100);assert.equal(await results.locator('h3').innerText(),'B');record('旧比较提交响应不覆盖已切换的历史记录');
  const download=p.waitForEvent('download');await p.locator('.pelican-download').click();const file=path.join(out,'anonymous-model.html');await(await download).saveAs(file);assert.match(fs.readFileSync(file,'utf8'),/匿名模型动画/);await p.locator('[data-pelican-preview]').click();await p.locator('.pelican-preview-dialog[open]').waitFor();assert.equal(await p.locator('.pelican-preview-dialog iframe').getAttribute('sandbox'),'allow-scripts');await p.keyboard.press('Escape');await p.locator('.pelican-preview-dialog').waitFor({state:'hidden'});record('比较结果仍支持HTML下载与隔离放大预览');
  await p.evaluate(()=>auditPelican.mode='cancel');await p.locator('[data-pelican-open=A]').click();await p.locator('[data-pelican-cancel]').click();await p.locator('[data-pelican-open=A]').click();assert(await p.locator('[data-pelican-cancel]').isDisabled());await p.locator('[data-pelican-open=C]').click();assert(await p.locator('[data-pelican-cancel]').isEnabled());await p.locator('[data-pelican-cancel]').click();await p.waitForFunction(()=>!!window.cancelReplies.C);await p.evaluate(()=>window.cancelReplies.A());await p.waitForTimeout(100);assert(await p.locator('[data-pelican-cancel]').isDisabled());await p.evaluate(()=>window.cancelReplies.C());await p.waitForFunction(()=>document.querySelector('[data-pelican-results] .pill').textContent==='已停止');assert.equal(await results.locator('h3').innerText(),'C');record('停止按钮按轮次跟踪，旧停止响应不解锁正在停止的新轮次');
 });
 }finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
