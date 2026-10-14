export function sectionGroup(section) {
  const title=section.title||'';
  if(/统计口径|材料说明|需补齐/.test(title))return '材料与口径';
  if(/概况|计划说明/.test(title))return '关键概况';
  if(/攻坚|突破|评估|短板|薄弱|训练优先|优先训练/.test(title))return '教学重点';
  if(/跟进|实施|复核|执行日程/.test(title))return '行动安排';
  return '完整证据';
}
export function metricSection(section) {
  return sectionGroup(section)==='关键概况'&&section.headers?.length>=2&&section.headers.length<=3&&section.rows?.length>0;
}
export function importantCell(section,row,column,report) {
  const header=section.headers[column]||'',text=String(row[column]??'—');
  const value=/^[+-]?\d+(?:\.\d+)?$/.test(text)?Number(text):null;
  const critical=/距.*线|.*距线/.test(header)&&value!==null&&value<0&&value>=-(report.spec?.band||20);
  return {bold:critical||/^(学生|姓名)|排名|校排|班排|总分|得分率/.test(header),critical};
}
export function compactMeta(report) {
  return (report.meta||[]).filter(([key,value])=>!['学校','分析考试','研究对象'].includes(key)||!String(report.subtitle||'').includes(String(value)));
}
