// Optional headless measurements; these describe this container, not real-device FPS.
const {chromium}=require('playwright');
const fs=require('node:fs'),path=require('node:path');
const {makeFixture}=require('./fixtures.cjs');
const output=path.join(__dirname,'../.audit-output/motion');fs.mkdirSync(output,{recursive:true});
const fixture=makeFixture();for(let copy=1;copy<Number(process.env.MOTION_COPIES||10);copy++){
 const extra=makeFixture();for(const student of extra.students){student.id+='-'+copy;student.name+='组'+copy;}
 for(const row of [...extra.scores,...extra.answers])row.sid+='-'+copy;
 fixture.students.push(...extra.students);fixture.scores.push(...extra.scores);fixture.answers.push(...extra.answers);
}
if(process.env.MOTION_DENSE==='1'){
 const templates=[...fixture.answers].filter(a=>a.subject==='数学');fixture.answers=[];
 for(const subject of ['语文','数学','英语','物理','化学','生物']){
  fixture.banks[subject+'|52']=Array.from({length:24},(_,i)=>({label:String(i+1),max:5,knowledge:'知识点'+(i%8+1)}));
  fixture.answers.push(...templates.map((a,n)=>({...a,subject,values:Array.from({length:24},(_,i)=>n%17===0?null:(n+i)%6)})));
 }
}
const material=path.join(output,'anonymous-profile.json');fs.writeFileSync(material,JSON.stringify(fixture));
const scenes=['board','class','papers','people','follow','library'];
const percentile=(values,p)=>{if(!values.length)return null;const sorted=[...values].sort((a,b)=>a-b),index=(sorted.length-1)*p,lo=Math.floor(index),hi=Math.ceil(index);return Math.round((sorted[lo]+(sorted[hi]-sorted[lo])*(index-lo))*10)/10;};
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||(fs.existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),args:['--no-sandbox']});const results=[];
 const targets=process.env.MOTION_BASELINE_URL?[['before',process.env.MOTION_BASELINE_URL],['after',process.env.AUDIT_URL||'http://127.0.0.1:4173']]:[['after',process.env.AUDIT_URL||'http://127.0.0.1:4173']];
 for(const [version,url] of targets)for(const mobile of [false,true]){
  const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:1000},reducedMotion:'no-preference'}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{window.__profile={recording:false,gaps:[],tasks:[],clicks:[],lastFrame:0};
   const tick=t=>{const p=window.__profile;if(p.recording&&p.lastFrame)p.gaps.push(t-p.lastFrame);p.lastFrame=t;requestAnimationFrame(tick);};requestAnimationFrame(tick);
   new PerformanceObserver(list=>{if(window.__profile.recording)window.__profile.tasks.push(...list.getEntries().map(e=>e.duration));}).observe({type:'longtask'});
   document.addEventListener('click',e=>{if(window.__profile.recording)window.__profile.clicks.push({at:performance.now(),scene:e.target.closest('[data-cmd="nav"]')?.dataset.scene||null});},true);
  });
  const settle=()=>page.waitForFunction(()=>document.getElementById('stage').getAttribute('aria-busy')!=='true'&&document.getAnimations().filter(a=>a.effect?.getTiming().iterations!==Infinity).every(a=>a.playState!=='running'&&!a.pending));
  await page.goto(url);await page.waitForSelector('#navigation button');await settle();await page.locator('#files').setInputFiles(material);await page.locator('[data-inbox="commit"]').click();await page.waitForSelector('body[data-workspace="ready"]');await page.waitForSelector('#inbox:not([open])',{state:'attached'});await settle();
  for(const scene of scenes){await page.locator(`[data-cmd="nav"][data-scene="${scene}"]`).click();await page.waitForFunction(s=>document.getElementById('stage').dataset.scene===s,scene);await settle();}
  await page.evaluate(()=>Object.assign(window.__profile,{recording:true,gaps:[],tasks:[],clicks:[],lastFrame:0}));const timings=[];
  for(let cycle=0;cycle<2;cycle++)for(const scene of scenes){
   const start=await page.evaluate(scene=>{const at=performance.now();document.querySelector(`[data-cmd="nav"][data-scene="${scene}"]`).click();return at;},scene);
   await page.waitForFunction(s=>document.getElementById('stage').dataset.scene===s,scene);const visible=await page.evaluate(()=>performance.now());await settle();const end=await page.evaluate(()=>performance.now());timings.push({scene,visible:visible-start,settled:end-start});
  }
  await page.evaluate(()=>window.__profile.recording=false);const data=await page.evaluate(()=>window.__profile);
  // Physical clicks while transitions are active, independent of DOM dispatch timing.
  await page.evaluate(()=>Object.assign(window.__profile,{recording:true,clicks:[]}));
  const expected=['people','papers','board','follow','library','class'];
  for(const scene of expected){const r=await page.locator(`[data-cmd="nav"][data-scene="${scene}"]`).boundingBox();await page.mouse.click(r.x+r.width/2,r.y+r.height/2);await page.waitForTimeout(35);}
  await settle();const rapid=await page.evaluate(()=>({clicks:window.__profile.clicks,final:document.getElementById('stage').dataset.scene}));
  const summary={version,platform:mobile?'mobile':'desktop',students:fixture.students.length,answers:fixture.answers.length,questions:Object.values(fixture.banks).reduce((n,b)=>n+b.length,0),navigations:timings.length,visibleMedianMs:percentile(timings.map(t=>t.visible),.5),settledMedianMs:percentile(timings.map(t=>t.settled),.5),rafGap95Ms:percentile(data.gaps,.95),rafGapsOver34Ms:data.gaps.filter(v=>v>34).length,rafFrames:data.gaps.length,longTasks:data.tasks.length,longTaskTotalMs:Math.round(data.tasks.reduce((s,v)=>s+v,0)),rapidAccepted:rapid.clicks.filter(c=>c.scene).length,rapidExpected:expected.length,rapidFinal:rapid.final,errors};
  results.push({...summary,timings,gaps:data.gaps,tasks:data.tasks,rapid});console.log(JSON.stringify(summary));await context.close();
 }
 fs.writeFileSync(path.join(output,'profile.json'),JSON.stringify({environment:'Headless Chromium in cloud container; no screenshot recording during timing',results},null,2));await browser.close();
})().catch(e=>{console.error(e);process.exitCode=1;});
