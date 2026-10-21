const xml=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
// mhchem builds reaction arrows from overlapping glyphs. OMML cannot preserve
// that TeX spacing reliably; keep the original vector rather than alter an arrow.
export const wordMathNeedsVector=latex=>/\\ce\{[^}]*?(?:<=>|<->|->|<-|=>|<=)/.test(latex)||/\\begin\{array\}/.test(latex)&&/\\hline|\|/.test(latex);
// MathML from the same local MathJax TeX parser used in preview. Native Office
// math keeps fractions, powers, roots, matrices and limits editable in Word.
export function mathMLToOffice(root){
 const run=(text,normal=false)=>'<m:r>'+(normal?'<m:rPr><m:sty m:val="p"/></m:rPr>':'')+'<m:t xml:space="preserve">'+xml(text)+'</m:t></m:r>';
 const transparent=['math','mrow','mstyle','mpadded','semantics','TeXAtom'],flat=list=>list.flatMap(n=>transparent.includes(n.localName)?flat([...n.children]):[n]);
 const convert=(node,base='')=>{const tag=node.localName,kids=[...node.children],c=i=>i===0&&base?base:kids[i]?convert(kids[i]):'',all=()=>{const out=[];let previous;
  for(const child of flat(kids)){let value;if(['msub','msup','msubsup'].includes(child.localName)&&!convert(child.children[0])){if(!out.length||previous?.localName==='mo'&&!/[)\]}]/.test(previous.textContent))throw new Error('OFFICE_MATH_EMPTY_SCRIPT');value=convert(child,out.pop());}else value=convert(child);if(value){out.push(value);previous=child;}}
  return out.join('');},slot=(tag,body)=>'<m:'+tag+'>'+body+'</m:'+tag+'>';
  if(['math','mrow','mstyle','mpadded','semantics','TeXAtom'].includes(tag))return all();
  if(['annotation','annotation-xml','mphantom','mspace','none'].includes(tag))return '';
  if(['mi','mn','mo','mtext','ms'].includes(tag))return run(node.textContent,tag==='mtext'||node.getAttribute('mathvariant')==='normal');
  if(tag==='msup'||tag==='msub'){if(!c(0))throw new Error('OFFICE_MATH_EMPTY_SCRIPT');return slot(tag==='msup'?'sSup':'sSub',slot('e',c(0))+slot(tag==='msup'?'sup':'sub',c(1)));}
  if(tag==='msubsup'){if(!c(0))throw new Error('OFFICE_MATH_EMPTY_SCRIPT');return slot('sSubSup',slot('e',c(0))+slot('sub',c(1))+slot('sup',c(2)));}
  if(tag==='mfrac')return '<m:f><m:fPr><m:type m:val="'+(node.getAttribute('linethickness')==='0'?'noBar':'bar')+'"/></m:fPr>'+slot('num',c(0))+slot('den',c(1))+'</m:f>';
  if(tag==='msqrt'||tag==='mroot')return '<m:rad><m:radPr>'+(tag==='msqrt'?'<m:degHide m:val="1"/>':'')+'</m:radPr>'+slot('deg',tag==='mroot'?c(1):'')+slot('e',tag==='mroot'?c(0):all())+'</m:rad>';
  if(tag==='mfenced')return '<m:d><m:dPr><m:begChr m:val="'+xml(node.getAttribute('open')??'(')+'"/><m:endChr m:val="'+xml(node.getAttribute('close')??')')+'"/><m:sepChr m:val="'+xml(node.getAttribute('separators')??',')+'"/></m:dPr>'+kids.map(n=>slot('e',convert(n))).join('')+'</m:d>';
  if(tag==='mtable'){
   // MathJax marks aligned derivations with columnalign="right left". OMML
   // matrices center each cell by default, which would break the alignment
   // points, so carry the column justification over to the matrix properties.
   const columns=Math.max(1,...kids.map(row=>row.children.length)),marks=(node.getAttribute('columnalign')||'').trim().split(/\s+/).filter(Boolean),
    mpr=marks.length?'<m:mPr><m:mcs>'+Array.from({length:columns},(_,i)=>{const value=marks[i]??marks[marks.length-1];return '<m:mc><m:mcPr><m:count m:val="1"/><m:mcJc m:val="'+(['left','right','center'].includes(value)?value:'center')+'"/></m:mcPr></m:mc>';}).join('')+'</m:mcs></m:mPr>':'';
   return '<m:m>'+mpr+kids.map(row=>'<m:mr>'+[...row.children].map(cell=>slot('e',convert(cell))).join('')+'</m:mr>').join('')+'</m:m>';
  }
  if(['mtd','mtr','mlabeledtr'].includes(tag))return all();
  if(tag==='mover'&&node.getAttribute('accent')==='true'&&kids[1]?.textContent.length===1)return '<m:acc><m:accPr><m:chr m:val="'+xml(kids[1].textContent)+'"/></m:accPr>'+slot('e',c(0))+'</m:acc>';
  if(tag==='mover')return slot('limUpp',slot('e',c(0))+slot('lim',c(1)));
  if(tag==='munder')return slot('limLow',slot('e',c(0))+slot('lim',c(1)));
  if(tag==='munderover')return slot('limUpp',slot('e',slot('limLow',slot('e',c(0))+slot('lim',c(1))))+slot('lim',c(2)));
  throw new Error('OFFICE_MATH_UNSUPPORTED '+tag);
 };
 return '<m:oMath>'+convert(root)+'</m:oMath>';
}
export function mathMLTableToWord(table){
 const rows=[...table.children];if(!rows.length||rows.some(row=>row.localName!=='mtr'))throw new Error('WORD_TABLE_UNSUPPORTED');const columns=Math.max(...rows.map(r=>r.children.length));if(!columns||columns>12)throw new Error('WORD_TABLE_UNSUPPORTED');const width=Math.floor(9200/columns),border=['top','left','bottom','right','insideH','insideV'].map(side=>'<w:'+side+' w:val="single" w:sz="4" w:color="B6C3CC"/>').join('');
 return '<w:tbl><w:tblPr><w:tblW w:w="9200" w:type="dxa"/><w:jc w:val="center"/><w:tblBorders>'+border+'</w:tblBorders><w:tblLayout w:type="fixed"/></w:tblPr><w:tblGrid>'+Array.from({length:columns},()=>'<w:gridCol w:w="'+width+'"/>').join('')+'</w:tblGrid>'+rows.map(row=>'<w:tr><w:trPr><w:cantSplit/></w:trPr>'+Array.from({length:columns},(_,i)=>'<w:tc><w:tcPr><w:tcW w:w="'+width+'" w:type="dxa"/><w:vAlign w:val="center"/></w:tcPr><w:p><w:pPr><w:jc w:val="center"/><w:spacing w:before="75" w:after="75"/></w:pPr>'+(row.children[i]?mathMLToOffice(row.children[i]):'')+'</w:p></w:tc>').join('')+'</w:tr>').join('')+'</w:tbl>';
}
