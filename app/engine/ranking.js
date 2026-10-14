// A number without a declared scope is never a school/grade rank.
export const validRank = value => Number.isInteger(value) && value > 0;
// Older standard-workbook imports used fixed offsets, without retaining the
// column heading. Preserve their numbers, but do not certify their scope.
export const legacyRanks = record => Boolean(record?.sourceRow&&record.rankProvenance!=='column-headings-v1');
export function schoolRank(record) {
  return !legacyRanks(record)&&(!record?.sourceRow||record.rankSources?.schoolRank)&&validRank(record?.schoolRank)?record.schoolRank:null;
}
export function rankScope(label='') {
  const text=String(label).replace(/[\s（）()\n]/g,'');
  if (/班(?:级)?(?:排|名)|班内/.test(text)) return 'classRank';
  if (/年级|校(?:内)?(?:排|名)|学校排名|学校名次/.test(text)) return 'schoolRank';
  if (/市(?:级|内)?(?:排|名)|全市|全省|省(?:排|名)/.test(text)) return 'cityRank';
  return null;
}
export function rankColumns(rows,start,end) {
  const result={};
  for(let column=start;column<=end;column++) {
    const labels=rows.map(row=>String(row[column]??'').trim()).filter(Boolean);
    const label=labels.slice().reverse().find(value=>rankScope(value));
    const scope=rankScope(label);
    if(scope&&!Object.hasOwn(result,scope))result[scope]={column,label};
  }
  return result;
}
export function ranksFrom(row,columns) {
  const result={schoolRank:null,classRank:null,cityRank:null,rankSources:{},rankProvenance:'column-headings-v1'};
  for(const [scope,{column,label}] of Object.entries(columns)) {
    const value=row[column]==null||String(row[column]).trim()===''?null:Number(row[column]);
    result[scope]=validRank(value)?value:null;
    result.rankSources[scope]=label;
  }
  return result;
}
export function rankDescription(record,{legacy=legacyRanks(record)}={}) {
  if(!record)return '未提供';
  const parts=[['schoolRank','校排'],['classRank','班排'],['cityRank','市排']]
    .filter(([key])=>validRank(record[key])).map(([key,label])=>legacy||record.sourceRow&&!record.rankSources?.[key]?'旧导入 '+record[key]+'（范围待核实）':label+' '+record[key]);
  if(!parts.length&&validRank(record.rank))parts.push('原表 '+record.rank+'（范围未注明）');
  return parts.join('\n')||'未提供';
}
export function qualifyHistoricalRankings(report) {
  if(!['class','subject','student'].includes(report.kind)||report.rankingVersion==='source-scopes-v1')return report;
  const label=value=>typeof value==='string'?value.replace(/年级排名/g,'历史排名（待核实）'):value;
  let changed=false;
  const sections=(report.sections||[]).map(section=>{
    const pending=(section.headers||[]).some(h=>h.includes('年级排名'))||(section.rows||[]).some(row=>String(row[0]||'').includes('年级排名'));
    if(!pending)return section;changed=true;
    return {...section,headers:(section.headers||[]).map(label),rows:(section.rows||[]).map(row=>row.map((value,index)=>index===0?label(value):value)),caption:[section.caption,'这是旧版保存的报告，排名范围尚未核验；可从当前材料重新生成。原快照数值保留。'].filter(Boolean).join(' ')};
  });
  if(!changed)return report;
  const sheets=report.sheets?Object.fromEntries(Object.entries(report.sheets).map(([name,rows])=>[name,rows.map((row,index)=>row.map((value,column)=>index===0||column===0?label(value):value))])):undefined;
  return {...report,sections,...(sheets?{sheets}:{})};
}
