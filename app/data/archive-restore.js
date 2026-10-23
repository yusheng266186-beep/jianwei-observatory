import {mergePlans,mergePlansRestore,mergeRestoredExerciseRecords,mergeRestoredComposerDrafts} from './workspace-merge.js';
import {mergeImportTemplates} from './import-templates.js';
import {mergeExerciseSetupArchive} from '../engine/exercise-setups.js';
import {normalizePlan} from '../engine/training.js';

// All archive collections join the same transaction as the dataset. Reducers
// see the newest values, so a failed collection cannot leave a half import.
export function archiveRestore(incoming,{plans=[],plansBase=plans,resetContext=false,composerDrafts=null,remap=new Map()}={}){
 const source=incoming.plans||incoming.actions;
 const next=Array.isArray(source)?resetContext?source.map(normalizePlan):mergePlansRestore(plans,source.map(normalizePlan)).records:resetContext?[]:plans;
 const entries=[['plans',next]],reducers={plans:latest=>mergePlans(plansBase,next,Array.isArray(latest)?latest:plansBase).records},stats={};
 const add=(key,value,reduce)=>{entries.push([key,value]);reducers[key]=reduce;};
 if(Array.isArray(incoming.importColumnTemplates))add('importColumnTemplates',incoming.importColumnTemplates,latest=>mergeImportTemplates(latest,incoming.importColumnTemplates));
 if(Array.isArray(incoming.exerciseSavedSetups))add('exerciseSavedSetups',incoming.exerciseSavedSetups,latest=>mergeExerciseSetupArchive(latest,incoming.exerciseSavedSetups));
 if(Array.isArray(incoming.exercises))add('exercises',incoming.exercises,latest=>{stats.exerciseStats=mergeRestoredExerciseRecords(latest,incoming.exercises);return stats.exerciseStats.records;});
 if(composerDrafts?.version===1)add('exerciseComposerDrafts',composerDrafts,latest=>{const merged=mergeRestoredComposerDrafts(latest,composerDrafts,{remap});stats.composerStats=merged.restore;return merged;});
 return {entries,reducers,stats};
}

// Explicit restoration is a new user action and supersedes an earlier delete.
// Unrelated deleted jobs stay deleted in other tabs and later polls.
export function restoredRemovals(removed,incoming,saved){
 const present=new Set((saved||[]).map(row=>row.id)),restored=new Set((incoming||[]).map(row=>row.id).filter(id=>present.has(id)));
 return (Array.isArray(removed)?removed:[]).filter(id=>!restored.has(id));
}
