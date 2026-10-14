// Source identifiers are authoritative. Names alone need exam/class evidence.
export const identityHash=text=>{let h=2166136261;for(let i=0;i<text.length;i++)h=Math.imul(h^text.charCodeAt(i),16777619);return 's'+(h>>>0).toString(36);};
const records=data=>[...(data.scores||[]),...(data.answers||[])];
const classesByExam=rows=>{const map=new Map();for(const r of rows){if(!map.has(r.exam))map.set(r.exam,new Set());map.get(r.exam).add(Number(r.classNo));}return map;};
const compatible=(a,b)=>{const left=classesByExam(a),right=classesByExam(b);return [...right].every(([exam,classes])=>!left.has(exam)||[...classes].every(no=>left.get(exam).has(no)));};
export function remapScopedContext(value,data,scope={}){
 if(Array.isArray(value))return value.map(v=>remapScopedContext(v,data,scope));
 if(!value||typeof value!=='object')return value;
 const local={...scope,...value.spec,...(value.no!=null?{no:value.no}:{}),...(value.classNo!=null?{no:value.classNo}:{}),...(value.exam?{exam:value.exam}:{})};
 const result=Object.fromEntries(Object.entries(value).map(([key,v])=>[key,remapScopedContext(v,data,local)]));
 for(const key of ['sid','focusSid'])if(typeof value[key]==='string'){
  const scopes=data.identityScopes?.[value[key]],rows=scopes?records(data).filter(r=>r.exam===local.exam&&Object.values(scopes).includes(r.sid)):[];
  const no=Number(local.no),target=scopes?.[no]||([...new Set(rows.map(r=>r.sid))].length===1?rows[0]?.sid:null);
  if(target)result[key]=target;
 }
 if(value.sid&&value.id===value.sid+'|'+value.exam+'|'+value.tier)result.id=result.sid+'|'+value.exam+'|'+value.tier;
 return result;
}
export function repairStudentIdentities(data){
 const byPerson=new Map();for(const r of records(data)){if(!byPerson.has(r.sid))byPerson.set(r.sid,[]);byPerson.get(r.sid).push(r);}
 const occupied=new Set(data.students.map(p=>p.id));let changed=false;
 for(const person of [...data.students]){
  const rows=byPerson.get(person.id)||[],examClasses=classesByExam(rows);
  if(![...examClasses.values()].some(classes=>classes.size>1))continue;
  if(person.sourceId)throw new Error('同一学生识别码在同一考次对应多个班级，请核对导入表的识别码与班级。');
  const classes=[...new Set(rows.map(r=>Number(r.classNo)))].sort((a,b)=>a-b),primary=person.identityClass??classes[0];
  data.identityScopes||={};const scopes=data.identityScopes[person.id]||={};scopes[primary]=person.id;person.identityClass=primary;
  for(const no of classes){
   if(no===primary)continue;
   let sid=scopes[no]||identityHash(person.id+'|class|'+no),suffix=0;
   while(occupied.has(sid)&&!data.students.some(p=>p.id===sid&&p.name===person.name&&p.identityClass===no))sid=identityHash(person.id+'|class|'+no+'|'+(++suffix));
   if(!occupied.has(sid)){data.students.push({...person,id:sid,identityClass:no});occupied.add(sid);}scopes[no]=sid;
   for(const row of rows)if(Number(row.classNo)===no)row.sid=sid;
  }
  changed=true;
 }
 if(changed)for(const key of ['plans','actions','notebook','directoryViews','research'])if(data[key])data[key]=remapScopedContext(data[key],data);
 return data;
}
export function mergeStudentIdentities(current,incoming){
 const remap=new Map(),occupied=new Set(current.students.map(p=>p.id)),oldRows=new Map(),newRows=new Map(),names=new Map();
 for(const [data,index] of [[current,oldRows],[incoming,newRows]])for(const row of records(data)){if(!index.has(row.sid))index.set(row.sid,[]);index.get(row.sid).push(row);}
 for(const p of current.students){if(!names.has(p.name))names.set(p.name,[]);names.get(p.name).push(p);}
 for(const person of incoming.students){
  const own=newRows.get(person.id)||[],sameName=names.get(person.name)||[],sourceMatch=person.sourceId?current.students.find(p=>p.sourceId===person.sourceId):null;
  if(sourceMatch&&!compatible(oldRows.get(sourceMatch.id)||[],own))throw new Error('同一学生识别码的考次与班级不一致，请核对本次补充表。');
  const candidates=sameName.filter(p=>(!person.sourceId||!p.sourceId||p.sourceId===person.sourceId)&&compatible(oldRows.get(p.id)||[],own));
  const exact=candidates.filter(p=>own.some(r=>(oldRows.get(p.id)||[]).some(s=>s.exam===r.exam&&Number(s.classNo)===Number(r.classNo))));
  const sameClass=candidates.filter(p=>own.some(r=>(oldRows.get(p.id)||[]).some(s=>Number(s.classNo)===Number(r.classNo))));
  const match=sourceMatch||(exact.length===1?exact[0]:sameClass.length===1?sameClass[0]:candidates.length===1&&sameName.length===1?candidates[0]:null);
  let sid=match?.id||person.id;
  if(!match&&occupied.has(sid)){let suffix=0;do{sid=identityHash(person.id+'|'+own.map(r=>r.exam+':'+r.classNo).sort().join(',')+'|'+(++suffix));}while(occupied.has(sid));}
  remap.set(person.id,sid);
  if(match){if(person.sourceId)match.sourceId=person.sourceId;if(sourceMatch&&person.name){const oldName=match.name;match.name=person.name;if(oldName!==person.name){names.set(oldName,(names.get(oldName)||[]).filter(p=>p!==match));if(!names.has(person.name))names.set(person.name,[]);names.get(person.name).push(match);}}}
  else{const added={...person,id:sid};current.students.push(added);occupied.add(sid);if(!names.has(person.name))names.set(person.name,[]);names.get(person.name).push(added);}
  oldRows.set(sid,[...(oldRows.get(sid)||[]),...own.map(r=>({...r,sid}))]);
 }
 return remap;
}
