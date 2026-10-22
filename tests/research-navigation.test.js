import test from 'node:test';import assert from 'node:assert/strict';
import {replaceResearchHistory,pushResearchHistory,researchPath,researchStudySnapshot,researchHistoryState,researchHistoryStudy,researchHistoryConditions} from '../app/engine/research-navigation.js';
test('相同研究状态不重复写历史；历史限额不抛出到界面切换流程',()=>{
 let writes=0;const history={state:{keep:1},replaceState(value){writes++;this.state=value;}};
 assert.equal(replaceResearchHistory(history,'#board',{keep:1}),false);assert.equal(writes,0);
 assert.equal(replaceResearchHistory(history,'#board',{keep:2}),true);assert.equal(writes,1);
 history.replaceState=()=>{throw new DOMException('limited','SecurityError');};assert.equal(replaceResearchHistory(history,'#board',{keep:3}),false);
});
test('pushState 受限时回退原生地址导航，保留目标地址且不阻止绘制',()=>{
 const history={pushState(){throw new DOMException('limited','SecurityError');}},location={hash:'#papers'};
 assert.equal(pushResearchHistory(history,location,'#people'),'native');assert.equal(location.hash,'#people');assert.equal(pushResearchHistory(history,location,'#people'),'same');
 assert.equal(pushResearchHistory({pushState(){}},{hash:'#board'},'#follow'),'pushed');
 const blocked={get hash(){return '#board';},set hash(value){throw Error('blocked');}};assert.equal(pushResearchHistory(history,blocked,'#follow'),'unavailable');
});
const options=(study,trail=[])=>({scope:'workspace-A',hash:researchPath(study.scene,study.values),study,trail});
const entry=()=>({scene:'class',values:{no:4,tab:'history',exam:'51',exams:['51'],search:'甲，乙',matrix:'rank',matrixOrder:'up'},position:{top:720,section:'matrix',offset:104,details:[{key:'id:rows',open:true}],tables:[{key:'roster',left:200,top:514}]},drawer:{type:'person',sid:'student-1',exam:'51',tab:'questions'},drawerTop:390,drawerTables:[{key:'answers',left:32,top:220}]});
test('历史条目保留本次考次、筛选、双向读表位置和观察状态，之后的修改不覆盖旧条目',()=>{const study=entry(),original=structuredClone(study),opts=options(study),state=researchHistoryState(null,opts);study.values.exam='52';study.values.exams.push('52');study.position.tables[0].top=0;study.drawer.tab='overview';const restored=researchHistoryStudy(state,opts);assert.deepEqual(restored.study,original);restored.study.values.search='';assert.equal(researchHistoryStudy(state,opts).study.values.search,'甲，乙');});
test('前进恢复各条目自己的研究路径；历史路径最多保留10层且不改写输入',()=>{const trail=Array.from({length:13},(_,i)=>({scene:'board',values:{mode:'roster',exam:String(i)}})),before=structuredClone(trail),a=entry(),b={scene:'people',values:{sid:'student-1',exam:'51'}},stateA=researchHistoryState(null,options(a,trail)),stateB=researchHistoryState(null,options(b,[a]));assert.deepEqual(researchHistoryStudy(stateA,options(a)).trail,trail.slice(-10));assert.deepEqual(researchHistoryStudy(stateB,options(b)).trail,[a]);assert.deepEqual(trail,before);});
test('换材料、旧页面会话、地址不匹配和不完整旧历史条目不恢复过期条件',()=>{const study=entry(),opts=options(study),state=researchHistoryState(null,opts);assert.equal(researchHistoryStudy(state,{...opts,scope:'workspace-B'}),null);assert.equal(researchHistoryStudy(state,{...opts,hash:'#people'}),null);assert.equal(researchHistoryStudy(null,opts),null);assert.equal(researchHistoryStudy({jianweiResearch:{version:0,...opts}},opts),null);for(const bad of [{scene:'missing',values:{}},{scene:'class',values:null},{scene:'class',values:[]}])assert.equal(researchHistoryStudy(researchHistoryState(null,{...opts,study:bad}),opts),null);});
test('共享地址编码兼容学科和学生特殊字符，直接链接不能借用其他地址的状态',()=>{assert.equal(researchPath('papers',{key:'数学|52'}),'#papers/'+encodeURIComponent('数学|52'));assert.equal(researchPath('people',{sid:'a/b',exam:'学期/一'}),'#people/a%2Fb/'+encodeURIComponent('学期/一'));assert.equal(researchPath('people',{}),'#people');assert.equal(researchPath('board',{mode:'roster'}),'#board');const study=entry(),opts=options(study),state=researchHistoryState(null,{...opts,hash:'#board'});assert.equal(researchHistoryStudy(state,{...opts,hash:'#board'}),null);});
test('保存阅读条件不吞掉其他历史状态，也不把原始成绩混入快照',()=>{const foreign={scrollKey:'other',nested:{keep:true}},before=structuredClone(foreign),study=entry(),state=researchHistoryState(foreign,options(study));assert.equal(state.scrollKey,'other');assert.deepEqual(foreign,before);assert.equal('scores' in state.jianweiResearch,false);assert.equal('answers' in state.jianweiResearch,false);assert.equal(state.jianweiResearch.study.scene,'class');});
test('输入后立即刷新或离开，历史采用最新条件，保留阅读和观察位置且不改写已绘制快照',()=>{
 const painted=entry(),before=structuredClone(painted),values={...painted.values,search:'校检4班03',page:1,minScore:'0',matrixOrder:'down'},live=researchStudySnapshot(painted,{scene:'class',values,hash:researchPath('class',values)}),state=researchHistoryState(null,options(live));
 values.search='下一次输入';const restored=researchHistoryStudy(state,options(live)).study;
 assert.equal(restored.values.search,'校检4班03');assert.equal(restored.values.minScore,'0');assert.equal(restored.values.matrixOrder,'down');assert.deepEqual(restored.position,before.position);assert.deepEqual(restored.drawer,before.drawer);assert.equal(restored.drawerTop,390);assert.deepEqual(painted,before);
});
test('尚未绘制的新页面和对象不能把条件混到上一个学生、试卷或班级的阅读快照',()=>{
 const samples=[
  [{scene:'people',values:{sid:'student-a',exam:'51'}},'people',{sid:'student-b',exam:'52'}],
  [{scene:'papers',values:{key:'数学|51',search:'甲'}},'papers',{key:'英语|52',search:'乙'}],
  [entry(),'class',{...entry().values,no:7}],
  [entry(),'class',{...entry().values,tab:'snapshot'}],
  [entry(),'people',{sid:'student-a',search:'新条件'}]
 ];
 for(const [painted,scene,values] of samples)assert.deepEqual(researchStudySnapshot(painted,{scene,values,hash:researchPath(scene,values)}),painted);
 assert.deepEqual(researchStudySnapshot(entry(),{scene:'class',values:{...entry().values,search:'迟到'},hash:'#board'}),entry());assert.equal(researchStudySnapshot(null),null);
});
test('六个入口同一研究地址都保留尚未完成重绘的最新检索，快照与后续输入独立',()=>{
 for(const [scene,values] of [['board',{mode:'roster',exam:'51'}],['class',{no:4,tab:'history',exam:'51'}],['papers',{key:'数学|52',tab:'students'}],['people',{sid:'',directoryExam:'51'}],['follow',{planView:'list'}],['library',{tab:'notebook'}]]){
  const painted={scene,values:{...values,search:''}},current={...values,search:'校检4班05',page:1},study=researchStudySnapshot(painted,{scene,values:current,hash:researchPath(scene,current)}),state=researchHistoryState(null,options(study));current.search='';assert.equal(researchHistoryStudy(state,options(study)).study.values.search,'校检4班05');assert.equal(painted.values.search,'');
 }
});
test('即时条件检查点更新本条检索，沿用最后阅读位置和返回路径，不依赖卸载事件或DOM重绘',()=>{
 const painted=entry(),trail=[{scene:'board',values:{mode:'roster',exam:'51'}}],old=researchHistoryState({foreign:'keep'},options(painted,trail)),before=structuredClone(old),values={...painted.values,search:'校检4班03',page:1},state=researchHistoryConditions(old,{...options(painted),scene:'class',values,painted,trail:[]});
 const saved=researchHistoryStudy(state,options(painted));assert.equal(saved.study.values.search,'校检4班03');assert.deepEqual(saved.study.position,painted.position);assert.deepEqual(saved.study.drawer,painted.drawer);assert.deepEqual(saved.trail,trail);assert.equal(state.foreign,'keep');assert.deepEqual(old,before);
});
test('即时条件检查点拒绝旧工作区状态，首次已绘制页面可建立检查点，导航中的其他地址不写入',()=>{
 const painted=entry(),opts={...options(painted),scene:'class',values:{...painted.values,search:'新输入'},painted,trail:[]},first=researchHistoryConditions(null,opts);assert.equal(researchHistoryStudy(first,opts).study.values.search,'新输入');
 const old=researchHistoryState(null,{...options(painted),scope:'old'}),next=researchHistoryConditions(old,opts);assert.equal(researchHistoryStudy(next,opts).study.values.search,'新输入');
 assert.equal(researchHistoryConditions(first,{...opts,hash:'#people'}),null);assert.equal(researchHistoryConditions(first,{...opts,scene:'people',values:{sid:''}}),null);assert.equal(researchHistoryConditions(null,{...opts,painted:null}),null);
});
