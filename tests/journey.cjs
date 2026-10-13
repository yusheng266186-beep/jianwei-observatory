const {settings:openReportSettings}=require('./paper-preview-helpers.cjs');
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {makeFixture}=require('./fixtures.cjs');

const output=path.join(__dirname,'../.audit-output');
fs.mkdirSync(output,{recursive:true});
const material=path.join(output,'hengji-journey.json');
fs.writeFileSync(material,JSON.stringify(makeFixture()));
const longerMaterial=path.join(output,'hengji-journey-long.json'),longFixture=makeFixture(),extra=makeFixture();
for(const student of extra.students){student.id+='-more';student.name+='乙';}
for(const row of [...extra.scores,...extra.answers])row.sid+='-more';
longFixture.students.push(...extra.students);longFixture.scores.push(...extra.scores);longFixture.answers.push(...extra.answers);
fs.writeFileSync(longerMaterial,JSON.stringify(longFixture));

(async()=>{
  const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||(fs.existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),args:['--no-sandbox']});
  const results=[];
  async function test(name,fn,materialFile=material){
    if(process.argv[2]&&!name.includes(process.argv[2]))return;
    const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce',acceptDownloads:true});
    const page=await context.newPage(),errors=[];
    page.setDefaultTimeout(7000);
    page.on('pageerror',e=>errors.push(e.message));
    const wait=()=>page.waitForTimeout(220);
    const click=async selector=>{await page.locator(selector).first().click();await wait();};
    const nav=scene=>click(`[data-cmd="nav"][data-scene="${scene}"]`);
    const search=async value=>{await page.locator('#stage [data-field="search"]').fill(value);await page.waitForTimeout(550);};
    const backup=async()=>{
      await nav('library');await click('#stage [data-cmd="set"][data-key="tab"][data-value="materials"]');
      const pending=page.waitForEvent('download');await click('[data-cmd="backup"]');
      const stream=await (await pending).createReadStream();let text='';for await(const bytes of stream)text+=bytes;
      return JSON.parse(text);
    };
    try{
      await page.goto(process.env.AUDIT_URL||'http://127.0.0.1:4173');
      await page.waitForSelector('#navigation button');
      await page.locator('#files').setInputFiles(materialFile);
      await click('[data-inbox="commit"]');await page.waitForSelector('body[data-workspace="ready"]');
      await fn({page,click,nav,search,backup,wait});
      assert.deepEqual(errors,[]);
      results.push({name,ok:true});console.log('PASS '+name);
    }catch(e){
      results.push({name,ok:false,error:e.message});console.log('FAIL '+name+' '+e.message.slice(0,800));
      await page.screenshot({path:output+'/hengji-journey-failure-'+results.length+'.png'});
    }finally{await context.close();}
  }

  await test('目录翻页将新结果放回阅读位置，桌面和手机均可继续找人',async({page,click,nav})=>{
    await nav('people');
    for(const viewport of [{width:1440,height:1000},{width:390,height:844}]){
      await page.setViewportSize(viewport);
      await click('.directory-pagination [data-step="1"]');
      const position=await page.locator('.directory-controls').boundingBox();
      assert.ok(position.y>=55&&position.y<180,'结果标题应位于顶栏下方：'+position.y);
      assert.ok((await page.locator('.student-card').first().boundingBox()).y<viewport.height/2);
      assert.equal(await page.locator('.directory-controls').evaluate(el=>document.activeElement===el),true);
      await click('.directory-pagination [data-step="-1"]');
    }
  });

  await test('手机范围面板可收起，学科筛选与全部结果导出仍可到达',async({page,click,nav})=>{
    await page.setViewportSize({width:390,height:844});await nav('people');
    assert.equal(await page.locator('.scope-controls').isVisible(),false);
    assert.equal(await page.locator('.directory-query [data-cmd="export"]').isVisible(),true);
    assert.ok((await page.locator('.student-card').first().boundingBox()).y<844,'第一屏应能遇到学生结果');
    await click('[data-cmd="directory-scope"]');
    await click('.scope-controls [data-cmd="toggle"][data-value="4"]');
    await click('[data-cmd="directory-scope"]');
    assert.match(await page.locator('.scope-summary-mobile b').textContent(),/4班/);
    await click('[data-cmd="directory-filters"]');
    await click('#drawer-content [data-key="focusSubject"][data-value="数学"]');
    await click('[data-cmd="directory-apply"]');
    assert.match(await page.locator('.directory-controls h2').textContent(),/6 位/);
    assert.equal(await page.locator('.student-card').count(),6);
    assert.ok((await page.locator('.directory-controls').boundingBox()).y<180);
    await click('[data-cmd="directory-clear"][data-key="classes"]');
    assert.match(await page.locator('.scope-summary-mobile b').textContent(),/全部班级/);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    await page.screenshot({path:output+'/hengji-journey-mobile.png'});
  });

  await test('学生小题可进本班同题，再展开全部班级，逐层返回保留来源',async({page,click,nav,search})=>{
    await nav('people');await search('校检4班01');await click('#stage [data-cmd="peek"]');
    await click('#drawer-content [data-cmd="drawer-tab"][data-value="questions"]');
    const button=page.locator('#drawer-content [data-cmd="answer-question"][data-key="数学|52"][data-index="0"]');
    assert.match(await button.getAttribute('aria-label'),/校检4班01/);
    await button.press('Enter');await page.waitForTimeout(220);
    assert.match(await page.locator('#drawer-title').textContent(),/第 1 题/);
    assert.match(await page.locator('.answer-focus').textContent(),/校检4班01/);
    assert.match(await page.locator('.lens-scope').textContent(),/4班/);
    assert.match(await page.locator('.roster-bar').textContent(),/35 \/ 35/);
    await click('[data-cmd="question-all"]');
    assert.match(await page.locator('.roster-bar').textContent(),/51 \/ 51/);
    await click('#drawer-back');assert.match(await page.locator('.roster-bar').textContent(),/35 \/ 35/);
    await click('#drawer-back');assert.match(await page.locator('#drawer-title').textContent(),/校检4班01/);
    assert.equal(await page.locator('#drawer-content [data-cmd="drawer-tab"][data-value="questions"]').getAttribute('aria-pressed'),'true');
    await click('[data-cmd="drawer-close"]');assert.equal(await page.locator('#stage [data-field="search"]').inputValue(),'校检4班01');
  });

  await test('完整档案的逐题明细与知识点题目都能深入，关闭后保留原展示方式',async({page,click,nav,search})=>{
    await nav('people');await search('校检4班01');await click('#stage [data-cmd="peek"]');await click('[data-cmd="drawer-person"]');
    for(const view of ['table','knowledge']){
      await click(`#stage [data-key="questionView"][data-value="${view}"]`);
      await click('#person-questions [data-cmd="answer-question"][data-index="0"]');
      assert.match(await page.locator('.answer-focus').textContent(),/校检4班01/);
      await click('[data-cmd="drawer-close"]');
      assert.equal(await page.locator(`#stage [data-key="questionView"][data-value="${view}"]`).getAttribute('aria-pressed'),'true');
    }
  });

  await test('空白预览不新增摘录，写判断后关闭、Esc、快捷查找和刷新均保留且不重复',async({page,click,nav,backup})=>{
    await nav('people');await click('#stage [data-cmd="export"]');await click('[data-cmd="close-report"]');
    assert.equal((await backup()).notebook.length,0);
    await nav('people');await click('#stage [data-cmd="export"]');await openReportSettings(page);await page.locator('#report-note').fill('第一段匿名判断');
    await click('[data-cmd="close-report"]');await click('#stage [data-cmd="export"]');
    assert.equal(await page.locator('#report-note').inputValue(),'第一段匿名判断');
    await openReportSettings(page);await page.locator('#report-note').fill('第二段匿名判断');await page.keyboard.press('Escape');await page.waitForTimeout(250);
    assert.equal(await page.locator('#report-dialog').getAttribute('open'),null);
    await click('#stage [data-cmd="export"]');assert.equal(await page.locator('#report-note').inputValue(),'第二段匿名判断');
    await openReportSettings(page);await page.locator('#report-note').fill('第三段匿名判断');await page.keyboard.press('Control+k');await page.waitForTimeout(400);
    assert.equal(await page.locator('#report-dialog').getAttribute('open'),null);
    await page.reload();await page.waitForSelector('body[data-workspace="ready"]');await nav('people');await click('#stage [data-cmd="export"]');
    assert.equal(await page.locator('#report-note').inputValue(),'第三段匿名判断');await click('[data-cmd="close-report"]');
    const b=await backup();assert.equal(b.notebook.length,1);assert.equal(b.notebook[0].note,'第三段匿名判断');
    await click('#stage [data-key="tab"][data-value="notebook"]');await click('[data-cmd="notebook-open"]');
    await openReportSettings(page);await page.locator('#report-note').fill('从摘录重新研究后更新判断');await click('[data-cmd="close-report"]');
    assert.equal(await page.locator('[data-evidence-note]').inputValue(),'从摘录重新研究后更新判断');
  });

  await test('从旧考次学生观察窗进入并排对比，当前总分和学科切面沿用旧考次',async({page,click,nav,search})=>{
    await nav('people');await click('#stage [data-key="directoryExam"][data-value="51"]');
    await search('校检4班01,校检4班03');
    for(const sid of ['test-4-0','test-4-2'])await click(`#stage [data-cmd="compare-toggle"][data-sid="${sid}"]`);
    await click('#stage [data-cmd="peek"][data-sid="test-4-0"]');
    await click('#drawer-content [data-cmd="compare-open"]');
    assert.match(await page.locator('#drawer-content .drawer-title .overline').textContent(),/测试第一场/);
    const totals=await page.locator('.compare-overview strong').allTextContents();
    assert.deepEqual(totals,['370.0','380.0']);
    assert.match(await page.locator('#drawer-content').textContent(),/测试第一场 · 学科切面/);
    await click('#drawer-back');assert.match(await page.locator('#drawer-title').textContent(),/校检4班01/);
    assert.equal(await page.locator('#drawer-content .drawer-stages button[data-exam="51"]').getAttribute('aria-pressed'),'true');
  });

  await test('手机宽表进入学生再返回保持横向位置，学科翻页回到名单开头',async({page,click,nav})=>{
    await page.setViewportSize({width:390,height:844});await nav('class');await click('[data-cmd="class-subject"][data-subject="数学"]');
    const scroller=page.locator('#drawer-content .table-scroll').first();
    const left=await scroller.evaluate(el=>{el.scrollLeft=240;return el.scrollLeft;});assert.ok(left>0);
    await click('#drawer-content [data-cmd="peek"]');await click('#drawer-back');
    assert.equal(await page.locator('#drawer-content .table-scroll').first().evaluate(el=>el.scrollLeft),left);
    await click('#drawer-content [data-cmd="lens-page"][data-step="1"]');
    const list=await page.locator('.lens-roster-tools').boundingBox(),dialog=await page.locator('#research-drawer').boundingBox();
    assert.ok(list.y>=dialog.y&&list.y<dialog.y+180,'下一页应显示名单入口');
    assert.equal(await page.locator('#drawer-content [data-cmd="peek"]').count(),5);
  });

  await test('导出材料翻页自动回到材料检索，完整呈现后续50行',async({page,click,nav})=>{
    await nav('people');await click('#stage [data-cmd="export"]');await page.locator('[data-cmd=report-preview-mode][data-value=details]').click();await click('[data-cmd="report-section"][data-index="1"]');
    await click('#report-dialog [data-cmd="report-page"][data-step="1"]');
    const query=await page.locator('.report-query').boundingBox(),dialog=await page.locator('#report-dialog').boundingBox();
    assert.ok(query.y>=dialog.y&&query.y<dialog.y+220,'下一页应显示材料检索入口');
    assert.equal(await page.locator('#report-dialog tbody tr').count(),50);
  },longerMaterial);

  await test('颠倒的总分范围有明确提示，可返回修改并恢复结果',async({page,click,nav})=>{
    await nav('people');await click('[data-cmd="directory-filters"]');
    await page.locator('#drawer-content [data-field="minScore"]').fill('600');await page.waitForTimeout(550);
    await page.locator('#drawer-content [data-field="maxScore"]').fill('300');await page.waitForTimeout(550);
    assert.match(await page.locator('.filter-range-error').textContent(),/最低分高于最高分/);
    assert.equal(await page.locator('#drawer-content [data-field="minScore"]').getAttribute('aria-invalid'),'true');
    await click('[data-cmd="directory-apply"]');assert.match(await page.locator('#stage').textContent(),/最低分高于最高分/);
    await click('[data-cmd="directory-filters"][data-focus="minScore"]');
    assert.equal(await page.locator('#drawer-content [data-field="minScore"]').evaluate(el=>document.activeElement===el),true);
    await page.locator('#drawer-content [data-field="minScore"]').fill('370');await page.waitForTimeout(550);
    await page.locator('#drawer-content [data-field="maxScore"]').fill('400');await page.waitForTimeout(550);
    assert.equal(await page.locator('.filter-range-error').count(),0);
    await click('[data-cmd="directory-apply"]');assert.ok(await page.locator('.student-card').count()>0);
  });
  fs.writeFileSync(output+'/hengji-journey-results.json',JSON.stringify(results,null,2));
  await browser.close();if(results.some(r=>!r.ok))process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});
