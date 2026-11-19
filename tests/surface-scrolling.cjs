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
  progress:{phase:'writing',heartbeatAt:now,receivedAt:now,thinkingChars:thinkingText.length,thinkingText,responseChars:2200,
   draft:{title:'匿名进度',completed:5,questions:[1,2,3,4,5].map(id=>({id,type:'解答',complete:true,stem:'已输出的题干。'.repeat(85)}))}
  }
 };
}
async function wheel(page,locator,y,x=0){
 await locator.hover();
 await page.mouse.wheel(x,y);
}
async function swipe(session,target,delta){
 const {x,y,width,height}=await target.boundingBox();
 const point={x:x+width/2,y:y+height/2};
 const send=(type,touchPoints)=>session.send('Input.dispatchTouchEvent',{type,touchPoints});
 await send('touchStart',[point]);
 for(let step=1;step<=8;step++){
  await send('touchMove',[{...point,y:point.y+delta*step/8}]);
 }
 await send('touchEnd',[]);
}

async function exercise(page,session){
 await page.locator('#navigation [data-scene=follow]').click();
 const opener=page.locator('.follow-ai-entry [data-cmd=exercise-hub]');
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
 }else{
  await wheel(page,toolbar,260);
  await page.waitForFunction(()=>document.querySelector('#research-drawer .drawer-body').scrollTop>120);
 }
 await toolbar.locator('[data-cmd=drawer-close]').click();
 await drawer.waitFor({state:'hidden'});
 assert(await peek.evaluate(el=>document.activeElement===el));

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
 await log.evaluate(el=>{el.scrollTop=el.scrollHeight;});
 const before=await scrollTop(dialog);
 if(session)await swipe(session,log,-120);
 else await page.mouse.wheel(0,220);
 await page.waitForFunction(top=>document.getElementById('exercise-dialog').scrollTop>top+25,before);
 await dialog.locator('.inbox-top [data-ai-action=close]').click();
 await dialog.waitFor({state:'hidden'});
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
    await page.goto(url);
    const fixture=makeFixture();
    fixture.exercises=[liveExercise()];
    await page.locator('#files').setInputFiles({name:'anonymous-scroll.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(fixture))});
    await page.locator('[data-inbox=commit]').click();
    await page.locator('#inbox').waitFor({state:'hidden'});
    if(await page.locator('#toast [data-cmd=toast-close]').isVisible())await page.locator('#toast [data-cmd=toast-close]').click();
    const session=width<600&&engine===chromium?await context.newCDPSession(page):null;
    await exercise(page,session);
    await observations(page,session);
    await tableReading(page,session);
    await livePreview(page,session);
    assert.deepEqual(issues,[]);
    console.log('PASS '+engine.name()+' '+width+' '+(session?'touch':'wheel')+' exercise, live output, drawer, table and report scrolling and return');
   }finally{await context.close();}
  }
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
