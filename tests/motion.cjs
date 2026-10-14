const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {makeFixture}=require('./fixtures.cjs');
const output=path.join(__dirname,'../.audit-output/motion');fs.mkdirSync(output,{recursive:true});
const material=path.join(output,'anonymous-motion.json');fs.writeFileSync(material,JSON.stringify(makeFixture()));
const url=process.env.AUDIT_URL||'http://127.0.0.1:4173';
const scenes=['board','class','papers','people','follow','library'];
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||(fs.existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),args:['--no-sandbox']});
 const results=[];
 async function test(name,fn,{mobile=false,fallback=false}={}){
  if(process.argv[2]&&!name.includes(process.argv[2]))return;
  const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:1000},reducedMotion:'no-preference'}),page=await context.newPage(),errors=[];
  page.setDefaultTimeout(7000);page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(fallback=>{
   window.__transitions=[];window.__scenes=[];
   document.addEventListener('DOMContentLoaded',()=>new MutationObserver(()=>{const stage=document.getElementById('stage');window.__scenes.push({scene:stage.dataset.scene,materials:document.body.dataset.workspace,cards:[...stage.querySelectorAll('[data-motion-key]')].filter(el=>{const r=el.getBoundingClientRect();return r.top<innerHeight&&r.bottom>72;}).map(el=>({opacity:Number(getComputedStyle(el).opacity),transform:getComputedStyle(el).transform})),animationDetails:stage.getAnimations({subtree:true}).map(a=>({name:a.animationName||'WAAPI',frames:a.effect.getKeyframes().map(f=>({opacity:f.opacity,transform:f.transform}))}))});}).observe(document.getElementById('stage'),{attributes:true,attributeFilter:['data-scene']}));
   if(fallback){document.startViewTransition=undefined;return;}
   const native=document.startViewTransition.bind(document);
   document.startViewTransition=callback=>{
    const record={at:performance.now()},transition=native(callback);window.__transitions.push(record);
    transition.ready.then(()=>{record.ready=performance.now();record.scene=document.getElementById('stage').dataset.scene;record.cards=[...document.querySelectorAll('#stage [data-motion-key]')].filter(el=>{const r=el.getBoundingClientRect();return r.top<innerHeight&&r.bottom>72;}).map(el=>({opacity:Number(getComputedStyle(el).opacity),transform:getComputedStyle(el).transform}));record.materials=document.body.dataset.workspace;record.groups=document.getAnimations().filter(a=>a.effect.pseudoElement?.startsWith('::view-transition-group')).map(a=>({pseudo:a.effect.pseudoElement,frames:a.effect.getKeyframes().map(f=>f.transform)}));record.animationDetails=document.getElementById('stage').getAnimations({subtree:true}).map(a=>({name:a.animationName||'WAAPI',target:a.effect.target.className,frames:a.effect.getKeyframes().map(f=>({opacity:f.opacity,transform:f.transform}))}));record.stageAnimations=record.animationDetails.length;}).catch(()=>{record.skipped=true;});
    transition.finished.then(()=>record.end=performance.now()).catch(()=>{});return transition;
   };
  },fallback);
  const settled=async()=>{await page.waitForFunction(()=>[...document.getAnimations()].filter(a=>a.effect?.getTiming().iterations!==Infinity).every(a=>a.playState!=='running'&&!a.pending));};
  const nav=async scene=>{await page.locator(`[data-cmd="nav"][data-scene="${scene}"]`).click();await page.waitForFunction(scene=>document.getElementById('stage').dataset.scene===scene&&document.getElementById('stage').getAttribute('aria-busy')==='false',scene);await settled();};
  const click=async selector=>{await page.locator(selector).first().click();await settled();};
  try{
   await page.goto(url);await page.waitForSelector('#navigation button');await settled();
   await page.locator('#files').setInputFiles(material);await page.locator('[data-inbox="commit"]').click();await page.waitForSelector('body[data-workspace="ready"]');await page.waitForSelector('#inbox:not([open])',{state:'attached'});await settled();
   await fn({page,nav,click,settled});assert.deepEqual(errors,[]);
   results.push({name,ok:true,transitions:await page.evaluate(()=>window.__transitions),sceneFrames:await page.evaluate(()=>window.__scenes)});console.log('PASS '+name);
  }catch(error){results.push({name,ok:false,error:error.message,errors,transitions:await page.evaluate(()=>window.__transitions),sceneFrames:await page.evaluate(()=>window.__scenes)});console.log('FAIL '+name+' '+error.message.slice(0,800));await page.screenshot({path:path.join(output,'failure-'+results.length+'.png')});}
  await context.close();
 }
 for(const mobile of [false,true]){
  const platform=mobile?'手机':'桌面';
  await test(platform+' 六页自然动效：内容连续可见，无截图冻结',async({page,nav})=>{
   for(const scene of scenes)await nav(scene);
   for(const scene of [...scenes].reverse())await nav(scene);
   const records=await page.evaluate(()=>window.__scenes.filter(r=>r.materials==='ready'));assert.ok(records.length>=10);assert.equal(await page.evaluate(()=>window.__transitions.length),0);
   assert.ok(records.some(r=>r.cards.length));
   for(const r of records){assert.ok(r.cards.every(c=>c.opacity===1&&c.transform==='none'),r.scene+' hidden incoming cards');assert.ok(r.animationDetails.every(a=>!['trace-line','grow-bar'].includes(a.name)),r.scene+' layered entry/chart animations');}
   await page.screenshot({path:path.join(output,platform+'-settled.png')});
  },{mobile});
  await test(platform+' 连续点击导航：末次选择生效，动画不挡点击',async({page,nav,settled})=>{
   for(const scene of scenes)await nav(scene);
   for(const scene of ['people','papers','board','follow','library','class']){
    const r=await page.locator(`[data-cmd="nav"][data-scene="${scene}"]`).boundingBox();await page.mouse.click(r.x+r.width/2,r.y+r.height/2);await page.waitForTimeout(35);
   }
   await page.waitForFunction(()=>document.getElementById('stage').dataset.scene==='class');await settled();
   assert.match(await page.evaluate(()=>location.hash),/^#class\//);assert.equal(await page.locator('#navigation [aria-current]').getAttribute('data-scene'),'class');
   assert.equal(await page.locator('#stage').evaluate(e=>e.inert),false);assert.equal(await page.locator('#scene-status').isVisible(),false);
  },{mobile});
  await test(platform+' 页内标签、考次和展示方式：条件与URL一致',async({page,nav,click,settled})=>{
   await nav('class');let count=await page.evaluate(()=>window.__transitions.length);
   for(const tab of ['history','targets','snapshot']){await page.locator(`#stage [data-key="tab"][data-value="${tab}"]`).press('Enter');await page.waitForTimeout(45);}
   await settled();assert.match(await page.evaluate(()=>location.hash),/snapshot$/);assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('hengji:books')).class.tab),'snapshot');
   assert.equal(await page.evaluate(()=>window.__transitions.length),count,'local tabs must not restart the full-page transition');
   for(const exam of ['51','52'])await click(`#stage [data-key="exam"][data-value="${exam}"]`);
   assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('hengji:books')).class.exam),'52');
   await nav('people');count=await page.evaluate(()=>window.__transitions.length);
   for(const view of ['table','landscape','cards']){await page.locator(`#stage [data-key="view"][data-value="${view}"]`).press('Enter');await page.waitForTimeout(45);}
   await settled();assert.equal(await page.locator('.student-card').count(),24);assert.equal(await page.evaluate(()=>window.__transitions.length),count);
   await nav('papers');await click('[data-cmd="paper"][data-key="数学|52"]');
   for(const tab of ['knowledge','map'])await click(`#stage [data-key="tab"][data-value="${tab}"]`);
   assert.ok(await page.locator('#stage [data-cmd="question"]').count());assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  },{mobile});
  await test(platform+' 抽屉入场中按Escape：退出连续，无展开跳变',async({page,nav,settled})=>{
   await nav('class');await page.locator('button[data-cmd="class-subject"][data-subject="数学"]').press('Enter');
   await page.waitForFunction(()=>document.getElementById('research-drawer').getAnimations().some(a=>a.currentTime>30&&a.currentTime<170));
   const sample=await page.evaluate(()=>{const d=document.getElementById('research-drawer'),style=getComputedStyle(d),before={opacity:Number(style.opacity),transform:style.transform};d.dispatchEvent(new Event('cancel',{cancelable:true}));const frame=d.getAnimations()[0].effect.getKeyframes()[0];return {before,frame};});
   assert.ok(sample.before.opacity>0&&sample.before.opacity<1);assert.ok(Math.abs(Number(sample.frame.opacity)-sample.before.opacity)<.01);assert.equal(sample.frame.transform,sample.before.transform);
   await page.waitForSelector('#research-drawer:not([open])',{state:'attached'});await settled();assert.equal(await page.locator('body').evaluate(e=>e.classList.contains('modal-open')),false);
   assert.equal(await page.evaluate(()=>document.activeElement?.dataset.subject),'数学');
  },{mobile});
  await test(platform+' 关闭途中展开学生：新操作保留，旧关闭不抢状态',async({page,nav,click,settled})=>{
   await nav('class');await click('button[data-cmd="class-subject"][data-subject="数学"]');
   const person=page.locator('#drawer-content [data-cmd="peek"]').first(),name=await person.textContent();
   await page.keyboard.press('Escape');await page.waitForTimeout(35);await person.press('Enter');await page.waitForTimeout(350);await settled();
   assert.equal(await page.locator('#research-drawer').evaluate(d=>d.open),true);assert.match(await page.locator('#drawer-title').textContent(),new RegExp(name.trim()));
   assert.equal(await page.locator('#research-drawer').evaluate(d=>d.getAnimations().length),0);
   await page.keyboard.press('Escape');await page.waitForSelector('#research-drawer:not([open])',{state:'attached'});
  },{mobile});
 }
 for(const mobile of [false,true])await test((mobile?'手机':'桌面')+' 选中底板：首次打开、快速切换与尺寸变化均对齐',async({page,nav,click,settled})=>{
  const aligned=selector=>page.waitForFunction(selector=>{
   const rail=document.querySelector(selector),selected=rail?.querySelector('.chip.selected'),indicator=rail?.querySelector('.selection-indicator');if(!selected||!indicator)return false;
   const a=selected.getBoundingClientRect(),b=indicator.getBoundingClientRect();return a.width>15&&Math.abs(a.left-b.left)<1.5&&Math.abs(a.width-b.width)<1.5;
  },selector);
  await nav('class');await aligned('#stage .scene-tabs>.chips');
  await click('button[data-cmd="class-subject"][data-subject="数学"]');await aligned('#drawer-content .drawer-tabs');
  for(const value of ['history','papers','students']){await page.locator(`#drawer-content .drawer-tabs [data-value="${value}"]`).press('Enter');await page.waitForTimeout(30);}await settled();await aligned('#drawer-content .drawer-tabs');
  await page.locator('#drawer-content .drawer-tabs [data-value="history"]').press('Enter');await page.waitForTimeout(40);await page.setViewportSize({width:mobile?820:390,height:900});await aligned('#drawer-content .drawer-tabs');
  assert.ok(await page.locator('#drawer-content .selection-indicator').evaluate(el=>el.getAnimations().length<=1));
  for(const width of [320,820,1440]){await page.setViewportSize({width,height:900});await aligned('#drawer-content .drawer-tabs');assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));}
  await page.keyboard.press('Escape');await page.waitForSelector('#research-drawer:not([open])',{state:'attached'});await settled();await aligned('#stage .scene-tabs>.chips');
  await click('button[data-cmd="class-subject"][data-subject="数学"]');await aligned('#drawer-content .drawer-tabs');
 },{mobile});
 await test('图表导出：缺失断开、实际零分保留，渐变随SVG和PNG完整导出',async({page})=>{
  const result=await page.evaluate(async()=>{
   const {trajectory,bars}=await import('./app/ui/plots.js?v=runtime-v44');
   const host=document.createElement('section');host.className='block';host.id='visual-fixture';host.innerHTML=trajectory('匿名趋势',['一','二','缺失阶段','四','五'],[{name:'匿名阶段',values:[10,30,null,0,20]}])+bars('匿名条形',[{label:'实际零分',value:0},{label:'未填成绩',value:null},{label:'已有成绩',value:40}]);document.getElementById('stage').replaceChildren(host);
   const svg=host.querySelector('.trajectory'),line=svg.querySelector('.plot-line'),bar=host.querySelector('.bars');
   const references=[...host.querySelectorAll('[fill^="url("]')].map(el=>el.getAttribute('fill').slice(5,-1));
   return {points:svg.querySelectorAll('.plot-point').length,segments:(line.getAttribute('d').match(/M/g)||[]).length,areas:svg.querySelectorAll('.plot-area').length,zero:Number(bar.querySelectorAll('.plot-value')[0].textContent),missing:bar.querySelectorAll('.plot-value')[1].textContent,allFillsResolve:references.every(id=>!!document.getElementById(id))};
  });
  assert.deepEqual(result,{points:4,segments:2,areas:2,zero:0,missing:'—',allFillsResolve:true});
  for(const id of ['匿名趋势','匿名条形'])for(const png of [false,true]){
   const pending=page.waitForEvent('download');await page.evaluate(async({id,png})=>{const {chart}=await import('./app/io/exports.js?v=runtime-v44');chart(id,png);},{id,png});
   const file=await pending;assert.equal(await file.failure(),null);const target=path.join(output,id+(png?'.png':'.svg'));await file.saveAs(target);const bytes=fs.readFileSync(target);assert.ok(bytes.length>100);
   if(!png){const decoded=await page.evaluate(async text=>{const svg=new DOMParser().parseFromString(text,'image/svg+xml');if(svg.querySelector('parsererror'))return false;return new Promise(resolve=>{const image=new Image(),url=URL.createObjectURL(new Blob([text],{type:'image/svg+xml'}));image.onload=()=>{URL.revokeObjectURL(url);resolve(image.naturalWidth>0)};image.onerror=()=>{URL.revokeObjectURL(url);resolve(false)};image.src=url;});},bytes.toString());assert.equal(decoded,true);}
  }
 });
 await test('慢加载：旧页点击和输入不能污染新页，可继续换页',async({page,nav,settled})=>{
  await nav('class');await page.route('**/app/scenes/papers.js*',async route=>{await new Promise(r=>setTimeout(r,1100));await route.continue();});
  await page.locator('[data-cmd="nav"][data-scene="papers"]').click();await page.waitForSelector('#stage[aria-busy=true]');
  assert.equal(await page.locator('#stage').evaluate(e=>e.inert),true);await page.waitForSelector('#scene-status:not([hidden])');
  await page.evaluate(()=>{document.querySelector('#stage [data-key="tab"][data-value="history"]').click();const input=document.querySelector('#stage [data-field="search"]');if(input){input.value='过期输入';input.dispatchEvent(new Event('input',{bubbles:true}));}});
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('hengji:books')).papers.tab),'map');assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('hengji:books')).papers.search),'');
  await nav('people');await page.waitForTimeout(1250);await settled();assert.equal(await page.locator('#stage').getAttribute('data-scene'),'people');assert.equal(await page.locator('#scene-status').isVisible(),false);
 });
 await test('切换未结束时点击学生卡片：立即展开且保留研究来源',async({page,nav,settled})=>{
  await nav('class');await page.locator('[data-cmd="nav"][data-scene="people"]').click();await page.waitForFunction(()=>document.getElementById('stage').dataset.scene==='people');
  // A full-width slide initially places the new controls outside the viewport.
  // Click a visible moving card, rather than coordinates beyond the screen.
  await page.waitForFunction(()=>{const stage=document.getElementById('stage'),r=stage.querySelector('.student-card [data-cmd="peek"]')?.getBoundingClientRect(),a=stage.getAnimations()[0];return r&&a&&a.currentTime>180&&a.currentTime<370&&r.x+r.width/2>20&&r.x+r.width/2<innerWidth-40;});
  await page.evaluate(()=>document.addEventListener('click',()=>{window.__cardClickMoving=document.getElementById('stage').getAnimations().some(a=>a.playState==='running');},{capture:true,once:true}));
  const target=page.locator('.student-card [data-cmd="peek"]').first(),name=(await target.textContent()).replace(/\s*↗$/,''),r=await target.boundingBox();await page.mouse.click(r.x+r.width/2,r.y+r.height/2);
  await page.waitForSelector('#research-drawer[open]');await settled();assert.equal(await page.evaluate(()=>window.__cardClickMoving),true);assert.match(await page.locator('#drawer-title').textContent(),new RegExp(name.trim()));assert.equal(await page.locator('#stage').getAttribute('data-scene'),'people');
 });
 await test('研究链自然动效：知识点、小题、学生、逐层返回',async({page,nav,click,settled})=>{
  await nav('papers');await click('[data-cmd="paper"][data-key="数学|52"]');await click('#stage [data-key="tab"][data-value="knowledge"]');
  await page.locator('button[data-cmd="knowledge-open"][data-knowledge="函数"]').press('Enter');await page.locator('#drawer-content [data-cmd="drawer-tab"][data-value="questions"]').press('Enter');await page.locator('#drawer-content [data-cmd="question"]').first().press('Enter');await settled();
  assert.match(await page.locator('#drawer-title').textContent(),/第 1 题/);await click('#drawer-content [data-cmd="peek"]');assert.match(await page.locator('#drawer-title').textContent(),/校检/);
  await click('#drawer-back');assert.match(await page.locator('#drawer-title').textContent(),/第 1 题/);await click('#drawer-back');assert.match(await page.locator('#drawer-title').textContent(),/函数/);
  await page.keyboard.press('Escape');await page.waitForSelector('#research-drawer:not([open])',{state:'attached'});
 });
 await test('抽屉跳转中改变主意：新学生观察不被旧跳转带走',async({page,nav,click,settled})=>{
  await nav('class');await click('button[data-cmd="class-subject"][data-subject="数学"]');
  const student=page.locator('#drawer-content [data-cmd="peek"]').first(),name=await student.textContent();
  await page.locator('#drawer-content [data-cmd="subject-open"]').press('Enter');await page.waitForTimeout(35);await student.press('Enter');await page.waitForTimeout(450);await settled();
  assert.equal(await page.locator('#stage').getAttribute('data-scene'),'class','obsolete navigation changed the research page');assert.equal(await page.locator('#research-drawer').evaluate(d=>d.open),true);assert.match(await page.locator('#drawer-title').textContent(),new RegExp(name.trim()));
 });
 await test('首次加载失败：解除等待，重新打开可恢复',async({page,nav,settled})=>{
  await nav('class');await page.route('**/app/scenes/papers.js*',route=>route.fulfill({status:503,contentType:'text/javascript',body:''}));await page.locator('[data-cmd="nav"][data-scene="papers"]').click();await page.waitForSelector('#stage [data-cmd="reload"]');
  assert.equal(await page.locator('#stage').evaluate(e=>e.inert),false);assert.equal(await page.locator('#scene-status').isVisible(),false);assert.equal(await page.locator('#stage').getAttribute('aria-busy'),'false');
  await page.unroute('**/app/scenes/papers.js*');await page.locator('#stage [data-cmd="reload"]').click();await page.waitForSelector('body[data-workspace="ready"]');await page.waitForSelector('[data-cmd="paper"][data-key="数学|52"]');await settled();
 });
 await test('浏览器后退前进：研究页与滚动位置稳定恢复',async({page,nav,settled})=>{
  await nav('class');await page.evaluate(()=>scrollTo({top:1100,behavior:'instant'}));const classTop=await page.evaluate(()=>scrollY);assert.ok(classTop>800);
  await nav('people');assert.equal(await page.evaluate(()=>window.__transitions.length),0,'scroll restoration must not invoke snapshot geometry interpolation');assert.equal(await page.evaluate(()=>scrollY),0);await page.evaluate(()=>scrollTo({top:520,behavior:'instant'}));
  await page.goBack();await page.waitForFunction(()=>document.getElementById('stage').dataset.scene==='class');await settled();assert.ok(Math.abs(await page.evaluate(()=>scrollY)-classTop)<2);
  await page.goForward();await page.waitForFunction(()=>document.getElementById('stage').dataset.scene==='people');await settled();assert.ok(Math.abs(await page.evaluate(()=>scrollY)-520)<2);
 });
 await test('学生抽屉连续方向键：队列准确，内容动画不叠加',async({page,nav,click,settled})=>{
  await nav('people');await click('#stage [data-cmd="peek"]');const original=await page.locator('#drawer-title').textContent();
  for(const key of ['ArrowRight','ArrowRight','ArrowRight','ArrowLeft','ArrowLeft','ArrowLeft']){await page.keyboard.press(key);assert.ok(await page.evaluate(()=>Boolean(document.activeElement.closest('#research-drawer'))),'changing the student must retain keyboard focus in the drawer');assert.ok(await page.locator('#drawer-content').evaluate(e=>e.getAnimations().length<=1));await page.waitForTimeout(25);}
  await settled();assert.equal(await page.locator('#drawer-title').textContent(),original);assert.equal(await page.locator('#drawer-content').evaluate(e=>e.getAnimations().length),0);
  await page.screenshot({path:path.join(output,'drawer-settled.png')});
 });
 await test('四种弹窗中途关闭：从当前画面退出，关闭动作不重复',async({page,nav,click,settled})=>{
  await nav('class');
  for(const [open,id,close] of [['.reading-button','reading-dialog','reading-close'],['.research-button','research-dialog','research-close'],['#stage [data-cmd="export"]','report-dialog','close-report'],['#stage [data-cmd="table-open"]','table-reader','table-close']]){
   await page.locator(open).first().press('Enter');await page.waitForSelector('#'+id+'[open]');
   await page.waitForTimeout(35);
   const sample=await page.evaluate(async({id,close})=>{const d=document.getElementById(id),style=getComputedStyle(d),before={opacity:Number(style.opacity),transform:style.transform};d.querySelector(`[data-cmd="${close}"]`).click();await Promise.resolve();await Promise.resolve();const a=d.getAnimations().find(a=>a.effect.getKeyframes().at(-1).opacity==='0');return {before,frame:a?.effect.getKeyframes()[0]};},{id,close});
   assert.ok(sample.frame,id+' close not animated');assert.ok(Math.abs(Number(sample.frame.opacity)-sample.before.opacity)<.01,id);assert.equal(sample.frame.transform,sample.before.transform,id);
   await page.waitForSelector('#'+id+':not([open])',{state:'attached'});await settled();
  }
 });
 await test('四种弹窗Escape关闭：退出一致，连按不留遮罩',async({page,nav,settled})=>{
  await nav('class');
  for(const [open,id] of [['.reading-button','reading-dialog'],['.research-button','research-dialog'],['#stage [data-cmd="export"]','report-dialog'],['#stage [data-cmd="table-open"]','table-reader']]){
   await page.locator(open).first().press('Enter');await page.waitForSelector('#'+id+'[open]');await settled();await page.keyboard.press('Escape');
   assert.equal(await page.locator('#'+id).evaluate(d=>d.open&&d.getAnimations().some(a=>a.effect.getKeyframes().at(-1).opacity==='0')),true,id+' Escape skipped exit motion');
   await page.keyboard.press('Escape');await page.waitForSelector('#'+id+':not([open])',{state:'attached'});await settled();assert.equal(await page.locator('body').evaluate(e=>e.classList.contains('modal-open')),false);
  }
 });
 await test('卡片折叠连点：最后一次动作生效，无残留高度',async({page,nav,settled})=>{
  await nav('people');const details=page.locator('.card-scores').first(),summary=details.locator('summary');
  for(let i=0;i<3;i++){await summary.press('Enter');await page.waitForTimeout(45);}await settled();assert.equal(await details.evaluate(e=>e.open),true);
  assert.equal(await details.evaluate(e=>[...e.children].find(c=>c.tagName!=='SUMMARY').getAnimations().length),0);
  await summary.press('Enter');await settled();assert.equal(await details.evaluate(e=>e.open),false);
 });
 await test('入场中关闭动态效果：页面可用，不留遮罩',async({page,nav,click,settled})=>{
  await nav('people');await page.locator('[data-cmd="nav"][data-scene="class"]').click();await page.locator('.reading-button').press('Enter');
  await page.locator('#reading-content [data-key="motion"][data-value="calm"]').press('Enter');await page.locator('[data-cmd="reading-close"]').first().press('Enter');await page.waitForSelector('#reading-dialog:not([open])',{state:'attached'});await settled();
  const count=await page.evaluate(()=>window.__transitions.length);for(const scene of scenes)await nav(scene);assert.equal(await page.evaluate(()=>window.__transitions.length),count);
  await nav('class');await click('button[data-cmd="class-subject"][data-subject="数学"]');await page.keyboard.press('Escape');await page.waitForSelector('#research-drawer:not([open])',{state:'attached'});assert.equal(await page.evaluate(()=>document.getAnimations().length),0);
 });
 await test('浏览器不支持截屏过渡：正常入场、连续操作可用',async({page,nav,settled})=>{
  for(const scene of scenes)await nav(scene);
  for(const scene of ['people','papers','class']){await page.locator(`[data-cmd="nav"][data-scene="${scene}"]`).press('Enter');await page.waitForTimeout(45);}
  await page.waitForFunction(()=>document.getElementById('stage').dataset.scene==='class');await settled();assert.equal(await page.locator('#stage').evaluate(e=>Number(getComputedStyle(e).opacity)),1);assert.equal(await page.locator('#stage').evaluate(e=>e.inert),false);
 },{fallback:true});
 fs.writeFileSync(path.join(output,'results.json'),JSON.stringify({results},null,2));await browser.close();if(results.some(r=>!r.ok))process.exitCode=1;
})().catch(error=>{console.error(error);process.exitCode=1;});
