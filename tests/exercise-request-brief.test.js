import test from 'node:test';import assert from 'node:assert/strict';
import {exerciseTypeSummary,exerciseCountGuidance,exerciseRequestRows,exerciseRequestSummaryHTML,exerciseRequestBriefHTML} from '../app/ui/exercise-request-brief.js';

const request={subject:'英语',grade:'高三',curriculum:'人教版必修三，Unit 2',focus:'语法填空与非谓语动词',targets:['非谓语动词','定语从句'],count:6,minutes:30,difficulty:'方法进阶',visuals:'auto',questionTypes:['填空','简答'],requirements:'只用已学课内方法'};
const rows=Object.fromEntries(exerciseRequestRows(request,{labels:['非谓语动词','定语从句'],level:'方法进阶'}));

test('生成前摘要一次展示范围、知识点、重点、题型、难度和题数时长',()=>{
 assert.equal(rows['教学范围'],request.curriculum);
 assert.equal(rows['知识点'],'非谓语动词、定语从句');
 assert.equal(rows['训练重点'],request.focus);
 assert.equal(rows['题型（答题形式）'],'填空、简答 · 决定怎么作答，具体任务由训练内容决定');
 assert.equal(rows['难度与安排'],'方法进阶 · 6题 · 30分钟');
 assert.equal(rows['配图'],'自动判断 · 按题目需要配图');
 assert.equal(rows['补充要求'],request.requirements);
});

test('未选题型时说明按学科自动搭配，必填缺失时明确标出而不是显示空白',()=>{
 const empty=Object.fromEntries(exerciseRequestRows({...request,curriculum:'',focus:'',questionTypes:[],requirements:''},{labels:[]}));
 assert.match(empty['教学范围'],/尚未选择/);
 assert.match(empty['训练重点'],/尚未填写/);
 assert.equal(empty['知识点'],'由训练内容补充');
 assert.match(empty['题型（答题形式）'],/未选择时按学科自动搭配/);
 assert.equal(exerciseTypeSummary([]),'按学科自动搭配');
 assert.equal(exerciseTypeSummary(['填空','简答']),'填空、简答');
});

test('题数口径区分独立选择小题与题组',()=>{
 assert.match(exerciseCountGuidance(6,['填空','简答']),/6题 · 单个选择小题算1题/);
 assert.match(exerciseCountGuidance(6,['填空','简答']),/题数不少于2题/);
 assert.match(exerciseCountGuidance(5,[]),/语法填空、主观材料题可按题组计/);
});

test('摘要与顶部要求板不使用隐藏details，保留现有测试依赖的selection-summary节点',()=>{
 const html=exerciseRequestBriefHTML(request,{labels:['非谓语动词','定语从句'],level:'方法进阶'});
 assert(!/<details/i.test(html),'requirements are visible without a disclosure');
 assert(html.includes('data-ai-selection-summary'));
 assert(html.includes('本次已选要求'));
 assert(html.includes('2个知识点'));
 assert(html.includes('6题'));
 assert(html.includes('30分钟'));
 assert.match(html,/材料、数据与新情境可原创拓展/);
 const summary=exerciseRequestSummaryHTML(request,{labels:['非谓语动词'],level:'方法进阶'});
 assert(summary.includes('data-ai-selection-summary')===false);
 assert(summary.startsWith('<dl>'));
});

test('摘要对所有教师输入做转义，脚本不会被注入',()=>{
 const html=exerciseRequestSummaryHTML({...request,curriculum:'<img src=x onerror=alert(1)>',focus:'函数 <导数>'},{labels:['<b>知识点</b>']});
 assert(!html.includes('<img src=x'));
 assert(html.includes('&lt;img src=x'));
 assert(!html.includes('<b>知识点</b>'));
 assert(html.includes('&lt;b&gt;知识点&lt;/b&gt;'));
});
