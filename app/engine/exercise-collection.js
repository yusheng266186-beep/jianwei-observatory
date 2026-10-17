import {jobState} from './exercise-jobs.js';
// Selections stay within the active result set, including its loaded pages.
export function exerciseSelection(records,ids){const selected=new Set(ids);return records.filter(r=>selected.has(r.id));}
// Confirmation freezes IDs. A later poll must never expand the operation to
// newly matching records, or clean a failed task which has since recovered.
export function exerciseRemovalPlan(records,ids,{failedOnly=false}={}){
 const rows=exerciseSelection(records,ids).filter(r=>!failedOnly||jobState(r)==='failed');
 return {ids:rows.map(r=>r.id),count:rows.length,pending:rows.filter(r=>jobState(r)==='pending').length,reviewed:rows.filter(r=>jobState(r)==='reviewed').length};
}
