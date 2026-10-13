import {selectedReport} from '../engine/report-selection.js?v=flow-v29';
import {esc} from '../ui/html.js?v=flow-v29';
import {SITE_NAME} from '../brand.js?v=flow-v29';
// All three outlets share the same sections, field splits and missing-value rules.
export function documentSections(report){
 return (report.sections||[]).flatMap(s=>{
  const section={...s,headers:s.headers||[],rows:s.rows||[],paragraphs:s.paragraphs||[]};
  if(section.headers.length<=6)return [section];
  const keys=section.headers.flatMap((h,i)=>i<4&&['考试','姓名','学生','班级','学科'].includes(h)?[i]:[]);if(!keys.length)keys.push(0);
  const values=section.headers.map((_,i)=>i).filter(i=>!keys.includes(i)),size=6-keys.length,parts=Math.ceil(values.length/size);
  return Array.from({length:parts},(_,p)=>{const indices=[...keys,...values.slice(p*size,(p+1)*size)];return {...section,title:section.title+'（字段 '+(p+1)+'/'+parts+'）',headers:indices.map(i=>section.headers[i]),rows:section.rows.map(r=>indices.map(i=>r[i]))};});
 });
}
export function columnWeights(headers){return headers.map(h=>/建议|安排|线索|知识点|依据|记录|结果|说明|内容|题目|方向|任务/.test(h)?2.3:/日期|时段|学生|学科/.test(h)?1.5:1);}
export function reportHTML(report){
 report=selectedReport(report);
 const sections=documentSections(report);
 return '<article class="print-paper"><div class="print-brand">'+esc(SITE_NAME)+'</div><h1>'+esc(report.title)+'</h1><p>'+esc(report.subtitle)+'</p><p class="print-meta">'+esc(report.created||'')+' · A4黑白打印</p>'+(report.meta?.length?'<dl>'+report.meta.map(([k,v])=>'<dt>'+esc(k)+'</dt><dd>'+esc(v)+'</dd>').join('')+'</dl>':'')+sections.map((s,i)=>'<section><h2>'+String(i+1).padStart(2,'0')+' '+esc(s.title)+'</h2>'+(s.caption?'<p class="print-caption">'+esc(s.caption)+'</p>':'')+s.paragraphs.map(p=>'<p>'+esc(p)+'</p>').join('')+(s.headers.length?(s.rows.length?'<table><colgroup>'+columnWeights(s.headers).map(w=>'<col style="width:'+w/columnWeights(s.headers).reduce((a,b)=>a+b,0)*100+'%">').join('')+'</colgroup><thead><tr>'+s.headers.map(h=>'<th>'+esc(h)+'</th>').join('')+'</tr></thead><tbody>'+s.rows.map(r=>'<tr>'+s.headers.map((_,j)=>'<td>'+esc(r[j]??'—')+'</td>').join('')+'</tr>').join('')+'</tbody></table>':'<p>本范围暂无符合条件的记录。</p>'):'')+'</section>').join('')+(report.note?'<section><h2>教师判断与后续行动</h2><p class="written-note">'+esc(report.note)+'</p></section>':'')+'<footer>缺失值保留为—；判断以已导入材料为依据。</footer></article>';
}
export function pdfDefinition(report){
 report=selectedReport(report);
 const content=[{text:SITE_NAME,style:'brand'},{text:report.title,style:'title'},{text:report.subtitle||'',style:'subtitle'},{text:'生成时间：'+(report.created||''),style:'caption'}];
 if(report.meta?.length)content.push({table:{widths:[62,'*'],body:report.meta.map(([k,v])=>[{text:k,bold:true},String(v??'—')])},layout:'noBorders',margin:[0,7,0,8]});
 documentSections(report).forEach((s,i)=>{
  const heading=String(i+1).padStart(2,'0')+'  '+s.title;
  if(s.headers.length&&s.rows.length){
   const intro=[{text:heading,style:'heading'},...(s.caption?[{text:s.caption,style:'caption'}]:[]),...s.paragraphs.map(text=>({text,margin:[0,0,0,5]}))];
   const weights=columnWeights(s.headers),sum=weights.reduce((a,b)=>a+b,0),widths=weights.map(w=>(499.28-weights.length*9)*w/sum);
   // Repeat the section identity together with the column header and first row.
   // This keeps long reports traceable and prevents an isolated heading at a page end.
   const titleRow=[{stack:intro,colSpan:s.headers.length,border:[false,false,false,false],margin:[-4,0,-4,0]},...s.headers.slice(1).map(()=>({text:'',border:[false,false,false,false]}))];
   const tallRow=row=>row.some((value,j)=>String(value??'').split('\n').reduce((lines,line)=>lines+Math.max(1,Math.ceil(line.length/Math.max(3,Math.floor(widths[j]/9)))),0)>45);
   content.push({table:{headerRows:2,keepWithHeaderRows:tallRow(s.rows[0])?0:1,dontBreakRows:!s.rows.some(tallRow),widths,body:[titleRow,s.headers.map(h=>({text:h,bold:true,fillColor:'#eeeeee'})),...s.rows.map(r=>s.headers.map((_,j)=>String(r[j]??'—')))]},layout:{hLineWidth:i=>i===0?0:0.4,vLineWidth:()=>0.4,hLineColor:()=> '#555555',vLineColor:()=> '#555555',paddingLeft:()=>4,paddingRight:()=>4,paddingTop:()=>5,paddingBottom:()=>5},fontSize:9,margin:[0,0,0,8]});
  }else{
   content.push({text:heading,style:'heading',headlineLevel:1});
   if(s.caption)content.push({text:s.caption,style:'caption'});
   s.paragraphs.forEach(p=>content.push({text:p,margin:[0,0,0,5]}));
   if(s.headers.length)content.push({text:'本范围暂无符合条件的记录。',style:'caption'});
  }
 });
 if(report.note)content.push({text:'教师判断与后续行动',style:'heading'},{text:report.note});
 return {pageSize:'A4',pageMargins:[48,45,48,45],defaultStyle:{font:'Report',fontSize:10,color:'#111111',lineHeight:1.25},info:{title:report.title,author:SITE_NAME},content,pageBreakBefore:(node,following)=>node.headlineLevel===1&&following.length===0,styles:{brand:{fontSize:9,color:'#444444',margin:[0,0,0,10]},title:{fontSize:19,bold:true,margin:[0,0,0,8]},subtitle:{fontSize:11,margin:[0,0,0,5]},heading:{fontSize:12,bold:true,margin:[0,14,0,6]},caption:{fontSize:9,color:'#444444',margin:[0,0,0,6]}},footer:(page,pages)=>({text:SITE_NAME+'   ·   第 '+page+' / '+pages+' 页',font:'Report',fontSize:8,color:'#555555',alignment:'center',margin:[0,14,0,0]})};
}
const xml=text=>esc(String(text??'')).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'');
export function wordFiles(report){
 report=selectedReport(report);
 const ns='http://schemas.openxmlformats.org/wordprocessingml/2006/main';
 const p=(text,style='Normal')=>'<w:p><w:pPr><w:pStyle w:val="'+style+'"/></w:pPr><w:r><w:t xml:space="preserve">'+xml(text).replace(/\n/g,'</w:t><w:br/><w:t xml:space="preserve">')+'</w:t></w:r></w:p>';
 const tbl=s=>{const weights=columnWeights(s.headers),sum=weights.reduce((a,b)=>a+b,0),widths=weights.map(w=>Math.round(10000*w/sum));return '<w:tbl><w:tblPr><w:tblW w:w="10000" w:type="dxa"/><w:tblLayout w:type="fixed"/><w:tblBorders>'+['top','left','bottom','right','insideH','insideV'].map(side=>'<w:'+side+' w:val="single" w:sz="4" w:color="555555"/>').join('')+'</w:tblBorders><w:tblCellMar><w:top w:w="90" w:type="dxa"/><w:left w:w="90" w:type="dxa"/><w:bottom w:w="90" w:type="dxa"/><w:right w:w="90" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>'+widths.map(w=>'<w:gridCol w:w="'+w+'"/>').join('')+'</w:tblGrid>'+[s.headers,...s.rows].map((row,i)=>'<w:tr><w:trPr><w:cantSplit/>'+(i===0?'<w:tblHeader/>':'')+'</w:trPr>'+s.headers.map((_,j)=>'<w:tc><w:tcPr><w:tcW w:w="'+widths[j]+'" w:type="dxa"/>'+(i===0?'<w:shd w:fill="EEEEEE"/>':'')+'</w:tcPr>'+p(row[j]??'—',i===0?'TableHead':'TableText')+'</w:tc>').join('')+'</w:tr>').join('')+'</w:tbl>';};
 const body=p(SITE_NAME,'Brand')+p(report.title,'Title')+p(report.subtitle,'Subtitle')+p('生成时间：'+(report.created||''),'Caption')+(report.meta||[]).map(([k,v])=>p(k+'：'+v,'Caption')).join('')+documentSections(report).map((s,i)=>p(String(i+1).padStart(2,'0')+' '+s.title,'Heading1')+(s.caption?p(s.caption,'Caption'):'')+s.paragraphs.map(t=>p(t)).join('')+(s.headers.length?(s.rows.length?tbl(s):p('本范围暂无符合条件的记录。','Caption')):'')).join('')+(report.note?p('教师判断与后续行动','Heading1')+p(report.note):'');
 const style=(id,size,bold=false,extra='')=>'<w:style w:type="paragraph" w:styleId="'+id+'"><w:name w:val="'+id+'"/><w:basedOn w:val="Normal"/><w:pPr>'+extra+'</w:pPr><w:rPr><w:sz w:val="'+size+'"/><w:szCs w:val="'+size+'"/>'+(bold?'<w:b/>':'')+'</w:rPr></w:style>';
 const types=['document','styles','footer1'].map(f=>'<Override PartName="/word/'+f+'.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.'+(f==='document'?'document.main':f==='footer1'?'footer':f)+'+xml"/>').join('');
 return {'[Content_Types].xml':'<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>'+types+'</Types>',
 '_rels/.rels':'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
 'word/_rels/document.xml.rels':'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rIdFooter" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/></Relationships>',
 'word/document.xml':'<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="'+ns+'" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>'+body+'<w:sectPr><w:footerReference w:type="default" r:id="rIdFooter"/><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="900" w:right="950" w:bottom="900" w:left="950" w:footer="400"/></w:sectPr></w:body></w:document>',
 'word/styles.xml':'<w:styles xmlns:w="'+ns+'"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="宋体"/><w:sz w:val="21"/><w:color w:val="111111"/><w:lang w:val="zh-CN" w:eastAsia="zh-CN"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="100" w:line="280" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>'+style('Title',36,true,'<w:spacing w:before="100" w:after="160"/><w:keepNext/>')+style('Heading1',24,true,'<w:spacing w:before="230" w:after="100"/><w:keepNext/>')+style('Subtitle',22)+style('Brand',18)+style('Caption',18,false,'<w:spacing w:after="90"/>')+style('TableHead',18,true,'<w:spacing w:after="0"/>')+style('TableText',18,false,'<w:spacing w:after="0"/>')+'</w:styles>',
 'word/footer1.xml':'<w:ftr xmlns:w="'+ns+'"><w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:sz w:val="16"/></w:rPr><w:t>'+xml(SITE_NAME)+' · 第 </w:t></w:r><w:fldSimple w:instr="PAGE"/><w:r><w:t> / </w:t></w:r><w:fldSimple w:instr="NUMPAGES"/><w:r><w:t> 页</w:t></w:r></w:p></w:ftr>'};
}
