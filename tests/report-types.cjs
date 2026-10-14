const {chromium,webkit}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {makeFixture}=require('./fixtures.cjs'),{ready,text,settings,closeSettings}=require('./paper-preview-helpers.cjs');
const out=path.join(__dirname,'../.audit-output/report-types');fs.mkdirSync(out,{recursive:true});
(async()=>{
 const engine=process.env.AUDIT_BROWSER==='webkit'?webkit:chromium,browser=await engine.launch(engine===chromium?{executablePath:process.env.CHROMIUM_PATH}:{});
 try{for(const width of [1440,390,320]){
  const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce'}),p=await context.newPage(),errors=[],times=[];p.setDefaultTimeout(30000);p.on('pageerror',error=>errors.push(error.message));
  await p.goto(process.env.AUDIT_URL||'http://127.0.0.1:4173');await p.waitForSelector('#navigation button');const data=makeFixture();
  await p.locator('#files').setInputFiles({name:'anonymous-report-types.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(data))});await p.locator('[data-inbox=commit]').click();await p.waitForSelector('#inbox:not([open])',{state:'attached'});
  await p.locator('#navigation [data-scene=people]').click();await p.locator('[data-field=search]').fill('校检7班01');await p.locator('.student-name[data-sid="test-7-0"]').click();await p.waitForSelector('#research-drawer[open]');assert((await p.locator('#research-drawer .number-ribbon').textContent()).includes('班级排名'));
  await p.locator('[data-cmd=teaching-report-entry][data-kind=student]').click();await p.waitForSelector('.report-studio');await p.locator('[data-cmd=teaching-report-build]').click();let started=Date.now();await ready(p);times.push({kind:'student',ms:Date.now()-started});
  let body=await text(p);fs.writeFileSync(path.join(out,'student-'+width+'.txt'),body);await p.screenshot({path:path.join(out,'student-'+width+'.png')});assert(body.includes('第3名'));assert((await p.locator('#report-dialog-title').textContent()).includes('校检7班01'));
  for(const kind of ['class','subject']){
   await p.locator('.report-kind-switch [data-cmd=report-scope][data-value='+kind+']').click();started=Date.now();await ready(p);times.push({kind,ms:Date.now()-started});body=await text(p);
   if(kind==='class'){assert(body.includes('7班成绩诊断'));assert(body.includes('校检7班04'));assert(body.includes('班级学生成绩与短板'));assert(body.includes('班级排名'));}
   else{await settings(p);await p.locator('.report-context>summary').click();await p.locator('.report-context [data-key=subject][data-value="数学"]').click();await p.locator('.report-context [data-key=no][data-value=all]').click();await closeSettings(p);await ready(p);await settings(p);await p.locator('[data-cmd=report-preset][data-preset=all]').click();await closeSettings(p);body=await text(p);assert(body.includes('数学学科诊断'));assert(body.includes('班级学科比较'));assert(body.includes('校检4班01'));assert(body.includes('校检7班01'));}
   if(width===390){for(const cmd of ['report-pdf','report-word']){const pending=p.waitForEvent('download');await p.locator('[data-cmd='+cmd+']').click();const download=await pending;assert.equal(await download.failure(),null);await download.saveAs(path.join(out,kind+(cmd==='report-pdf'?'.pdf':'.docx')));}}
   assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);assert(await p.locator('#report-dialog').evaluate(e=>e.scrollWidth<=e.clientWidth+1));await p.screenshot({path:path.join(out,kind+'-'+width+(engine===webkit?'-webkit':'')+'.png')});
  }
  assert.deepEqual(errors,[]);console.log(JSON.stringify({width,engine:engine===webkit?'webkit':'chromium',times,checks:'student class rank; visible class/subject switching; entire class roster; whole-subject class comparison and weak students; real PDF/Word downloads; no overflow'}));await context.close();
 }}finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
