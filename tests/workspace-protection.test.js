import test from 'node:test';
import assert from 'node:assert/strict';
import {backupCounts,protectionSummary,inspectBrowserStorage,trackWorkspaceChanges} from '../app/data/workspace-protection.js';
import {importTemplates,matchImportTemplate,saveImportTemplate,mergeImportTemplates,validImportMapping} from '../app/data/import-templates.js';
import {workspaceBackup} from '../app/data/backup.js';
import {mergeContext} from '../app/data/context.js';
const headers=['姓名','班级','考试','总分','赋分校排名'],mapping={name:0,classNo:1,exam:2,total:3,schoolRank:4};
test('导入模板只接受相同的完整有序表头，映射保留校排范围和未使用列',()=>{
 const rows=saveImportTemplate([],{headers,mapping,name:'成绩.csv',now:1});assert.equal(rows.length,1);assert.equal(rows[0].name,'成绩');
 assert.equal(matchImportTemplate(rows,[...headers]).mapping.schoolRank,4);assert.equal(rows[0].mapping.cityRank,null);
 for(const h of [[...headers].reverse(),headers.slice(0,-1),[...headers,'班排名'],['姓名','班级','考试','总分','原分校排名']])assert.equal(matchImportTemplate(rows,h),null);
 assert.equal(validImportMapping(headers,{...mapping,name:99}),null);assert.equal(validImportMapping(headers,{...mapping,classNo:0}),null);
});
test('再次保存同一表头更新模板，恢复合并保留较新的教师选择，模板列表有界',()=>{
 let rows=saveImportTemplate([],{headers,mapping,now:1});rows=saveImportTemplate(rows,{headers,mapping:{...mapping,schoolRank:null},now:2});assert.equal(rows.length,1);assert.equal(rows[0].mapping.schoolRank,null);
 const merged=mergeImportTemplates(rows,saveImportTemplate([],{headers,mapping,now:1}));assert.equal(merged[0].mapping.schoolRank,null);
 assert.deepEqual(importTemplates([null,{headers,mapping:{name:99}},{headers:[],mapping}]),[]);
 for(let i=0;i<25;i++)rows=saveImportTemplate(rows,{headers:[...headers,String(i)],mapping,now:10+i});assert.equal(rows.length,20);assert.equal(rows[0].updatedAt,34);
});
test('完整备份携带导入模板；读取失败不会把未知模板伪装成空列表',async()=>{
 const templates=saveImportTemplate([],{headers,mapping});const full=await workspaceBackup({scores:[]},{read:async()=>({importColumnTemplates:templates})});assert.deepEqual(full.payload.importColumnTemplates,templates);assert(full.complete);
 const partial=await workspaceBackup({scores:[]},{read:async()=>{throw Error('blocked');}});assert(!partial.complete);assert(partial.missing.includes('importColumnTemplates'));assert(!Object.hasOwn(partial.payload,'importColumnTemplates'));
});
test('普通材料合并不重新恢复旧数据快照中的已删模板，明确导入备份才恢复',()=>{
 const templates=saveImportTemplate([],{headers,mapping}),current={importColumnTemplates:templates};
 assert.equal(mergeContext(current,{},new Map()).importColumnTemplates,undefined);
 assert.deepEqual(mergeContext({},current,new Map()).importColumnTemplates,templates);
});
test('备份摘要区分未备份、内容更新和份数增长；不把减少量说成新增量',()=>{
 const payload={students:[{}],scores:[{},{}],answers:[],exercises:[{}]},counts=backupCounts(payload),receipt={at:1,stamp:'a',localRevision:'l',counts};
 assert.equal(protectionSummary({counts}).state,'unbacked');assert.equal(protectionSummary({receipt,journal:{stamp:'a',counts},localRevision:'l'}).state,'current');
 assert.equal(protectionSummary({receipt,journal:{stamp:'b',counts},localRevision:'l'}).state,'changed');assert.equal(protectionSummary({receipt,journal:{stamp:'a',counts},localRevision:'new'}).state,'changed');
 const next=protectionSummary({receipt,journal:{stamp:'b',counts:{...counts,scores:3,exercises:0}},localRevision:'l'});assert.deepEqual(next.changes,['成绩记录 +1']);
});
test('资料修订与计数附加在同一事务中，忽略文件缓存并保留其他集合计数',()=>{
 const gets=[],puts=[],store={get:()=>{const r={};gets.push(r);return r;},put:(value,key)=>puts.push([key,value])};const track=trackWorkspaceChanges(store);
 track('dataset',{students:[{}],scores:[{},{}],answers:[]});track('plans',[{},{}]);gets[0].result={stamp:'old',counts:{exercises:5}};gets[0].onsuccess();
 const first=puts.at(-1)[1];assert.notEqual(first.stamp,'old');assert.equal(first.counts.exercises,5);assert.equal(first.counts.plans,2);assert.equal(first.counts.scores,2);
 track('notebook',[{}]);assert.equal(puts.at(-1)[1].stamp,first.stamp);assert.equal(puts.at(-1)[1].counts.notes,1);
 const length=puts.length;track('exercise-files-v1',[{}]);assert.equal(puts.length,length);
});
test('浏览器不支持或拒绝空间查询时仍返回可用状态，不声称启用持久保存',async()=>{
 assert.deepEqual(await inspectBrowserStorage({}),{supported:false,persisted:null,usage:null,quota:null});
 const failed=await inspectBrowserStorage({persist(){},persisted:async()=>{throw Error('blocked');},estimate:async()=>{throw Error('blocked');}});assert.equal(failed.persisted,null);assert.equal(failed.usage,null);
 const ready=await inspectBrowserStorage({persist(){},persisted:async()=>true,estimate:async()=>({usage:100,quota:1000})});assert.equal(ready.persisted,true);assert.equal(ready.usage,100);
});
