import test from 'node:test';
import assert from 'node:assert/strict';
import {achievementDial,progressMeter} from '../app/ui/solar.js';

test('达线环形图分别使用本科和特控口径，不混用可判定人数',()=>{
 const html=achievementDial('independent',{under:30,underBase:60,underRate:.5,top:10,topBase:25,topRate:.4});
 assert.match(html,/本科达线率50\.0%，特控达线率40\.0%，分别按各自可判定人数计算/);
 assert.match(html,/本科可判定 60 人/);assert.match(html,/特控可判定 25 人/);
});
test('环形图保留真实零比例和未知口径的区别',()=>{
 const html=achievementDial('unknown',{under:0,underBase:10,underRate:0,top:null,topBase:0,topRate:null});
 assert.match(html,/本科达线率0\.0%，特控达线率—/);
 assert.equal((html.match(/class="solar-progress"/g)||[]).length,1);
 assert.doesNotMatch(html,/特控 0\.0%/);
});
test('任务进度超过目标保留真实完成率，未知人数与未设任务单独说明',()=>{
 assert.match(progressMeter(12,8),/150\.0%/);
 assert.match(progressMeter(null,8),/>—<\/b>/);
 assert.match(progressMeter(0,8),/>0\.0%<\/b>/);
 for(const target of [null,undefined,0])assert.match(progressMeter(8,target),/未设任务/);
});
