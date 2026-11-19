const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const {chromium,webkit}=require('playwright');
const {makeFixture}=require('./fixtures.cjs');

const base=new URL(process.env.AUDIT_URL||'http://127.0.0.1:4173/');
const engine=process.env.AUDIT_BROWSER==='webkit'?webkit:chromium;
const limit=String.raw`当 \(x\to+\infty}}\) 时观察函数变化。`;
const calculation=String.raw`代入得到
\[
\begin{aligned}
f(1)&=2\times1\\
&=2
\end{aligned}
\]
。这与代入法一致。`;
function savedExercise(id,analysis){
 return {
  id,sid:'test-4-0',exam:'52',status:'ready',createdAt:Date.now(),
  student:{name:'匿名同学',classNo:4},
  request:{subject:'数学',grade:'高三',count:3,minutes:20,difficulty:'基础巩固',curriculum:'高中数学',focus:'函数',visuals:'none',evidence:[]},
  sheet:{
   title:'函数专项练习',objective:'核对函数性质',
   questions:[1,2,3].map(id=>({
    id,type:'填空',level:'基础',stem:'求函数 $f(x)='+id+'x$ 在 $x=1$ 时的值。',
    choices:[],answer:String(id),analysis:id===1?analysis:id===2?calculation:'将指定的自变量代入函数。',
    points:['写出函数值'],maxScore:5,minutes:4
   }))
  }
 };
}

(async()=>{
 const browser=await engine.launch();
 try{
  const context=await browser.newContext({viewport:{width:390,height:950},reducedMotion:'reduce'});
  await context.route('https://**/*',r=>new URL(r.request().url()).origin===base.origin?r.continue():r.abort());
  const page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  const fixture=makeFixture();
  fixture.exercises=[savedExercise('older-exercise','直接代入。'),{...savedExercise('cli-exercise',limit),provider:'workbuddy-account'}];
  await page.goto(base.href);
  await page.locator('#files').setInputFiles({
   name:'anonymous-review.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(fixture))
  });
  await page.locator('[data-inbox=commit]').click();
  await page.locator('#inbox').waitFor({state:'hidden'});
  await page.locator('#navigation [data-scene=library]').click();
  await page.waitForFunction(()=>document.querySelector('#stage')?.dataset.scene==='library'&&document.querySelector('#stage')?.getAttribute('aria-busy')==='false');
  const tab=page.locator('#stage [data-key=tab][data-value=exercises]');
  if(!await tab.isVisible())await page.locator('.library-context-navigation>summary').click();
  await tab.click();

  const review=page.locator('[data-ai-review]');
  const exports=page.locator('[data-ai-action$=-pdf],[data-ai-action$=-word]');
  const previewNotice=page.locator('[data-ai-preview-update]');
  const update=previewNotice.getByRole('button',{name:'更新题目预览'});
  const editor=page.locator('[data-question-id="1"] .exercise-edit');
  const analysis=editor.locator('[data-ai-part=analysis]');
  const approved=()=>page.waitForFunction(()=>[...document.querySelectorAll('#exercise-content [data-ai-action$=-pdf],#exercise-content [data-ai-action$=-word]')].filter(b=>!b.disabled).length===4);
  const open=id=>page.locator('[data-center-action=open][data-center-id='+id+']').click();
  const close=async()=>{await page.locator('[data-ai-action=close]').last().click();await page.locator('#exercise-dialog').waitFor({state:'hidden'});};

  await open('older-exercise');
  await review.check();
  await approved();
  await review.uncheck();
  await page.waitForFunction(()=>document.querySelector('[data-ai-action=student-pdf]')?.disabled);
  await close();

  await open('cli-exercise');
  await review.check();
  await approved();
  assert.equal(await page.locator('[data-exercise-preview-invalid]').count(),0);
  const labels=await page.locator('[data-question-id="1"] .exercise-formula').evaluateAll(nodes=>nodes.map(node=>node.getAttribute('aria-label')));
  assert(labels.includes('公式：x\\to+\\infty'));
  assert.equal(await page.locator('[data-question-id="2"] .exercise-formula').count(),3,'The multiline display is rendered as one formula');
  assert.equal(await analysis.inputValue(),limit,'The edit field retains the original formula');
  const download=page.waitForEvent('download');
  await page.locator('[data-ai-action=teacher-word]').click();
  const file=await (await download).path(),bytes=await fs.readFile(file);
  assert.equal(bytes.toString('ascii',0,2),'PK');
  const word=await page.evaluate(async encoded=>{
   const archive=await window.JSZip.loadAsync(encoded,{base64:true});
   const source=await archive.file('word/document.xml').async('string');
   const xml=new DOMParser().parseFromString(source,'application/xml');
   const math='http://schemas.openxmlformats.org/officeDocument/2006/math';
   const drawing='http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing';
   return {
    formulas:[...xml.getElementsByTagNameNS(math,'oMath')].map(node=>node.textContent),
    illustrations:[...xml.getElementsByTagNameNS(drawing,'docPr')].map(node=>node.getAttribute('descr'))
   };
  },bytes.toString('base64'));
  assert(word.formulas.includes('x→+∞'),'The Word answer keeps the corrected formula editable');
  assert(word.illustrations.some(text=>text.includes('\\begin{aligned}')&&text.includes('2\\times1')),'The Word vector retains the multiline layout');
  const pdf=page.waitForEvent('download');
  await page.locator('[data-ai-action=teacher-pdf]').click();
  const pdfBytes=await fs.readFile(await (await pdf).path());
  assert.equal(pdfBytes.toString('ascii',0,4),'%PDF');

  await editor.locator('summary').click();
  await analysis.fill('当 $x}+1$ 时观察函数变化。');
  await update.click();
  await previewNotice.getByText(/第 1 题解析.*公式格式需调整/).waitFor();
  assert(await review.isDisabled());
  assert.equal(await exports.count(),4);
  for(const button of await exports.all())assert(await button.isDisabled());
  await editor.locator('summary').click();
  await previewNotice.getByRole('button',{name:'定位并编辑'}).click();
  assert(await analysis.evaluate(el=>document.activeElement===el));
  await analysis.fill(limit);
  await update.click();
  await review.check();
  await approved();
  assert.deepEqual(errors,[]);
  console.log('PASS '+engine.name()+' legacy review, CLI formula recovery and Word/PDF downloads, precise review blocker and recovery');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
