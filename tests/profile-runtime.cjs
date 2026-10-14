// Controlled local latency (90ms per request) and CPU (4x). These are
// repeatable development measurements, not a device/network guarantee.
const {chromium}=require('playwright'),fs=require('node:fs'),zlib=require('node:zlib');
(async()=>{
const b=await chromium.launch({executablePath:process.env.CHROMIUM_PATH});
const data=JSON.parse(zlib.gunzipSync(fs.readFileSync('data/sample.json.gz')));data.userImported=true;
const result=[];
for(const saved of [false,true]){
 const c=await b.newContext({reducedMotion:'reduce'}),p=await c.newPage();
 await p.goto(process.env.AUDIT_URL||'http://127.0.0.1:4173');await p.waitForSelector('#welcome-title');
 if(saved)await p.evaluate(d=>new Promise((res,rej)=>{const r=indexedDB.open('hengji-evidence-workspace',1);r.onsuccess=()=>{const db=r.result,t=db.transaction('materials','readwrite');t.objectStore('materials').put(d,'dataset');t.oncomplete=()=>{db.close();res()};t.onerror=rej}}),data);
 await p.addInitScript(()=>{window.__tasks=[];new PerformanceObserver(l=>window.__tasks.push(...l.getEntries().map(e=>({start:e.startTime,duration:e.duration})))).observe({entryTypes:['longtask']});});
 const session=await c.newCDPSession(p);await session.send('Emulation.setCPUThrottlingRate',{rate:4});
 await p.route('**/*',async route=>{if(new URL(route.request().url()).origin===new URL(process.env.AUDIT_URL||'http://127.0.0.1:4173').origin)await new Promise(r=>setTimeout(r,90));await route.continue()});
 await p.reload({waitUntil:'domcontentloaded'});await p.waitForFunction(()=>document.querySelector('#stage').getAttribute('aria-busy')==='false');
 const startup=await p.evaluate(()=>({ms:performance.now(),requests:performance.getEntriesByType('resource').length,js:performance.getEntriesByType('resource').filter(e=>e.name.includes('.js')).map(e=>({url:e.name.split('/').slice(-2).join('/'),bytes:e.decodedBodySize})),tasks:window.__tasks,measures:performance.getEntriesByType('measure').map(e=>({name:e.name,ms:e.duration}))}));
 const nav=[];if(saved)for(let pass=0;pass<2;pass++)for(const scene of ['class','papers','people','follow','library','board']){const start=Date.now();await p.locator(`[data-cmd=nav][data-scene=${scene}]`).click();await p.waitForFunction(s=>document.querySelector('#stage').dataset.scene===s&&document.querySelector('#stage').getAttribute('aria-busy')==='false',scene);nav.push({pass,scene,ms:Date.now()-start});}
 result.push({saved,startup,nav});await c.close();
}
await b.close();fs.mkdirSync('.audit-output/runtime-speed',{recursive:true});fs.writeFileSync('.audit-output/runtime-speed/profile.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result.map(r=>({saved:r.saved,startupMs:r.startup.ms,requests:r.startup.requests,jsCount:r.startup.js.length,jsBytes:r.startup.js.reduce((a,e)=>a+e.bytes,0),longTasks:r.startup.tasks,measures:r.startup.measures,nav:r.nav})),null,2));
})().catch(e=>{console.error(e);process.exitCode=1});
