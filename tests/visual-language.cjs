const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib');
const data=zlib.gunzipSync(fs.readFileSync(path.join(__dirname,'../data/sample.json.gz'))),url=process.env.AUDIT_URL||'http://127.0.0.1:4173';
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium'});
 try{
  for(const width of (process.env.AUDIT_WIDTHS||'1440,820,390,320').split(',').map(Number)){
   const c=await browser.newContext({viewport:{width,height:1000},reducedMotion:'no-preference'}),p=await c.newPage(),errors=[];p.setDefaultTimeout(20000);p.on('pageerror',e=>errors.push(e.message));
   const settle=()=>p.waitForFunction(()=>!document.querySelector('.scene-leaving-viewport')&&document.getAnimations().every(a=>a.effect?.getTiming().iterations===Infinity||(!a.pending&&a.playState!=='running')));
   const nav=async scene=>{await p.locator('#navigation [data-scene='+scene+']').click();await p.waitForFunction(s=>document.querySelector('#stage').dataset.scene===s&&document.querySelector('#stage').getAttribute('aria-busy')==='false',scene);await settle();};
   await p.goto(url);await p.waitForSelector('#navigation button');await p.locator('#files').setInputFiles({name:'匿名视觉回归.json',mimeType:'application/json',buffer:data});await p.locator('[data-inbox=commit]').click();await p.waitForSelector('#inbox:not([open])',{state:'attached'});await settle();
   let reference;
   for(const scene of ['board','class','papers','people','follow','library']){
    await nav(scene);
    const panels=await p.locator('#stage').evaluate(root=>[...root.querySelectorAll('.block,.student-card,.paper-cover,.paper-profile,.class-split,.materials-stage,.overview-measures>button')].filter(e=>!e.closest('.class-split')||e===e.closest('.class-split')).map(e=>{const s=getComputedStyle(e);return {class:e.className,material:[s.backgroundColor,s.backgroundImage,s.boxShadow,s.borderTopWidth,s.borderTopLeftRadius]};}));
    assert(panels.length>0,scene+' has reading surfaces');
    reference??=panels[0].material;for(const panel of panels)assert.deepEqual(panel.material,reference,scene+' '+panel.class+' uses the same reading material');
    assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),scene+' page overflow');
    if(scene==='class'&&width<760){
     const rails=await p.locator('.scene-toolbar .exam-rail').evaluateAll(rails=>rails.map(r=>{const box=r.getBoundingClientRect(),selected=r.querySelector('.selected').getBoundingClientRect();return {overflow:r.scrollWidth>r.clientWidth+1,visible:selected.left>=box.left-1&&selected.right<=box.right+1,labels:[...r.querySelectorAll('.exam-stop small')].map(e=>({width:e.clientWidth,fontSize:parseFloat(getComputedStyle(e).fontSize),overflow:e.scrollWidth>e.clientWidth+1}))};}));
     assert(rails.length>0);assert(rails.every(r=>r.overflow&&r.visible&&r.labels.every(l=>l.width>=l.fontSize*6&&!l.overflow)),'long exam names remain horizontal and current exam is visible: '+JSON.stringify(rails));
    }
   }
   await p.locator('.masthead [data-cmd=reading]').click();await p.waitForFunction(()=>document.querySelector('#reading-dialog').getAnimations().some(a=>a.currentTime>40&&a.currentTime<140));
   const backdrop=await p.evaluate(()=>{
    const d=document.querySelector('#reading-dialog'),opacity=()=>Number(getComputedStyle(d,'::backdrop').opacity),before=opacity();
    d.querySelector('[data-cmd=reading-close]').click();const closing=opacity();document.querySelector('.masthead [data-cmd=reading]').click();const reopened=opacity();return {before,closing,reopened};
   });
   assert(backdrop.before>0&&backdrop.before<1);assert(Math.abs(backdrop.closing-backdrop.before)<.12&&Math.abs(backdrop.reopened-backdrop.closing)<.12,JSON.stringify(backdrop));await settle();assert(await p.locator('#reading-dialog').evaluate(d=>d.open));
   const timings=await p.evaluate(async()=>{const {motion}=await import('./app/ui/motion.js?v=runtime-v42'),s=getComputedStyle(document.documentElement);return Object.entries(motion).map(([key,v])=>({key,native:v.duration,css:parseFloat(s.getPropertyValue('--motion-'+key))}));});assert(timings.every(t=>t.native===t.css),'native animations and CSS share timings');
   await p.locator('#reading-dialog [data-key=surface][data-value=paper]').click();await p.locator('#reading-dialog [data-cmd=reading-close]').first().click();await p.waitForSelector('#reading-dialog:not([open])',{state:'attached'});await nav('papers');assert.equal(await p.locator('#navigation').evaluate(e=>getComputedStyle(e).backdropFilter),'none');
   await p.emulateMedia({reducedMotion:'reduce'});await nav('people');assert.equal(await p.locator('.scene-leaving-viewport').count(),0);assert.equal(await p.locator('#stage').evaluate(e=>getComputedStyle(e).transform),'none');
   await p.emulateMedia({forcedColors:'active'});assert(await p.locator('.student-card').first().evaluate(e=>getComputedStyle(e).borderTopWidth!=='0px'),'high contrast retains structural boundaries');
   assert.deepEqual(errors,[]);console.log('PASS '+width+': shared materials, readable exam rail, interrupted backdrop continuity, shared motion tokens, paper/reduced motion/high contrast');await c.close();
  }
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
