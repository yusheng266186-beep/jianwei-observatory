import {remapContext} from './context.js';
import {planDraftIdentity,planTextPaths} from './workspace-merge.js';

export function workspaceDrafts({followDraft=null,planTextDrafts={}}={}){
 const draft=followDraft?.plan&&typeof followDraft.plan.sid==='string'?structuredClone(followDraft):null;
 const journal={};
 for(const row of Object.values(planTextDrafts||{})){
  if(!row||typeof row.sid!=='string')continue;
  const values=Object.fromEntries(Object.entries(row.values||{}).filter(([key,value])=>planTextPaths.has(key)&&typeof value==='string'));
  if(Object.keys(values).length)journal[planDraftIdentity(row)]={id:row.id||'',sid:row.sid,exam:row.exam||'',at:Number(row.at)||0,values};
 }
 return {version:1,followDraft:draft,planTextDrafts:journal};
}
export function restoreWorkspaceDrafts(current,incoming,{remap=new Map()}={}){
 const local=workspaceDrafts(current),source=workspaceDrafts(incoming?.version===1?remapContext(incoming,remap):{});
 // The one open editor remains local. Text journals for other plans can still
 // be recovered; the imported archive never silently replaces newer typing.
 const planTextDrafts={...source.planTextDrafts,...local.planTextDrafts};
 return workspaceDrafts({followDraft:local.followDraft||source.followDraft,planTextDrafts});
}
