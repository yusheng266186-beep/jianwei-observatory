const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {makeFixture}=require('./fixtures.cjs'),{ready,text,settings,closeSettings}=require('./paper-preview-helpers.cjs');
const out=path.join(__dirname,'../.audit-output/report-v36');fs.mkdirSync(out,{recursive:true});
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium'});
 try{
  for(const width of (process.env.AUDIT_WIDTHS||'320,360,390,430,820').split(',').map(Number)){
   const c=await browser.newContext({viewport:{width,height:844},isMobile:width<600,deviceScaleFactor:1}),p=await c.newPage(),errors=[];
   p.on('pageerror',e=>errors.push(e.message));p.setDefaultTimeout(20000);
   const bounded=async label=>{
    const failures=await p.evaluate(()=>{
     const d=document.querySelector('#report-dialog'),bounds=d?.open?d.getBoundingClientRect():{left:0,right:innerWidth};
     const elements=d?.open?d.querySelectorAll('.report-workspace-head,.report-head-actions,.report-paper-tools,.report-outlets,.report-settings-scroll,.report-paper-rail,.report-head-actions button,.report-outlets button'):document.querySelectorAll('.report-types,.report-type,.report-options,.report-outline');
     return [...elements].filter(e=>e.getClientRects().length).flatMap(e=>{const r=e.getBoundingClientRect();return r.left<Math.max(0,bounds.left)-1||r.right>Math.min(innerWidth,bounds.right)+1?[{class:e.className,cmd:e.dataset.cmd,left:r.left,right:r.right,screen:innerWidth}]:[]});
    });assert.deepEqual(failures,[],label);
    assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),label+' page overflow');
   };
   await p.goto(process.env.AUDIT_URL||'http://127.0.0.1:4173');await p.waitForSelector('#navigation button');
   await p.locator('#files').setInputFiles({name:'anonymous-mobile-report.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(makeFixture()))});await p.locator('[data-inbox=commit]').click();await p.waitForFunction(()=>!document.querySelector('#inbox').open);
   await p.locator('#navigation [data-scene=library]').click();await p.locator('#stage [data-key=tab][data-value=reports]').click();await bounded('report setup '+width);
   await p.locator('#stage [data-key=reportKind][data-value=student]').click();await p.locator('[data-cmd=teaching-report-build]').click();await ready(p);await bounded('report window '+width);
   const content=await text(p);assert(content.includes('校内排名'));assert(!/旧导入|待核实|未保留列名/.test(content));
   await p.waitForSelector('.pdf-page[data-rendered=true]');if(await p.locator('#toast .toast-dismiss').isVisible())await p.locator('#toast .toast-dismiss').click();
   assert(await p.locator('.report-paper-scroll').evaluate(e=>e.scrollWidth<=e.clientWidth+1),'fit paper has no horizontal scrolling at '+width);
   await p.screenshot({path:path.join(out,'report-mobile-'+width+'.png')});
   await settings(p);await bounded('settings '+width);await p.screenshot({path:path.join(out,'settings-'+width+'.png')});await closeSettings(p);
   await p.locator('[data-cmd=report-reading]').click();await bounded('reading '+width);await p.screenshot({path:path.join(out,'reading-'+width+'.png')});
   assert.deepEqual(errors,[]);console.log('PASS '+width+': report setup, window, tools, settings, fullscreen reading, PDF fit');await c.close();
  }
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
