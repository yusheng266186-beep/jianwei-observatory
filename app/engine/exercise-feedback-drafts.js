import {practiceFeedbackDraft,practiceFeedbackStamp,practiceSourceStamp} from './exercise-feedback.js';
const valueStamp=d=>JSON.stringify([d.date,d.note,d.rows],(_,v)=>typeof v==='number'&&!Number.isFinite(v)?String(v):v);
export function createPracticeFeedbackDrafts(today){
 const drafts=new Map(),key=r=>r.id+'|'+practiceSourceStamp(r);
 const fresh=r=>{const d=practiceFeedbackDraft(r,today());d.initial=valueStamp(d);d.dirty=false;return d;};
 function get(record){const k=key(record);let d=drafts.get(k);if(!d||!d.dirty&&d.expected!==practiceFeedbackStamp(record)){d=fresh(record);drafts.set(k,d);}return d;}
 function changed(d){d.dirty=valueStamp(d)!==d.initial;return d;}
 function reset(record){const d=fresh(record);drafts.set(key(record),d);return d;}
 function commit(record,submitted){const k=key(record),d=drafts.get(k),saved=fresh(record);if(!d||valueStamp(d)===valueStamp(submitted)){drafts.set(k,saved);return saved;}
  // Edits made while storage was saving remain a new draft against the saved revision.
  d.expected=saved.expected;d.initial=saved.initial;return changed(d);
 }
 return {get,changed,reset,commit,stale:(r,d)=>d.expected!==practiceFeedbackStamp(r)};
}
