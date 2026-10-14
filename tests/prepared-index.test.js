import test from 'node:test';
import assert from 'node:assert/strict';
import {Atlas} from '../app/engine/atlas.js';
import {normalizeDataset} from '../app/data/compat.js';
import fixtures from './fixtures.cjs';
test('后台索引交接保留原始记录引用、统计、零分、缺失和班级排名',()=>{
 const original=new Atlas(fixtures.makeWideFixture()),payload=structuredClone({dataset:original.data,index:original.indexSnapshot()}),restored=new Atlas(payload.dataset,{prepared:true,index:payload.index});
 assert.equal(restored.rows('52')[0],payload.dataset.scores.find(r=>r.exam==='52'));
 assert.equal(restored.paperRows.get('数学|52')[0],payload.dataset.answers.find(r=>r.subject==='数学'&&r.exam==='52'));
 for(const no of original.classes){assert.deepEqual(restored.snapshot(no,'52'),original.snapshot(no,'52'));for(const row of restored.classAt(no,'52'))assert.equal(restored.classRank(row),original.classRank(original.classAt(no,'52').find(r=>r.sid===row.sid)));}
 for(const paper of original.papers())assert.deepEqual(restored.paper(paper.key),original.paper(paper.key));
 assert.deepEqual(restored.data.scores,original.data.scores);assert.deepEqual(restored.data.answers,original.data.answers);
});
test('材料更新创建独立索引和统计缓存，旧索引不会覆盖新成绩',()=>{
 const original=new Atlas(fixtures.makeWideFixture());original.snapshot(4,'52');
 const next=normalizeDataset(structuredClone(original.data));next.scores.find(r=>r.classNo===4&&r.exam==='52'&&r.total!==null).total=999;
 const current=new Atlas(next);assert.notDeepEqual(current.summary(current.classAt(4,'52')),original.summary(original.classAt(4,'52')));assert.notEqual(current.examRows,original.examRows);
});
