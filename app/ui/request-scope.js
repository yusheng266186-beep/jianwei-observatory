// Async responses from a previous sign-in must never restore an exited view or
// clear a newly established session. Named reads also ignore older refreshes.
export function createRequestScope(){
 let generation=0;const reads=new Map();
 const current=ticket=>ticket.generation===generation&&(!ticket.name||reads.get(ticket.name)===ticket.sequence);
 return {ticket:()=>({generation}),begin(name){const sequence=(reads.get(name)||0)+1;reads.set(name,sequence);return {generation,name,sequence};},current,assert(ticket){if(!current(ticket))throw Object.assign(new Error('操作已结束'),{code:'SESSION_CHANGED'});},invalidate(){generation++;reads.clear();}};
}
