const xml=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
// MathML from the same local MathJax TeX parser used in preview. Native Office
// math keeps fractions, powers, roots, matrices and limits editable in Word.
export function mathMLToOffice(root){
 const run=(text,normal=false)=>'<m:r>'+(normal?'<m:rPr><m:sty m:val="p"/></m:rPr>':'')+'<m:t xml:space="preserve">'+xml(text)+'</m:t></m:r>';
 const convert=node=>{const tag=node.localName,kids=[...node.children],c=i=>kids[i]?convert(kids[i]):'',all=()=>kids.map(convert).join(''),slot=(tag,body)=>'<m:'+tag+'>'+body+'</m:'+tag+'>';
  if(['math','mrow','mstyle','mpadded','semantics','TeXAtom'].includes(tag))return all();
  if(['annotation','annotation-xml','mphantom','mspace','none'].includes(tag))return '';
  if(['mi','mn','mo','mtext','ms'].includes(tag))return run(node.textContent,tag==='mtext'||node.getAttribute('mathvariant')==='normal');
  if(tag==='msup'||tag==='msub')return slot(tag==='msup'?'sSup':'sSub',slot('e',c(0))+slot(tag==='msup'?'sup':'sub',c(1)));
  if(tag==='msubsup')return slot('sSubSup',slot('e',c(0))+slot('sub',c(1))+slot('sup',c(2)));
  if(tag==='mfrac')return '<m:f><m:fPr><m:type m:val="'+(node.getAttribute('linethickness')==='0'?'noBar':'bar')+'"/></m:fPr>'+slot('num',c(0))+slot('den',c(1))+'</m:f>';
  if(tag==='msqrt'||tag==='mroot')return '<m:rad><m:radPr>'+(tag==='msqrt'?'<m:degHide m:val="1"/>':'')+'</m:radPr>'+slot('deg',tag==='mroot'?c(1):'')+slot('e',tag==='mroot'?c(0):all())+'</m:rad>';
  if(tag==='mfenced')return '<m:d><m:dPr><m:begChr m:val="'+xml(node.getAttribute('open')??'(')+'"/><m:endChr m:val="'+xml(node.getAttribute('close')??')')+'"/><m:sepChr m:val="'+xml(node.getAttribute('separators')??',')+'"/></m:dPr>'+kids.map(n=>slot('e',convert(n))).join('')+'</m:d>';
  if(tag==='mtable')return '<m:m>'+kids.map(row=>'<m:mr>'+[...row.children].map(cell=>slot('e',convert(cell))).join('')+'</m:mr>').join('')+'</m:m>';
  if(['mtd','mtr','mlabeledtr'].includes(tag))return all();
  if(tag==='mover'&&node.getAttribute('accent')==='true'&&kids[1]?.textContent.length===1)return '<m:acc><m:accPr><m:chr m:val="'+xml(kids[1].textContent)+'"/></m:accPr>'+slot('e',c(0))+'</m:acc>';
  if(tag==='mover')return slot('limUpp',slot('e',c(0))+slot('lim',c(1)));
  if(tag==='munder')return slot('limLow',slot('e',c(0))+slot('lim',c(1)));
  if(tag==='munderover')return slot('limUpp',slot('e',slot('limLow',slot('e',c(0))+slot('lim',c(1))))+slot('lim',c(2)));
  throw new Error('OFFICE_MATH_UNSUPPORTED '+tag);
 };
 return '<m:oMath>'+convert(root)+'</m:oMath>';
}
