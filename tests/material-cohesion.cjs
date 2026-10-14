const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {makeWideFixture}=require('./fixtures.cjs');
const url=process.env.AUDIT_URL||'http://127.0.0.1:4173',out=path.join(__dirname,'../.audit-output/cohesion-v22/checks');fs.mkdirSync(out,{recursive:true});
const data=makeWideFixture(),values=[0,3,6,8,9.5,3,-2,12.5],expected=['foundation','developing','steady','secure','mastered','unknown','unknown','unknown'];
data.banks['数学|52']=values.map((_,i)=>({label:String(i+1),max:i===5?null:10,knowledge:'概念与推理'}));
data.answers.forEach((a,i)=>{if(a.subject==='数学'){a.values=[...values];if(i===0)a.values[4]=null;}});
data.plans=[{id:'cohesion-plan',sid:'test-4-4',exam:'52',classNo:4,tier:'under',subject:'数学',status:'active',note:'核对订正与同题作答。'}];
(async()=>{
  const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']}),results=[];
  async function test(name,fn){
    const c=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'}),p=await c.newPage(),errors=[];p.setDefaultTimeout(url.startsWith('https:')?20000:9000);p.on('pageerror',e=>errors.push(e.message));
    const nav=async scene=>{await p.locator('#navigation [data-scene='+scene+']').click();await p.waitForFunction(s=>document.querySelector('#stage').dataset.scene===s&&document.querySelector('#stage').getAttribute('aria-busy')==='false',scene);};
    const set=async(key,value)=>{await p.locator('#stage [data-cmd=set][data-key='+key+'][data-value='+value+']').first().click();await p.waitForFunction(()=>document.querySelector('#stage').getAttribute('aria-busy')==='false');};
    const close=async()=>{await p.keyboard.press('Escape');await p.waitForSelector('#research-drawer:not([open])',{state:'attached'});};
    try{
      await p.goto(url);await p.waitForSelector('#navigation button');assert.equal(await p.locator('.question-square,.number-ribbon').count(),0);
      await p.locator('#files').setInputFiles({name:'anonymous-material-check.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(data))});await p.locator('[data-inbox=commit]').click();await p.waitForSelector('body[data-workspace=ready]');await p.waitForSelector('#inbox:not([open])',{state:'attached'});await p.locator('#toast [data-cmd=toast-close]').click();
      await fn(p,nav,set,close);assert.deepEqual(errors,[]);results.push({name,ok:true});console.log('PASS '+name);
    }catch(e){results.push({name,ok:false,error:e.stack,errors});console.log('FAIL '+name+' '+e.message);await p.screenshot({path:path.join(out,'failure-'+results.length+'.png')});}finally{await c.close();}
  }
  const shades=locator=>locator.evaluateAll(es=>es.map(e=>({tone:e.dataset.scoreTone,color:getComputedStyle(e).backgroundColor,image:getComputedStyle(e).backgroundImage})));
  await test('得分率色阶贯穿封面、全卷与逐题卡，选中和悬停保持数据颜色，小字清楚',async(p,nav,set,close)=>{
    await nav('papers');const cover=await shades(p.locator('.paper-cover[data-key="数学|52"] .cover-score-square'));assert.deepEqual(cover.map(x=>x.tone),expected);
    await p.locator('.paper-cover[data-key="数学|52"]').click();await p.locator('.question-square').first().waitFor();
    const cards=await shades(p.locator('.question-square'));assert.deepEqual(cards.map(x=>x.tone),expected);assert.deepEqual(cards.map(x=>x.color),cover.map(x=>x.color));
    const profile=await p.locator('.profile-question').evaluateAll(es=>es.map(e=>({tone:e.dataset.scoreTone,fill:document.querySelector('#score-square-'+e.dataset.scoreTone).getAttribute('data-score-base')})));
    assert.deepEqual(profile.map(x=>x.tone),expected);
    for(let i=0;i<cards.length;i++)assert.equal(await p.locator('.question-square').nth(i).evaluate(e=>getComputedStyle(e).getPropertyValue('--score-base').trim()),profile[i].fill);
    assert.equal(await p.locator('.question-meter,.profile-meter-fill,.cover-stem').count(),0);assert.match(await p.locator('.question-square').nth(0).innerText(),/0\.0%/);assert.match(await p.locator('.question-square').nth(6).innerText(),/-20\.0%/);assert.match(await p.locator('.question-square').nth(7).innerText(),/125\.0%/);
    assert.match(await p.locator('.score-tone-legend').first().textContent(),/蓝色越深，得分率越低/);
    const issues=await p.locator('.question-square').evaluateAll(es=>{
      const rgb=s=>s.match(/[\d.]+/g).map(Number),lum=c=>c.reduce((n,v,i)=>{v/=255;return n+(v<=.04045?v/12.92:((v+.055)/1.055)**2.4)*[.2126,.7152,.0722][i];},0),ratio=(a,b)=>(Math.max(lum(a),lum(b))+.05)/(Math.min(lum(a),lum(b))+.05),issues=[];
      for(const e of es){const style=getComputedStyle(e),bg=rgb(style.backgroundColor),alpha=bg[3]??1,base=bg.slice(0,3).map(v=>v*alpha+255*(1-alpha)),highlight=style.getPropertyValue('--score-highlight').trim(),ha=parseInt(highlight.slice(-2),16)/255,light=base.map(v=>v*(1-ha)+255*ha);
        for(const t of e.querySelectorAll('.question-identity>b,.question-identity>b>small,.question-status,.question-reading>strong,.question-reading>strong>small,.question-reading>span,.question-topic,.question-mean,.question-context>span,footer span')){
          const s=getComputedStyle(t),color=rgb(s.color).slice(0,3),minimum=parseFloat(s.fontSize)>=24?3:4.5,value=Math.min(ratio(color,base),ratio(color,light));if(value<minimum)issues.push({tone:e.dataset.scoreTone,part:t.className||t.tagName,ratio:value});
        }
      }return issues;
    });assert.deepEqual(issues,[]);
    const deep=p.locator('.question-square[data-index="4"]');await deep.hover();assert.equal((await shades(deep))[0].color,cards[4].color);await deep.click();await p.waitForSelector('#research-drawer[open]');await close();assert.equal((await shades(deep))[0].color,cards[4].color);assert.ok(await deep.evaluate(e=>e.classList.contains('selected')));
    for(const width of [1440,820,390,320]){await p.setViewportSize({width,height:1000});await p.evaluate(()=>document.fonts.ready);await p.waitForTimeout(70);assert.equal(await p.locator('.question-square').count(),8);assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await p.locator('.question-gallery').screenshot({path:path.join(out,'shades-'+width+'.png')});}
  });
  await test('知识点、个人得分与热力格使用同一色阶，未知和异常不当作零分或满分',async(p,nav,set,close)=>{
    await nav('papers');await p.locator('.paper-cover[data-key="数学|52"]').click();await p.locator('.question-square').first().waitFor();const main=await shades(p.locator('.question-square')),masteredInk=await p.locator('.question-square[data-score-tone=mastered] .question-reading>strong').evaluate(e=>getComputedStyle(e).color);
    await set('tab','knowledge');await p.locator('#stage [data-cmd=knowledge-open]').first().click();await p.waitForSelector('.lens-question');const lens=await shades(p.locator('.lens-question'));assert.deepEqual(lens.map(x=>x.tone),expected);assert.deepEqual(lens.map(x=>x.color),main.map(x=>x.color));await close();
    for(const tab of ['classes','students']){await set('tab',tab);const colors=await p.locator('.table-scroll tbody tr').nth(tab==='students'?1:0).locator('.heat-cell').evaluateAll(es=>es.map(e=>({color:getComputedStyle(e).backgroundColor,ink:getComputedStyle(e).color})));assert.equal(colors.length,8);for(let i=0;i<5;i++){const m=main[i].color.match(/[\d.]+/g).slice(0,3).join(',');assert.equal(colors[i].color.match(/[\d.]+/g).slice(0,3).join(','),m);}assert.notEqual(colors[0].color,colors[5].color);assert.equal(colors[5].color,colors[6].color);assert.equal(colors[6].color,colors[7].color);assert.equal(colors[4].ink,masteredInk);}
    await p.locator('#stage [data-cmd=peek][data-sid="test-4-4"]').click();await p.waitForSelector('#research-drawer[open]');await p.locator('#research-drawer [data-cmd=drawer-tab][data-value=questions]').first().click();await p.waitForSelector('.personal-question-card');
    assert.deepEqual((await shades(p.locator('.personal-question-card'))).map(x=>x.tone),expected);assert.deepEqual((await shades(p.locator('.personal-question-card'))).map(x=>x.color),main.map(x=>x.color));
    await p.locator('[data-cmd=drawer-person]').first().click();await p.waitForSelector('#person-questions');assert.deepEqual((await shades(p.locator('.personal-questions .personal-question-card'))).map(x=>x.tone),expected);
  });
  await test('六板块的阅读层、内嵌层和浮窗各自统一，窄屏与纸面偏好保留层次和数据色',async(p,nav,set,close)=>{
    for(const width of [1440,390]){await p.setViewportSize({width,height:1000});assert.ok(await p.locator('body').evaluate((e,attachment)=>getComputedStyle(e).backgroundAttachment.split(',').every(value=>value.trim()===attachment),'scroll'));for(const scene of ['board','class','papers','people','follow','library']){
      await nav(scene);const issues=await p.locator('#stage').evaluate(root=>{const s=getComputedStyle(document.documentElement),radius=s.getPropertyValue('--radius-panel').trim(),inset=s.getPropertyValue('--radius-inner').trim(),issues=[];
        for(const e of root.querySelectorAll('.block,.student-card,.follow-card,.paper-cover,.class-split,.materials-stage')){if(e.closest('.class-split')&&e!==e.closest('.class-split'))continue;const v=getComputedStyle(e);if(v.borderTopLeftRadius!==radius||v.backgroundImage==='none'||v.boxShadow==='none')issues.push(e.className+' reading');}
        for(const e of root.querySelectorAll('.class-atlas,.directory-lenses,.student-scope')){const v=getComputedStyle(e);if(v.borderTopLeftRadius!==inset||v.backgroundImage==='none')issues.push(e.className+' inset');}return issues;
      });assert.deepEqual(issues,[]);assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
      const dock=await p.locator('#navigation').evaluate(e=>{const s=getComputedStyle(e);return {image:s.backgroundImage,blur:s.backdropFilter,alpha:Number(s.backgroundColor.match(/[\d.]+/g)[3])};});assert.match(dock.blur,/blur/);assert.notEqual(dock.image,'none');assert.ok(dock.alpha<.6);
    }}
    await p.setViewportSize({width:1440,height:1000});await nav('papers');await p.locator('.paper-cover[data-key="数学|52"]').click();await p.locator('.question-square').first().waitFor();await p.locator('.question-square').first().click();await p.waitForSelector('#research-drawer[open]');
    for(const selector of ['.drawer-top','.number-ribbon','.score-group'])assert.notEqual(await p.locator('#research-drawer '+selector).first().evaluate(e=>getComputedStyle(e).backgroundImage),'none');await close();
    await p.locator('[data-cmd=reading]').click();await p.waitForSelector('#reading-dialog[open]');await p.locator('#reading-dialog [data-key=surface][data-value=paper]').click();await p.keyboard.press('Escape');await p.waitForSelector('#reading-dialog:not([open])',{state:'attached'});
    assert.equal(await p.locator('#navigation').evaluate(e=>getComputedStyle(e).backdropFilter),'none');assert(await p.locator('.question-square').evaluateAll(es=>es.every(e=>getComputedStyle(e).backgroundImage.includes('linear-gradient'))));assert.deepEqual(await p.locator('.question-square').evaluateAll(es=>es.map(e=>e.dataset.scoreTone)),expected);
    await p.locator('[data-cmd=reading]').click();await p.waitForSelector('#reading-dialog[open]');await p.locator('#reading-dialog [data-key=surface][data-value=glass]').click();await p.keyboard.press('Escape');await p.waitForSelector('#reading-dialog:not([open])',{state:'attached'});
    const session=await p.context().newCDPSession(p);await session.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-transparency',value:'reduce'},{name:'prefers-reduced-motion',value:'reduce'}]});assert.ok(await p.evaluate(()=>matchMedia('(prefers-reduced-transparency:reduce)').matches));
    assert.equal(await p.locator('#navigation').evaluate(e=>getComputedStyle(e).backdropFilter),'none');await p.locator('.question-square[data-index="4"]').hover();assert(await p.locator('.question-square').evaluateAll(es=>es.every(e=>getComputedStyle(e).backgroundImage.includes('linear-gradient'))));assert.deepEqual(await p.locator('.question-square').evaluateAll(es=>es.map(e=>e.dataset.scoreTone)),expected);
  });
  fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({url,results},null,2));await browser.close();if(results.some(r=>!r.ok))process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1});
