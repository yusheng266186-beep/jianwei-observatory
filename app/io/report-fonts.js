const base=new URL('../../assets/report-fonts/',import.meta.url);
// New core/manifest filenames invalidate only changed assets; keep the rare
// shard URLs stable so an upgrade can reuse fonts already saved on this device.
const cacheName='rongxian-print-fonts-report-v36';
let manifestTask,warmingTask;
export async function cachedFontFile(name) {
  const url=new URL(name+'?v=report-v36',base).href;
  let cache;
  try {cache=await globalThis.caches?.open(cacheName);}catch{}
  const read=async()=>{
    let response=await cache?.match(url);
    if(!response){
      response=await fetch(url,{signal:AbortSignal.timeout(60000),cache:'force-cache'});
      if(!response.ok)throw new Error('报告字体加载失败，请重试');
      try{await cache?.put(url,response.clone());}catch{}
    }
    return response;
  };
  return cache&&globalThis.navigator?.locks?globalThis.navigator.locks.request('report-font:'+url,read):read();
}
export function reportFontManifest() {
  if(!manifestTask) {
    const task=cachedFontFile('manifest-v38.json').then(response=>response.json());
    manifestTask=task;task.catch(()=>{if(manifestTask===task)manifestTask=null;});
  }
  return manifestTask;
}
export function warmReportFonts() {
  if(!warmingTask){const task=(async()=>{
    const manifest=await reportFontManifest(),core=manifest.parts.find(part=>part.id==='core');
    await Promise.all(Object.values(core.files).map(async name=>(await cachedFontFile(name)).arrayBuffer()));
  })();warmingTask=task;task.catch(()=>{if(warmingTask===task)warmingTask=null;});}
  return warmingTask;
}
export function prepareReportFonts(definition,manifest) {
  const needed=new Map(),byPoint=new Map();
  for(const part of manifest.parts)for(const [start,end] of part.ranges)
    for(let point=start;point<=end;point++)byPoint.set(point,part.id);
  const runs=(text,bold=false)=>{
    const result=[];
    for(const char of String(text)) {
      const point=char.codePointAt(0),part=byPoint.get(point);
      if(!part&&point>31)throw new Error('打印字体缺少字符 U+'+point.toString(16).toUpperCase()+'，请修改该字符后重试');
      const id=part||'core',font='Report-'+id;if(!needed.has(id))needed.set(id,new Set());needed.get(id).add(bold?'medium':'regular');
      if(result.at(-1)?.font===font)result.at(-1).text+=char;
      else result.push({text:char,font});
    }
    return result.length?result:[{text:'',font:'Report-core'}];
  };
  const node=(value,inheritedBold=false)=>{
    if(typeof value==='string'||typeof value==='number')return {text:runs(value,inheritedBold)};
    if(!value||typeof value!=='object')return value;
    if(Array.isArray(value))return value.map(v=>node(v,inheritedBold));
    const styles=Array.isArray(value.style)?value.style:[value.style],styleBold=styles.reduce((bold,name)=>definition.styles?.[name]?.bold??bold,inheritedBold),bold=value.bold??styleBold;
    const result={...value};
    if(value.svgTextFonts&&typeof value.svg==='string'){
      const decode=text=>text.replace(/&(?:amp|lt|gt|quot|apos);/g,entity=>({'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&apos;':"'"}[entity]));
      const encode=text=>text.replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[char]));
      result.svg=value.svg.replace(/<text\b([^>]*)>([\s\S]*?)<\/text>/g,(_,attrs,text)=>'<text'+attrs+'>'+text.split(/(<[^>]+>)/).map(part=>part.startsWith('<')?part:runs(decode(part),bold).map(run=>'<tspan font-family="'+run.font+'">'+encode(run.text)+'</tspan>').join('')).join('')+'</text>');
      delete result.svgTextFonts;
    }
    if(value.font==='Report')result.font='Report-core';
    if(Object.hasOwn(value,'text'))result.text=Array.isArray(value.text)?value.text.map(v=>node(v,bold)):runs(value.text,bold);
    for(const key of ['content','stack','columns'])if(value[key])result[key]=value[key].map(v=>node(v,bold));
    if(value.table)result.table={...value.table,body:value.table.body.map(row=>row.map(v=>node(v,bold)))};
    return result;
  };
  const output={...definition,defaultStyle:{...definition.defaultStyle,font:'Report-core'},content:definition.content.map(v=>node(v))};
  for(const key of ['header','footer'])if(typeof definition[key]==='function'){
    node(definition[key](1,1));output[key]=(...args)=>node(definition[key](...args));
  }
  return {definition:output,parts:manifest.parts.filter(part=>needed.has(part.id)).map(part=>({...part,weights:[...needed.get(part.id)]}))};
}
