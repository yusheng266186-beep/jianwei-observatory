// Physical points shared by PDF and editable Word; preview keeps its screen scale.
export const exerciseDocumentDesign=Object.freeze({body:11,meta:9.5,title:20,heading:12,caption:9,table:10,tableHeader:9.5,mathEm:12,contentWidth:507.3,margins:[44,40,44,44]});
export const exerciseDocumentLeading=teacher=>teacher?1.35:1.4;
export function exerciseWordStyles(teacher=false){
 const d=exerciseDocumentDesign,spacing=Math.round(exerciseDocumentLeading(teacher)*d.body*20);
 const style=(id,size,bold=false,props='')=>'<w:style w:type="paragraph" w:styleId="'+id+'"><w:name w:val="'+id+'"/><w:basedOn w:val="Normal"/><w:pPr>'+props+'</w:pPr><w:rPr><w:color w:val="000000"/><w:sz w:val="'+size*2+'"/><w:szCs w:val="'+size*2+'"/>'+(bold?'<w:b/>':'')+'</w:rPr></w:style>';
 return '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="宋体" w:eastAsia="宋体" w:hAnsi="宋体" w:cs="宋体"/><w:color w:val="000000"/><w:sz w:val="22"/><w:lang w:val="en-US" w:eastAsia="zh-CN"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="60" w:line="'+spacing+'" w:lineRule="atLeast"/><w:widowControl/><w:snapToGrid w:val="0"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>'+
 style('Title',d.title,true,'<w:jc w:val="center"/><w:keepNext/><w:spacing w:after="120"/>')+
 style('Subtitle',11,false,'<w:jc w:val="center"/><w:keepNext/><w:spacing w:after="140"/>')+
 style('Meta',d.meta,false,'<w:keepNext/><w:spacing w:after="100"/>')+
 style('Heading1',d.heading,true,'<w:outlineLvl w:val="0"/><w:keepNext/><w:keepLines/><w:spacing w:before="200" w:after="100"/>')+
 style('Heading2',d.body,true,'<w:outlineLvl w:val="1"/><w:keepNext/><w:spacing w:before="140" w:after="60"/>')+
 style('Caption',d.caption,false,'<w:jc w:val="center"/><w:spacing w:after="120" w:line="240" w:lineRule="atLeast"/>')+
 style('Choice',d.body,false,'<w:spacing w:before="0" w:after="40" w:line="'+spacing+'" w:lineRule="atLeast"/>')+
 style('TableHeader',d.tableHeader,true,'<w:spacing w:before="0" w:after="0" w:line="260" w:lineRule="atLeast"/>')+
 style('TableCell',d.table,false,'<w:spacing w:before="0" w:after="0" w:line="260" w:lineRule="atLeast"/>')+
 style('ScorePoint',d.body,false,'<w:spacing w:before="0" w:after="40" w:line="'+spacing+'" w:lineRule="atLeast"/>')+
 style('AnswerSpace',d.body,false,'<w:spacing w:after="0" w:line="360" w:lineRule="exact"/>')+
 style('Footer',d.caption,false,'<w:jc w:val="center"/><w:spacing w:before="0" w:after="0" w:line="240" w:lineRule="auto"/>')+'</w:styles>';
}
export const exerciseWordFontTable='<w:fonts xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:font w:name="宋体"><w:altName w:val="Songti SC"/><w:family w:val="roman"/><w:pitch w:val="variable"/></w:font><w:font w:name="Cambria Math"><w:family w:val="roman"/></w:font></w:fonts>';
