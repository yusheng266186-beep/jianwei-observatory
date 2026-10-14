const {chromium,webkit}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib');
const data=JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(__dirname,'../data/sample.json.gz'))));
const out=path.join(__dirname,'../.audit-output/responsive-layout'+(process.env.AUDIT_BROWSER==='webkit'?'-webkit':''));fs.mkdirSync(out,{recursive:true});
const url=process.env.AUDIT_URL||'http://127.0.0.1:4173/',widths=(process.env.AUDIT_WIDTHS||'320,360,390,430,600,768,820,1024,1440,1920').split(',').map(Number);
(async()=>{
 const engine=process.env.AUDIT_BROWSER==='webkit'?webkit:chromium,browser=await engine.launch({executablePath:engine===chromium?process.env.CHROMIUM_PATH:undefined}),c=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'}),p=await c.newPage(),errors=[],checks=[];p.setDefaultTimeout(20000);p.on('pageerror',e=>errors.push(e.message));
 const settle=async()=>{await p.waitForFunction(()=>document.querySelector('#stage').getAttribute('aria-busy')!=='true'&&!document.querySelector('.scene-leaving-viewport'));await p.evaluate(()=>document.fonts.ready);await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));};
 const click=async s=>{await p.locator(s).filter({visible:true}).first().click();await settle();};
 const nav=async s=>{await click('#navigation [data-scene='+s+']');await p.evaluate(()=>scrollTo({top:0,behavior:'instant'}));};
 const resize=async(width,height=width<600?844:1000)=>{await p.setViewportSize({width,height});await settle();};
 const importData=async value=>{await p.locator('#files').setInputFiles({name:'anonymous-responsive.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(value))});await click('[data-inbox=commit][data-mode=replace]');await p.waitForSelector('#inbox:not([open])',{state:'attached'});if(await p.locator('#toast [data-cmd=toast-close]').isVisible())await click('#toast [data-cmd=toast-close]');};
 const fit=async label=>{
  const issues=await p.evaluate(()=>{
   const root=document.querySelector('dialog[open]')||document.getElementById('stage'),body=root.querySelector('.drawer-body'),problems=[];
   if(document.documentElement.scrollWidth>innerWidth+1)problems.push('page');if(root.tagName==='DIALOG'&&root.scrollWidth>root.clientWidth+1)problems.push(root.id);
   if(body&&body.scrollWidth>body.clientWidth+1)problems.push('drawer-body');
   for(const e of root.querySelectorAll('.workspace-counts>span,.route-questions b,.follow-lane>header>span,.drawer-tabs>.chip,.drawer-section-link,.block-head h2,.number-ribbon strong,.follow-plan-primary,.follow-agenda>section>div,.compare-overview strong,.table-tools'))if(e.getClientRects().length&&e.scrollWidth>e.clientWidth+2)problems.push(e.className||e.tagName);
   return problems;
  });assert.deepEqual(issues,[],label+' @'+p.viewportSize().width);checks.push({label,...p.viewportSize()});
 };
 const countsCentered=async()=>{
  const counts=await p.locator('.follow-lane>header>span').evaluateAll(es=>es.map(e=>{const r=e.getBoundingClientRect(),range=document.createRange();range.selectNodeContents(e);const t=range.getBoundingClientRect();return {label:e.textContent,display:getComputedStyle(e).display,dx:Math.abs(t.x+t.width/2-r.x-r.width/2),dy:Math.abs(t.y+t.height/2-r.y-r.height/2)};}));
  assert.equal(counts.length,3);for(const count of counts){assert.match(count.display,/grid/);assert.ok(count.dx<=1.5&&count.dy<=4,'count is off center: '+JSON.stringify(count));}
 };
 const separatedChrome=async label=>{
  const geometry=await p.locator('#research-drawer').evaluate(d=>{const rect=e=>{const r=e.getBoundingClientRect();return {top:r.top,bottom:r.bottom,left:r.left,right:r.right,height:r.height};},body=d.querySelector('.drawer-body'),tabs=d.querySelector('#drawer-content>:is(.drawer-tabs,.drawer-section-nav)');return {dialog:rect(d),header:rect(d.querySelector('.drawer-top')),body:rect(body),tabs:tabs&&rect(tabs),scroll:body.scrollTop,extent:body.scrollHeight-body.clientHeight,glass:[getComputedStyle(d).backdropFilter,getComputedStyle(d,'::backdrop').backdropFilter].join(' ')};});
  assert.ok(geometry.body.height>80,label+' body is squeezed');assert.ok(geometry.header.bottom<=geometry.body.top,label+' title overlaps body');
  if(geometry.tabs){assert.ok(geometry.header.bottom<=geometry.tabs.top+.5,label+' title cuts tabs');assert.ok(geometry.tabs.bottom<=geometry.body.top,label+' tabs cut cards');}
  assert.match(geometry.glass,/blur/);await fit(label);return geometry;
 };
 try{
  await p.goto(url);await p.waitForSelector('#navigation button');await importData({...data,plans:[]});
  for(const scene of ['board','class','papers','people','follow','library']){
   await nav(scene);for(const width of widths){await resize(width);await fit(scene);if(scene==='follow'){await countsCentered();if([390,1440].includes(width)){await p.locator('.follow-board').evaluate(e=>e.scrollIntoView({block:'center',behavior:'instant'}));await p.locator('.follow-board').screenshot({path:path.join(out,'follow-empty-'+width+'.png')});}}}
  }
  await nav('people');await click('.student-name');await p.waitForSelector('#research-drawer[open]');
  for(const width of widths){await resize(width);const before=await separatedChrome('student initial');
   for(const ratio of [.25,.5,1]){await p.locator('.drawer-body').evaluate((b,ratio)=>b.scrollTop=(b.scrollHeight-b.clientHeight)*ratio,ratio);await settle();const after=await separatedChrome('student scroll '+ratio);assert.deepEqual(after.header,before.header);assert.deepEqual(after.tabs,before.tabs);}
   if([320,390,820,1440].includes(width))await p.screenshot({path:path.join(out,'student-end-'+width+'.png')});
   await click('#drawer-content [data-cmd=drawer-tab][data-value=subjects]');assert.equal(await p.locator('.drawer-body').evaluate(b=>b.scrollTop),0,'new view starts at top');await separatedChrome('student subjects');
   await click('#drawer-content [data-cmd=drawer-tab][data-value=questions]');await separatedChrome('student questions');await click('#drawer-content [data-cmd=drawer-tab][data-value=overview]');
  }
  await resize(820,390);await separatedChrome('landscape');
  await p.locator('#drawer-context').evaluate(e=>e.textContent='荣县第一中学高三成绩分析 / 学生观察 / 较长标题与放大阅读布局核查');await resize(320);await separatedChrome('wrapped title');
  // Saving and reopening a study must retain the body scroll position.
  await p.locator('.drawer-body').evaluate(b=>b.scrollTop=350);await settle();const saved=await p.locator('.drawer-body').evaluate(b=>b.scrollTop);await p.locator('#drawer-content [data-cmd=research-pin]').evaluate(e=>e.click());await settle();await click('[data-cmd=drawer-close]');await click('.masthead [data-cmd=research]');
  await click('[data-cmd=research-open][data-collection=saved]');await p.waitForSelector('#research-drawer[open]');const restored=await p.locator('.drawer-body').evaluate(b=>b.scrollTop);assert.ok(Math.abs(restored-saved)<2,'saved study scroll position: '+saved+' -> '+restored);await separatedChrome('saved student');await click('[data-cmd=drawer-close]');
  await nav('class');await click('#stage [data-cmd=class-subject][data-subject="数学"]');
  for(const tab of ['students','history','papers']){await click('#drawer-content [data-cmd=drawer-tab][data-value='+tab+']');for(const width of widths){await resize(width);await separatedChrome('subject '+tab);}}
  await click('[data-cmd=drawer-close]');await nav('papers');await click('.paper-cover[data-key="数学|52"]');await click('.question-square');
  for(const width of widths){await resize(width);await separatedChrome('question');await click('[data-cmd=drawer-section][data-target=question-answers]');await p.waitForFunction(()=>document.querySelector('[data-target="question-answers"]').getAttribute('aria-current')==='location');await separatedChrome('question answers');await click('[data-cmd=drawer-section][data-target=question-structure]');}
  await click('[data-cmd=drawer-close]');await resize(1440);await nav('people');
  const ids=await p.locator('.student-card [data-cmd=compare-toggle]').evaluateAll(es=>es.slice(0,2).map(e=>e.dataset.sid));for(const sid of ids)await click('.student-card [data-cmd=compare-toggle][data-sid="'+sid+'"]');await click('[data-cmd=compare-open]');for(const width of widths){await resize(width);await separatedChrome('comparison');}await click('[data-cmd=drawer-close]');await resize(1440);
  const rows=data.scores.filter(r=>r.exam==='52').slice(0,123),plans=rows.map((r,i)=>({id:'responsive-'+i,sid:r.sid,classNo:r.classNo,exam:r.exam,tier:'under',status:i<111?'new':i<120?'active':'done',subject:'数学',note:'匿名布局核查',schedule:{date:'2026-10-14',slot:'lesson',period:3,duration:40}}));
  await importData({...data,plans});await nav('follow');for(const width of widths){await resize(width);await countsCentered();await fit('populated follow');}
  assert.deepEqual(await p.locator('.follow-lane>header>span').allTextContents(),['111','9','3']);
  for(const view of ['agenda','list']){await click('#stage [data-key=followView][data-value='+view+']');for(const width of widths){await resize(width);await fit('follow '+view);}}
  assert.deepEqual(errors,[]);console.log('PASS '+checks.length+' responsive checks: '+widths.length+' widths, empty/populated counts, separate drawer chrome, scrolling, view switches, landscape, long title, study restoration, section navigation');
  fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({checks,errors},null,2));
 }catch(e){await p.screenshot({path:path.join(out,'failure.png')});throw e;}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
