// Replay anonymous completed sheets through the real preview/PDF/Word exporters.
// No model calls. Render the exported files with render_docx.py + Poppler for QA.
const {chromium}=require('playwright'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const fixture=JSON.parse(fs.readFileSync(process.env.DOC_FIXTURES||path.join(__dirname,'fixtures/document-regression.json')));
const records=fixture.records||fixture,out=process.env.AUDIT_OUTPUT||path.join(__dirname,'../.audit-output/document-regression');fs.mkdirSync(out,{recursive:true});
const baseline=process.env.DOC_FIXTURES?null:require('./fixtures/document-layout-baseline.json');
(async()=>{const browser=await chromium.launch(),p=await browser.newPage({viewport:{width:1280,height:960}}),checks=[],errors=[];p.setDefaultTimeout(90000);p.on('pageerror',e=>errors.push(e.message));
 try{await p.goto(process.env.AUDIT_URL||'http://127.0.0.1:4198');
  await p.route('https://**/*',r=>r.abort()); // Exports must remain entirely local.
  for(const record of records){
   const result=await p.evaluate(async record=>{
    const {exercisePDF}=await import('/app/io/exercise-pdf.js'),{exerciseWord}=await import('/app/io/exercise-word.js'),{exercisePreviewHTML}=await import('/app/ui/exercise-preview.js'),{loadStyleLink}=await import('/app/ui/feature-styles.js');
    await Promise.all([...document.querySelectorAll('[data-workspace-styles],[data-feature-styles]')].map(l=>loadStyleLink(l)));
    const preview=document.createElement('main');preview.id='preview-fixture';preview.style.cssText='max-width:1000px;margin:24px auto;padding:24px';preview.innerHTML=await exercisePreviewHTML(record);document.getElementById('preview-fixture')?.remove();document.body.append(preview);
    if(preview.querySelector('[data-exercise-preview-invalid]'))throw Error('PREVIEW_INVALID '+record.request.subject);
    const results=[];
    for(const teacher of [false,true])for(const [format,exporter] of [['pdf',exercisePDF],['docx',exerciseWord]]){
     const at=performance.now(),blob=await exporter(record,{teacher});
     const encoded=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result.split(',')[1]);reader.onerror=reject;reader.readAsDataURL(blob);});
     const metrics={};
     if(format==='pdf'){
      const pdf=await import('/vendor/pdfjs/pdf.min.mjs');pdf.GlobalWorkerOptions.workerSrc='/vendor/pdfjs/pdf.worker.min.mjs';
      const doc=await pdf.getDocument({data:new Uint8Array(await blob.arrayBuffer())}).promise,pages=[];
      for(let n=1;n<=doc.numPages;n++){const page=await doc.getPage(n),content=await page.getTextContent(),viewport=page.getViewport({scale:1});
       const overflow=content.items.filter(i=>i.str.trim()&&(i.transform[4]<-2||i.transform[4]+i.width>viewport.width+2||i.transform[5]<-2||i.transform[5]>viewport.height+2));if(overflow.length)throw Error('PDF_TEXT_OUTSIDE_PAGE '+record.request.subject+' '+n);
       const text=content.items.map(i=>i.str).join('');if(text.replace(/第\s*\d+\s*页\s*\/\s*共\s*\d+\s*页/,'').trim().length<12)throw Error('PDF_EMPTY_PAGE '+record.request.subject+' '+n);pages.push(text);
      }
      const all=pages.join('').replace(/\s/g,'');for(const q of record.sheet.questions)if(!all.includes('第'+q.id+'题'))throw Error('PDF_MISSING_QUESTION '+q.id);
      if(teacher&&!all.includes('参考答案'))throw Error('PDF_MISSING_ANSWERS');metrics.pages=pages.length;await doc.destroy();
     }else{
      const zip=await window.JSZip.loadAsync(blob),xml=await zip.file('word/document.xml').async('string'),dom=new DOMParser().parseFromString(xml,'application/xml');
      if(dom.querySelector('parsererror'))throw Error('WORD_XML_INVALID');const all=dom.documentElement.textContent.replace(/\s/g,'');for(const q of record.sheet.questions)if(!all.includes('第'+q.id+'题'))throw Error('WORD_MISSING_QUESTION '+q.id);
      metrics.tables=dom.getElementsByTagName('w:tbl').length;metrics.equations=dom.getElementsByTagName('m:oMath').length;metrics.figures=dom.getElementsByTagName('w:drawing').length;
     }
     results.push({format,teacher,bytes:blob.size,ms:Math.round(performance.now()-at),...metrics,encoded});
    }
    return {questions:preview.querySelectorAll('.exercise-question').length,results};
   },record);
   assert.equal(result.questions,record.request.count,record.request.subject+' preview questions');
   for(const r of result.results){const name=record.request.subject+'-'+(r.teacher?'teacher':'student')+'.'+r.format;const data=Buffer.from(r.encoded,'base64');assert(data.length>1000);assert(data.subarray(0,r.format==='pdf'?4:2).toString()=== (r.format==='pdf'?'%PDF':'PK'));if(baseline)for(const [key,value] of Object.entries(baseline.files[name]))assert.equal(r[key],value,name+' '+key+' differs from visually reviewed baseline');fs.writeFileSync(path.join(out,name),data);delete r.encoded;r.file=name;checks.push(r);console.log('PASS '+name+' '+r.bytes+' bytes '+r.ms+'ms');}
   await p.locator('#preview-fixture').screenshot({path:path.join(out,record.request.subject+'-preview.png')});
  }
  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'exports.json'),JSON.stringify({source:fixture.source,checks,errors},null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
