import {selectedReport} from '../engine/report-selection.js?v=controls-v25';
import {reportHTML,wordFiles,pdfDefinition} from './print-document.js?v=controls-v25';
export {reportHTML} from './print-document.js?v=controls-v25';
import {esc,number,percent,signed} from '../ui/html.js?v=controls-v25';
import {SITE_NAME,CREST_URL} from '../brand.js?v=controls-v25';
import {chartFontRules} from '../ui/font-export.js?v=controls-v25';
import {worksheetNames} from './sheet-names.js?v=controls-v25';
export function download(content,name,type='application/octet-stream') {
  const blob=content instanceof Blob?content:new Blob([content],{type}),url=URL.createObjectURL(blob),anchor=document.createElement('a');
  anchor.href=url;anchor.download=name;anchor.click();setTimeout(()=>URL.revokeObjectURL(url),5000);
}
let loaded;
export async function vendors() {
  if(!loaded){
    const attempt=Promise.all([['xlsx.full.min.js','XLSX'],['jszip.min.js','JSZip']].map(([file,global])=>window[global]?Promise.resolve():new Promise((resolve,reject)=>{
      const script=document.createElement('script'),timer=setTimeout(()=>finish(new Error('导出组件载入超时，请重试')),15000);
      let done=false;
      const finish=error=>{if(done)return;done=true;clearTimeout(timer);script.onload=null;script.onerror=null;if(error){script.remove();reject(error);}else resolve();};
      script.src=new URL('../../vendor/'+file,import.meta.url);script.onload=()=>finish(window[global]?null:new Error('导出组件未能初始化，请重试'));script.onerror=()=>finish(new Error('导出组件暂时无法载入，请重试'));document.head.append(script);
    })));
    loaded=attempt;attempt.catch(()=>{if(loaded===attempt)loaded=null;});
  }
  await loaded;return {XLSX:window.XLSX,JSZip:window.JSZip};
}
export async function excel(sheets,name=SITE_NAME+'-分析材料') {
  const {XLSX}=await vendors(),book=XLSX.utils.book_new();
  const entries=Object.entries(sheets),names=worksheetNames(entries.map(([label])=>label));
  for(const [index,[,rows]] of entries.entries()) {
    const sheet=XLSX.utils.aoa_to_sheet(rows);sheet['!cols']=(rows[0]||[]).map((_,i)=>({wch:i===0?24:16}));
    XLSX.utils.book_append_sheet(book,sheet,names[index]);
  }
  XLSX.writeFile(book,name+'.xlsx');
}
export function scoreRows(atlas,rows) {
  const subjects=atlas.comparisonSubjects(rows);
  return [['考试','姓名','班级','科类','语种','赋分总分','原分总分','市排名','校排名','特控分差','本科分差',...subjects.flatMap(s=>[s+'赋分',s+'原分',s+'原排名',s+'特控分差',s+'本科分差'])],...rows.map(r=>[atlas.exam(r.exam).label,atlas.name(r.sid),r.classNo,r.track==='physics'?'物理类':'历史类',r.language,r.total,r.rawTotal,r.cityRank,r.schoolRank,atlas.gap(r,'top'),atlas.gap(r,'under'),...subjects.flatMap(s=>[atlas.subject(r,s)?.score??null,atlas.subject(r,s)?.raw??null,atlas.subjectRank(r,s),atlas.gap(r,'top',s),atlas.gap(r,'under',s)])])];
}
export function effectiveRows(atlas,exam,comparison='') {
  const rows=[['班级','类别','届别','班主任','参考人数','均分','均分增量','特控有效人','特控增量','特控任务','本科有效人','本科增量','本科任务','特控线下10','特控线下20','本科线下10','本科线下20','外语特控有效','外语特控双上线','外语本科有效','外语本科双上线']];
  for(const no of atlas.classes) {
    const p=atlas.profile(no),records=atlas.classAt(no,exam),s=atlas.summary(records),previous=atlas.summary(atlas.classAt(no,comparison));
    const foreign=atlas.summary(records,'外语');
    rows.push([no,p.track,p.cohort,p.lead,s.count,s.mean,s.mean!==null&&previous.mean!==null?s.mean-previous.mean:null,s.top,s.top!==null&&previous.top!==null?s.top-previous.top:null,p.targets?.top,s.under,s.under!==null&&previous.under!==null?s.under-previous.under:null,p.targets?.under,s.topNear10,s.topNear20,s.underNear10,s.underNear20,foreign.top,foreign.topDouble,foreign.under,foreign.underDouble]);
  }
  return rows;
}
export function subjectRows(atlas,exam) {
  return [['班级','学科','教师','人数','均分','原分均分','特控有效','特控双上线','特控有效率','本科有效','本科双上线','本科有效率'],...atlas.classes.flatMap(no=>atlas.comparisonSubjects(atlas.classAt(no,exam)).map(subject=>{
    const s=atlas.summary(atlas.classAt(no,exam),subject);return [no,subject,atlas.teacher(no,subject),s.count,s.mean,s.raw,s.top,s.topDouble,s.topRate,s.under,s.underDouble,s.underRate];
  }))];
}
export function answerRows(atlas,answers,paperKey='') {
  const keys=[...new Set(answers.map(a=>a.subject+'|'+a.exam))],key=paperKey||(keys.length===1?keys[0]:''),bank=atlas.data.banks[key]||[];
  const max=answers.reduce((length,a)=>Math.max(length,a.values.length),bank.length);
  return [['考试','姓名','班级','学科',...Array.from({length:max},(_,i)=>'第'+(bank[i]?.label??i+1)+'题')],...answers.map(a=>[atlas.exam(a.exam).label,atlas.name(a.sid),a.classNo,a.subject,...a.values])];
}
export function evidence(title,subtitle,sections,sheets={}) {return {title,subtitle,sections,sheets,created:new Date().toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'}),note:''};}
export function print(report) {document.getElementById('print-area').innerHTML=reportHTML(report);window.print();}
export async function word(report) {
 report=selectedReport(report);
 const {JSZip}=await vendors(),zip=new JSZip();for(const [name,content] of Object.entries(wordFiles(report)))zip.file(name,content);
 download(await zip.generateAsync({type:'blob'}),report.title+'.docx');
}
let pdfReady;
async function pdfEngine(){
 if(!pdfReady){const attempt=(async()=>{
  if(!window.pdfMake)await new Promise((resolve,reject)=>{const script=document.createElement('script');let done=false;const finish=e=>{if(done)return;done=true;clearTimeout(timer);script.onload=script.onerror=null;if(e){script.remove();reject(e);}else resolve();},timer=setTimeout(()=>finish(new Error('PDF组件加载超时，请重试')),30000);script.src=new URL('../../vendor/pdfmake.min.js',import.meta.url);script.onload=()=>finish(window.pdfMake?null:new Error('PDF组件初始化失败'));script.onerror=()=>finish(new Error('PDF组件加载失败，请重试'));document.head.append(script);});
  const entries=await Promise.all(['regular','medium'].map(async weight=>{const response=await fetch(new URL('../../assets/report-fonts/report-'+weight+'.otf',import.meta.url),{signal:AbortSignal.timeout(60000)});if(!response.ok)throw new Error('打印中文字体加载失败，请重试');const data=new Uint8Array(await response.arrayBuffer());let binary='';for(let i=0;i<data.length;i+=32768)binary+=String.fromCharCode(...data.subarray(i,i+32768));return ['report-'+weight+'.otf',btoa(binary)];}));
  window.pdfMake.addVirtualFileSystem(Object.fromEntries(entries));window.pdfMake.fonts={Report:{normal:'report-regular.otf',bold:'report-medium.otf',italics:'report-regular.otf',bolditalics:'report-medium.otf'}};return window.pdfMake;
 })();pdfReady=attempt;attempt.catch(()=>{if(pdfReady===attempt)pdfReady=null;});}
 return pdfReady;
}
export async function pdf(report){report=selectedReport(report);const engine=await pdfEngine();const blob=await new Promise((resolve,reject)=>{let done=false;const finish=(error,result)=>{if(done)return;done=true;clearTimeout(timer);error?reject(error):resolve(result);},timer=setTimeout(()=>finish(new Error('PDF生成超时，可缩小报告范围或先下载Word')),120000);try{const definition=pdfDefinition(report),doc=engine.createPdf(definition);const stream=doc.getStream({});stream.on('error',error=>finish(error));const chunks=[];stream.on('data',chunk=>chunks.push(chunk));stream.on('end',()=>finish(null,new Blob(chunks,{type:'application/pdf'})));stream.end();}catch(e){finish(e);}});download(blob,report.title+'.pdf');}
export async function chart(id,png=false) {
  const svg=document.getElementById(id);if(!svg)throw new Error('当前没有可导出的图表，请先补充可绘制的数据。');
  const copy=svg.cloneNode(true),{width,height}=svg.viewBox.baseVal;copy.setAttribute('xmlns','http://www.w3.org/2000/svg');copy.setAttribute('width',width);copy.setAttribute('height',height);
  const labels=[...svg.querySelectorAll('text')];copy.querySelectorAll('text').forEach((text,index)=>{const style=getComputedStyle(labels[index]);for(const key of ['fontFamily','fontSize','fontWeight','fontStyle','fontStretch','fontVariantNumeric','letterSpacing','fill'])text.style[key]=style[key];});
  const fonts=await chartFontRules(labels);if(fonts){const style=document.createElementNS('http://www.w3.org/2000/svg','style');style.textContent=fonts;copy.prepend(style);}
  const blob=new Blob([new XMLSerializer().serializeToString(copy)],{type:'image/svg+xml'});
  if(!png){download(blob,SITE_NAME+'-'+id+'.svg');return;}
  const url=URL.createObjectURL(blob),image=new Image();
  try {
    await new Promise((resolve,reject)=>{
      image.onload=()=>{try{const canvas=document.createElement('canvas');canvas.width=width*2;canvas.height=height*2;const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0,canvas.width,canvas.height);canvas.toBlob(bytes=>{if(!bytes){reject(new Error('PNG暂时未能生成，请重试或下载SVG。'));return;}download(bytes,SITE_NAME+'-'+id+'.png');resolve();});}catch(error){reject(error);}};
      image.onerror=()=>reject(new Error('图表图片未能打开，请重试或下载SVG。'));image.src=url;
    });
  }finally{URL.revokeObjectURL(url);}
}
