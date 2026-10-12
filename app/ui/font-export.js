// Keep only the used, loaded font subsets in standalone chart downloads.
const payloads=new Map();
const family=value=>value.replace(/["']/g,'').trim();
const normalizedRange=value=>(value||'U+0-10FFFF').replace(/\s/g,'').toUpperCase();
function covers(range,characters) {
  if(!range)return true;
  const intervals=range.split(',').map(part=>{const [from,to]=part.trim().replace(/^U\+/i,'').split('-');return [parseInt(from.replace(/\?/g,'0'),16),parseInt((to||from).replace(/\?/g,'F'),16)];});
  return characters.some(code=>intervals.some(([low,high])=>code>=low&&code<=high));
}
async function fontPayload(url) {
  if(!payloads.has(url))payloads.set(url,(async()=>{
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),8000);
    try {
      const response=await fetch(url,{cache:'force-cache',signal:controller.signal});if(!response.ok)throw new Error('图表字体暂时无法下载，请稍后重试。');
      const bytes=new Uint8Array(await response.arrayBuffer()),parts=[];
      for(let offset=0;offset<bytes.length;offset+=32768)parts.push(String.fromCharCode(...bytes.subarray(offset,offset+32768)));
      return btoa(parts.join(''));
    }finally{clearTimeout(timer);}
  })().catch(error=>{payloads.delete(url);throw error;}));
  return payloads.get(url);
}
export async function chartFontRules(labels) {
  if(!document.fonts)return '';
  const used=new Set(labels.flatMap(label=>getComputedStyle(label).fontFamily.split(',').map(family))),characters=[...new Set(labels.flatMap(label=>[...label.textContent].map(char=>char.codePointAt(0))))],rules=[];
  const loaded=[...document.fonts].filter(font=>font.status==='loaded');
  for(const sheet of document.styleSheets){
    let entries;try{entries=sheet.cssRules;}catch{continue;}
    for(const rule of entries){
      if(rule.type!==CSSRule.FONT_FACE_RULE)continue;
      const name=family(rule.style.getPropertyValue('font-family')),range=rule.style.getPropertyValue('unicode-range');
      if(!used.has(name)||!covers(range,characters)||!loaded.some(font=>family(font.family)===name&&normalizedRange(font.unicodeRange)===normalizedRange(range)))continue;
      const source=rule.style.getPropertyValue('src').match(/url\(["']?([^"'()\s]+)["']?\)/);if(!source)continue;
      const url=new URL(source[1],sheet.href||location.href);if(url.origin!==location.origin)continue;
      rules.push({css:rule.cssText,source:source[0],url:url.href,format:source[1].split('?')[0].endsWith('.woff2')?'woff2':'woff'});
    }
  }
  return (await Promise.all(rules.map(async rule=>rule.css.replace(rule.source,'url("data:font/'+rule.format+';base64,'+await fontPayload(rule.url)+'")')))).join('\n');
}
