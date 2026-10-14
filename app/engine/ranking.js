// A number without a declared scope is never a school/grade rank.
export const validRank = value => Number.isInteger(value) && value > 0;
export const explicitRanks = record => ['column-headings-v1','column-headings-v2'].includes(record?.rankProvenance);
// Older standard-workbook imports used fixed offsets, without retaining the
// column heading. Preserve their numbers, but do not certify their scope.
export const legacyRanks = record => Boolean(record?.sourceRow&&!explicitRanks(record)&&record.rankProvenance!=='source-audit-v2');
export function schoolRank(record) {
  return !legacyRanks(record)&&(!record?.sourceRow||record.rankSources?.schoolRank)&&validRank(record?.schoolRank)?record.schoolRank:null;
}
export function rankScope(label='') {
  const text=String(label).replace(/[\s（）()\n]/g,'');
  if (/班(?:级)?(?:赋|原)?(?:排|名)|班内/.test(text)) return 'classRank';
  if (/年级|校(?:内)?(?:赋|原)?(?:排|名)|学校排名|学校名次/.test(text)) return 'schoolRank';
  if (/市(?:级|内)?(?:赋|原)?(?:排|名)|全市|全省|省(?:排|名)/.test(text)) return 'cityRank';
  return null;
}
export function rankColumns(rows,start,end) {
  const result={};
  for(let column=start;column<=end;column++) {
    const labels=rows.map(row=>String(row[column]??'').trim()).filter(Boolean);
    const label=labels.slice().reverse().find(value=>rankScope(value));
    const scope=rankScope(label);
    const preference=value=>/赋/.test(value)?3:/原/.test(value)?1:2;
    if(scope&&(!result[scope]||preference(label)>preference(result[scope].label)))result[scope]={column,label};
  }
  return result;
}
export function ranksFrom(row,columns,{provenance='column-headings-v1'}={}) {
  const result={schoolRank:null,classRank:null,cityRank:null,rankSources:{},rankProvenance:provenance};
  for(const [scope,{column,label}] of Object.entries(columns)) {
    const value=row[column]==null||String(row[column]).trim()===''?null:Number(row[column]);
    result[scope]=validRank(value)?value:null;
    result.rankSources[scope]=label;
  }
  return result;
}
export function rankDescription(record,{legacy=legacyRanks(record)}={}) {
  if(!record)return '—';
  const parts=[['schoolRank','校排'],['classRank','班排'],['cityRank','市排']]
    .filter(([key])=>validRank(record[key])&&!legacy&&(!record.sourceRow||record.rankSources?.[key])).map(([key,label])=>label+' '+record[key]);
  return parts.join('\n')||'—';
}
export function qualifyHistoricalRankings(report) {
  if(!['class','subject','student'].includes(report.kind)||report.rankingVersion==='source-scopes-v2')return report;
  const label=value=>typeof value==='string'?value.replace(/年级排名(?:（原表校排）)?/g,'校内排名'):value;
  let changed=false;
  const sections=(report.sections||[]).map(section=>{
    const pending=(section.headers||[]).some(h=>h.includes('年级排名'))||(section.rows||[]).some(row=>String(row[0]||'').includes('年级排名'));
    if(!pending)return section;changed=true;
    // A snapshot without a source-scoped rank cannot certify its numeric value.
    const rankColumns=(section.headers||[]).flatMap((h,i)=>h.includes('年级排名')?[i]:[]);
    return {...section,headers:(section.headers||[]).map(label),rows:(section.rows||[]).map(row=>row.map((value,index)=>rankColumns.includes(index)||index===1&&String(row[0]).includes('年级排名')?'—':index===0?label(value):value)),caption:section.caption||''};
  });
  if(!changed)return report;
  const sheets=report.sheets?Object.fromEntries(sections.map((s,i)=>[(i+1)+'-'+s.title,[s.headers,...s.rows]])):undefined;
  return {...report,sections,...(sheets?{sheets}:{})};
}
