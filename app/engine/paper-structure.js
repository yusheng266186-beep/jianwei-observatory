// A score column can represent several question numbers. Preserve its actual
// measurement: a combined score cannot be divided into invented scores.
export function questionNumbers(label) {
  const text=String(label??'').normalize('NFKC').trim().replace(/^第\s*/,'').replace(/\s*题$/,'').replace(/\s/g,'');
  const range=text.match(/^(\d+)[—–－~～-](\d+)$/);
  if(range){const start=Number(range[1]),end=Number(range[2]);return start>0&&end>=start&&end-start<200?Array.from({length:end-start+1},(_,i)=>start+i):[];}
  if(/^\d+(?:[,，、]\d+)+$/.test(text))return [...new Set(text.split(/[,，、]/).map(Number))].filter(n=>n>0);
  const part=text.match(/^(\d+)(?:[.．]\d+|\(\d+\))*$/);
  return part&&Number(part[1])>0?[Number(part[1])]:[];
}
export function paperStructure(questions) {
  const entries=questions.map(q=>({question:q,numbers:questionNumbers(q.label)}));
  const numbers=[...new Set(entries.flatMap(entry=>entry.numbers))].sort((a,b)=>a-b);
  return {entries,numbers,numberCount:entries.length&&entries.every(e=>e.numbers.length)?numbers.length:null,scoreCount:questions.length,combined:entries.filter(e=>e.numbers.length>1)};
}
export function paperCountLabel(questions) {
  const structure=paperStructure(questions);
  return structure.numberCount!==null&&structure.numberCount!==structure.scoreCount?structure.numberCount+' 个题号 · '+structure.scoreCount+' 个得分项':structure.scoreCount+' 个得分项';
}
export function paperMapLayout(count,width) {
  width=Math.max(1,Number(width)||760);
  const capacity=Math.max(1,Math.floor((width+8)/88));
  const rows=Math.max(1,Math.ceil(count/capacity));
  const columns=Math.max(1,Math.ceil(count/rows));
  const cellWidth=(width-(columns-1)*8)/columns,height=Math.ceil(count/columns)*116;
  return {width,columns,cellWidth,height:Math.max(116,height),position:index=>({x:(index%columns)*(cellWidth+8),y:Math.floor(index/columns)*116})};
}
