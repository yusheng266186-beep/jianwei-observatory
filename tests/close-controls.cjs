const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {makeFixture}=require('./fixtures.cjs'),out=path.join(__dirname,'../.audit-output/close-controls');fs.mkdirSync(out,{recursive:true});
const url=process.env.AUDIT_URL||'http://127.0.0.1:4173/';
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'/usr/bin/chromium',args:['--no-sandbox']}),results=[];
 async function test(name,fn,{width=1440,motion='no-preference'}={}){
  const c=await browser.newContext({viewport:{width,height:1000},reducedMotion:motion}),p=await c.newPage(),errors=[];p.setDefaultTimeout(url.startsWith('https:')?20000:8000);p.on('pageerror',e=>errors.push(e.message));
  try{
   await p.goto(url);await p.waitForSelector('#navigation button');await p.locator('#files').setInputFiles({name:'anonymous-close.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(makeFixture()))});
   await p.locator('[data-inbox=commit]').click();await p.waitForSelector('#inbox:not([open])',{state:'attached'});await p.locator('#toast [data-cmd=toast-close]').click();
   await p.locator('[data-cmd=nav][data-scene=class]').click();await p.waitForSelector('#class-distribution');await fn(p);
   assert.deepEqual(errors,[]);results.push({name,ok:true});console.log('PASS '+name);
  }catch(e){results.push({name,ok:false,error:e.message,errors});console.log('FAIL '+name+' '+e.message.slice(0,1500));await p.screenshot({path:path.join(out,'failure-'+results.length+'.png')});}
  await c.close();
 }
 const panels=[
  {id:'research-dialog',open:'.masthead [data-cmd=research]',close:'[data-cmd=research-close]'},
  {id:'reading-dialog',open:'.masthead [data-cmd=reading]',close:'[data-cmd=reading-close]'},
  {id:'report-dialog',open:'#stage [data-cmd=export]',close:'[data-cmd=close-report]'},
  {id:'table-reader',open:'#stage [data-cmd=table-open]',close:'[data-cmd=table-close]'},
  {id:'research-drawer',open:'#stage .table-scroll [data-cmd=peek]',close:'[data-cmd=drawer-close]'}
 ];
 const opened=async(p,item)=>{await p.locator(item.open).first().click();await p.waitForSelector('#'+item.id+'[open]');};
 const closed=async(p,id)=>{await p.waitForSelector('#'+id+':not([open])',{state:'attached',timeout:1600});await p.waitForFunction(()=>!document.querySelector('dialog[open]')&&!document.body.classList.contains('modal-open')&&!document.body.classList.contains('drawer-open'));};
 for(const [width,motion] of [[1440,'no-preference'],[390,'no-preference'],[390,'reduce']])await test(width+' / '+motion+'：五类面板的关闭按钮、Esc与焦点恢复',async p=>{
  for(const item of panels)for(const key of ['button','Escape']){
   await opened(p,item);if(key==='button')await p.locator('#'+item.id+' '+item.close).first().click();else await p.keyboard.press('Escape');await closed(p,item.id);
   assert.ok(await p.evaluate(()=>!document.activeElement?.closest('dialog:not([open])')),'焦点停在已关闭的 '+item.id);
  }
 },{width,motion});
 await test('退场动画被暂停时五类面板仍能退出并再次打开',async p=>{
  for(const item of panels){
   await opened(p,item);await p.locator('#'+item.id).evaluate(d=>{d.__originalAnimate=d.animate;d.animate=function(...args){const a=this.__originalAnimate(...args);a.pause();return a;};});
   await p.locator('#'+item.id+' '+item.close).first().click();await closed(p,item.id);
   await p.locator('#'+item.id).evaluate(d=>{d.animate=d.__originalAnimate;delete d.__originalAnimate;});await opened(p,item);await p.keyboard.press('Escape');await closed(p,item.id);
  }
 });
 await test('动画API不可用时五类面板的关闭仍有效',async p=>{
  for(const item of panels){
   await opened(p,item);await p.locator('#'+item.id).evaluate(d=>{d.__animate=d.animate;d.__animations=d.getAnimations;d.animate=undefined;d.getAnimations=undefined;});
   await p.locator('#'+item.id+' '+item.close).first().click();await closed(p,item.id);
   await p.locator('#'+item.id).evaluate(d=>{d.animate=d.__animate;d.getAnimations=d.__animations;delete d.__animate;delete d.__animations;});
  }
 });
 await test('连续关闭不会锁住研究夹，快速再开和宽表再开保留新面板',async p=>{
  const research=panels[0];await opened(p,research);
  await p.evaluate(()=>{const close=document.querySelector('[data-cmd=research-close]');close.click();close.click();document.dispatchEvent(new KeyboardEvent('keydown',{key:'k',ctrlKey:true,bubbles:true}));queueMicrotask(()=>document.querySelector('.masthead [data-cmd=research]').click());});
  await p.waitForSelector('#research-dialog[open]');await p.waitForTimeout(400);assert.equal(await p.locator('#research-dialog').evaluate(d=>d.open),true);
  await p.locator('[data-cmd=research-close]').click();await closed(p,research.id);
  await p.locator('[data-cmd=nav][data-scene=class]').click();await p.waitForSelector('#class-distribution');await opened(p,panels[3]);
  await p.evaluate(()=>{document.getElementById('table-reader').close();document.querySelector('#stage [data-cmd=table-open]').click();});
  await p.waitForTimeout(100);assert.equal(await p.locator('#table-reader').evaluate(d=>d.open),true);assert.ok(await p.locator('#table-reader-content table').count());assert.equal(await p.locator('#table-reader [data-cmd=table-close]').count(),1);
  await p.locator('#table-reader [data-cmd=table-close]').click();await closed(p,'table-reader');
 });
 await test('取消尚未完成的导入会终止读取，关闭后材料与导航保留',async p=>{
  let release;const gate=new Promise(r=>release=r);await p.route('**/app/data/worker.js*',async route=>{await gate;try{await route.continue();}catch{}});
  await p.locator('#files').setInputFiles({name:'anonymous-pending.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(makeFixture()))});
  await p.waitForSelector('#inbox[open]');await p.locator('[data-inbox=close]').click();release();await closed(p,'inbox');await p.waitForTimeout(100);
  assert.equal(await p.locator('body').getAttribute('data-workspace'),'ready');assert.equal(await p.locator('#files').inputValue(),'');await p.locator('[data-cmd=nav][data-scene=papers]').click();await p.waitForSelector('.paper-cover');
 });
 await test('较长研究夹中的可见提示条不覆盖关闭按钮，隐藏后不拦截导出',async p=>{
  await p.evaluate(()=>localStorage.setItem('hengji:research',JSON.stringify({saved:Array.from({length:20},(_,i)=>({id:'anonymous-study-'+i,scene:'class',values:{no:4,exam:'52',tab:'snapshot'},title:'匿名研究线索 '+i,scope:'4班 · 本场成绩',name:'匿名研究线索 '+i})),recent:[]})));
  await p.reload();await p.waitForSelector('#class-distribution');await p.locator('#stage [data-cmd=research-pin]').first().click();await p.locator('#toast.visible [data-cmd=research]').click();await p.waitForSelector('#research-dialog[open]');
  assert.equal(await p.locator('#research-dialog #toast').count(),1);await p.locator('[data-cmd=research-close]').click();await closed(p,'research-dialog');
  await p.locator('#toast [data-cmd=toast-close]').click();assert.equal(await p.locator('#toast').isVisible(),false);await opened(p,panels[2]);await p.locator('[data-cmd=close-report]').click();await closed(p,'report-dialog');
 },{width:390});
 await browser.close();fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(results,null,2));if(results.some(r=>!r.ok))process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});
