const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {makeFixture}=require('./fixtures.cjs');
(async()=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']}),p=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'no-preference'}),errors=[],workers=[];
 p.on('pageerror',e=>errors.push(e.message));p.on('worker',w=>workers.push(w.url()));
 await p.goto(process.env.AUDIT_URL||'http://127.0.0.1:4173');await p.waitForSelector('#navigation button');await p.locator('#files').setInputFiles({name:'anonymous-background.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(makeFixture()))});await p.locator('[data-inbox=commit]').click();await p.waitForFunction(()=>!document.getElementById('inbox').open);
 let release,started;const gate=new Promise(r=>release=r),fontRequest=new Promise(r=>started=r);
 await p.route('**/assets/report-fonts/*.woff*',async route=>{started();await gate;try{await route.continue();}catch{}});
 await p.locator('#navigation [data-scene=library]').click();await p.locator('#stage [data-key=tab][data-value=reports]').click();await p.locator('[data-cmd=teaching-report-build]').click();await p.waitForSelector('.report-head-actions');
 const download=p.waitForEvent('download',{timeout:90000});await p.locator('[data-cmd=report-pdf]').click();await fontRequest;
 const start=Date.now();await p.locator('[data-cmd=close-report]').click();await p.waitForFunction(()=>!document.getElementById('report-dialog').open);assert(Date.now()-start<1800,'waiting print fonts must not lock the closing window');
 await p.locator('.masthead [data-cmd=reading]').click();await p.locator('[data-cmd=reading-close]').first().click();await p.waitForFunction(()=>!document.getElementById('reading-dialog').open);
 assert.equal(await p.evaluate(()=>Boolean(window.pdfMake)),false,'PDF engine must run outside the page thread');
 assert(workers.some(url=>url.includes('/app/io/pdf-worker.js')));release();const file=await download,dir=path.join(__dirname,'../.audit-output/runtime');fs.mkdirSync(dir,{recursive:true});const target=path.join(dir,'background-download.pdf');await file.saveAs(target);assert(fs.readFileSync(target).subarray(0,4).equals(Buffer.from('%PDF')));assert.deepEqual(errors,[]);
 console.log('PASS local PDF worker: window closes and other controls respond while fonts wait; closing preview preserves its in-flight real PDF download');await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
