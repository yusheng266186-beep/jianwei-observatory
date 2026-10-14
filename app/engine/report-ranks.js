// Fill missing class ranks only when the saved score still matches its source.
// Scores, supplied ranks, dates and teacher notes remain snapshot values.
export function fillSavedClassRanks(report,atlas){
 if(report?.kind!=='student'||!report.spec?.sid)return report;
 const current=atlas.materialAt(report.spec.sid,report.spec.exam),story=atlas.materialStory(report.spec.sid),empty=value=>value==null||value===''||value==='—';
 const sameTotal=(value,row)=>value!==null&&value!==''&&value!=='—'&&row&&Number(value)===row.total;
 let changed=false;
 const sections=(report.sections||[]).map(section=>{
  const originalRows=section.rows||[];let rows=originalRows;
  if(section.title==='本场学习概况'&&sameTotal(rows.find(row=>row[0]==='本场总分')?.[1],current))rows=rows.map(row=>{
   const rank=atlas.classRank(current);if(row[0]!=='班级排名'||!empty(row[1])||rank===null)return row;
   changed=true;return [row[0],'第'+rank+'名',...row.slice(2)];
  });
  if(section.title==='阶段成绩变化'){
   const headers=section.headers||[],rankIndex=headers.indexOf('班级排名'),totalIndex=headers.indexOf('总分'),examIndex=headers.indexOf('考试'),classIndex=headers.indexOf('班级');
   if(rankIndex>=0&&totalIndex>=0&&examIndex>=0&&classIndex>=0)rows=rows.map(row=>{
    if(!empty(row[rankIndex]))return row;
    const matches=story.filter(record=>atlas.exam(record.exam).label===row[examIndex]&&record.classNo===Number(String(row[classIndex]).replace(/班$/,''))&&sameTotal(row[totalIndex],record));
    if(matches.length!==1)return row;const rank=atlas.classRank(matches[0]);if(rank===null)return row;
    changed=true;return row.map((value,i)=>i===rankIndex?rank:value);
   });
  }
  const filled=rows.some((row,index)=>row!==originalRows[index]);return filled?{...section,rows,caption:section.title==='阶段成绩变化'?(section.caption||'')+' 班级排名优先采用原表名次；未提供时按本场同班有效总分排序，同分并列。':section.caption}:section;
 });
 return changed?{...report,sections,sheets:Object.fromEntries(sections.map((section,i)=>[(i+1)+'-'+section.title,[section.headers||[],...(section.rows||[])]]))}:report;
}
