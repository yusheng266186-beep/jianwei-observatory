// Record the same visible surfaces before/after changing stylesheet delivery.
// No pixel thresholds mask cascade changes: computed material and geometry match.
const {chromium}=require('playwright'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {makeFixture}=require('./fixtures.cjs');
const out=process.env.AUDIT_OUTPUT||path.join(__dirname,'../.audit-output/style-parity');fs.mkdirSync(out,{recursive:true});
const mode=process.argv.includes('--baseline')?'before':'after';
(async()=>{const browser=await chromium.launch(),result={};try{
 for(const width of [390,1440]){
  const context=await browser.newContext({viewport:{width,height:960},reducedMotion:'reduce'}),p=await context.newPage();p.setDefaultTimeout(30000);
  await p.route('**/*tencentscf.com/**',r=>r.fulfill({status:200,body:'{"subjects":[]}'}));
  await p.goto(process.env.AUDIT_URL||'http://127.0.0.1:4198');
  await p.locator('#files').setInputFiles({name:'style-parity.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(makeFixture()))});
  try{await p.locator('[data-inbox=commit]').click();}catch(error){await p.screenshot({path:path.join(out,'import-failure.png')});fs.writeFileSync(path.join(out,'import-failure.txt'),await p.locator('body').innerText());throw error;}await p.locator('body[data-workspace=ready]').waitFor();await p.locator('#inbox').waitFor({state:'hidden'});
  const snap=async name=>{await p.evaluate(()=>document.fonts.ready);await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
   result[width+'-'+name]=await p.evaluate(()=>{const rules=['#stage','.scene-head','.block','.number-ribbon','.paper-cover','.question-cell','.directory-controls','.person-card','.follow-ai-entry','#report-dialog[open]','.report-workspace-head','#exercise-dialog[open]','.exercise-step','.exercise-more-settings','.exercise-content-fields','.exercise-focus-editor','.exercise-choice','.exercise-wheel'];
    return Object.fromEntries(rules.flatMap(selector=>[...document.querySelectorAll(selector)].filter(e=>e.getBoundingClientRect().width&&e.checkVisibility()).slice(0,3).map((e,i)=>{const s=getComputedStyle(e),r=e.getBoundingClientRect();return [selector+'#'+i,{width:+r.width.toFixed(1),height:+r.height.toFixed(1),style:Object.fromEntries(['display','gridTemplateColumns','padding','gap','fontFamily','fontSize','lineHeight','backgroundImage','backgroundColor','boxShadow','borderRadius','backdropFilter','animationName','transitionDuration','transitionTimingFunction'].map(k=>[k,s[k]]))}];})));});
   await p.screenshot({path:path.join(out,mode+'-'+width+'-'+name+'.png')});};
  for(const scene of ['board','class','papers','people','follow','library']){await p.locator('#navigation [data-scene='+scene+']').click();await p.waitForFunction(s=>document.querySelector('#stage').dataset.scene===s&&document.querySelector('#stage').getAttribute('aria-busy')==='false',scene);await snap(scene);}
  await p.locator('#stage [data-key=tab][data-value=reports]').click();await p.locator('[data-cmd=teaching-report-build]').click();await p.locator('#report-dialog[open]').waitFor();await snap('report');await p.locator('#report-dialog [data-cmd=close-report]').click();await p.locator('#report-dialog').waitFor({state:'hidden'});
  await p.locator('#navigation [data-scene=follow]').click();await p.locator('.follow-ai-entry [data-cmd=exercise-hub]').click();await p.locator('[data-ai-action=pick-student]').first().click();await p.locator('[data-ai-action=subject]').first().waitFor();await snap('teacher');await context.close();
 }
 fs.writeFileSync(path.join(out,mode+'.json'),JSON.stringify(result,null,2));
 if(mode==='after')assert.deepEqual(result,JSON.parse(fs.readFileSync(path.join(out,'before.json'))),'Stylesheet delivery must preserve the visible design');
 console.log('PASS '+Object.keys(result).length+' '+mode+' surfaces');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
