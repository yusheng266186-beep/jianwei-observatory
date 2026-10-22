// Material imports must keep teacher work attached to the same students.
export function remapContext(value,ids,key='') {
  if(['savedPeople','comparePeople'].includes(key)&&Array.isArray(value))return value.map(id=>ids.get(id)||id);
  if(['sid','focusSid'].includes(key)&&typeof value==='string')return ids.get(value)||value;
  if(Array.isArray(value))return value.map(item=>remapContext(item,ids));
  if(!value||typeof value!=='object')return value;
  const result=Object.fromEntries(Object.entries(value).map(([k,v])=>[k,remapContext(v,ids,k)]));
  if(value.sid&&value.id===value.sid+'|'+value.exam+'|'+value.tier)result.id=result.sid+'|'+value.exam+'|'+value.tier;
  return result;
}
const mergeEntries=(current=[],incoming=[])=>{const ids=new Set(incoming.map(item=>item.id));return [...new Map([...incoming,...current.filter(item=>!ids.has(item.id))].map(item=>[item.id,item])).values()];};
export function mergeContext(current,incoming,ids) {
  const result={},context=remapContext({plans:incoming.plans||incoming.actions,notebook:incoming.notebook,savedPeople:incoming.savedPeople,comparePeople:incoming.comparePeople,directoryViews:incoming.directoryViews,research:incoming.research},ids);
  for(const key of ['plans','notebook','directoryViews'])if(Array.isArray(context[key])||Array.isArray(current[key]))result[key]=mergeEntries(current[key],context[key]);
  for(const key of ['savedPeople','comparePeople'])if(Array.isArray(context[key])||Array.isArray(current[key]))result[key]=[...new Set([...(current[key]||[]),...(context[key]||[])])].slice(0,key==='comparePeople'?4:Infinity);
  if(current.research||context.research)result.research={saved:mergeEntries(current.research?.saved,context.research?.saved),recent:mergeEntries(current.research?.recent,context.research?.recent).sort((a,b)=>String(b.updated||'').localeCompare(String(a.updated||''))).slice(0,24)};
  // This is a one-time archive payload. Ordinary workbook imports must not
  // replay an old copy of the draft library from the current dataset.
  result.exercises=Array.isArray(incoming.exercises)?remapContext(incoming.exercises,ids):undefined;
  result.exerciseSavedSetups=Array.isArray(incoming.exerciseSavedSetups)?structuredClone(incoming.exerciseSavedSetups):undefined;
  result.importColumnTemplates=Array.isArray(incoming.importColumnTemplates)?structuredClone(incoming.importColumnTemplates):undefined;
  return result;
}
