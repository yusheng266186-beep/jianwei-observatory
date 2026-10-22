const arrays={plans:'plans',notebook:'notes',exercises:'exercises',exerciseSavedSetups:'setups',importColumnTemplates:'imports'};
export function collectionCounts(key,value){
 if(key==='dataset')return {students:value?.students?.length||0,scores:value?.scores?.length||0,answers:value?.answers?.length||0};
 if(arrays[key])return {[arrays[key]]:Array.isArray(value)?value.length:0};
 return {};
}
// Only small counters and a revision are added to the existing transaction.
// No second copy, serialization or scan of student records is needed.
export function trackWorkspaceChanges(store){
 let meta=null,changed=false;const counts={};const request=store.get('workspaceJournal');
 const save=()=>{if(!meta||!changed)return;store.put({...meta,counts:{...(meta.counts||{}),...counts}},'workspaceJournal');};
 request.onsuccess=()=>{meta={version:1,...request.result};if(changed){meta.stamp=crypto.randomUUID();meta.updatedAt=Date.now();}save();};
 return (key,value)=>{const next=collectionCounts(key,value);if(!Object.keys(next).length&&key!=='exerciseComposerDrafts')return;Object.assign(counts,next);if(!changed&&meta){meta={...meta,stamp:crypto.randomUUID(),updatedAt:Date.now()};}changed=true;save();};
}
export function backupCounts(payload){return Object.assign({},...['dataset',...Object.keys(arrays)].map(key=>collectionCounts(key,key==='dataset'?payload:payload[key])));}
export function protectionSummary({receipt,journal,localRevision='',counts={}}){
 if(!receipt?.at)return {state:'unbacked',label:'尚无完整备份记录',changes:[]};
 const changed=(journal?.stamp||'')!==receipt.stamp||localRevision!==receipt.localRevision;
 const labels={students:'学生',scores:'成绩记录',answers:'小题学科记录',plans:'跟进计划',notes:'证据报告',exercises:'练习',setups:'训练模板',imports:'导入模板'};
 const changes=Object.entries({...journal?.counts,...counts}).flatMap(([key,count])=>Number.isFinite(count)&&Number.isFinite(receipt.counts?.[key])&&count>receipt.counts[key]?[labels[key]+' +'+(count-receipt.counts[key])]:[]).filter(Boolean);
 return {state:changed||changes.length?'changed':'current',label:changed||changes.length?'有更新，建议下载新备份':'已导出当前资料备份',changes};
}
export async function inspectBrowserStorage(storage=globalThis.navigator?.storage){
 const result={supported:!!storage?.persist,persisted:null,usage:null,quota:null};
 const values=await Promise.allSettled([Promise.resolve().then(()=>storage?.persisted?.()),Promise.resolve().then(()=>storage?.estimate?.())]);
 if(values[0].status==='fulfilled'&&typeof values[0].value==='boolean')result.persisted=values[0].value;
 const estimate=values[1].status==='fulfilled'?values[1].value:null;
 if(Number.isFinite(estimate?.usage))result.usage=estimate.usage;if(Number.isFinite(estimate?.quota)&&estimate.quota>0)result.quota=estimate.quota;
 return result;
}
