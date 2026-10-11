function makeFixture(){
const fixture={schemaVersion:1,title:'匿名校检材料',school:'测试学校',grade:'校检年级',students:[],scores:[],answers:[],profiles:{},banks:{},exams:[{id:'51',label:'测试第一场',order:1,scope:'school'},{id:'52',label:'测试第二场',order:2,scope:'school'}],lines:[],sheets:[]};
for(const exam of ['51','52']) for(const track of ['physics','history']) fixture.lines.push({exam,track,top:520,under:400,subjects:Object.fromEntries(['语文','数学','英语','日语','物理','历史','化学','生物','政治','地理'].map(s=>[s,{top:90,under:60}]))});
for(const no of [4,7,10,17,18]) for(let i=0;i<(no===4?35:4);i++) {
 const id=`test-${no}-${i}`,name=`校检${no}班${String(i+1).padStart(2,'0')}`,language=no===7?'日语':'英语',track=[10,18].includes(no)?'history':'physics';
 fixture.students.push({id,name});
 for(const exam of ['51','52']) {
  const scores=[i===0?0:i===1?null:35+(i*7)%80,i===1?null:50+(i*3)%80,60+i%35];
  const subjects=Object.fromEntries(['语文','数学',language,...(track==='physics'?['物理','化学','生物']:['历史','政治','地理'])].map((s,j)=>[s,{score:j===0?scores[0]:j===1?scores[1]:scores[2],raw:j===2&&language==='日语'?80:scores[Math.min(j,2)],schoolRank:i+1}]));
  fixture.scores.push({exam,sid:id,classNo:no,track,language,total:i===1?null:370+i*5+(exam==='52'?10:0),rawTotal:null,schoolRank:i+1,subjects});
 }
 fixture.answers.push({exam:'52',sid:id,classNo:no,track,subject:'数学',values:i===0?[0,0,null]:i===1?[null,null,null]:i===2?[2,null,4]:[i%6,i%11,i%5]});
 if([4,7].includes(no)) fixture.answers.push({exam:'52',sid:id,classNo:no,track,subject:language,values:[2,5]});
}
fixture.banks['数学|52']=[{label:'1',max:5,knowledge:'函数'},{label:'2',max:10,knowledge:'函数'},{label:'3',max:null,knowledge:''}];
fixture.banks['英语|52']=[{label:'1',max:5,knowledge:'阅读'},{label:'2',max:10,knowledge:'阅读'}];
fixture.banks['日语|52']=[{label:'1',max:5,knowledge:'阅读'},{label:'2',max:10,knowledge:'阅读'}];
return fixture;
}
function makeWideFixture(){
 const data=makeFixture();
 for(let no=1;no<=18;no++){
  const track=no<10||no===17?'physics':'history';
  if(!data.scores.some(r=>r.classNo===no)){
   const source=track==='physics'?4:10,people=data.students.filter(p=>data.scores.some(r=>r.classNo===source&&r.sid===p.id)).slice(0,4);
   for(const person of people){const sid=person.id+'-class'+no;data.students.push({id:sid,name:'观察'+no+'班'+person.name.slice(-2)});for(const list of [data.scores,data.answers])list.push(...list.filter(r=>r.sid===person.id).map(r=>({...structuredClone(r),sid,classNo:no,track})));}
  }
  data.profiles[no]={classNo:no,track,cohort:no>=17?'repeat':'regular',lead:'匿名教师'+no,type:'平行班',combination:track==='physics'?'物化生':'史政地',teachers:{数学:'匿名数学教师',英语:'匿名外语教师'}};
 }
 return data;
}
module.exports={makeFixture,makeWideFixture};
