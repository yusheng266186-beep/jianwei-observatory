import test from 'node:test';
import assert from 'node:assert/strict';
import {workspaceBackup} from '../app/data/backup.js';
import {archiveRestore,restoredRemovals} from '../app/data/archive-restore.js';
import {workspaceDrafts,restoreWorkspaceDrafts} from '../app/data/workspace-drafts.js';
import {mergeContext} from '../app/data/context.js';
const composer=subject=>({version:1,requests:[['key',{subject}]],focuses:[],bases:[['key',{mode:'manual',exams:[]}]],applied:['key']});
test('备份已保存的资料时以原子读取的集合为准，不让已打开页面的旧草稿覆盖另一页的保存',async()=>{
 const saved={exercises:[{id:'remote'}],exerciseComposerDrafts:composer('物理')};
 const live={backupSaved:true,exercises:[],exerciseComposerDrafts:composer('数学')};
 const result=await workspaceBackup({},{live,read:async()=>saved});
 assert(result.complete);assert.deepEqual(result.payload.exercises,saved.exercises);assert.deepEqual(result.payload.exerciseComposerDrafts,saved.exerciseComposerDrafts);
});
test('保存失败的应急备份合并远端练习和当前未保存练习，不能被记为完整备份',async()=>{
 const result=await workspaceBackup({},{live:{backupSaved:false,exercises:[{id:'local',sheet:{title:'本页'}}],exerciseComposerDrafts:composer('数学')},read:async()=>({exercises:[{id:'remote'}],exerciseComposerDrafts:{...composer('物理'),requests:[['other',{subject:'物理'}]]}})});
 assert(!result.complete);assert(result.missing.includes('unsavedChanges'));assert.deepEqual(result.payload.exercises.map(r=>r.id),['remote','local']);assert.equal(result.payload.exerciseComposerDrafts.requests.length,2);
});
test('其他页面更新材料后旧页面的备份保持可下载，但不声称已备份当前版本',async()=>{
 const result=await workspaceBackup({scores:[{total:370}]},{datasetStamp:'page',read:async()=>({prepared:{stamp:'newer'},workspaceJournal:{stamp:'latest'}})});
 assert(result.staleDataset);assert(!result.complete);assert(result.missing.includes('currentDataset'));assert.equal(result.payload.scores[0].total,370);
 const matching=await workspaceBackup({},{datasetStamp:'page',read:async()=>({prepared:{stamp:'page'},workspaceJournal:{stamp:'matching'}})});assert(matching.complete);assert.equal(matching.journal.stamp,'matching');
});
test('材料、计划、练习、模板与草稿的恢复操作在提交前构造，全部提供同步事务 reducer',()=>{
 const incoming={plans:[{id:'plan',sid:'student',exam:'52'}],exercises:[{id:'exercise',status:'ready'}],importColumnTemplates:[],exerciseSavedSetups:[]};
 const restore=archiveRestore(incoming,{composerDrafts:composer('数学')});
 assert.deepEqual(restore.entries.map(([key])=>key),['plans','importColumnTemplates','exerciseSavedSetups','exercises','exerciseComposerDrafts']);
 for(const [key] of restore.entries)assert.equal(typeof restore.reducers[key],'function');
 const plans=restore.reducers.plans([{id:'other',sid:'another',exam:'52'}]);assert.deepEqual(plans.map(p=>p.id),['other','plan']);
 assert.equal(restore.reducers.exercises([]).length,1);assert.equal(restore.stats.exerciseStats.added,1);
});
test('明确恢复练习只解除已实际恢复的删除记录，不复活其他已删练习',()=>{
 assert.deepEqual(restoredRemovals(['restore','deleted','missing'],[{id:'restore'},{id:'missing'}],[{id:'restore'}]),['deleted','missing']);
});
test('完整备份保留未提交的跟进计划及文字日志；恢复时映射学生并保留本页较新草稿',()=>{
 const draft={plan:{sid:'old',exam:'52',training:{goal:'未保存目标'}},ui:{search:'检索'}};
 const source=workspaceDrafts({followDraft:draft,planTextDrafts:{old:{sid:'old',exam:'52',values:{note:'未落盘文字',unsupported:'忽略'},at:1}}});
 const restored=restoreWorkspaceDrafts({},source,{remap:new Map([['old','new']])});assert.equal(restored.followDraft.plan.sid,'new');assert.equal(restored.followDraft.plan.training.goal,'未保存目标');assert.equal(restored.planTextDrafts['new:new|52'].values.note,'未落盘文字');assert(!Object.hasOwn(restored.planTextDrafts['new:new|52'].values,'unsupported'));
 const local={followDraft:{plan:{sid:'local',exam:'52',note:'本页较新'}}};assert.equal(restoreWorkspaceDrafts(local,source).followDraft.plan.note,'本页较新');
 assert.equal(mergeContext({workspaceDrafts:source},{},new Map()).workspaceDrafts,undefined);assert.equal(mergeContext({}, {workspaceDrafts:source},new Map([['old','new']])).workspaceDrafts.followDraft.plan.sid,'new');
});
