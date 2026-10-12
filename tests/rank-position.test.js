import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {Atlas} from '../app/engine/atlas.js';
import {directoryEntries,queryDirectory,directoryDefaults} from '../app/engine/directory.js';
import {trajectory} from '../app/ui/plots.js';
const {makeFixture}=createRequire(import.meta.url)('./fixtures.cjs');
test('年级排名采用原表校排，市级原排名和缺失均不冒充年级排名',()=>{
 const data=makeFixture();data.exams.find(e=>e.id==='52').scope='city';const atlas=new Atlas(data);
 assert.equal(atlas.gradeRank({exam:'52',schoolRank:12,rank:100}),12);
 assert.equal(atlas.gradeRank({exam:'52',rank:100}),null);
 assert.equal(atlas.gradeRank({exam:'51',rank:18}),18);
 for(const schoolRank of [null,0,-1,NaN])assert.equal(atlas.gradeRank({exam:'52',schoolRank}),null);
 assert.equal(atlas.value({exam:'52',schoolRank:12},'gradeRank'),12);
});
test('筛选不会重新计算表内排名，排名排序将未提供的记录放在末尾',()=>{
 const data=makeFixture();for(const row of data.scores)row.schoolRank=row.sid==='test-4-0'?null:row.schoolRank;
 const atlas=new Atlas(data),state={...directoryDefaults,sort:'rank',classes:[4]},result=queryDirectory(atlas,state,{savedPeople:[]});
 assert.equal(result.matches[0].rank,2);assert.equal(result.matches.at(-1).rank,null);
 assert.equal(directoryEntries(atlas).find(e=>e.person.id==='test-4-2').rank,3);
});
test('排名轨迹把较小的名次放在上方，缺失阶段仍保留断点',()=>{
 const svg=trajectory('rank',['一','二','三','四'],[{name:'年级排名',values:[20,10,null,5]}],{inverse:true,floor:1,integerTicks:true});
 const points=[...svg.matchAll(/class="plot-point"[^>]*cx="([^"]+)"[^>]*cy="([^"]+)"/g)].map(m=>Number(m[2]));
 assert.equal(points.length,3);assert.ok(points[0]>points[1]&&points[1]>points[2]);
 assert.equal((svg.match(/class="plot-line"[^>]*d="([^"]+)"/)?.[1].match(/M/g)||[]).length,2);
});

test('排名为第1名时纵轴不出现零名、负名次或重复名次',()=>{
 const svg=trajectory('first-rank',['一','二'],[{name:'年级排名',values:[1,1]}],{inverse:true,floor:1,integerTicks:true});
 const labels=[...svg.matchAll(/<text[^>]*text-anchor="end"[^>]*>([^<]+)<\/text>/g)].map(m=>Number(m[1]));
 assert.ok(labels.length>0);assert.ok(labels.every(v=>Number.isInteger(v)&&v>=1));assert.equal(new Set(labels).size,labels.length);
});
