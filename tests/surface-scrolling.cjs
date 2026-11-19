const assert=require('node:assert/strict');
const {chromium,webkit}=require('playwright');
const {makeFixture}=require('./fixtures.cjs');

const engine=process.env.AUDIT_BROWSER==='webkit'?webkit:chromium;
const url=process.env.AUDIT_URL||'http://127.0.0.1:4173/';
const scrollTop=locator=>locator.evaluate(el=>el.scrollTop);
const liveId='84111111-1111-4111-8111-111111111112';
function liveExercise(){
 const now=Date.now(),thinkingText='核对条件并计算。'.repeat(900);
 return {id:liveId,sid:'test-4-0',exam:'52',status:'running',createdAt:now,startedAt:now,acceptedAt:now,deadlineAt:now+600000,
  request:{subject:'数学',grade:'高三',curriculum:'函数',focus:'求导',count:6,minutes:25,difficulty:'基础巩固',evidence:[]},
  progress:{phase:'writing',sequence:1,heartbeatAt:now,receivedAt:now,thinkingChars:thinkingText.length,thinkingText,responseChars:2200,
   draft:{title:'匿名进度',completed:5,questions:[1,2,3,4,5].map(id=>({id,type:'解答',complete:true,stem:'已输出的题干。'.repeat(85)}))}
  }
 };
}
async function importMaterials(page,record){
 await page.goto(url);
 const fixture=makeFixture();fixture.exercises=[record];
 await page.locator('#files').setInputFiles({name:'anonymous-scroll.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(fixture))});
 await page.locator('[data-inbox=commit]').click();
 await page.locator('#inbox').waitFor({state:'hidden'});
 const notice=page.locator('#toast [data-cmd=toast-close]');
 if(await notice.isVisible())await notice.click();
}
async function wheel(page,locator,y,x=0){
 await locator.hover();
 await page.mouse.wheel(x,y);
}
async function swipe(session,target,delta,{whileHeld,reverse=0}={}){
 const {x,y,width,height}=await target.boundingBox();
 const point={x:x+width/2,y:y+height/2};
 const send=(type,touchPoints)=>session.send('Input.dispatchTouchEvent',{type,touchPoints});
 await send('touchStart',[point]);
 for(let step=1;step<=8;step++){
  await send('touchMove',[{...point,y:point.y+delta*step/8}]);
 }
 await whileHeld?.(false);
 if(reverse){
  for(let step=1;step<=6;step++)await send('touchMove',[{...point,y:point.y+delta+reverse*step/6}]);
  await whileHeld?.(true);
 }
 await send('touchEnd',[]);
}

async function exercise(page,session){
 await page.locator('#navigation [data-scene=follow]').click();
 const opener=page.locator('#stage .follow-ai-entry [data-cmd=exercise-hub]');
 await opener.click();
 const dialog=page.locator('#exercise-dialog');
 const student=dialog.locator('[data-ai-action=pick-student][data-ai-sid="test-18-3"]');
 await student.scrollIntoViewIfNeeded();
 const background=await page.evaluate(()=>scrollY);
 await student.evaluate(node=>node.addEventListener('click',()=>{window.rosterTopAtClick=node.closest('dialog').scrollTop;},{once:true}));
 await student.click();
 const position=await page.evaluate(()=>window.rosterTopAtClick);
 assert(position>100,'the roster has an earlier scroll position to restore');
 await dialog.locator('.exercise-knowledge-results').waitFor();
 assert.equal(await scrollTop(dialog),0,'student workspace opens at the top');
 for(const query of ['.exercise-knowledge-results','.exercise-plan-rows']){
  assert.equal(await dialog.locator(query).evaluate(el=>getComputedStyle(el).maxHeight),'none',query+' follows the dialog scroll');
 }
 const topic=dialog.locator('.exercise-topic-point').first();
 await topic.scrollIntoViewIfNeeded();
 const before=await scrollTop(dialog);
 if(session)await swipe(session,topic,-105);
 else await wheel(page,topic,240);
 await page.waitForFunction(top=>document.getElementById('exercise-dialog').scrollTop>top+20,before);
 assert.equal(await page.evaluate(()=>scrollY),background,'the material behind the exercise stays at its scroll position');

 if(page.viewportSize().width>760){
  const count=dialog.locator('[data-exercise-wheel=count]');
  await count.scrollIntoViewIfNeeded();
  const oldValue=await count.getAttribute('data-wheel-value'),oldOuter=await scrollTop(dialog);
  await wheel(page,count,144);
  await page.waitForFunction(top=>document.getElementById('exercise-dialog').scrollTop>top+40,oldOuter);
  assert.equal(await count.getAttribute('data-wheel-value'),oldValue,'a page scroll does not change an unfocused selector');
  await count.scrollIntoViewIfNeeded();
  await count.focus();
  await wheel(page,count,90);
  await page.waitForFunction(value=>document.querySelector('[data-exercise-wheel=count]').dataset.wheelValue!==value,oldValue);
 }

 if(page.viewportSize().width<600)await dialog.locator('[data-ai-action=roster]').tap();
 else await page.keyboard.press('Escape');
 await student.waitFor();
 const restored=await scrollTop(dialog);
 assert(Math.abs(restored-position)<4,'return restores the roster reading position ('+restored+' / '+position+')');
 assert(await student.evaluate(el=>document.activeElement===el),'return focuses the row that opened the exercise');
 if(page.viewportSize().width<600)await dialog.locator('.inbox-top [data-ai-action=close]').tap();
 else await page.keyboard.press('Escape');
 await dialog.waitFor({state:'hidden'});
 await page.waitForFunction(()=>!document.body.classList.contains('modal-open'));
 assert(await opener.evaluate(el=>document.activeElement===el),'closing returns focus to the teaching entry');

 await opener.click();
 await student.click();
 const focus=dialog.locator('[data-ai-field=focus]');
 await focus.fill('返回后继续编辑这份匿名练习');
 await page.goBack();
 await page.waitForSelector('#stage[data-scene=board][aria-busy=false]');
 await dialog.waitFor({state:'hidden'});
 await page.goForward();
 await page.waitForSelector('#stage[data-scene=follow][aria-busy=false]');
 assert(await dialog.isHidden(),'browser history restores the scene without a stale overlay');
 await opener.click();
 await student.click();
 assert.equal(await focus.inputValue(),'返回后继续编辑这份匿名练习','browser navigation saves the editor before closing');
 await dialog.locator('.inbox-top [data-ai-action=close]').click();
 await dialog.waitFor({state:'hidden'});
}

async function observations(page,session){
 await page.locator('#navigation [data-scene=class]').click();
 const peek=page.locator('#stage .table-scroll [data-cmd=peek]').first();
 await peek.click();
 const drawer=page.locator('#research-drawer'),body=drawer.locator('.drawer-body');
 const toolbar=drawer.locator('.drawer-top');
 await body.waitFor();
 if(session){
  await body.evaluate(el=>{el.scrollTop=180;});
  const before=await scrollTop(body);
  assert(before>100);
  await swipe(session,toolbar,97);
  await page.waitForFunction(top=>document.querySelector('#research-drawer .drawer-body').scrollTop<top-35,before);
  await page.emulateMedia({reducedMotion:'no-preference'});
  await body.evaluate(el=>{el.scrollTop=240;});
  const close=toolbar.locator('[data-cmd=drawer-close]');
  let liftedAt;
  await swipe(session,close,85,{whileHeld:async()=>{liftedAt=await scrollTop(body);}});
  await page.waitForFunction(top=>document.querySelector('#research-drawer .drawer-body').scrollTop<top-6,liftedAt);
  assert(await drawer.isVisible(),'a swipe starting over Close does not click it');
  const {x,y,width,height}=await toolbar.boundingBox();
  await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:x+width/2,y:y+height/2}]});
  const interruptedAt=await scrollTop(body);
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  assert(Math.abs(await scrollTop(body)-interruptedAt)<2,'touching the toolbar again immediately stops the prior flick');
  await session.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});
  await page.emulateMedia({reducedMotion:'reduce'});
 }else{
  await wheel(page,toolbar,260);
  await page.waitForFunction(()=>document.querySelector('#research-drawer .drawer-body').scrollTop>120);
 }
 await toolbar.locator('[data-cmd=drawer-close]').click();
 await drawer.waitFor({state:'hidden'});
 assert(await peek.evaluate(el=>document.activeElement===el));

 await page.locator('#stage [data-cmd=class-subject][data-subject=数学]').first().click();
 const row=body.locator('[data-cmd=peek][data-sid="test-4-17"]').first();
 await row.scrollIntoViewIfNeeded();
 await row.evaluate(node=>node.addEventListener('click',()=>{window.subjectTopAtClick=node.closest('.drawer-body').scrollTop;},{once:true}));
 await row.click();
 const subjectPosition=await page.evaluate(()=>window.subjectTopAtClick);
 assert(subjectPosition>60);
 await page.locator('#research-drawer[data-kind=person]').waitFor();
 assert.equal(await scrollTop(body),0,'student observation opens from the top');
 if(page.viewportSize().width<600)await toolbar.locator('[data-cmd=drawer-back]').tap();
 else await page.keyboard.press('Escape');
 await page.locator('#research-drawer[data-kind=subject]').waitFor();
 assert(await row.evaluate(el=>document.activeElement===el),'undoing the drill-down returns to the opening student row');
 assert(Math.abs(await scrollTop(body)-subjectPosition)<4,'the subject list keeps its vertical position');
 await toolbar.locator('[data-cmd=drawer-close]').click();
 await drawer.waitFor({state:'hidden'});

 await page.locator('#stage [data-cmd=export]').first().click();
 const report=page.locator('#report-dialog'),paper=report.locator('.report-paper-scroll');
 await report.locator('.pdf-page[data-rendered=true]').first().waitFor({timeout:45000});
 if(session){
  await paper.evaluate(el=>{el.scrollTop=150;});
  const before=await scrollTop(paper);
  assert(before>100);
  await swipe(session,report.locator('.report-heading'),90);
  await page.waitForFunction(top=>document.querySelector('.report-paper-scroll').scrollTop<top-30,before);
 }else{
  await wheel(page,report.locator('.report-heading'),220);
  await page.waitForFunction(()=>document.querySelector('.report-paper-scroll').scrollTop>100);
 }
 await report.locator('.report-head-actions [data-cmd=report-settings]').click();
 await report.locator('#report-settings').waitFor();
 await page.keyboard.press('Escape');
 await report.locator('#report-settings').waitFor({state:'hidden'});
 assert(await report.isVisible(),'Escape dismisses settings before leaving the report');
 await page.keyboard.press('Escape');
 await report.waitFor({state:'hidden'});
}

async function tableReading(page,session){
 const frame=page.locator('#stage .table-frame').filter({has:page.locator('tbody tr:nth-child(20)')}).first();
 const inline=frame.locator('.table-scroll');
 const row=inline.locator('tbody tr').first();
 await row.hover();
 const original=await page.evaluate(()=>scrollY);
 await page.mouse.wheel(0,215);
 await page.waitForFunction(top=>scrollY>top+80,original);
 assert.equal(await scrollTop(inline),0,'inline results follow the main page vertically');

 const opener=frame.locator('[data-cmd=table-open]');
 await opener.click();
 const dialog=page.locator('#table-reader'),body=dialog.locator('.table-scroll'),header=dialog.locator('.reader-head');
 await body.waitFor();
 if(session){
  await body.evaluate(el=>{el.scrollTop=180;});
  const top=await scrollTop(body);
  assert(top>100);
  await swipe(session,header,90);
  await page.waitForFunction(top=>document.querySelector('#table-reader .table-scroll').scrollTop<top-30,top);
 }else{
  await wheel(page,header,210);
  await page.waitForFunction(()=>document.querySelector('#table-reader .table-scroll').scrollTop>80);
 }
 if(await body.evaluate(el=>el.scrollWidth>el.clientWidth+20)){
  await wheel(page,body,0,160);
  await page.waitForFunction(()=>document.querySelector('#table-reader .table-scroll').scrollLeft>30);
 }
 await dialog.locator('[data-cmd=table-close]').click();
 await dialog.waitFor({state:'hidden'});
 assert(await opener.evaluate(el=>document.activeElement===el));
}

async function livePreview(page,session){
 await page.locator('#navigation [data-scene=library]').click();
 await page.waitForSelector('#stage[data-scene=library][aria-busy=false]');
 const tab=page.locator('#stage [data-key=tab][data-value=exercises]');
 if(!await tab.isVisible())await page.locator('.library-context-navigation>summary').click();
 await tab.click();
 await page.locator('[data-center-action=open][data-center-id="'+liveId+'"]').click();
 const dialog=page.locator('#exercise-dialog'),output=dialog.locator('.exercise-live-output');
 await output.waitFor();
 assert.equal(await output.evaluate(el=>getComputedStyle(el).maxHeight),'none','live questions follow the dialog scroll');
 const log=dialog.locator('[data-stream-scroll=thinking]');
 await log.scrollIntoViewIfNeeded();
 await log.hover();
 const end=await log.evaluate(el=>{const max=el.scrollHeight-el.clientHeight;el.scrollTop=max-42;return max;});
 const before=await scrollTop(dialog);
 if(session){
  let handedOffAt;
  await swipe(session,log,-140,{reverse:75,whileHeld:async reversed=>{
   if(!reversed){
    assert(end-await scrollTop(log)<2,'touch reaches the last line in the log');
    handedOffAt=await scrollTop(dialog);
    assert(handedOffAt>before+35,'one drag continues through the log boundary before lift');
   }else{
    assert(end-await scrollTop(log)>40,'touch can reverse inside the original log immediately');
    assert(Math.abs(await scrollTop(dialog)-handedOffAt)<4,'a reversal does not move the outer dialog');
   }
  }});
 }else{
  await page.mouse.wheel(0,190);
  await page.waitForFunction(top=>document.getElementById('exercise-dialog').scrollTop>top+35,before,{timeout:3500});
  const crossed=await scrollTop(dialog);
  assert(end-await scrollTop(log)<2,'the wheel covers the last part of the log first');
  assert(Math.abs(crossed-before-148)<5,'only the unused wheel distance moves the dialog');
  const point=await log.evaluate(node=>{
   const rect=node.getBoundingClientRect(),x=(rect.left+rect.right)/2;
   for(let y=Math.max(0,rect.top)+4;y<Math.min(innerHeight,rect.bottom);y+=8){
    if(node.contains(document.elementFromPoint(x,y)))return {x,y};
   }
   return null;
  });
  assert(point,'the visible portion of the log can receive a reverse wheel');
  await page.mouse.move(point.x,point.y);
  await page.mouse.wheel(0,-70);
  await page.waitForFunction(end=>document.querySelector('[data-stream-scroll=thinking]').scrollTop<end-40,end);
  assert(Math.abs(await scrollTop(dialog)-crossed)<4,'wheel reversal goes back through the log');
 }
 await page.waitForFunction(top=>document.getElementById('exercise-dialog').scrollTop>top+25,before);
 await dialog.locator('.inbox-top [data-ai-action=close]').click();
 await dialog.waitFor({state:'hidden'});
}

async function delayedLiveFrame(page){
 const actual=await page.evaluate(async()=>{
  const source=new URL('./app/ui/exercise-progress.js',location.href);
  source.search=location.search;
  const {renderExerciseLiveFrame}=await import(source);
  const host=document.createElement('section');
  document.body.append(host);
  const frame=(lines,label)=>'<pre data-stream-scroll="thinking" style="height:120px;overflow:auto">'+Array.from({length:lines},(_,i)=>i+' '+label).join('\n')+'</pre>';
  try{
   host.innerHTML=frame(200,'已收到');
   const log=host.firstElementChild;
   log.scrollTop=log.scrollHeight;
   let release;
   const pending=renderExerciseLiveFrame(host,new Promise(resolve=>{release=resolve;}),()=>true);
   log.scrollTop-=230;
   const reading=log.scrollTop;
   release(frame(240,'后台新增内容'));
   const rendered=await pending,preserved=log.scrollTop===reading;
   const received=log.textContent.includes('后台新增内容');
   log.scrollTop=log.scrollHeight;
   await renderExerciseLiveFrame(host,Promise.resolve(frame(270,'继续更新')),()=>true);
   const follows=log.scrollHeight-log.clientHeight-log.scrollTop<2;
   const obsolete=await renderExerciseLiveFrame(host,Promise.resolve(frame(5,'过期响应')),()=>false);
   return {rendered,received,preserved,follows,obsolete};
  }finally{host.remove();}
 });
 assert.deepEqual(actual,{rendered:true,received:true,preserved:true,follows:true,obsolete:false});
}

(async()=>{
 const browser=await engine.launch();
 try{
  for(const width of [1280,390]){
   const context=await browser.newContext({viewport:{width,height:810},hasTouch:width<600,reducedMotion:width<600?'reduce':'no-preference'});
   try{
    const page=await context.newPage(),issues=[];
    page.on('pageerror',error=>issues.push(error.message));
    page.setDefaultTimeout(14000);
    await page.route('https://**/*',route=>new URL(route.request().url()).origin===new URL(url).origin?route.continue():route.abort());
    await importMaterials(page,liveExercise());
    const session=width<600&&engine===chromium?await context.newCDPSession(page):null;
    await exercise(page,session);
    await observations(page,session);
    await tableReading(page,session);
    await livePreview(page,session);
    await delayedLiveFrame(page);
    assert.deepEqual(issues,[]);
    console.log('PASS '+engine.name()+' '+width+' '+(session?'touch':'wheel')+' exercise, delayed live output, drawer, table and report scrolling and return');
   }finally{await context.close();}
  }
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
