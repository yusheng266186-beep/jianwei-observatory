// PDF text uses the font ascender as its baseline; SVG formulae use y=0.
// Align those two coordinate systems rather than centering their outer boxes.
export async function printFontMetrics(bytes,fontSize=11){
 const view=new DataView(bytes),tables=new Map(),woff=view.getUint32(0)===0x774f4646,count=view.getUint16(woff?12:4);
 for(let n=0;n<count;n++){const at=(woff?44:12)+n*(woff?20:16),tag=String.fromCharCode(...new Uint8Array(bytes,at,4));tables.set(tag,{offset:view.getUint32(at+(woff?4:8)),length:view.getUint32(at+(woff?8:12)),original:woff?view.getUint32(at+12):0});}
 const table=async tag=>{const entry=tables.get(tag);if(!entry)throw Error('打印字体度量不可用');let data=bytes.slice(entry.offset,entry.offset+entry.length);if(woff&&entry.length<entry.original)data=await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate'))).arrayBuffer();return new DataView(data);};
 const [head,hhea]=await Promise.all([table('head'),table('hhea')]);
 const units=head.getUint16(18),ascent=hhea.getInt16(4)/units*fontSize,descent=-hhea.getInt16(6)/units*fontSize;
 return {ascent,descent};
}
export function alignExerciseLine(fragments){
 const baseline=Math.max(...fragments.map(f=>f.ascent)),depth=Math.max(...fragments.map(f=>f.descent));
 return {columns:fragments.map(f=>({width:f.width,stack:[f.node],margin:[0,baseline-f.ascent,0,0]})),columnGap:0,margin:[0,1,0,Math.max(3,16-baseline-depth)]};
}

// pdfmake multiplies the font's ascent/descent height, not the CSS em size.
// Convert physical leading so Songti prose doesn't become looser than formula rows.
export const exercisePDFLineHeight=(metrics,leading=1.4,measuredSize=11)=>measuredSize*leading/(metrics.ascent+metrics.descent);
