const cache=new WeakMap();
export function exerciseRoster(atlas,{exam='latest',classNo=null,search='',limit=60}={}){
 let saved=cache.get(atlas);if(!saved)cache.set(atlas,saved=new Map());
 if(!saved.has(exam)){
  const ids=new Set(atlas.data.students.map(p=>p.id).concat(atlas.data.answers.map(a=>a.sid)));
  saved.set(exam,[...ids].map(sid=>{const row=atlas.materialAt(sid,exam);return row?{...row,name:atlas.name(sid),label:atlas.label?.(sid)||atlas.name(sid),examCount:new Set(atlas.materialStory(sid).map(r=>r.exam)).size}:null;}).filter(Boolean).sort((a,b)=>a.classNo-b.classNo||a.name.localeCompare(b.name,'zh-CN')));
 }
 const all=saved.get(exam),query=search.trim().replace(/\s/g,'').toLocaleLowerCase(),scope=query?null:classNo,matched=all.filter(r=>(scope===null||r.classNo===scope)&&(!query||r.name.replace(/\s/g,'').toLocaleLowerCase().includes(query)));
 return {classes:[...new Set(all.map(r=>r.classNo))].sort((a,b)=>a-b),scope,total:matched.length,rows:matched.slice(0,limit)};
}
