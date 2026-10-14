const base=new URL('../../assets/report-fonts/',import.meta.url);
const cacheName='rongxian-print-fonts-report-v32';
let manifestTask,warmingTask;
export async function cachedFontFile(name) {
  const url=new URL(name+'?v=report-v32',base).href;
  let cache;
  try {cache=await globalThis.caches?.open(cacheName);}catch{}
  let response=await cache?.match(url);
  if(!response) {
    response=await fetch(url,{signal:AbortSignal.timeout(60000),cache:'force-cache'});
    if(!response.ok)throw new Error('打印字体未能载入，请重试');
    try {await cache?.put(url,response.clone());}catch{}
  }
  return response;
}
export function reportFontManifest() {
  if(!manifestTask) {
    const task=cachedFontFile('manifest.json').then(response=>response.json());
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
  const needed=new Set(),byPoint=new Map();
  for(const part of manifest.parts)for(const [start,end] of part.ranges)
    for(let point=start;point<=end;point++)byPoint.set(point,part.id);
  const runs=text=>{
    const result=[];
    for(const char of String(text)) {
      const point=char.codePointAt(0),part=byPoint.get(point);
      if(!part&&point>31)throw new Error('打印字体缺少字符 U+'+point.toString(16).toUpperCase()+'，请修改该字符后重试');
      const font='Report-'+(part||'core');needed.add(part||'core');
      if(result.at(-1)?.font===font)result.at(-1).text+=char;
      else result.push({text:char,font});
    }
    return result.length?result:[{text:'',font:'Report-core'}];
  };
  const node=value=>{
    if(typeof value==='string'||typeof value==='number')return {text:runs(value)};
    if(!value||typeof value!=='object')return value;
    if(Array.isArray(value))return value.map(node);
    const result={...value};
    if(value.font==='Report')result.font='Report-core';
    if(Object.hasOwn(value,'text'))result.text=Array.isArray(value.text)?value.text.map(node):runs(value.text);
    for(const key of ['content','stack','columns'])if(value[key])result[key]=value[key].map(node);
    if(value.table)result.table={...value.table,body:value.table.body.map(row=>row.map(node))};
    return result;
  };
  const output={...definition,defaultStyle:{...definition.defaultStyle,font:'Report-core'},content:definition.content.map(node)};
  for(const key of ['header','footer'])if(typeof definition[key]==='function'){
    node(definition[key](1,1));output[key]=(...args)=>node(definition[key](...args));
  }
  return {definition:output,parts:manifest.parts.filter(part=>needed.has(part.id))};
}
