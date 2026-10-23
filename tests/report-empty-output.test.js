import test from 'node:test';
import assert from 'node:assert/strict';
import {reportView} from '../app/ui/report.js';
const report=()=>({title:'匿名报告',subtitle:'',sections:[{title:'名册',headers:['姓名'],rows:[['匿名甲']]}],outputSelection:{selected:[0],filters:{0:'未匹配'},paper:{skipEmpty:true}}});
function outlets(r){const html=reportView(r,{preview:'paper'});return ['report-pdf','report-word','report-excel','report-print'].map(cmd=>html.match(new RegExp('<button[^>]*data-cmd="'+cmd+'"[^>]*>'))?.[0]);}
test('隐藏空章后的导出状态与实际正文一致，不生成只有标题的报告',()=>{
 const r=report();for(const button of outlets(r))assert.match(button,/disabled/);
 r.outputSelection.paper.skipEmpty=false;for(const button of outlets(r))assert.doesNotMatch(button,/disabled/);
});
test('保留说明正文或教师判断时仍能导出，取消附加判断后不把隐藏文字当作正文',()=>{
 const r=report();r.note='教师判断';for(const button of outlets(r))assert.doesNotMatch(button,/disabled/);
 r.outputSelection.includeNote=false;for(const button of outlets(r))assert.match(button,/disabled/);
 r.sections[0].paragraphs=['统计依据'];for(const button of outlets(r))assert.doesNotMatch(button,/disabled/);
 r.outputSelection.selected=[];for(const button of outlets(r))assert.match(button,/disabled/);
});
