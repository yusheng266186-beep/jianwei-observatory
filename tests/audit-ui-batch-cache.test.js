import test from 'node:test';import assert from 'node:assert/strict';
import {batchRoster,filterBatchRoster,batchClasses,cachedExerciseExams} from '../app/ui/exercise-batch.js';
function makeAtlas({count=2000,exams=['50','51','52','53','54','55'],namePrefix='学生',tag='材料甲'}={}){
 const people=new Map(),stories=new Map(),personAnswers=new Map(),stats={material:0};
 for(let i=0;i<count;i++){
  const sid='s'+String(i).padStart(5,'0'),name=namePrefix+(i+1),classNo=(i%12)+1;
  people.set(sid,{id:sid,name});
  stories.set(sid,exams.map(exam=>({sid,exam,classNo,subjects:{数学:{score:80},物理:{score:70}}})));
 }
 const atlas={data:{tag},people,personAnswers,name:sid=>people.get(sid)?.name||'',exam:id=>({id,label:'考试'+id}),materialStory(sid){stats.material++;return stories.get(sid)||[]}};
 return {atlas,stats,stories,people};
}
test('全年级roster与逐生exerciseExams按atlas/材料/subject/exam缓存，输入只过滤',()=>{
 const {atlas,stats}=makeAtlas();
 const first=batchRoster(atlas,'数学','53');
 assert.equal(first.length,2000);assert.equal(stats.material,2000,'one material read per pupil on first build');
 const again=batchRoster(atlas,'数学','53');assert.equal(again,first,'the same roster array is reused');
 assert.equal(stats.material,2000);
 const started=performance.now();
 for(let i=0;i<40;i++){const rows=filterBatchRoster(first,{query:(i%2?'学生1':'学生2')+'',classNo:i%4===0?2:null});assert(rows.every(row=>row.name.includes(i%2?'学生1':'学生2')));}
 const elapsed=performance.now()-started;
 assert.equal(stats.material,2000,'typing must not rebuild the full-grade roster');
 assert(elapsed<1000,'anonymous 2,000-pupil/40-filter bench stays well below a second, took '+elapsed.toFixed(1)+'ms');
 const byClass=filterBatchRoster(first,{classNo:2});assert(byClass.length>0&&byClass.every(row=>row.classNo===2));
 assert.deepEqual(batchClasses(first),Array.from({length:12},(_,i)=>i+1));
 assert.equal(stats.material,2000);
});
test('切换学科重建该科逐生依据，切换考次只重选行；新材料不继承旧缓存',()=>{
 const {atlas,stats}=makeAtlas();
 batchRoster(atlas,'数学','52');assert.equal(stats.material,2000);
 batchRoster(atlas,'数学','53');assert.equal(stats.material,2000,'another exam reuses the per-pupil subject lists');
 batchRoster(atlas,'物理','53');assert.equal(stats.material,4000,'a new subject reads each pupil once');
 const physics=cachedExerciseExams(atlas,'s00001','物理');assert.equal(physics[0].subjects.物理.score,70);

 const next=makeAtlas({tag:'材料乙',namePrefix:'新同学'});
 const rows=batchRoster(next.atlas,'数学','53');
 assert.equal(rows[0].name,'新同学1');
 assert.equal(next.stats.material,2000,'a new material version must not reuse the old roster');
 assert.notEqual(rows[0].name,'学生1');

 atlas.data={tag:'材料甲修订'};
 batchRoster(atlas,'数学','53');
 assert.equal(stats.material,6000,'replacing the dataset on the same Atlas also invalidates the caches');
});
test('每个学生保留自己的考次与依据，过滤不会换成别人的材料',()=>{
 const {atlas}=makeAtlas({count:3,exams:['51','52','53']});
 atlas.materialStory=sid=>sid==='s00000'
  ?[{sid,exam:'51',classNo:1,subjects:{数学:{score:10}}}]
  :[{sid,exam:'51',classNo:2,subjects:{数学:{score:20}}},{sid,exam:'53',classNo:2,subjects:{数学:{score:30}}}];
 const rows=batchRoster(atlas,'数学','53');
 assert.deepEqual(rows.map(row=>[row.sid,row.exam,row.subjects.数学.score]),[['s00000','51',10],['s00001','53',30],['s00002','53',30]]);
 const filtered=filterBatchRoster(rows,{query:'学生2'});
 assert.equal(filtered.length,1);assert.equal(filtered[0].exam,'53');assert.equal(filtered[0].subjects.数学.score,30);
 assert.equal(rows[0].exam,'51','filtering must not rewrite another pupil’s anchor exam');
});
