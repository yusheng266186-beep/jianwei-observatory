// Shared merge policy for imported score/answer records.
// - A blank value never erases an existing measurement; a real 0 does.
// - Rows that merely repeat or complement the same identity are merged.
// - Rows that disagree on the same measured field are reported (or rejected
//   during import) instead of silently keeping whichever row came last.
// - Rank invalidation follows the recorded rank source: raw-score changes
//   only clear ranks sourced from raw scores; new explicit ranks stay.
const finiteValue = value => typeof value === 'number' && Number.isFinite(value);
const text = value => String(value ?? '').trim();
export const validRank = value => Number.isInteger(value) && value > 0;

export function supplement(previous = {}, incoming = {}) {
  const result = {...previous};
  for (const [key, value] of Object.entries(incoming)) {
    if (value == null || value === '' || typeof value === 'number' && !Number.isFinite(value)) continue;
    result[key] = typeof value === 'object' && !Array.isArray(value) ? supplement(previous[key], value) : value;
  }
  return result;
}

const RANK_FIELDS = [['rank', null], ['schoolRank', 'schoolRank'], ['classRank', 'classRank'], ['cityRank', 'cityRank']];
const FIELD_LABELS = {total: '总分', rawTotal: '原始总分', track: '科类', language: '语种', score: '赋分', raw: '原分', rank: '排名', schoolRank: '校排', classRank: '班排', cityRank: '市排'};
const provenanceScore = value => value === 'column-headings-v2' ? 3 : value === 'column-headings-v1' ? 2 : value === 'source-audit-v2' ? 1 : 0;
const bestProvenance = (a, b) => provenanceScore(a) >= provenanceScore(b) ? a : b;
const display = value => finiteValue(value) ? String(value) : '—';

// Rank labels such as 原分校排名 / 赋分校排名 / 校原名 describe the score basis.
// "原表..." means the original worksheet, not an original-score rank.
export function rankKind(label = '') {
  const value = text(label).replace(/\s/g, '');
  if (/原(?:始)?分|原名/.test(value)) return 'raw';
  if (/赋(?:分)?|赋名/.test(value)) return 'assigned';
  return 'unknown';
}

function invalidated(kind, changes) {
  if (changes.assigned && changes.raw) return true;
  if (kind === 'raw') return changes.raw;
  if (kind === 'assigned') return changes.assigned;
  // An unlabelled/legacy rank cannot prove which score basis it used. When the
  // score moves, clear it rather than keep a possibly stale position.
  return changes.assigned || changes.raw;
}

function invalidateRanks(target, incoming, changes) {
  if(changes.assigned||changes.raw)target.rankAuditInvalidated=true;
  for (const [key, scope] of RANK_FIELDS) {
    if (validRank(incoming?.[key])) continue;
    const label = scope ? target?.rankSources?.[scope] : '';
    if (!invalidated(scope ? rankKind(label) : 'unknown', changes)) continue;
    target[key] = null;
    if (scope && target.rankSources) delete target.rankSources[scope];
  }
}

function changed(previous, incoming) {
  return finiteValue(previous) && finiteValue(incoming) && previous !== incoming;
}

// Merge an explicitly newer material into an existing record. Non-blank values
// (including 0) update; blanks supplement. Stale ranks are cleared only when
// their recorded basis changed and the new material supplied no replacement.
export function mergeScoreRecord(previous, incoming) {
  if (!previous) return structuredClone(incoming);
  const result = supplement(structuredClone(previous), incoming);
  result.rankProvenance = bestProvenance(previous.rankProvenance, incoming.rankProvenance);
  invalidateRanks(result, incoming, {assigned: changed(previous.total, incoming.total), raw: changed(previous.rawTotal, incoming.rawTotal)});
  result.subjects = {...(result.subjects || {})};
  for (const [subject, record] of Object.entries(incoming.subjects || {})) {
    const old = previous.subjects?.[subject];
    if (!old) continue;
    const merged = supplement(old, record);
    merged.rankProvenance = bestProvenance(old.rankProvenance, record.rankProvenance);
    invalidateRanks(merged, record, {assigned: changed(old.score, record.score), raw: changed(old.raw, record.raw)});
    result.subjects[subject] = merged;
  }
  return result;
}

function conflictKey(kind, record, subject, field) {
  return [kind, record?.exam ?? '', record?.classNo ?? '', record?.sid ?? '', subject || '', field].join('|');
}

function conflict(kind, record, subject, field, previous, incoming) {
  return {key: conflictKey(kind, record, subject, field), kind, exam: record?.exam ?? '', classNo: record?.classNo ?? null, sid: record?.sid ?? '', subject: subject || '', field, previous, incoming};
}

export function conflictMessage(conflicts, context = '') {
  const detail = conflicts.slice(0, 4).map(item => `${item.subject || ''}${FIELD_LABELS[item.field] || item.field}：${display(item.previous)} / ${display(item.incoming)}`).join('；');
  const more = conflicts.length > 4 ? `；另 ${conflicts.length - 4} 处` : '';
  return `${context ? context + ' ' : ''}存在不同有效值的重复行（${detail}${more}）。同一学生同一考次不能同时保留两个值，请补充学生识别码或整理重复行后重试。`;
}

function resolveRank(previous, incoming, result, key, scope, subject, conflicts, onConflict) {
  const before = previous?.[key];
  const after = incoming?.[key];
  if (!validRank(before) || !validRank(after) || before === after) return;
  const sourceBefore = scope ? previous?.rankSources?.[scope] : null;
  const sourceAfter = scope ? incoming?.rankSources?.[scope] : null;
  // A sourced rank is more informative than an unlabelled legacy position.
  if (Boolean(sourceBefore) !== Boolean(sourceAfter)) {
    if (sourceBefore) {
      result[key] = before;
      if (scope && result.rankSources) result.rankSources[scope] = sourceBefore;
    } else {
      result[key] = after;
      if (scope && result.rankSources) result.rankSources[scope] = sourceAfter;
    }
    return;
  }
  conflicts.push(conflict('score', previous, subject, key, before, after));
  if (onConflict === 'throw') return;
  result[key] = before;
  if (scope && result.rankSources) {
    if (sourceBefore) result.rankSources[scope] = sourceBefore;
    else delete result.rankSources[scope];
  }
}

// Duplicate rows inside one import are ambiguous. Identical/complementary
// rows merge; a genuine disagreement throws with field-level detail. During
// normalization (legacy workspaces) the first value is kept and the conflict is
// exposed in data.mergeConflicts instead of failing the whole workspace.
export function mergeDuplicateScore(previous, incoming, {onConflict = 'throw', context = ''} = {}) {
  if (!previous) return {record: structuredClone(incoming), conflicts: []};
  incoming=structuredClone(incoming);
  const conflicts = [];
  for (const field of ['total', 'rawTotal']) {
    if (changed(previous[field], incoming[field])) {
      conflicts.push(conflict('score', previous, '', field, previous[field], incoming[field]));
      if (onConflict !== 'throw') incoming = {...incoming, [field]: previous[field]};
    }
  }
  for (const field of ['track', 'language']) {
    if (text(previous[field]) && text(incoming[field]) && previous[field] !== incoming[field]) {
      conflicts.push(conflict('score', previous, '', field, previous[field], incoming[field]));
      if (onConflict !== 'throw') incoming = {...incoming, [field]: previous[field]};
    }
  }
  const result = supplement(structuredClone(previous), incoming);
  result.rankProvenance = bestProvenance(previous.rankProvenance, incoming.rankProvenance);
  for (const [key, scope] of RANK_FIELDS) resolveRank(previous, incoming, result, key, scope, '', conflicts, onConflict);
  result.subjects = {...(previous.subjects || {})};
  for (const [subject, record] of Object.entries(incoming.subjects || {})) {
    const old = previous.subjects?.[subject];
    if (!old) { result.subjects[subject] = structuredClone(record); continue; }
    for (const field of ['score', 'raw']) {
      if (changed(old[field], record[field])) {
        conflicts.push(conflict('score', previous, subject, field, old[field], record[field]));
        if (onConflict !== 'throw') record[field] = old[field];
      }
    }
    const merged = supplement(old, record);
    merged.rankProvenance = bestProvenance(old.rankProvenance, record.rankProvenance);
    for (const [key, scope] of RANK_FIELDS) resolveRank(old, record, merged, key, scope, subject, conflicts, onConflict);
    result.subjects[subject] = merged;
  }
  if (conflicts.length && onConflict === 'throw') throw new Error(conflictMessage(conflicts, context));
  return {record: result, conflicts};
}

export function mergeDuplicateScores(records, options = {onConflict: 'collect'}) {
  const map = new Map(), conflicts = [], reviews=[];
  for (const record of records) {
    const key = `${record.exam}|${record.classNo}|${record.sid}`;
    if (!map.has(key)) { map.set(key, record); continue; }
    const previous=map.get(key),merged = mergeDuplicateScore(previous, record, options);
    if(merged.conflicts.length)reviews.push({kind:'score',previous:structuredClone(previous),incoming:structuredClone(record),conflicts:merged.conflicts});
    map.set(key, merged.record);
    conflicts.push(...merged.conflicts);
  }
  return {records: [...map.values()], conflicts, reviews, mergedCount: records.length - map.size};
}

export function mergeDuplicateAnswer(previous, incoming, {onConflict = 'throw', context = ''} = {}) {
  if (!previous) return {record: structuredClone(incoming), conflicts: []};
  const conflicts = [];
  if (text(previous.track) && text(incoming.track) && previous.track !== incoming.track) {
    conflicts.push(conflict('answer', previous, previous.subject || '', 'track', previous.track, incoming.track));
    if (onConflict !== 'throw') incoming = {...incoming, track: previous.track};
  }
  const before = previous.values || [], after = incoming.values || [], values = [];
  for (let index = 0; index < Math.max(before.length, after.length); index++) {
    const a = before[index], b = after[index];
    if (finiteValue(a) && finiteValue(b) && a !== b) {
      conflicts.push(conflict('answer', previous, previous.subject || '', 'values.' + index, a, b));
      values[index] = onConflict === 'throw' ? b : a;
    } else values[index] = finiteValue(b) ? b : finiteValue(a) ? a : null;
  }
  const result = {...supplement(previous, incoming), values};
  if (conflicts.length && onConflict === 'throw') throw new Error(conflictMessage(conflicts, context));
  return {record: result, conflicts};
}

export function mergeDuplicateAnswers(records, options = {onConflict: 'collect'}) {
  const map = new Map(), conflicts = [], reviews=[];
  for (const record of records) {
    const key = `${record.exam}|${record.classNo}|${record.sid}|${record.subject}`;
    if (!map.has(key)) { map.set(key, record); continue; }
    const previous=map.get(key),merged = mergeDuplicateAnswer(previous, record, options);
    if(merged.conflicts.length)reviews.push({kind:'answer',previous:structuredClone(previous),incoming:structuredClone(record),conflicts:merged.conflicts});
    map.set(key, merged.record);
    conflicts.push(...merged.conflicts);
  }
  return {records: [...map.values()], conflicts, reviews, mergedCount: records.length - map.size};
}

export function supplementAnswerValues(previous = [], incoming = []) {
  return Array.from({length: Math.max(previous.length, incoming.length)}, (_, index) => finiteValue(incoming[index]) ? incoming[index] : finiteValue(previous[index]) ? previous[index] : null);
}
