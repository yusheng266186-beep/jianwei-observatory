import {effectiveRows, answerRows, scoreRows, subjectRows} from '../io/exports.js?v=runtime-v45';

// The four-sheet package is generated for the exam currently selected on the
// overview (or the explicit target of the materials screen), not silently for
// the latest imported exam. The comparison must be a different imported exam.
export function fourSheetSelection(atlas, {exam, comparison} = {}) {
  const exams = Array.isArray(atlas?.exams) ? atlas.exams : [];
  const requested = exam == null ? '' : String(exam);
  const selected = exams.some(item => item.id === requested) ? requested : (atlas?.latest || exams.at(-1)?.id || '');
  const index = exams.findIndex(item => item.id === selected);
  const previous = index > 0 ? exams[index - 1].id : '';
  const candidate = comparison == null ? '' : String(comparison);
  const compared = candidate && candidate !== selected && exams.some(item => item.id === candidate) ? candidate : previous;
  return {
    exam: selected,
    comparison: compared,
    examLabel: atlas?.exam?.(selected)?.label || selected,
    comparisonLabel: compared ? atlas?.exam?.(compared)?.label || compared : ''
  };
}

const safeName = value => String(value ?? '').replace(/[\\/:*?"<>|\s]+/g, '-').replace(/^-+|-+$/g, '');
export function fourSheetFilename(site, scope) {
  const label = [scope.exam, scope.examLabel].filter((value, index, list) => value && list.indexOf(value) === index).map(safeName).filter(Boolean).join('-');
  return `${site}-四表分析包-${label}${scope.comparison ? '-对照' + safeName(scope.comparison) : ''}`;
}

export function fourSheetBundle(atlas, options = {}) {
  const scope = fourSheetSelection(atlas, options);
  const multi = [['班级', '姓名', ...atlas.exams.map(exam => exam.label)]];
  for (const no of atlas.classes) {
    for (const sid of new Set(atlas.data.scores.filter(row => row.classNo === no).map(row => row.sid))) {
      multi.push([no, atlas.name(sid), ...atlas.exams.map(exam => atlas.classAt(no, exam.id).find(row => row.sid === sid)?.total ?? null)]);
    }
  }
  const banks = [['学科', '考试', '题序', '题号', '满分', '知识点'], ...atlas.papers().flatMap(paper => paper.questions.map((question, index) => [paper.subject, paper.exam, index + 1, question.label, question.max, question.knowledge]))];
  return {
    scope,
    sheets: {
      '导出范围': [['项目', '内容'],
        ['当前考次', scope.exam + ' · ' + scope.examLabel],
        ['对照考次', scope.comparison ? scope.comparison + ' · ' + scope.comparisonLabel : '无（当前考次为最早一次或未选择）'],
        ['单次成绩', '班级有效人、班级成绩分析单次、学科有效与双上线按当前考次'],
        ['多次对比', '已导入 ' + atlas.exams.length + ' 次考试'],
        ['个人小题', '保留工作区内全部小题记录'],
        ['题目目录', atlas.papers().length + ' 张试卷']],
      '班级有效人': effectiveRows(atlas, scope.exam, scope.comparison),
      '个人学科小题得分': answerRows(atlas, atlas.data.answers),
      '班级多次考试对比': multi,
      '班级成绩分析单次': scoreRows(atlas, atlas.rows(scope.exam)),
      '学科有效与双上线': subjectRows(atlas, scope.exam),
      '题目目录': banks
    }
  };
}
