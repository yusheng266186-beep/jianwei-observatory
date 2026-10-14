import {paperMetrics,paperSettings} from '../engine/paper-settings.js?v=runtime-v32';
import {selectedReport} from '../engine/report-selection.js?v=runtime-v32';
import {esc} from '../ui/html.js?v=runtime-v32';
import {SITE_NAME} from '../brand.js?v=runtime-v32';
import {qualifyHistoricalRankings} from '../engine/ranking.js?v=runtime-v32';
import {sectionGroup,metricSection,importantCell,compactMeta} from './report-design.js?v=runtime-v32';
// All three outlets share the same sections, field splits and missing-value rules.
export function documentSections(report){
 report=qualifyHistoricalRankings(report);
 return (report.sections||[]).flatMap(s=>{
  const section={...s,caption:paperSettings(report).includeCaptions?s.caption:'',headers:s.headers||[],rows:s.rows||[],paragraphs:s.paragraphs||[]};
  const limit=paperSettings(report).orientation==='landscape'?9:6;
  if(section.headers.length<=limit)return [section];
  const keys=section.headers.flatMap((h,i)=>i<4&&['考试','姓名','学生','班级','学科'].includes(h)?[i]:[]);if(!keys.length)keys.push(0);
  const values=section.headers.map((_,i)=>i).filter(i=>!keys.includes(i)),size=limit-keys.length,parts=Math.ceil(values.length/size);
  return Array.from({length:parts},(_,p)=>{const indices=[...keys,...values.slice(p*size,(p+1)*size)];return {...section,title:section.title+'（字段 '+(p+1)+'/'+parts+'）',headers:indices.map(i=>section.headers[i]),rows:section.rows.map(r=>indices.map(i=>r[i]))};});
 });
}
export function columnWeights(headers){return headers.map(h=>/建议|安排|线索|知识点|依据|记录|结果|说明|内容|题目|方向|任务/.test(h)?2.3:/日期|时段|学生|学科/.test(h)?1.5:1);}
export function reportHTML(report){
 report=selectedReport(report);
 const sections=documentSections(report),paper=paperMetrics(report);
 return '<article class="print-paper"><div class="print-brand">'+esc(SITE_NAME)+'</div><h1>'+esc(report.title)+'</h1><p>'+esc(report.subtitle)+'</p><p class="print-meta">'+esc(report.created||'')+' · A4黑白打印</p>'+(report.meta?.length?'<dl>'+report.meta.map(([k,v])=>'<dt>'+esc(k)+'</dt><dd>'+esc(v)+'</dd>').join('')+'</dl>':'')+sections.map((s,i)=>'<section><h2>'+String(i+1).padStart(2,'0')+' '+esc(s.title)+'</h2>'+(s.caption?'<p class="print-caption">'+esc(s.caption)+'</p>':'')+s.paragraphs.map(p=>'<p>'+esc(p)+'</p>').join('')+(s.headers.length?(s.rows.length?'<table><colgroup>'+columnWeights(s.headers).map(w=>'<col style="width:'+w/columnWeights(s.headers).reduce((a,b)=>a+b,0)*100+'%">').join('')+'</colgroup><thead><tr>'+s.headers.map(h=>'<th>'+esc(h)+'</th>').join('')+'</tr></thead><tbody>'+s.rows.map(r=>'<tr>'+s.headers.map((_,j)=>'<td>'+esc(r[j]??'—')+'</td>').join('')+'</tr>').join('')+'</tbody></table>':'<p>本范围暂无符合条件的记录。</p>'):'')+'</section>').join('')+(report.note?'<section><h2>教师判断与后续行动</h2><p class="written-note">'+esc(report.note)+'</p></section>':'')+'<footer>缺失值保留为—；判断以已导入材料为依据。</footer></article>';
}
export function pdfDefinition(report){
 report=selectedReport(report);const paper=paperMetrics(report);
 const content=[
  {text:SITE_NAME,style:'brand'},
  {text:report.title,style:'title'},
  {text:report.subtitle||'',style:'subtitle'},
  {text:'生成：'+(report.created||''),style:'caption'}
 ];
 const meta=compactMeta(report);
 if(meta.length)content.push({text:meta.map(([key,value])=>key+'：'+String(value??'—')).join('  ·  '),style:'caption',margin:[0,0,0,7]});
 const sections=documentSections(report);
 sections.forEach((s,i)=>{
  const group=sectionGroup(s),heading=String(i+1).padStart(2,'0')+'  '+s.title;
  const intro=[{text:group+'  /  '+heading,style:'heading'},
   ...(s.caption?[{text:s.caption,style:'caption'}]:[]),
   ...s.paragraphs.map(text=>({text,margin:[0,0,0,5]}))];
  if(metricSection(s)){
   const cards=s.rows.map(row=>({stack:[
    {text:String(row[0]??'—'),fontSize:8.5,color:'#444444',margin:[0,0,0,5]},
    {text:String(row[1]??'—'),fontSize:String(row[1]??'').length>28?10:14,bold:true,lineHeight:1.15},
    ...(row[2]?[{text:String(row[2]),fontSize:8,color:'#555555',margin:[0,5,0,0]}]:[])
   ],fillColor:'#f2f2f2',margin:[7,7,7,7]}));
   const body=[[{stack:intro,colSpan:2,fillColor:'#ffffff',margin:[0,0,0,2]},{}]];
   for(let n=0;n<cards.length;n+=2)body.push(cards[n+1]?[cards[n],cards[n+1]]:[{...cards[n],colSpan:2},{}]);
   content.push({table:{headerRows:1,keepWithHeaderRows:1,dontBreakRows:true,widths:['*','*'],body},layout:{hLineWidth:n=>n>1?6:0,vLineWidth:n=>n===1?8:0,hLineColor:()=> '#ffffff',vLineColor:()=> '#ffffff',paddingLeft:()=>0,paddingRight:()=>0,paddingTop:()=>0,paddingBottom:()=>0},margin:[0,3,0,7],pageBreak:paper.chapterPages&&i>0?'before':undefined});
  }else if(s.headers.length&&s.rows.length){
   const weights=columnWeights(s.headers),sum=weights.reduce((a,b)=>a+b,0),widths=weights.map(w=>(paper.contentWidth-weights.length*9)*w/sum);
   const titleRow=[{stack:intro,colSpan:s.headers.length,border:[false,false,false,false],margin:[-4,0,-4,0]},...s.headers.slice(1).map(()=>({text:'',border:[false,false,false,false]}))];
   const tallRow=row=>row.some((value,j)=>String(value??'').split('\n').reduce((lines,line)=>lines+Math.max(1,Math.ceil(line.length/Math.max(3,Math.floor(widths[j]/paper.table)))),0)>Math.floor((paper.height-210)/(paper.table*paper.line+2)));
   const cells=s.rows.map((row,index)=>s.headers.map((_,column)=>{
    const mark=importantCell(s,row,column,report);
    return {text:String(row[column]??'—'),bold:mark.bold,fillColor:mark.critical?'#e3e3e3':index%2?'#f7f7f7':'#ffffff'};
   }));
   content.push({table:{headerRows:2,keepWithHeaderRows:tallRow(s.rows[0])?0:1,dontBreakRows:!s.rows.some(tallRow),widths,body:[titleRow,s.headers.map(h=>({text:h,bold:true,fillColor:'#eeeeee',fontSize:8.5})),...cells]},layout:{hLineWidth:n=>n===0?0:n===2?.7:.25,vLineWidth:()=>0,hLineColor:()=> '#b7b7b7',paddingLeft:()=>4,paddingRight:()=>4,paddingTop:()=>paper.padding,paddingBottom:()=>paper.padding},fontSize:paper.table,pageBreak:paper.chapterPages&&i>0?'before':undefined,margin:[0,2,0,8]});
  }else{
   content.push({text:group+'  /  '+heading,style:'heading',headlineLevel:1,pageBreak:paper.chapterPages&&i>0?'before':undefined});
   if(s.caption)content.push({text:s.caption,style:'caption'});
   s.paragraphs.forEach(text=>content.push({text,fontSize:9,color:'#444444',margin:[0,0,0,5]}));
   if(s.headers.length)content.push({text:'本范围暂无符合条件的记录。',style:'caption'});
  }
 });
 if(report.note)content.push({text:'教师判断与后续行动',style:'heading'},{text:report.note});
 return {pageSize:'A4',pageOrientation:paper.orientation,pageMargins:[48,45,48,45],defaultStyle:{font:'Report',fontSize:paper.body,color:'#111111',lineHeight:paper.line},info:{title:report.title,author:SITE_NAME},content,pageBreakBefore:(node,following)=>node.headlineLevel===1&&following.length===0,styles:{brand:{fontSize:8.5,color:'#555555',margin:[0,0,0,9]},title:{fontSize:20,bold:true,margin:[0,0,0,7]},subtitle:{fontSize:10.5,margin:[0,0,0,5]},heading:{fontSize:11,bold:true,margin:[0,12,0,6]},caption:{fontSize:8.5,color:'#555555',margin:[0,0,0,5]}},footer:(page,pages)=>({text:SITE_NAME+'   ·   第 '+page+' / '+pages+' 页',font:'Report',fontSize:8,color:'#555555',alignment:'center',margin:[0,14,0,0]})};
}

const xml=text=>esc(String(text??'')).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'');
export function wordFiles(report){
 report=selectedReport(report);const paper=paperMetrics(report),tableWidth=Math.round(paper.contentWidth*20),size=paper.table*2;
 const ns='http://schemas.openxmlformats.org/wordprocessingml/2006/main';
 const p=(text,style='Normal',breakBefore=false,bold=false)=>'<w:p><w:pPr>'+(breakBefore?'<w:pageBreakBefore/>':'')+'<w:pStyle w:val="'+style+'"/></w:pPr><w:r>'+(bold?'<w:rPr><w:b/></w:rPr>':'')+'<w:t xml:space="preserve">'+xml(text).replace(/\n/g,'</w:t><w:br/><w:t xml:space="preserve">')+'</w:t></w:r></w:p>';
 const tbl=s=>{const weights=columnWeights(s.headers),sum=weights.reduce((a,b)=>a+b,0),widths=weights.map(w=>Math.round(tableWidth*w/sum));return '<w:tbl><w:tblPr><w:tblW w:w="'+tableWidth+'" w:type="dxa"/><w:tblLayout w:type="fixed"/><w:tblBorders>'+['top','left','bottom','right','insideH','insideV'].map(side=>'<w:'+side+' w:val="single" w:sz="4" w:color="555555"/>').join('')+'</w:tblBorders><w:tblCellMar><w:top w:w="'+paper.padding*18+'" w:type="dxa"/><w:left w:w="90" w:type="dxa"/><w:bottom w:w="'+paper.padding*18+'" w:type="dxa"/><w:right w:w="90" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>'+widths.map(w=>'<w:gridCol w:w="'+w+'"/>').join('')+'</w:tblGrid>'+[s.headers,...s.rows].map((row,i)=>'<w:tr><w:trPr>'+(!row.some((v,j)=>String(v??'').split('\n').reduce((n,line)=>n+Math.max(1,Math.ceil(line.length/Math.max(3,Math.floor(widths[j]/20/paper.table)))),0)>Math.floor((paper.height-210)/(paper.table*paper.line+2)))?'<w:cantSplit/>':'')+(i===0?'<w:tblHeader/>':'')+'</w:trPr>'+s.headers.map((_,j)=>'<w:tc><w:tcPr><w:tcW w:w="'+widths[j]+'" w:type="dxa"/>'+(i===0?'<w:shd w:fill="EEEEEE"/>':importantCell(s,row,j,report).critical?'<w:shd w:fill="E3E3E3"/>':'')+'</w:tcPr>'+p(row[j]??'—',i===0?'TableHead':'TableText',false,i>0&&importantCell(s,row,j,report).bold)+'</w:tc>').join('')+'</w:tr>').join('')+'</w:tbl>';};
 const body=p(SITE_NAME,'Brand')+p(report.title,'Title')+p(report.subtitle,'Subtitle')+p('生成时间：'+(report.created||''),'Caption')+(report.meta||[]).map(([k,v])=>p(k+'：'+v,'Caption')).join('')+documentSections(report).map((s,i)=>p(sectionGroup(s)+' / '+String(i+1).padStart(2,'0')+' '+s.title,'Heading1',paper.chapterPages&&i>0)+(s.caption?p(s.caption,'Caption'):'')+s.paragraphs.map(t=>p(t)).join('')+(s.headers.length?(s.rows.length?tbl(s):p('本范围暂无符合条件的记录。','Caption')):'')).join('')+(report.note?p('教师判断与后续行动','Heading1')+p(report.note):'');
 const style=(id,size,bold=false,extra='')=>'<w:style w:type="paragraph" w:styleId="'+id+'"><w:name w:val="'+id+'"/><w:basedOn w:val="Normal"/><w:pPr>'+extra+'</w:pPr><w:rPr><w:sz w:val="'+size+'"/><w:szCs w:val="'+size+'"/>'+(bold?'<w:b/>':'')+'</w:rPr></w:style>';
 const types=['document','styles','footer1'].map(f=>'<Override PartName="/word/'+f+'.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.'+(f==='document'?'document.main':f==='footer1'?'footer':f)+'+xml"/>').join('');
 return {'[Content_Types].xml':'<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>'+types+'</Types>',
 '_rels/.rels':'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
 'word/_rels/document.xml.rels':'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rIdFooter" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/></Relationships>',
 'word/document.xml':'<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="'+ns+'" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>'+body+'<w:sectPr><w:footerReference w:type="default" r:id="rIdFooter"/><w:pgSz w:w="'+(paper.orientation==='landscape'?16838:11906)+'" w:h="'+(paper.orientation==='landscape'?11906:16838)+'"'+(paper.orientation==='landscape'?' w:orient="landscape"':'')+'/><w:pgMar w:top="900" w:right="960" w:bottom="900" w:left="960" w:footer="400"/></w:sectPr></w:body></w:document>',
 'word/styles.xml':'<w:styles xmlns:w="'+ns+'"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="宋体"/><w:sz w:val="'+paper.body*2+'"/><w:color w:val="111111"/><w:lang w:val="zh-CN" w:eastAsia="zh-CN"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="100" w:line="'+Math.round(paper.line*240)+'" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>'+style('Title',36,true,'<w:spacing w:before="100" w:after="160"/><w:keepNext/>')+style('Heading1',24,true,'<w:spacing w:before="230" w:after="100"/><w:keepNext/>')+style('Subtitle',22)+style('Brand',18)+style('Caption',18,false,'<w:spacing w:after="90"/>')+style('TableHead',size,true,'<w:spacing w:after="0"/>')+style('TableText',size,false,'<w:spacing w:after="0"/>')+'</w:styles>',
 'word/footer1.xml':'<w:ftr xmlns:w="'+ns+'"><w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:sz w:val="16"/></w:rPr><w:t>'+xml(SITE_NAME)+' · 第 </w:t></w:r><w:fldSimple w:instr="PAGE"/><w:r><w:t> / </w:t></w:r><w:fldSimple w:instr="NUMPAGES"/><w:r><w:t> 页</w:t></w:r></w:p></w:ftr>'};
}
