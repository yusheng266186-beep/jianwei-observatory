// Pure merge strategies for workspace data shared by several tabs.
// These functions never touch storage or the DOM. A record is merged field by
// field against its last saved baseline; when two tabs changed the same field
// differently, the remote value stays at the original id and the local value is
// preserved as a conflict copy with a new id.
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const own = (value, key) => value != null && Object.hasOwn(value, key);
const rows = value => Array.isArray(value) ? value.filter(row => row && typeof row.id === 'string') : [];
const clone = value => value === undefined ? undefined : structuredClone(value);

function mergeFields(base, local, remote) {
  const result = {id: local.id};
  let conflict = false;
  const keys = new Set([...Object.keys(base || {}), ...Object.keys(local || {}), ...Object.keys(remote || {})]);
  keys.delete('id');
  for (const key of keys) {
    const before = base?.[key], localValue = local?.[key], remoteValue = remote?.[key];
    const hasBefore = own(base, key), hasLocal = own(local, key), hasRemote = own(remote, key);
    if (same(localValue, remoteValue)) {
      if (hasLocal) result[key] = clone(localValue);
      else if (hasRemote) result[key] = clone(remoteValue);
      continue;
    }
    const localUnchanged = hasLocal === hasBefore && same(localValue, before);
    const remoteUnchanged = hasRemote === hasBefore && same(remoteValue, before);
    if (localUnchanged) {
      if (hasRemote) result[key] = clone(remoteValue);
      continue;
    }
    if (remoteUnchanged) {
      if (hasLocal) result[key] = clone(localValue);
      continue;
    }
    conflict = true;
  }
  return {record: result, conflict};
}

function syncRecord(target, source) {
  for (const key of Object.keys(target)) if (!own(source, key)) delete target[key];
  for (const [key, value] of Object.entries(source)) if (!same(target[key], value)) target[key] = clone(value);
}

export function mergeRecordsById(base, local, latest, {newId = () => crypto.randomUUID(), now = () => Date.now(), conflictTag = 'conflictOf'} = {}) {
  const before = new Map(rows(base).map(row => [row.id, row]));
  const mine = new Map(rows(local).map(row => [row.id, row]));
  const saved = new Map(rows(latest).map(row => [row.id, row]));
  const result = [], conflicts = [], remaps = [], seen = new Set();
  const copy = (row, kind) => {
    const value = clone(row);
    value.id = newId();
    value[conflictTag] = row.id;
    value.conflictAt = now();
    conflicts.push({id: row.id, copyId: value.id, kind});
    remaps.push([row.id, value.id]);
    return value;
  };

  for (const remote of rows(latest)) {
    if (seen.has(remote.id)) continue;
    seen.add(remote.id);
    const beforeRow = before.get(remote.id), localRow = mine.get(remote.id);
    if (!localRow) {
      if (!beforeRow) { result.push(clone(remote)); continue; }
      if (same(beforeRow, remote)) continue; // local deletion wins; remote did not change.
      result.push(clone(remote));
      conflicts.push({id: remote.id, kind: 'local-delete'});
      continue;
    }
    if (!beforeRow) {
      if (same(localRow, remote)) { result.push(clone(remote)); continue; }
      result.push(clone(remote));
      result.push(copy(localRow, 'same-id'));
      continue;
    }
    const merged = mergeFields(beforeRow, localRow, remote);
    if (!merged.conflict) { result.push(merged.record); continue; }
    result.push(clone(remote));
    result.push(copy(localRow, 'field'));
  }

  for (const localRow of rows(local)) {
    if (seen.has(localRow.id) || saved.has(localRow.id)) continue;
    seen.add(localRow.id);
    const beforeRow = before.get(localRow.id);
    if (!beforeRow) { result.push(clone(localRow)); continue; }
    if (same(beforeRow, localRow)) continue; // remote deletion wins; local did not change.
    result.push(copy(localRow, 'remote-delete'));
  }
  return {records: result, conflicts, remaps};
}

// Keep object identity for rows that did not change while the transaction was
// pending. New edits stay in the live array and are checked against the newly
// saved baseline on the next save.
export function settleRecordsById(live, snapshot, saved) {
  const before = new Map(rows(snapshot).map(row => [row.id, row]));
  const stored = new Map(rows(saved).map(row => [row.id, row]));
  const liveRows = rows(live), result = [], seen = new Set();
  for (const row of liveRows) {
    const captured = before.get(row.id);
    if (!captured) { result.push(row); seen.add(row.id); continue; }
    if (same(row, captured)) {
      const next = stored.get(row.id);
      if (!next) continue; // deleted remotely while an unchanged row was saved.
      syncRecord(row, next);
    }
    result.push(row);
    seen.add(row.id);
  }
  const deleted = new Set(rows(snapshot).filter(row => !liveRows.some(item => item.id === row.id)).map(row => row.id));
  for (const row of rows(saved)) {
    if (seen.has(row.id) || deleted.has(row.id)) continue;
    result.push(clone(row));
    seen.add(row.id);
  }
  return result;
}

export const mergeNotebook = (base, local, latest, options) => mergeRecordsById(base, local, latest, options);
export const mergePlans = (base, local, latest, options) => mergeRecordsById(base, local, latest, {conflictTag: 'conflictOf', ...options});
export const settleNotebook = settleRecordsById;
export const settlePlans = settleRecordsById;

// Restoring a workspace backup must never replace a newer local judgment or
// plan with an older copy under the same id. Local rows win; backup-only rows
// are added. The second pass against current storage protects other tabs.
function keepLocal(local, incoming) {
  const result = rows(local).map(row => clone(row)), byId = new Map(result.map(row => [row.id, row]));
  let added = 0, kept = 0;
  for (const source of rows(incoming)) {
    const current = byId.get(source.id);
    if (current) { if (!same(current, source)) kept++; continue; }
    const row = clone(source);
    result.push(row); byId.set(row.id, row); added++;
  }
  return {records: result, added, kept};
}
export const mergeNotebookRestore = keepLocal;
export const mergePlansRestore = keepLocal;

// Exercise records carry a document/approval unit and practice feedback.
// Existing local records always stay authoritative; a differing backup record
// that still carries a sheet is preserved as an imported copy (approval kept),
// so a stale JSON backup cannot erase a newer sheet, review or feedback.
function exerciseDifference(current, incoming) {
  const document = JSON.stringify(current.sheet) !== JSON.stringify(incoming.sheet)
    || (current.reviewedAt ?? null) !== (incoming.reviewedAt ?? null);
  const feedback = !same(current.practiceFeedback, incoming.practiceFeedback);
  return document || feedback;
}
function restoreCopy(source, id, now) {
  const copy = {
    ...Object.fromEntries(Object.entries(source).filter(([key]) => !['progress', 'generationLog'].includes(key))),
    id,
    localCopyOf: source.localCopyOf || source.id,
    importedFromBackup: true,
    createdAt: Number.isFinite(source.createdAt) ? source.createdAt : now
  };
  copy.id = id;
  if (copy.sheet) copy.status = 'ready';
  delete copy.removed;
  return structuredClone(copy);
}
export function mergeRestoredExerciseRecords(local, incoming, {newId = () => crypto.randomUUID(), now = () => Date.now()} = {}) {
  const result = Array.isArray(local) ? structuredClone(local.filter(row => row && typeof row.id === 'string')) : [];
  const byId = new Map(result.map(row => [row.id, row]));
  let added = 0, copies = 0, skipped = 0;
  for (const source of Array.isArray(incoming) ? incoming : []) {
    if (!source || typeof source.id !== 'string') continue;
    const current = byId.get(source.id);
    if (!current) { const row = structuredClone(source); result.push(row); byId.set(row.id, row); added++; continue; }
    if (!exerciseDifference(current, source)) continue;
    if (!source.sheet) { skipped++; continue; }
    if(result.some(row=>row.importedFromBackup&&row.localCopyOf===(source.localCopyOf||source.id)&&!exerciseDifference(row,source))){skipped++;continue;}
    const copy = restoreCopy(source, newId(), now());
    if (byId.has(copy.id)) continue;
    result.push(copy); byId.set(copy.id, copy); copies++;
  }
  return {records: result, added, copies, skipped};
}

// Backups store composer drafts keyed by JSON [sid, exam, subject]. Remap the
// student id after an identity merge; keep a newer local draft for the same
// student/exam/subject and only add backup-only drafts.
function pairs(value) { return Array.isArray(value) ? value.filter(pair => Array.isArray(pair) && typeof pair[0] === 'string') : []; }
function mappedId(sid, remap) {
  const value = remap instanceof Map ? remap.get(sid) : remap?.[sid];
  return typeof value === 'string' && value ? value : sid;
}
function remapDraftKey(key, remap) {
  try {
    const parts = JSON.parse(key);
    if (!Array.isArray(parts) || typeof parts[0] !== 'string') return key;
    const sid = mappedId(parts[0], remap);
    return sid === parts[0] ? key : JSON.stringify([sid, ...parts.slice(1)]);
  } catch { return key; }
}
function remapFocusKey(key, remap) {
  try {
    const parts = JSON.parse(key);
    if (!Array.isArray(parts) || typeof parts[0] !== 'string') return key;
    parts[0] = remapDraftKey(parts[0], remap);
    return JSON.stringify(parts);
  } catch { return key; }
}
export function mergeRestoredComposerDrafts(latest, incoming, {remap = new Map()} = {}) {
  const source = incoming?.version === 1 ? incoming : {requests: [], focuses: [], bases: [], applied: []};
  const current = latest?.version === 1 ? latest : {requests: [], focuses: [], bases: [], applied: []};
  const requests = new Map(pairs(current.requests)), focuses = new Map(pairs(current.focuses)), bases = new Map(pairs(current.bases));
  const applied = new Set(Array.isArray(current.applied) ? current.applied : []), oldBases = new Map(pairs(source.bases)), oldApplied = new Set(Array.isArray(source.applied) ? source.applied : []);
  const imported=new Set();
  let added = 0, kept = 0, skipped = 0;
  for (const [key, value] of pairs(source.requests)) {
    const nextKey = remapDraftKey(key, remap);
    if (!value || typeof value !== 'object' || Array.isArray(value) || typeof value.subject !== 'string') { skipped++; continue; }
    if (requests.has(nextKey)) { kept++; continue; }
    requests.set(nextKey, structuredClone(value));
    imported.add(nextKey);
    if (oldBases.has(key)) bases.set(nextKey, structuredClone(oldBases.get(key)));
    if (oldApplied.has(key)) applied.add(nextKey);
    added++;
  }
  for (const [key, focus] of pairs(source.focuses)) {
    const nextKey = remapFocusKey(key, remap);
    try{if(!imported.has(JSON.parse(nextKey)[0]))continue;}catch{continue;}
    if (!focuses.has(nextKey)) focuses.set(nextKey, structuredClone(focus));
  }
  for (const [key, basis] of oldBases) {
    const nextKey = remapDraftKey(key, remap);
    if (imported.has(nextKey) && !bases.has(nextKey)) bases.set(nextKey, structuredClone(basis));
  }
  return {version: 1, requests: [...requests], focuses: [...focuses], bases: [...bases].filter(([key]) => requests.has(key)), applied: [...applied].filter(key => requests.has(key)), restore: {added, kept, skipped}};
}

// A tiny synchronous journal for text typed into a training plan. It keeps the
// last keystroke recoverable without serializing the full plan (which can carry
// a generated exercise and figures) on every input event.
export const planTextPaths = new Set(['note', 'teacher', 'result', 'training.goal', 'ui.search']);
const planIdentity = plan => plan?.id || 'new:' + (plan?.sid || '') + '|' + (plan?.exam || '');
export const planDraftIdentity = planIdentity;
export function recordPlanText(journal, plan, path, value, {now = () => Date.now(), limit = 24} = {}) {
  if (!planTextPaths.has(path)) return journal || {};
  const identity = planIdentity(plan);
  const next = {...(journal && typeof journal === 'object' ? journal : {})};
  const previous = next[identity];
  next[identity] = {
    id: plan?.id || '',
    sid: plan?.sid || '',
    exam: plan?.exam || '',
    values: {...(previous?.values || {}), [path]: String(value ?? '')},
    at: now()
  };
  const entries = Object.entries(next).sort((a, b) => (b[1]?.at || 0) - (a[1]?.at || 0));
  while (entries.length > limit) delete next[entries.pop()[0]];
  return next;
}
export function applyPlanText(journal, plan, ui = {}, {identity = planIdentity(plan)} = {}) {
  const values = journal?.[identity]?.values;
  let applied = 0;
  if (!values || !plan) return {applied};
  for (const [path, value] of Object.entries(values)) {
    if (!planTextPaths.has(path) || typeof value !== 'string') continue;
    const [group, key] = path.split('.');
    if (group === 'ui') { if (key) ui[key] = value; }
    else if (key) { plan[group] ||= {}; plan[group][key] = value; }
    else plan[group] = value;
    applied++;
  }
  return {applied};
}
export function clearPlanText(journal, identity) {
  if (!journal || !identity || !Object.hasOwn(journal, identity)) return {journal: journal || {}, cleared: false};
  const next = {...journal};
  delete next[identity];
  return {journal: next, cleared: true};
}
