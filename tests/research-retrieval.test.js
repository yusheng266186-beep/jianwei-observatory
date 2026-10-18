import test from 'node:test';
import assert from 'node:assert/strict';
import {Atlas} from '../app/engine/atlas.js';
import {makeFixture} from './fixtures.cjs';
import {researchView,studyDescription,studyQueries} from '../app/ui/research.js';

test('保存的学生姓名筛选可按原检索词找回，旧自定义名称与条件保持不变',()=>{
 const atlas=new Atlas(makeFixture()),entry={id:'filtered',scene:'people',values:{sid:'',directoryExam:'52',view:'cards',search:'校检4班03'},name:'待跟进名单',title:'全体学生',scope:'学生目录',updated:'2026-10-18T12:00:00Z'},data={saved:[entry],recent:[entry]},before=structuredClone(data);
 for(const tab of ['saved','recent']){const html=researchView(atlas,data,{tab,search:'校检4班03'},null);assert.match(html,/显示 1 \/ 1 条/);assert.match(html,/姓名：校检4班03/);assert.match(html,/待跟进名单/);}assert.deepEqual(data,before);
});
test('研究线索完整检索长条件，但摘要适度缩短并安全转义，保留所有原条件',()=>{
 const atlas=new Atlas(makeFixture()),text='甲'.repeat(80)+' 结尾关键词<script>',entry={id:'long',scene:'class',values:{no:4,exam:'52',tab:'history',search:text},updated:'2026-10-18T12:00:00Z'},before=structuredClone(entry),scope=studyDescription(atlas,entry).scope;
 assert.match(scope,/甲… · /);assert(!scope.includes('结尾关键词'));const html=researchView(atlas,{saved:[entry],recent:[]},{search:'结尾关键词'},null);assert.match(html,/显示 1 \/ 1 条/);assert(!html.includes('<script>'));assert.deepEqual(entry,before);
 const unsafe={...entry,values:{...entry.values,search:'<script>'}};assert.match(researchView(atlas,{saved:[unsafe],recent:[]},{search:'<script>'},null),/姓名：&lt;script&gt;/);
});
test('线索仅显示当前视图生效的检索，不把隐藏标签的旧条件混入摘要，资料栏目名称准确',()=>{
 const atlas=new Atlas(makeFixture());assert.deepEqual(studyQueries({scene:'papers',values:{key:'数学|52',tab:'students',search:'校检4班03',questionSearch:'概率'}}),[{label:'姓名',text:'校检4班03'}]);assert.deepEqual(studyQueries({scene:'papers',values:{key:'数学|52',tab:'map',search:'旧姓名',questionSearch:'概率'}}),[{label:'题目',text:'概率'}]);assert.deepEqual(studyQueries({scene:'board',values:{mode:'overview',search:'旧检索'}}),[]);assert.deepEqual(studyQueries({scene:'people',values:{sid:'test-4-0',search:'旧检索'}}),[]);
 assert.deepEqual(studyQueries({scene:'follow',values:{planSearch:'函数',search:'校检4班03'}}),[{label:'跟进检索',text:'函数'},{label:'临界名单检索',text:'校检4班03'}]);assert.equal(studyDescription(atlas,{scene:'library',values:{tab:'exercises'}}).title,'试题中心');assert.equal(studyDescription(atlas,{scene:'library',values:{tab:'reports'}}).title,'打印报告');
 for(const old of [null,{}, {scene:'people',values:null}])assert.deepEqual(studyQueries(old),[]);
});
