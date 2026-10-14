import {paperSettings} from './paper-settings.js?v=runtime-v37';
import {qualifyHistoricalRankings} from './ranking.js?v=runtime-v37';
export function selectionFor(report){
 const source=report.outputSelection||{},sections=report.sections||[],indices=sections.map((_,i)=>i),valid=i=>Number.isInteger(i)&&i>=0&&i<sections.length;
 const order=[...new Set((source.order||indices).filter(valid))];for(const i of indices)if(!order.includes(i))order.push(i);
 const selected=Array.isArray(source.selected)?[...new Set(source.selected.filter(valid))]:indices;
 return {selected,order,fields:{...source.fields},filters:{...source.filters},includeMeta:source.includeMeta!==false,includeNote:source.includeNote!==false,title:source.title||'',paper:paperSettings(report)};
}
export function fieldsFor(report,index,selection=selectionFor(report)){const headers=report.sections[index]?.headers||[],fields=selection.fields[index];return Array.isArray(fields)?[...new Set(fields.filter(i=>Number.isInteger(i)&&i>=0&&i<headers.length))]:headers.map((_,i)=>i);}
export function presetSections(report,preset){
 const titles=(report.sections||[]).map(s=>s.title||'');if(preset==='all')return titles.map((_,i)=>i);
 const patterns={overview:/概况|阶段|评估|比较|短板|统计口径|说明/,weak:/攻坚|突破|薄弱|短板|训练优先|优先训练|教学跟进|统计口径/,paper:/小题|逐题|知识点|统计口径/,follow:/跟进|训练|执行日程|复核|计划说明|材料说明/};
 return titles.flatMap((title,i)=>patterns[preset]?.test(title)?[i]:[]);
}
export function selectedReport(report){
 report=qualifyHistoricalRankings(report);
 if(!report.outputSelection)return report;
 const selection=selectionFor(report),chosen=selection.order.filter(i=>selection.selected.includes(i)),sections=chosen.map(index=>{
  const source=report.sections[index],fields=fieldsFor(report,index,selection),query=String(selection.filters[index]||'').trim(),rows=(source.rows||[]).filter(row=>!query||row.some(value=>String(value??'').includes(query)));
  return {...source,sourceIndex:index,headers:fields.map(i=>source.headers[i]),rows:rows.map(row=>fields.map(i=>row[i])),caption:[selection.paper.includeCaptions?source.caption:'',fields.length<(source.headers||[]).length?'本章节仅保留所选'+fields.length+' / '+source.headers.length+'个字段。':'',query?'本章节仅包含匹配“'+query+'”的 '+rows.length+' 条记录。':''].filter(Boolean).join(' ')};
 });
 const result={...report,title:selection.title.trim()||report.title,paper:selection.paper,sections:selection.paper.skipEmpty?sections.filter(s=>s.rows.length||(s.paragraphs||[]).length):sections,note:selection.includeNote?report.note:'',meta:selection.includeMeta?report.meta:[],studyTitle:selection.includeMeta?report.studyTitle:'',sheets:Object.fromEntries(sections.map((s,i)=>[(i+1)+'-'+s.title,s.headers.length?[s.headers,...s.rows]:[['说明'],...(s.paragraphs||[]).map(text=>[text])]]))};result.sheets=Object.fromEntries(result.sections.map((s,i)=>[(i+1)+'-'+s.title,s.headers.length?[s.headers,...s.rows]:[['说明'],...(s.paragraphs||[]).map(text=>[text])]]));delete result.outputSelection;return result;
}
export function availablePresets(report){return [['all','完整材料'],['overview','概况与对照'],['weak','分层补弱'],['paper','试卷与知识点'],['follow','训练与跟进']].filter(([key])=>presetSections(report,key).length);}
// Chapter indices and field positions can change when the exam or person changes.
// Carry choices by their meaning, never by an index from the previous report.
export function transferSelection(previous,next){
 const old=selectionFor(previous),defaults=selectionFor(next),byTitle=new Map((next.sections||[]).map((s,i)=>[s.title,i])),mapped=new Map();
 (previous.sections||[]).forEach((s,i)=>{if(byTitle.has(s.title))mapped.set(i,byTitle.get(s.title));});
 const matched=new Set(mapped.values()),selected=old.selected.filter(i=>mapped.has(i)).map(i=>mapped.get(i));
 selected.push(...defaults.selected.filter(i=>!matched.has(i)));
 const order=old.order.filter(i=>mapped.has(i)).map(i=>mapped.get(i));order.push(...defaults.order.filter(i=>!order.includes(i)));
 const fields={},filters={};
 for(const [before,after] of mapped){
  if(Object.hasOwn(old.fields,before)){const labels=fieldsFor(previous,before,old).map(i=>previous.sections[before].headers[i]);const chosen=next.sections[after].headers.flatMap((h,i)=>labels.includes(h)?[i]:[]);if(chosen.length)fields[after]=chosen;}
  if(Object.hasOwn(old.filters,before))filters[after]=old.filters[before];
 }
 return {...defaults,selected,order,fields,filters,includeMeta:old.includeMeta,includeNote:old.includeNote,title:old.title,paper:old.paper};
}
