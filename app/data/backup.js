import {mergeRestoredExerciseRecords,mergeRestoredComposerDrafts} from './workspace-merge.js';
// An emergency export must not depend on the same failing store it protects.
// Missing collections are omitted, never represented as confirmed empty lists.
export async function workspaceBackup(snapshot,{read,live=null,setups=value=>value,datasetStamp}={}){
 let saved={},complete=true;
 try{saved=await read()||{};}catch{complete=false;}
 const payload={...snapshot},source={...(live||{}),...saved},missing=[];
 // A flushed studio is only a fallback for a failed read. Its in-memory draft
 // library may predate changes in another tab, even when its save succeeded.
 if(live&&live.backupSaved!==true){
  if(Object.hasOwn(live,'exercises'))source.exercises=mergeRestoredExerciseRecords(saved.exercises,live.exercises).records;
  if(Object.hasOwn(live,'exerciseComposerDrafts'))source.exerciseComposerDrafts=mergeRestoredComposerDrafts(live.exerciseComposerDrafts,saved.exerciseComposerDrafts);
  if(live.backupSaved===false)missing.push('unsavedChanges');
 }
 const staleDataset=datasetStamp!==undefined&&Object.hasOwn(saved,'prepared')&&(saved.prepared?.stamp??null)!==(datasetStamp??null);
 if(staleDataset)missing.push('currentDataset');
 for(const key of ['exercises','exerciseSavedSetups','exerciseComposerDrafts','importColumnTemplates']){
  if(Object.hasOwn(source,key))payload[key]=key==='exerciseSavedSetups'?setups(source[key]):key==='exerciseComposerDrafts'?(source[key]?.version===1?source[key]:{version:1,requests:[],focuses:[],bases:[],applied:[]}):Array.isArray(source[key])?source[key]:[];
  else if(complete)payload[key]=key==='exerciseComposerDrafts'?{version:1,requests:[],focuses:[],bases:[],applied:[]}:[];
  else missing.push(key);
 }
 return {payload,complete:missing.length===0,missing,staleDataset,journal:saved.workspaceJournal};
}
