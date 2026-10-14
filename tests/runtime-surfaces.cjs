const {chromium}=require('playwright'),assert=require('node:assert/strict');
const {makeFixture}=require('./fixtures.cjs');
(async()=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
 for(const width of [1440,390]){
  const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'no-preference'}),p=await context.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.goto(process.env.AUDIT_URL||'http://127.0.0.1:4173');await p.waitForSelector('#navigation button');
  await p.locator('#files').setInputFiles({name:'anonymous-runtime.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(makeFixture()))});await p.locator('[data-inbox=commit]').click();await p.waitForFunction(()=>!document.getElementById('inbox').open);
  await p.locator('#navigation [data-scene=class]').click();await p.waitForSelector('#class-distribution');
  // Dismiss during the shell's first frame: delayed assembly must not reopen it.
  await p.evaluate(async()=>{document.querySelector('#stage [data-cmd=export]').click();while(!document.getElementById('report-dialog').open)await new Promise(r=>setTimeout(r,0));document.getElementById('report-dialog').dispatchEvent(new Event('cancel',{cancelable:true}));});
  await p.waitForFunction(()=>!document.getElementById('report-dialog').open);await p.waitForTimeout(450);
  assert.equal(await p.locator('#report-dialog').evaluate(d=>d.open),false);
  // Sample a real, interruptible entry; exit starts from the visible opacity.
  await p.locator('.masthead [data-cmd=reading]').click();
  await p.waitForFunction(()=>document.getElementById('reading-dialog').getAnimations().some(a=>a.currentTime>40&&a.currentTime<260));
  const sample=await p.evaluate(()=>{const d=document.getElementById('reading-dialog'),from=Number(getComputedStyle(d).opacity);document.querySelector('[data-cmd=reading-close]').click();return {from};});
  assert.ok(sample.from>0&&sample.from<=1.02);await p.waitForFunction(()=>!document.getElementById('reading-dialog').open);
  await p.locator('#stage [data-cmd=export]').click();await p.waitForSelector('.report-head-actions');
  await p.locator('.report-head-actions [data-cmd=report-settings]').click();await p.waitForFunction(()=>document.getElementById('report-dialog').classList.contains('is-configuring'));
  await p.evaluate(()=>{const b=document.querySelector('.report-head-actions [data-cmd=report-settings]');b.click();queueMicrotask(()=>b.click());});
  await p.waitForTimeout(550);assert.equal(await p.locator('#report-dialog').evaluate(d=>d.classList.contains('is-configuring')),true);
  await p.locator('.report-head-actions [data-cmd=report-settings]').click();await p.waitForFunction(()=>!document.getElementById('report-dialog').classList.contains('is-configuring'));
  await p.locator('[data-cmd=close-report]').click();await p.waitForFunction(()=>!document.getElementById('report-dialog').open);
  // Offscreen graphs keep their complete DOM, but layout work waits for approach.
  const lazy=await p.evaluate(async()=>{const {enhance}=await import('./app/ui/interactions.js?v=runtime-v34');const node=document.createElement('div');node.style.cssText='margin-top:3000px;width:300px';node.innerHTML='<svg class="bars" viewBox="0 0 200 100"><text x="0" y="20">延后布局</text></svg>';document.getElementById('stage').append(node);enhance(node);window.__lazyNode=node;return node.querySelector('svg').style.getPropertyValue('--plot-label-size');});assert.equal(lazy,'');
  await p.evaluate(()=>window.__lazyNode.scrollIntoView({behavior:'instant'}));await p.waitForFunction(()=>window.__lazyNode.querySelector('svg').style.getPropertyValue('--plot-label-size'));
  assert.deepEqual(errors,[]);console.log('PASS '+width+'px: cancellable report shell, real surface entry/exit, reversible settings drawer and viewport-priority plot layout');await context.close();
 }
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
