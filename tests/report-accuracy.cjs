const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),vm=require('node:vm');
const {ready,text}=require('./paper-preview-helpers.cjs');
const out=path.join(__dirname,'../.audit-output/report-v32');fs.mkdirSync(out,{recursive:true});
const sandbox={console,setTimeout,clearTimeout,TextEncoder,TextDecoder};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../vendor/xlsx.full.min.js'),'utf8'),sandbox);const XLSX=sandbox.XLSX;
const subjects=['语文','数学','英语','物理','化学','生物','历史','政治','地理'];
function workbook(){
 const book=XLSX.utils.book_new(),headers=['考试','学校','班级','姓名','原分','总分','','市排名','校排名','班排','语文成绩','语文校排','语文班排','数学成绩','数学校排','数学班排','英语成绩','英语校排','英语班排','物理成绩','物理校排','物理班排'];
 const rows=[headers];
 for(const exam of ['51','52']){
  const cut=Array(39).fill(null);Object.assign(cut,{0:'有效线',1:exam+'物',2:520,11:400});
  for(let i=0;i<6;i++){cut[3+i]=90;cut[12+i]=60;}rows.push(cut);
  const row=Array(39).fill(null);Object.assign(row,{0:exam+'物',1:'荣县一中',2:4,3:'核查龘同学',4:430,5:exam==='52'?450:380,7:1400,8:exam==='52'?217:null,9:2,10:90,11:18,12:3,13:80,14:32,15:4,16:70,17:46,18:5,19:60,20:91,21:6});rows.push(row);
 }
 XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet(rows),'学生基础');
 for(const subject of subjects){
  const labels=subject==='数学'?[...Array.from({length:11},(_,i)=>i+1),'12–14',15,16,17,18,19]:subject==='英语'?['听力',21,22,'七选五阅读']:['1','2','3'];
  const knowledge=labels.map((_,i)=>i===labels.length-1?'':subject==='数学'?'函数与图像':subject==='英语'?'阅读理解':'材料分析');
  XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet([[null,52,'题号',...labels],[null,null,'满分',...labels.map(()=>5)],[null,null,'知识点',...knowledge],['52物',4,'核查龘同学',...labels.map((_,i)=>i===0?0:i%3===0?5:3)]]),subject);
 }
 return Buffer.from(XLSX.write(book,{type:'array',bookType:'xlsx'}));
}
async function importData(p){await p.locator('#files').setInputFiles({name:'匿名列名与知识点核查.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:workbook()});await p.locator('[data-inbox=commit]').click();await p.waitForSelector('#inbox:not([open])',{state:'attached'});}
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||chromium.executablePath()});
 try{
  for(const viewport of [{width:1440,height:900},{width:390,height:844}]){
   const context=await browser.newContext({viewport,reducedMotion:'reduce'}),p=await context.newPage(),errors=[],fontResponses=[];
   p.on('pageerror',e=>errors.push(e.message));p.on('response',r=>{if(r.url().includes('/assets/report-fonts/'))fontResponses.push(r);});
   await p.goto(process.env.AUDIT_URL||'http://127.0.0.1:4173');await p.waitForSelector('#navigation button');await importData(p);
   await p.locator('#navigation [data-scene=papers]').click();await p.waitForSelector('.paper-cover');
   assert.equal(await p.locator('.paper-cover').count(),subjects.length);
   for(const card of await p.locator('.paper-cover').all()){
    assert(await card.locator('.cover-square-topic').count()>0);
    assert(await card.locator('[data-knowledge]:not([data-knowledge=""])').count()>0);
    assert(await card.locator('.cover-square-topic.is-missing').count()>0);
   }
   const geometry=await p.locator('.cover-score-square').evaluateAll(tiles=>tiles.map(t=>({border:getComputedStyle(t).borderTopWidth,over:t.scrollWidth>t.clientWidth+1,width:t.clientWidth,scroll:t.scrollWidth,text:t.textContent})));assert(geometry.every(g=>g.border==='0px'&&!g.over),JSON.stringify(geometry.filter(g=>g.border!=='0px'||g.over)));
   assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
   await p.screenshot({path:path.join(out,'paper-cover-'+viewport.width+'.png'),fullPage:true});
   await p.locator('.paper-cover[data-key="数学|52"]').click();await p.waitForSelector('.profile-topic');assert((await p.locator('.profile-topic').first().textContent()).includes('函数'));assert.equal(await p.locator('.profile-question').count(),17);await p.screenshot({path:path.join(out,'math-map-'+viewport.width+'.png'),fullPage:true});
   await p.locator('#navigation [data-scene=library]').click();await p.locator('#stage [data-key=tab][data-value=reports]').click();await p.locator('#stage [data-key=reportKind][data-value=student]').click();
   const started=Date.now();await p.locator('[data-cmd=teaching-report-build]').click();await p.waitForFunction(()=>['ready','error'].includes(document.querySelector('.report-paper-scroll')?.dataset.pdfState),undefined,{timeout:20000});if(await p.locator('.report-paper-scroll').getAttribute('data-pdf-state')==='error')throw new Error(await p.locator('#report-dialog').innerText());await ready(p).catch(async error=>{console.error('PDF status:',await p.locator('#report-dialog').innerText());throw error;});const coldMs=Date.now()-started;
   const concise=await text(p);assert(concise.includes('优先训练题目'));assert(!concise.includes('个人全部小题得分'));const conciseDownload=p.waitForEvent('download');await p.locator('[data-cmd=report-pdf]').click();await(await conciseDownload).saveAs(path.join(out,'student-concise-'+viewport.width+'.pdf'));const {settings,closeSettings}=require('./paper-preview-helpers.cjs');await settings(p);await p.locator('[data-cmd=report-preset][data-preset=all]').click();await closeSettings(p);await ready(p);const actual=await text(p);assert(actual.includes('年级排名（原表校排）'));assert(actual.includes('第217名'));assert(actual.includes('班级排名（原表班排）'));assert(actual.includes('第2名'));assert(actual.includes('数学 · 19'));assert(actual.includes('核查龘同学'));assert(actual.includes('0.0'));assert(actual.includes('班排 2'));assert(!actual.includes('第1400名'));
   const hash=await p.locator('.report-paper-scroll').evaluate(async e=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await e.pdfBlob.arrayBuffer()))).map(x=>x.toString(16).padStart(2,'0')).join(''));
   const download=p.waitForEvent('download');await p.locator('[data-cmd=report-pdf]').click();const file=path.join(out,'student-'+viewport.width+'.pdf');await(await download).saveAs(file);assert.equal(crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),hash);
   const word=p.waitForEvent('download');await p.locator('[data-cmd=report-word]').click();await(await word).saveAs(path.join(out,'student-'+viewport.width+'.docx'));
   await p.waitForSelector('.pdf-page[data-rendered=true]');await p.screenshot({path:path.join(out,'student-preview-'+viewport.width+'.png')});
   const count=await p.locator('.report-paper-scroll').evaluate(e=>e.pdfDocument.numPages);assert(count>1);
   let fontBytes=0;for(const response of fontResponses)fontBytes+=(await response.body()).length;
   assert(fontResponses.every(r=>!r.url().endsWith('.otf')));assert(fontBytes<3000000,'cold fonts must remain below 3 MB, including rare glyphs');
   const previous=fontResponses.length;await p.locator('[data-cmd=close-report]').click();await p.waitForFunction(()=>!document.getElementById('report-dialog').open);await p.locator('[data-cmd=teaching-report-build]').click();await ready(p);assert.equal(fontResponses.length,previous,'reopening reuses persistent font assets');
   assert.deepEqual(errors,[]);console.log(JSON.stringify({viewport,coldMs,fontBytes,pages:count,checks:'source headings → student PDF, rare glyph, real bytes, Word, all-subject topics, no borders, persisted fonts'}));await context.close();
  }
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});
