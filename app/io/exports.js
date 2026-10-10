import {esc,number,percent,signed} from '../ui/html.js';
export function download(content,name,type='application/octet-stream') {
  const blob=content instanceof Blob?content:new Blob([content],{type}),url=URL.createObjectURL(blob),anchor=document.createElement('a');
  anchor.href=url;anchor.download=name;anchor.click();setTimeout(()=>URL.revokeObjectURL(url),5000);
}
let loaded;
export async function vendors() {
  loaded ||= Promise.all(['xlsx.full.min.js','jszip.min.js'].map(file=>new Promise((resolve,reject)=>{
    const script=document.createElement('script');script.src=new URL('../../vendor/'+file,import.meta.url);script.onload=resolve;script.onerror=()=>reject(new Error('导出组件暂时无法载入'));document.head.append(script);
  })));
  await loaded;return {XLSX:window.XLSX,JSZip:window.JSZip};
}
export async function excel(sheets,name='衡迹分析材料') {
  const {XLSX}=await vendors(),book=XLSX.utils.book_new();
  for(const [label,rows] of Object.entries(sheets)) {
    const sheet=XLSX.utils.aoa_to_sheet(rows);sheet['!cols']=(rows[0]||[]).map((_,i)=>({wch:i===0?24:16}));
    XLSX.utils.book_append_sheet(book,sheet,label.replace(/[\\/*?:\[\]]/g,'').slice(0,31));
  }
  XLSX.writeFile(book,name+'.xlsx');
}
export function scoreRows(atlas,rows) {
  const subjects=atlas.subjects(rows);
  return [['考试','姓名','班级','科类','语种','赋分总分','原分总分','市排名','校排名','特控分差','本科分差',...subjects.flatMap(s=>[s+'赋分',s+'原分',s+'原排名',s+'特控分差',s+'本科分差'])],...rows.map(r=>[atlas.exam(r.exam).label,atlas.name(r.sid),r.classNo,r.track==='physics'?'物理类':'历史类',r.language,r.total,r.rawTotal,r.cityRank,r.schoolRank,atlas.gap(r,'top'),atlas.gap(r,'under'),...subjects.flatMap(s=>[r.subjects[s]?.score??null,r.subjects[s]?.raw??null,atlas.subjectRank(r,s),atlas.gap(r,'top',s),atlas.gap(r,'under',s)])])];
}
export function effectiveRows(atlas,exam,comparison='') {
  const rows=[['班级','类别','届别','班主任','参考人数','均分','均分增量','特控有效人','特控增量','特控任务','本科有效人','本科增量','本科任务','特控线下10','特控线下20','本科线下10','本科线下20','特控英语','特控日语','本科英语','本科日语']];
  for(const no of atlas.classes) {
    const p=atlas.profile(no),records=atlas.classAt(no,exam),s=atlas.summary(records),previous=atlas.summary(atlas.classAt(no,comparison));
    const lang=(tier,language)=>atlas.summary(records.filter(r=>r.language===language))[tier];
    rows.push([no,p.track,p.cohort,p.lead,s.count,s.mean,s.mean!==null&&previous.mean!==null?s.mean-previous.mean:null,s.top,s.top!==null&&previous.top!==null?s.top-previous.top:null,p.targets?.top,s.under,s.under!==null&&previous.under!==null?s.under-previous.under:null,p.targets?.under,s.topNear10,s.topNear20,s.underNear10,s.underNear20,lang('top','英语'),lang('top','日语'),lang('under','英语'),lang('under','日语')]);
  }
  return rows;
}
export function subjectRows(atlas,exam) {
  return [['班级','学科','教师','人数','均分','原分均分','特控有效','特控双上线','特控有效率','本科有效','本科双上线','本科有效率'],...atlas.classes.flatMap(no=>atlas.subjects(atlas.classAt(no,exam)).map(subject=>{
    const s=atlas.summary(atlas.classAt(no,exam),subject);return [no,subject,atlas.profile(no).teachers?.[subject]||'',s.count,s.mean,s.raw,s.top,s.topDouble,s.topRate,s.under,s.underDouble,s.underRate];
  }))];
}
export function answerRows(atlas,answers) {
  const max=Math.max(0,...answers.map(a=>a.values.length));
  return [['考试','姓名','班级','学科',...Array.from({length:max},(_,i)=>'第'+(i+1)+'题')],...answers.map(a=>[atlas.exam(a.exam).label,atlas.name(a.sid),a.classNo,a.subject,...a.values])];
}
export function evidence(title,subtitle,sections,sheets={}) {return {title,subtitle,sections,sheets,created:new Date().toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'}),note:''};}
export function reportHTML(report) {
  return '<article class="print-paper"><div class="print-brand">衡迹 / 教学证据台</div><h1>'+esc(report.title)+'</h1><p>'+esc(report.subtitle)+'</p>'+report.sections.map(section=>'<section><h2>'+esc(section.title)+'</h2><table><thead><tr>'+section.headers.map(h=>'<th>'+esc(h)+'</th>').join('')+'</tr></thead><tbody>'+section.rows.map(row=>'<tr>'+row.map(value=>'<td>'+esc(value??'—')+'</td>').join('')+'</tr>').join('')+'</tbody></table></section>').join('')+(report.note?'<section><h2>教师判断与后续行动</h2><p class="written-note">'+esc(report.note)+'</p></section>':'')+'<footer>'+esc(report.created)+' · 缺失值保留为空，原排名保留原统计范围。</footer></article>';
}
export function print(report) {document.getElementById('print-area').innerHTML=reportHTML(report);window.print();}
export async function word(report) {
  const {JSZip}=await vendors(),zip=new JSZip();
  const paragraph=(text,bold=false)=>'<w:p><w:r>'+(bold?'<w:rPr><w:b/></w:rPr>':'')+'<w:t xml:space="preserve">'+esc(text??'')+'</w:t></w:r></w:p>';
  const sections=report.sections.map(section=>paragraph(section.title,true)+'<w:tbl><w:tblPr><w:tblBorders>'+['top','left','bottom','right','insideH','insideV'].map(side=>'<w:'+side+' w:val="single" w:sz="4" w:color="C8CDD8"/>').join('')+'</w:tblBorders></w:tblPr>'+[section.headers,...section.rows].map((row,i)=>'<w:tr>'+row.map(value=>'<w:tc>'+paragraph(String(value??'—'),i===0)+'</w:tc>').join('')+'</w:tr>').join('')+'</w:tbl>').join('');
  zip.file('[Content_Types].xml','<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
  zip.file('_rels/.rels','<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  zip.file('word/document.xml','<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>'+paragraph('衡迹 · 教学证据台',true)+paragraph(report.title,true)+paragraph(report.subtitle)+sections+paragraph('教师判断与后续行动',true)+paragraph(report.note||'')+paragraph(report.created)+'<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="900" w:right="800" w:bottom="900" w:left="800"/></w:sectPr></w:body></w:document>');
  download(await zip.generateAsync({type:'blob'}),report.title+'.docx');
}
export function chart(id,png=false) {
  const svg=document.getElementById(id);if(!svg)return;
  const copy=svg.cloneNode(true);copy.setAttribute('xmlns','http://www.w3.org/2000/svg');
  const blob=new Blob([new XMLSerializer().serializeToString(copy)],{type:'image/svg+xml'});
  if(!png){download(blob,'衡迹-'+id+'.svg');return;}
  const url=URL.createObjectURL(blob),image=new Image();
  image.onload=()=>{const dimensions=svg.viewBox.baseVal,canvas=document.createElement('canvas');canvas.width=dimensions.width*2;canvas.height=dimensions.height*2;const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0,canvas.width,canvas.height);canvas.toBlob(b=>download(b,'衡迹-'+id+'.png'));URL.revokeObjectURL(url);};image.onerror=()=>URL.revokeObjectURL(url);image.src=url;
}
