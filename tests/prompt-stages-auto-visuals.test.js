import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import server from '../backend/server.cjs';
import totp from '../backend/totp.cjs';
import tencent from '../backend/tencent.cjs';
import generator from '../backend/generator.cjs';
import templates from '../backend/templates.cjs';
import completion from '../backend/model-completion.cjs';
import control from '../backend/model-control.cjs';
import figures from '../backend/figure-generation.cjs';
import groups from '../backend/exercise-groups.cjs';
import stores from '../backend/store.cjs';
import policy from '../backend/prompt-policy.cjs';
import {validateExerciseRequest,validateExerciseResult} from '../app/engine/exercise-contract.js';
import {newExerciseDraft} from '../app/engine/exercise-drafts.js';
import {saveExerciseSetup,applyExerciseSetup,savedExerciseSetups} from '../app/engine/exercise-setups.js';
import {exerciseVisualOptions,exerciseVisualLabel} from '../app/ui/exercise-visual-policy.js';
import {solidFigures} from './fixtures/exercise-figures.js';
const input={subject:'数学',grade:'高三',examStyle:'sichuan-gaokao',answerSpaceVersion:1,curriculum:'已学函数与导数',focus:'导数与单调性',targets:['导数与单调性'],count:3,minutes:20,difficulty:'拓展挑战',evidence:[],visuals:'auto'};
const sheet=(tag,request=input)=>({title:'专项练习',objective:request.focus,questions:[1,2,3].map(id=>({id,level:id===1?'基础':'巩固',type:'填空',stem:tag+'：求第'+id+'个结果。',choices:[],answer:'2',analysis:'代入计算得2。',points:['正确得5分。'],maxScore:5,minutes:6,answerLines:0,...(request.targets?.length?{target:request.targets[0]}:{})}))});
test('十科、三策略、四配图方式分别编译出题与修复提示，教师原始选择不变，修复不继承重新命题',async()=>{
 for(const {subject} of templates.summary().subjects)for(const template of ['targeted','variation','retest'])for(const visuals of ['auto','none','vector','hybrid']){
  const request={...input,subject,template,visuals,requirements:'保留教师原始要求'},original=structuredClone(request);
  const author=await generator.buildExercisePrompt(request,{separateFigures:true}),repair=await generator.buildRepairPrompt(request,{output:'原稿只作教学数据',validation:'字段校验错误'},{separateFigures:true});
  assert.deepEqual(request,original);assert.deepEqual(author.input,original);assert.deepEqual(JSON.parse(JSON.parse(author.body).contents[0].parts[0].text),original);
  assert.equal(author.stage,'exercise');assert.equal(repair.stage,'repair');assert.deepEqual(author.schema,repair.schema);
  assert.match(author.system,/三者的交集/);assert.match(author.system,/所有已选训练点至少覆盖一次/);assert.match(author.system,/教师确认的训练目标，不声称由考试发现/);
  assert.match(repair.system,/最初原稿是所有轮次唯一保真基准/);assert(!repair.system.includes('【训练策略与难度】'));assert(!repair.system.includes('重设计整题'));assert(!repair.system.includes('逐题安排（'));assert(!repair.system.includes('完整字段编码示例'));
  const example=JSON.parse(author.system.split('输出形状：')[1].split('。完整Schema：')[0]);assert.equal(example.questions[0].level,'迁移');
  if(subject!=='数学')assert(!author.system.includes('幂函数求导法则'));
  if(visuals==='none')assert(!author.schema.properties.questions.items.properties.figureRequest);else assert(author.schema.properties.questions.items.properties.figureRequest);
  if(visuals==='auto')assert.match(author.system,/无需图就省略图示字段/);
 }
});
test('Gemini实际发送的尾部规则遵循环节Schema，图题核对不被混入每题字段，格式修复保持保真边界',async()=>{
 const generation={provider:'gemini',model:'gemini-3.8-flash',protocol:'gemini',base:control.routes.gemini.url,reasoningEffort:'high'},captured=[];
 const transport=async(_,options)=>{captured.push(JSON.parse(options.body));return {status:200,body:JSON.stringify({candidates:[{content:{parts:[{text:'{}'}]},finishReason:'STOP'}]})};};
 for(const prompt of [{system:policy.stagePolicy('figure-review'),input:{},schema:{type:'object',properties:{approved:{type:'boolean'}}}},await generator.buildExercisePrompt(input,{separateFigures:true}),await generator.buildRepairPrompt(input,{output:'完整原稿',validation:'公式标记错误'},{separateFigures:true})])await completion.completeGemini(prompt,generation,{key:'test-only',transport});
 const tails=captured.map(p=>p.contents.at(-1).parts.at(-1).text);
 assert(!/每题|choices|figureRequest/.test(tails[0]));assert.match(tails[1],/choices:\[\]/);assert.match(tails[2],/不重新命题/);assert(!tails[2].includes('需要配图时给出完整图示委托'));
});
test('自动配图是新草稿默认值，显式策略和旧任务不被改写；自动模式可保存套用',()=>{
 const legacy={...input};delete legacy.visuals;const fresh=newExerciseDraft(legacy);assert.equal(fresh.visuals,'auto');assert(!Object.hasOwn(legacy,'visuals'));
 assert.equal(exerciseVisualOptions[0].value,'auto');assert.match(exerciseVisualLabel('auto'),/自动判断/);
 for(const visuals of ['none','vector','hybrid','auto']){assert.equal(newExerciseDraft({...input,visuals}).visuals,visuals);validateExerciseRequest({...input,visuals});const saved=saveExerciseSetup([],{...input,visuals},{name:'策略草稿',newId:()=> 'saved',now:100});const [row]=savedExerciseSetups(JSON.parse(JSON.stringify(saved.rows)));assert.equal(applyExerciseSetup(row,{...input,visuals:'none'}).visuals,visuals);}
});
test('自动模式允许纯文字成稿和精确SVG；复杂外观可生图，精确委托与手动vector始终不能走位图',async()=>{
 const request={...input,difficulty:'基础巩固'};assert.deepEqual(await generator.validateOutput(JSON.stringify(sheet('无图',request)),request,{separateFigures:true}),sheet('无图',request));
 const q={...sheet('有图',request).questions[0],stem:'长方体模型如图所示。\n求线面关系。',figureRequest:{caption:'长方体',requirements:'八个顶点与遮挡棱',knownData:'长3宽2高2',labels:['A','B'],precision:'exact',placement:{after:'长方体模型如图所示。',width:'standard',aspect:'wide'}}};
 const vector=await figures.planFigure(q,request,{complete:async()=>({output:JSON.stringify({diagram:solidFigures[0]})})});assert.equal(vector.diagram.kind,'geometry');
 const illustration={kind:'illustration',caption:'结构外观示意',description:'只呈现题干已给的结构外观，不承担定量关系。'},output=JSON.stringify({diagram:illustration});
 await assert.rejects(figures.parseFigurePlan(output,q,request),/FIGURE_PLAN_INVALID/);
 const qualitative={...q,figureRequest:{...q.figureRequest,precision:'illustrative'}};
 assert.equal((await figures.parseFigurePlan(output,qualitative,request)).kind,'illustration');
 await assert.rejects(figures.parseFigurePlan(output,qualitative,{...request,visuals:'vector'}),/FIGURE_PLAN_INVALID/);
 await assert.rejects(figures.parseFigurePlan(JSON.stringify({diagram:solidFigures[0]}),q,{...request,visuals:'none'}),/FIGURE_PLAN_INVALID/);
 await assert.rejects(generator.validateOutput(JSON.stringify({...sheet('无图',request),questions:sheet('无图',request).questions.map((q,i)=>i?q:{...q,diagram:solidFigures[0]})}),{...request,visuals:'none'}),/MODEL_CONTENT_INVALID/);
});
test('自动模式可从本人已有题目重绘复杂插图，不配图策略拒绝重绘且不能绕过来源校验',async()=>{
 const store=new stores.MemoryStore(),dispatches=[],env={TRAINING_SESSION_SECRET:'local-test-'+crypto.randomUUID(),TRAINING_TOTP_SECRET:totp.encodeSecret(Buffer.from('12345678901234567890'))},app=server.createServer({store,env,dispatch:async k=>dispatches.push(k)});
 await new Promise(resolve=>app.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+app.address().port;let token='';const call=(route,body,id)=>fetch(base+route,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{}),...(id?{'X-Request-ID':id}:{})},body:JSON.stringify(body)});
 try{
  token=(await(await call('/session',{code:totp.codeForCounter(env.TRAINING_TOTP_SECRET,Math.floor(Date.now()/30000))})).json()).token;
  for(const visuals of ['auto','none']){const sourceId=crypto.randomUUID(),source='jobs/'+tencent.hash(env.TRAINING_SESSION_SECRET).slice(0,32)+'/'+sourceId,request={...input,subject:'生物',visuals,difficulty:'基础巩固'},document=sheet(visuals,request);document.questions[0].diagram={kind:'illustration',caption:'细胞外观',description:'题干已给的外观示意。'};
   await store.create(source+'/meta.json',{type:'exercise',input:request});await store.create(source+'/result.json',{status:'ready',sheet:document});
   const r=await call(visuals==='auto'?'/illustrations':'/figures',{sourceId,questionId:1},crypto.randomUUID());assert.equal(r.status,visuals==='auto'?202:400);
  }
  assert.equal(dispatches.length,1);const dispatched=(await store.get(dispatches[0]+'/meta.json')).value;assert.equal(dispatched.type,'illustration');const source=(await store.get('jobs/'+tencent.hash(env.TRAINING_SESSION_SECRET).slice(0,32)+'/'+dispatched.input.sourceId+'/meta.json')).value;assert.equal(source.input.visuals,'auto');assert.equal((await call('/illustrations',{sourceId:crypto.randomUUID(),questionId:1},crypto.randomUUID())).status,400);
 }finally{await new Promise(resolve=>app.close(resolve));}
});
test('分组自动配图以实际已用插图决定后组权限，前组零图不占用权限，已冻结的请求与模型保持不变',async()=>{
 for(const usedAt of [-1,0,1]){
  const store=new stores.MemoryStore(),key='jobs/test/'+crypto.randomUUID(),queue=[],request={...input,count:9,minutes:54,difficulty:'基础巩固'},generation={provider:'unit',model:'frozen'},options={dispatch:async k=>queue.push(k)};
  await groups.begin(store,key,{input:request,generation,imageGeneration:{provider:'image-unit',model:'image-frozen'}},options);
  for(let index=0;index<3;index++){
   const child=queue.shift(),job=(await store.get(child+'/meta.json')).value;assert.equal(job.input.visuals,usedAt>=0&&index>usedAt?'vector':'auto');assert.deepEqual(job.generation,generation);
   const document=sheet('第'+index+'组',job.input);if(index===usedAt){const bytes=fs.readFileSync(new URL('../assets/school-crest-192.png',import.meta.url));document.questions[0].diagram={kind:'illustration',caption:'已给结构外观',description:'教学示意',image:{mime:'image/png',data:bytes.toString('base64')}};}
   await store.create(child+'/result.json',{status:'ready',sheet:document});await groups.snapshot(store,key,options);
  }
  const result=await groups.snapshot(store,key,options);assert.equal(result.status,'ready');assert.equal(result.sheet.questions.filter(q=>q.diagram?.kind==='illustration').length,usedAt<0?0:1);validateExerciseResult(result.sheet,request);assert.equal((await store.get(key+'/groups.json')).value.input.visuals,'auto');
 }
});
test('洗气瓶不能把导管标签当成仪器节点；提示与校验反馈明确指向可用的drawing路径',async()=>{
 const request={...input,subject:'化学'},q={...sheet('装置',request).questions[0],figureRequest:{precision:'exact'}},bad={kind:'apparatus',caption:'洗气瓶示意',description:'长短导管',nodes:[{id:'bottle',x:50,y:50,label:'',shape:'vessel',equipment:'gas-bottle',liquidLevel:45,inlet:'long',outlet:'short'},{id:'label-a',x:30,y:20,label:'a',shape:'point'}],edges:[]};
 await assert.rejects(figures.parseFigurePlan(JSON.stringify({diagram:bad}),q,request),e=>/端口字母或水面标签不能作为point节点/.test(e.cause.message));
 let prompt;await figures.planFigure(q,request,{complete:async p=>{prompt=p;return {output:JSON.stringify({diagram:{kind:'drawing',caption:'已给结构',description:'题干给定的结构与字母',scene:[{type:'path',d:'M 100 100 L 200 100 L 200 200'},{type:'text',x:100,y:80,text:'a'}]}})};}});
 assert.match(prompt.system,/若这些位置标签是题目必需，就对整张图使用drawing/);assert.match(prompt.system,/不能混入shape:point/);
});
