// Missing-label markers describe coverage, not a teaching topic.
export function knowledgeLabels(value){
 return [...new Set(String(value??'').split(/[,，;；]/).map(label=>label.trim()).filter(label=>label&&!/^[-—–]+$|^(?:知识点)?未标注$/.test(label)))];
}
// Repair generated wording in saved formal reports without changing marks or notes.
export function repairKnowledgeReport(report){
 if(!report?.spec||!['class','subject','student'].includes(report.kind))return report;
 let changed=false;
 const advice=value=>typeof value!=='string'?value:value.replace(/围绕(.+?)(组织分层训练。|练习与复核)/g,(text,names,action)=>{
  const labels=names.split('、').flatMap(knowledgeLabels),clean=[...new Set(labels)].join('、');if(clean===names)return text;changed=true;
  return clean?'围绕'+clean+action:'定位对应原题，完成订正、同类练习与复核。';
 });
 const sections=(report.sections||[]).map(section=>{
  let rows=section.rows||[];
  if(section.title==='知识点训练优先级'){const next=rows.filter(row=>knowledgeLabels(row[1]).length);if(next.length!==rows.length){changed=true;rows=next;}}
  if(['各学科评估与建议','学科短板与改进方向'].includes(section.title)){const index=section.headers.findIndex(h=>h==='教学建议'||h==='建议');if(index>=0)rows=rows.map(row=>row.map((value,i)=>i===index?advice(value):value));}
  if(section.title==='学科概况')rows=rows.map(row=>row[0]==='教学建议'?row.map((value,i)=>i===1?advice(value):value):row);
  return rows===section.rows?section:{...section,rows};
 });
 return changed?{...report,sections,sheets:Object.fromEntries(sections.map((s,i)=>[(i+1)+'-'+s.title,[s.headers,...s.rows]]))}:report;
}
