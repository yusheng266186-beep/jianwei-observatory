const {chromium,webkit}=require('playwright'),assert=require('node:assert/strict');
const {makeFixture}=require('./fixtures.cjs');
(async()=>{const engine=process.env.AUDIT_BROWSER==='webkit'?webkit:chromium,b=await engine.launch({executablePath:engine===chromium?process.env.CHROMIUM_PATH:undefined});
try{for(const saved of [false,true]){
 const c=await b.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'}),p=await c.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.goto(process.env.AUDIT_URL||'http://127.0.0.1:4173');await p.waitForSelector('body[data-workspace=empty]');
 if(saved){const data=makeFixture();await p.locator('#files').setInputFiles({name:'anonymous-startup.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(data))});await p.locator('[data-inbox=commit]').click();await p.waitForSelector('body[data-workspace=ready]');await p.waitForSelector('#inbox:not([open])',{state:'attached'});await p.locator('#navigation [data-scene=class]').click();await p.waitForSelector('#class-distribution');}
 let release;const gate=new Promise(resolve=>release=resolve);await p.route('**/app/data/workspace.js*',async route=>{await gate;await route.continue();});
 await p.reload({waitUntil:'domcontentloaded'});assert.equal(await p.locator('#stage').getAttribute('aria-busy'),'true');assert(await p.locator('.startup[role=status]').isVisible());assert.equal(await p.locator('#welcome-title').count(),0,'a pending workspace is not an empty workspace');
 release();await p.waitForSelector('body[data-workspace='+(saved?'ready':'empty')+']');await p.waitForFunction(()=>document.querySelector('#stage').getAttribute('aria-busy')==='false');
 if(saved){assert.equal(await p.locator('#stage').getAttribute('data-scene'),'class');assert(await p.locator('#class-distribution').count());assert.equal(await p.locator('#welcome-title').count(),0);}else assert(await p.locator('#welcome-title').isVisible());
 assert.deepEqual(errors,[]);console.log('PASS '+(engine===webkit?'webkit':'chromium')+' delayed startup: '+(saved?'saved materials and route restored without empty flash':'welcome appears only after confirming an empty workspace'));await c.close();
}}finally{await b.close();}})().catch(error=>{console.error(error);process.exitCode=1;});
