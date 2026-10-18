// Scroll checkpoints only follow surfaces whose positions are stored in the
// research snapshot. Dialog/control scrolling must not force a full page
// geometry pass, while stage tables, the drawer body and table scroll keep
// their exact return positions.
const ignored = ['.exam-rail', '.trajectory-scroll', '.drawer-tabs', '.drawer-section-nav', '.drawer-stages', '.report-scroll', '#toast', '#navigation', '.masthead'];

export function tracksStudyScroll(target) {
  const document = target?.ownerDocument || globalThis.document;
  if (!target) return true;
  if (target.nodeType === 9 || target === document || target === document?.documentElement || target === document?.body) return true;
  if (typeof target.closest !== 'function') return false;
  if (target.closest(ignored.join(','))) return false;
  const dialog = target.closest('dialog');
  if (dialog && dialog.id !== 'research-drawer') return false;
  return Boolean(target.closest('#stage,#research-drawer'));
}

// The history checkpoint (120ms) and the archive checkpoint (500ms) share one
// geometry snapshot when nothing changed between them. A paint, condition
// change or another scroll invalidates the snapshot so both still measure the
// current page at least once; they no longer measure the same state twice.
export function createCheckpointScheduler({snapshot, checkpoint, archive, historyDelay = 120, archiveDelay = 500, setTimer = setTimeout, clearTimer = clearTimeout} = {}) {
  let dirty = true, cached = null, historyTimer = null, archiveTimer = null;
  const take = () => {
    if (dirty || cached === null) { cached = snapshot(); dirty = false; }
    return cached;
  };
  const clear = () => {
    if (historyTimer !== null) { clearTimer(historyTimer); historyTimer = null; }
    if (archiveTimer !== null) { clearTimer(archiveTimer); archiveTimer = null; }
  };
  const schedule = () => {
    dirty = true;
    clear();
    historyTimer = setTimer(() => { historyTimer = null; const study = take(); if (study) checkpoint(study); }, historyDelay);
    archiveTimer = setTimer(() => { archiveTimer = null; const study = take(); if (study) archive(study); }, archiveDelay);
  };
  const flush = () => {
    clear();
    const study = take();
    if (study) { checkpoint(study); archive(study); }
    return study;
  };
  return {schedule, clear, flush, invalidate() { dirty = true; }, snapshot: take};
}
