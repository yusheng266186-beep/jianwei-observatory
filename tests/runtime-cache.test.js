import test from 'node:test';
import assert from 'node:assert/strict';
import {Atlas} from '../app/engine/atlas.js';
import {render as board} from '../app/scenes/board.js';
import {render as paper} from '../app/scenes/papers.js';
import {makeFixture} from './fixtures.cjs';

test('重复统计复用同一数据快照；班级范围互不串用，缓存有上限',()=>{
 const atlas=new Atlas(makeFixture());
 assert.equal(atlas.summary(atlas.rows('52')),atlas.summary(atlas.rows('52')));
 assert.equal(atlas.groups('52'),atlas.groups('52'));
 assert.equal(atlas.snapshot(4,'52'),atlas.snapshot(4,'52'));
 assert.equal(atlas.papers(),atlas.papers());
 assert.equal(atlas.paper('数学|52',[7,4,4]),atlas.paper('数学|52',[4,7]));
 assert.notEqual(atlas.paper('数学|52',[4]),atlas.paper('数学|52',[7]));
 assert.equal(atlas.paperPreview('数学|52'),atlas.paperPreview('数学|52'));
 for(let i=0;i<70;i++)atlas.paper('数学|52',[i+30]);
 assert.equal(atlas.paperCache.size,48);
});
test('材料、有效线、满分和研究口径更新使用新快照，旧统计不会污染新结果',()=>{
 const data=makeFixture(),before=new Atlas(data),old=before.paper('数学|52',[4]),oldPass=before.summary(before.classAt(4,'52')).under;
 data.answers.find(a=>a.sid==='test-4-0'&&a.subject==='数学').values[0]=5;
 data.banks['数学|52'][0].max=10;data.banks['数学|52'][0].knowledge='新知识点';
 data.lines.filter(l=>l.exam==='52').forEach(l=>l.under=900);
 data.rules={topFraction:.5,lowRate:.9,focusRate:.95};
 const after=new Atlas(data),next=after.paper('数学|52',[4]);
 assert.equal(next.questions[0].max,10);assert.equal(next.questions[0].knowledge,'新知识点');
 assert.notEqual(next.questions[0].mean,old.questions[0].mean);
 assert.ok(oldPass>0);assert.equal(after.summary(after.classAt(4,'52')).under,0);
 assert.equal(next.skills.find(k=>k.name==='新知识点').advice,'优先修复');
 assert.equal(before.paper('数学|52',[4]),old);
});
test('当前页面不会整理完整报告；显式摘录仍返回所有成绩和小题',()=>{
 const atlas=new Atlas(makeFixture()),session={plans:[]};let previews=0;const summary=atlas.summary.bind(atlas);
 const view=board(atlas,{mode:'overview',exam:'52'},session);
 assert.equal(typeof Object.getOwnPropertyDescriptor(view,'report').get,'function');
 // Export-only subject bookkeeping must not run until the report is requested.
 atlas.summary=(...args)=>{previews++;return summary(...args);};
 assert.ok(view.html.includes('年级总览'));assert.equal(previews,0);
 const report=view.report;assert.ok(previews>0);assert.equal(view.report,report);assert.equal(report.sheets['全部成绩'].length,atlas.rows('52').length+1);
 const p=paper(atlas,{key:'数学|52',classes:[4],tab:'map'});
 assert.equal(typeof Object.getOwnPropertyDescriptor(p,'report').get,'function');
 assert.equal(p.report.sheets['个人学科小题得分'].length,atlas.paper('数学|52',[4]).answers.length+1);
 assert.equal(p.report.sections.find(s=>s.title==='逐题诊断').rows.length,3);
});
