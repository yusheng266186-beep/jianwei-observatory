import {esc,number,percent,signed} from '../ui/html.js?v=type-v16';
import {SITE_NAME,CREST_URL} from '../brand.js?v=type-v16';
import {chartFontRules} from '../ui/font-export.js?v=type-v16';
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
  for(const [label,rows] of Object.entries(sheets)) {
    const sheet=XLSX.utils.aoa_to_sheet(rows);sheet['!cols']=(rows[0]||[]).map((_,i)=>({wch:i===0?24:16}));
    XLSX.utils.book_append_sheet(book,sheet,label.replace(/[\\/*?:\[\]]/g,'').slice(0,31));
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
function documentSections(report) {
  return report.sections.flatMap(section=>{
    if(section.headers.length<=10)return [section];
    const keys=section.headers.flatMap((header,index)=>index<4&&['考试','姓名','学生','班级','学科'].includes(header)?[index]:[]);
    if(!keys.length)keys.push(0);
    const values=section.headers.map((_,index)=>index).filter(index=>!keys.includes(index)),size=10-keys.length,parts=Math.ceil(values.length/size);
    return Array.from({length:parts},(_,part)=>{
      const indices=[...keys,...values.slice(part*size,(part+1)*size)];
      return {...section,title:section.title+' · 字段 '+(part+1)+' / '+parts,headers:indices.map(index=>section.headers[index]),rows:section.rows.map(row=>indices.map(index=>row[index]))};
    });
  });
}
export function reportHTML(report) {
  return '<article class="print-paper"><div class="print-brand"><img src="'+esc(CREST_URL)+'" width="38" height="38" alt="荣县第一中学校徽">'+esc(SITE_NAME)+'</div><h1>'+esc(report.title)+'</h1><p>'+esc(report.subtitle)+'</p>'+(report.studyTitle?'<p>研究来源：'+esc(report.studyTitle)+'</p>':'')+documentSections(report).map(section=>'<section><h2>'+esc(section.title)+'</h2><table><thead><tr>'+section.headers.map(h=>'<th>'+esc(h)+'</th>').join('')+'</tr></thead><tbody>'+section.rows.map(row=>'<tr>'+row.map(value=>'<td>'+esc(value??'—')+'</td>').join('')+'</tr>').join('')+'</tbody></table></section>').join('')+(report.note?'<section><h2>教师判断与后续行动</h2><p class="written-note">'+esc(report.note)+'</p></section>':'')+'<footer>'+esc(report.created)+' · 缺失值保留为空，原排名保留原统计范围。</footer></article>';
}
export function print(report) {document.getElementById('print-area').innerHTML=reportHTML(report);window.print();}
export async function word(report) {
  const {JSZip}=await vendors(),zip=new JSZip();
  const paragraph=(text,bold=false)=>'<w:p><w:r>'+(bold?'<w:rPr><w:b/></w:rPr>':'')+'<w:t xml:space="preserve">'+esc(text??'')+'</w:t></w:r></w:p>';
  const sections=documentSections(report).map(section=>paragraph(section.title,true)+'<w:tbl><w:tblPr><w:tblBorders>'+['top','left','bottom','right','insideH','insideV'].map(side=>'<w:'+side+' w:val="single" w:sz="4" w:color="C8CDD8"/>').join('')+'</w:tblBorders></w:tblPr>'+[section.headers,...section.rows].map((row,i)=>'<w:tr>'+(i===0?'<w:trPr><w:tblHeader/></w:trPr>':'')+row.map(value=>'<w:tc>'+paragraph(String(value??'—'),i===0)+'</w:tc>').join('')+'</w:tr>').join('')+'</w:tbl>').join('');
  zip.file('[Content_Types].xml','<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
  zip.file('_rels/.rels','<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  zip.file('word/document.xml','<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>'+paragraph(SITE_NAME,true)+paragraph(report.title,true)+paragraph(report.subtitle)+(report.studyTitle?paragraph('研究来源：'+report.studyTitle):'')+sections+paragraph('教师判断与后续行动',true)+paragraph(report.note||'')+paragraph(report.created)+'<w:sectPr><w:pgSz w:w="16838" w:h="11906" w:orient="landscape"/><w:pgMar w:top="900" w:right="800" w:bottom="900" w:left="800"/></w:sectPr></w:body></w:document>');
  download(await zip.generateAsync({type:'blob'}),report.title+'.docx');
}
export async function chart(id,png=false) {
  const svg=document.getElementById(id);if(!svg)throw new Error('当前没有可导出的图表，请先补充可绘制的数据。');
  const copy=svg.cloneNode(true),dimensions=svg.viewBox.baseVal;copy.setAttribute('xmlns','http://www.w3.org/2000/svg');copy.setAttribute('width',dimensions.width);copy.setAttribute('height',dimensions.height);
  const labels=[...svg.querySelectorAll('text')];copy.querySelectorAll('text').forEach((text,index)=>{const style=getComputedStyle(labels[index]);for(const key of ['fontFamily','fontSize','fontWeight','fontStyle','fontStretch','fontVariantNumeric','letterSpacing','fill'])text.style[key]=style[key];});
  const fonts=await chartFontRules(labels);if(fonts){const style=document.createElementNS('http://www.w3.org/2000/svg','style');style.textContent=fonts;copy.prepend(style);}
  const blob=new Blob([new XMLSerializer().serializeToString(copy)],{type:'image/svg+xml'});
  if(!png){download(blob,SITE_NAME+'-'+id+'.svg');return;}
  const url=URL.createObjectURL(blob),image=new Image();
  try {
    await new Promise((resolve,reject)=>{
      image.onload=()=>{try{const canvas=document.createElement('canvas');canvas.width=dimensions.width*2;canvas.height=dimensions.height*2;const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0,canvas.width,canvas.height);canvas.toBlob(bytes=>{if(!bytes){reject(new Error('PNG暂时未能生成，请重试或下载SVG。'));return;}download(bytes,SITE_NAME+'-'+id+'.png');resolve();});}catch(error){reject(error);}};
      image.onerror=()=>reject(new Error('图表图片未能打开，请重试或下载SVG。'));image.src=url;
    });
  }finally{URL.revokeObjectURL(url);}
}
