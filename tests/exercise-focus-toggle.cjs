const {chromium}=require('playwright'),assert=require('node:assert/strict'),{makeFixture}=require('./fixtures.cjs');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH});
 try{
  const context=await browser.newContext({viewport:{width:390,height:1000},hasTouch:true}),page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*tencentscf.com/**',route=>{assert.equal(route.request().method(),'GET');return route.fulfill({headers:{'Access-Control-Allow-Origin':'*'},body:'{"subjects":[]}'});});
  const data=makeFixture(),knowledge='函数、导数综合';data.banks['数学|52'][0].knowledge=knowledge;
  await page.goto(process.env.AUDIT_URL||'http://127.0.0.1:4175');
  await page.locator('#files').setInputFiles({name:'anonymous-focus.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(data))});
  await page.locator('[data-inbox=commit]').click();await page.waitForSelector('#inbox:not([open])',{state:'attached'});
  await page.locator('#navigation [data-scene=follow]').click();await page.locator('.follow-ai-entry').waitFor();
  await page.locator('.follow-ai-entry [data-cmd=exercise-hub]').click();await page.locator('[data-ai-search]').fill('校检4班01');await page.locator('[data-ai-action=pick-student]').click();
  const focus=page.locator('[data-ai-field=focus]'),goal='条件、定义域与边界辨析';
  const option=label=>page.locator('[data-ai-action=focus-option][data-ai-value="'+label+'"]');
  for(const subject of ['语文','数学','英语','物理','化学','生物']){
   await page.locator('[data-ai-action=subject][data-ai-value="'+subject+'"]').click();
   await focus.fill('保留教师补充');
   const labels=await page.locator('[aria-label="训练重点选项"] [data-ai-value]').evaluateAll(nodes=>nodes.map(n=>n.dataset.aiValue));
   for(const label of labels)for(let cycle=0;cycle<2;cycle++){
    await option(label).click();assert.equal(await option(label).getAttribute('aria-pressed'),'true');assert.equal(await focus.inputValue(),'保留教师补充、'+label);
    await option(label).click();assert.equal(await option(label).getAttribute('aria-pressed'),'false');assert.equal(await focus.inputValue(),'保留教师补充');
   }
  }
  await page.locator('[data-ai-action=subject][data-ai-value="数学"]').click();
  await focus.fill(knowledge+'、'+goal+'、'+goal+'\n保留教师补充');
  assert.equal(await option(goal).getAttribute('aria-pressed'),'true');assert.equal(await option(knowledge).getAttribute('aria-pressed'),'true');
  await option(goal).click();assert.equal(await focus.inputValue(),knowledge+'、保留教师补充');
  await option(knowledge).click();assert.equal(await focus.inputValue(),'保留教师补充');
  await option(goal).click();await page.locator('[data-ai-action=subject][data-ai-value="英语"]').click();await page.locator('[data-ai-action=subject][data-ai-value="数学"]').click();
  assert.equal(await option(goal).getAttribute('aria-pressed'),'true');await option(goal).click();assert.equal(await focus.inputValue(),'保留教师补充');
  assert.deepEqual(errors,[]);console.log('PASS: six-subject options toggle twice; compound labels, old duplicates, authored text and subject drafts remain synchronized; no generation calls');
  await context.close();
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
