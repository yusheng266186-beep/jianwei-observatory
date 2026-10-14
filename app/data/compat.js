import {repairSourceRanks} from './rank-repair.js?v=runtime-v45';
import {repairStudentIdentities} from './identity.js?v=runtime-v45';
// Workbook exchange format only. Research queries live in engine/atlas.js.
export const SUBJECTS = ['语文','数学','英语','日语','物理','历史','化学','生物','政治','地理'];
export const EXAM_ORDER = ['入口','1册','21','2册','33','3册','41','4半','4月','43','4册','51','52'];
export const EXAM_NAMES = {'入口':'入口成绩','1册':'高一上期末','21':'高一下阶段考试','2册':'高一下期末','33':'高二上阶段考试','3册':'高二上期末','41':'高二下第一次月考','4半':'高二下半期考试','4月':'高二下阶段考试','43':'高二下第二次月考','4册':'高二下零诊','51':'高三第一次月考','52':'高三第二次月考'};
export const finite = value => typeof value === 'number' && Number.isFinite(value);
export const classDefaults = no => ({no:Number(no),track:no<=9||Number(no)===17?'physics':'history',cohort:no>=17?'repeat':'regular',type:no>=17?'补习班':Number(no)===1?'华英班':[2,10].includes(Number(no))?'直播班':Number(no)===7?'日语平行班':Number(no)===15?'体育班':Number(no)===16?'美术班':'平行班',combination:no>=17?'按学生实际选科':Number(no)===9?'物化地':no<=9?'物化生':'历政地',foreignLanguage:Number(no)===7?'日语':'英语',lead:'',teachers:{},targets:{top:null,under:null}});
export function normalizeDataset(data) {
  data.schemaVersion=1;
  for(const key of ['students','scores','answers','lines','exams','sheets']) data[key] ||= [];
  data.profiles ||= {}; data.banks ||= {};
  repairStudentIdentities(data);
  data.scores=[...new Map(data.scores.map(r=>[`${r.exam}|${r.classNo}|${r.sid}`,r])).values()];
  data.answers=[...new Map(data.answers.map(r=>[`${r.exam}|${r.classNo}|${r.sid}|${r.subject}`,r])).values()];
  data.exams.sort((a,b)=>(a.order??99)-(b.order??99)||String(a.id).localeCompare(String(b.id),'zh',{numeric:true}));
  for(const no of new Set(data.scores.map(r=>r.classNo))) data.profiles[no]={...classDefaults(no),...data.profiles[no]};
  return repairSourceRanks(data);
}
