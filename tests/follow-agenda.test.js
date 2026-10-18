import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {todayLocal,nextTeachingDayDelay,validTime,scheduleTimeLabel,planMatchesTime,planAgenda,planTimingLabels,comparePlanSchedules,selectedPlans} from '../app/engine/training.js';
import {Atlas} from '../app/engine/atlas.js';
import {buildTeachingReport} from '../app/engine/reports.js';
import {render} from '../app/scenes/follow.js';
const {makeFixture}=createRequire(import.meta.url)('./fixtures.cjs');
const today='2026-10-14';
const plan=(id,extra={})=>({id,sid:'test-4-0',exam:'52',classNo:4,tier:'under',status:'active',subject:'数学',training:{goal:'函数',questions:[],tasks:['same']},schedule:{date:'2026-10-12',slot:'lesson',period:3},...extra});
test('今天与本周同时纳入训练和复核日期，不漏掉早已训练的今日复核',()=>{
 const p=plan('review',{schedule:{date:'2026-10-01'},reviewDate:today});
 assert(planMatchesTime(p,'today',today));assert(planMatchesTime(p,'week',today));
 const agenda=planAgenda([p],{filter:'today',today});assert.deepEqual(agenda.map(g=>g.date),[today]);assert.deepEqual(agenda[0].entries[0].kinds,['review']);
 assert(!planMatchesTime({...p,reviewDate:'2026-10-19'},'week',today));
});
test('同日训练与复核只展示一次，跨日分别列入并保留同一条计划',()=>{
 const p=plan('both',{schedule:{date:today},reviewDate:today}),other=plan('two',{reviewDate:today});
 const original=structuredClone([p,other]),agenda=planAgenda([p,other],{today});
 assert.deepEqual(agenda.map(g=>g.date),['2026-10-12',today]);
 assert.deepEqual(agenda[1].entries[0].kinds,['training','review']);
 assert.equal(agenda[0].entries[0].plan,agenda[1].entries[1].plan);assert.deepEqual([p,other],original);
});
test('训练逾期和复核逾期独立判断，跟进中且未来才复核的计划不误报',()=>{
 assert(planMatchesTime(plan('new',{status:'new',reviewDate:'2026-10-20'}),'overdue',today));
 assert(!planMatchesTime(plan('active',{reviewDate:'2026-10-20'}),'overdue',today));
 const p=plan('late',{reviewDate:'2026-10-13'});assert(planMatchesTime(p,'overdue',today));
 assert.deepEqual(planAgenda([p],{filter:'overdue',today})[0].entries[0].kinds,['review']);
 assert.deepEqual(planTimingLabels(p,today),[{label:'复核逾期',tone:'overdue'}]);
});
test('实际0/5题也算已记录复核，已复核或已完成不再误报逾期',()=>{
 const p=plan('late',{reviewDate:'2026-10-13'});
 assert(!planMatchesTime({...p,review:{correct:0,total:5}},'overdue',today));
 assert(!planMatchesTime({...p,result:'已复核，仍需加强'},'overdue',today));
 assert(!planMatchesTime({...p,status:'done'},'overdue',today));
 assert(planMatchesTime({...p,review:{correct:6,total:5}},'overdue',today));
});
test('未安排复核不套用训练日期作为逾期日期，待安排含需要安排的复核',()=>{
 const p=plan('unscheduled');assert(!planMatchesTime(p,'overdue',today));assert(planMatchesTime(p,'unscheduled',today));
 const agenda=planAgenda([p],{filter:'unscheduled',today});assert.equal(agenda[0].date,'');assert.deepEqual(agenda[0].entries[0].kinds,['review']);
 assert(!planMatchesTime({...p,status:'done',schedule:{}},'unscheduled',today));
 assert(!planMatchesTime({...p,result:'复核已完成'},'unscheduled',today));
});
test('实际时刻按分钟排序，非课内时段不受旧课节字段影响',()=>{
 const p=plan('p',{schedule:{date:today,time:'9:30',slot:'custom',period:9}}),q=plan('q',{schedule:{date:today,time:'17:00',slot:'custom',period:1}}),r=plan('r',{schedule:{date:today,slot:'morning',period:8}}),s=plan('s',{schedule:{date:today,slot:'evening',period:1}});
 assert.deepEqual([s,q,r,p].sort(comparePlanSchedules).map(p=>p.id),['p','q','r','s']);
 assert.equal(scheduleTimeLabel({slot:'break',period:4,time:'09:30',duration:10}),'第4节课后课间 · 09:30 · 10分钟');assert(validTime('9:30'));assert(validTime('23:59'));for(const t of ['24:00','12:60','9:3','-1:00',''])assert(!validTime(t));
});
test('课间排在对应课节之后，非法日期放到待安排最后',()=>{
 const plans=[plan('break4',{schedule:{date:today,slot:'break',period:4}}),plan('lesson5',{schedule:{date:today,slot:'lesson',period:5}}),plan('lesson4',{schedule:{date:today,slot:'lesson',period:4}}),plan('bad',{schedule:{date:'2026-02-30'}})];
 assert.deepEqual(plans.toSorted(comparePlanSchedules).map(p=>p.id),['lesson4','break4','lesson5','bad']);assert.equal(planAgenda(plans,{today}).at(-1).date,'');
});
test('筛选按计划计数，一条跨日计划不会被算成两条，检索保持独立',()=>{
 const atlas=new Atlas(makeFixture()),p=plan('both',{schedule:{date:today},reviewDate:today}),q=plan('other',{classNo:5});
 assert.deepEqual(selectedPlans([p,q],{planClass:4,planTiming:'today',planSearch:'函数'},atlas,today),[p]);
});
test('跟进打印与日程共用训练排序，现有日期列同时保留复核日期',()=>{
 const atlas=new Atlas(makeFixture()),a=plan('early',{schedule:{date:today,time:'09:00',slot:'custom'},reviewDate:'2026-10-16'}),b=plan('late',{sid:'test-4-1',schedule:{date:today,time:'17:00',slot:'custom'}});
 const section=buildTeachingReport(atlas,{kind:'follow',exam:'all'},[b,a]).sections.find(s=>s.title==='执行日程与责任分工');
 assert.match(section.rows[0][2],/09:00.*复核：2026-10-16/);assert.match(section.rows[1][2],/17:00/);assert.equal(section.headers.length,6);
});
test('日期使用中国时区，凌晨自动刷新定时不依赖设备时区',()=>{
 const before=new Date('2026-10-14T15:59:59.000Z'),after=new Date('2026-10-14T16:00:00.000Z');
 assert.equal(todayLocal(before),'2026-10-14');assert.equal(todayLocal(after),'2026-10-15');assert.equal(nextTeachingDayDelay(before),1100);assert.equal(nextTeachingDayDelay(after),86400100);
});
test('日程卡片键唯一、状态可读、备注安全转义，材料不被渲染改写',()=>{
 const data=makeFixture(),scores=JSON.stringify(data.scores),atlas=new Atlas(data),p=plan('cross',{reviewDate:today,note:'<script>bad</script>'});
 const html=render(atlas,{followView:'agenda'},{plans:[p]}).html;
 assert.match(html,/plan-cross-2026-10-12/);assert.match(html,/plan-cross-2026-10-14/);assert.match(html,/aria-pressed="true"/);assert(!html.includes('<script>bad</script>'));assert.equal(JSON.stringify(data.scores),scores);
});
