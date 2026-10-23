import test from 'node:test';import assert from 'node:assert/strict';
import {imageSourceQuestion,figureSourceHash,illustrationSourceHash,legacyFigureSourceHash,createImageJob,imageJobBusy,imageJobSourceCheck,imageReplayBody,applyImagePayload} from '../app/ui/exercise-image-jobs.js';
const baseQuestion=()=>({
 id:1,type:'解答题',level:'中档',stem:'如图，在光滑水平面上放置一物块A。',choices:['A选项','B选项'],answer:'A的加速度为2m/s²。',analysis:'由牛顿第二定律可得。',points:['写出受力分析','代入数据计算'],maxScore:10,minutes:6,target:'牛顿第二定律',
 figureRequest:{caption:'物块受力示意图',requirements:'画出物块A与支持力',knownData:'质量m=2kg',labels:['A'],precision:'exact',placement:{after:'放置一物块A。',width:'wide',aspect:'wide'}},
 figureLayout:{after:'放置一物块A。',width:'standard',aspect:'wide',widthPercent:55},
 diagram:{kind:'illustration',caption:'物块A',description:'光滑水平面上的方形物块A',image:{mime:'image/png',data:'AAAA'}}
});
const reordered=value=>Object.fromEntries(Object.entries(value).reverse());
test('图示源哈希覆盖题干、选项、答案、解析、评分点与图题委托，忽略版位百分比和旧图片数据',()=>{
 const q=baseQuestion(),hash=figureSourceHash(q),source=imageSourceQuestion(q);
 assert.equal(source.diagram.image,undefined);assert.equal(source.figureLayout.widthPercent,undefined);
 for(const field of ['stem','choices','answer','analysis','points','figureRequest']){
  const next=structuredClone(q);next[field]=field==='choices'?['改了']:field==='points'?['改了']:'改了';
  assert.notEqual(figureSourceHash(next),hash,field+' must change the figure source hash');
 }
 const layout=structuredClone(q);layout.figureLayout.width='wide';assert.notEqual(figureSourceHash(layout),hash);
 const percent=structuredClone(q);percent.figureLayout.widthPercent=80;assert.equal(figureSourceHash(percent),hash);
 const image=structuredClone(q);image.diagram.image={mime:'image/png',data:'BBBB'};assert.equal(figureSourceHash(image),hash);
 assert.equal(figureSourceHash(reordered(q)),hash,'key insertion order must not change the hash');
 const illustration=illustrationSourceHash(q),illustrationLayout=structuredClone(q);illustrationLayout.figureLayout.width='compact';
 assert.equal(illustrationSourceHash(illustrationLayout),illustration,'illustration bitmap does not depend on placement');
});
test('新任务记录提交时的完整题干、原始sourceId与重放body，旧任务缺哈希仍走安全兼容',()=>{
 const q=baseQuestion(),record={id:'local-id',localCopyOf:'original-source',imageJobs:{}};
 const figure=createImageJob(record,{questionId:1,type:'figure',question:q,id:'job-figure',now:100});
 assert.equal(figure.type,'figure');assert.equal(figure.status,'submitting');assert.equal(figure.sourceHashVersion,2);
 assert.equal(figure.submission.sourceId,'original-source');assert.equal(figure.submission.questionId,1);assert.equal(figure.submission.redraw,true);
 assert.equal(figure.submission.question.figureLayout.widthPercent,undefined);assert.equal(figure.submission.question.diagram.image,undefined);
 assert.equal(figure.sourceHash,figureSourceHash(figure.submission.question));
 record.imageJobs[1]=figure;assert.equal(imageJobBusy(record,1),true);
 const illustration=createImageJob(record,{questionId:1,type:'illustration',question:q,id:'job-illustration',now:100});
 assert.deepEqual(Object.keys(illustration.submission).sort(),['questionId','redraw','sourceId']);
 assert.equal(illustration.submission.sourceId,'original-source');assert.equal(illustration.submission.redraw,false);
 assert.equal(illustration.sourceHash,illustrationSourceHash(q));
 record.imageJobs[1]={...illustration,status:'failed'};assert.equal(imageJobBusy(record,1),false);
 record.localCopyOf='changed-after-submit';
 assert.deepEqual(imageReplayBody(illustration,record),illustration.submission,'replay must reuse the original submission, not the current record');
 const legacy=imageReplayBody({questionId:1},record);assert.equal(legacy.sourceId,'changed-after-submit');
 const old={id:'old',type:'figure',questionId:1,status:'running',sourceHash:legacyFigureSourceHash(q)};
 assert.deepEqual(imageJobSourceCheck(old,q),{verified:true,basis:'legacy-hash',match:true});
 const changed=structuredClone(q);changed.figureRequest={...changed.figureRequest,requirements:'换一张图'};
 assert.equal(imageJobSourceCheck(old,changed).match,true,'legacy hash only covered the five prose fields');
 const submissions={id:'old2',type:'figure',questionId:1,status:'running',submission:{sourceId:'original-source',questionId:1,redraw:true,question:structuredClone(q)}};
 assert.equal(imageJobSourceCheck(submissions,q).match,true);
 assert.equal(imageJobSourceCheck(submissions,changed).match,false,'a captured submission verifies the full source even for old jobs');
 assert.deepEqual(imageJobSourceCheck({id:'old3',questionId:1,status:'running'},q),{verified:false,basis:'missing',match:false});
});
test('过期插图/图示结果不写入新题，老师的新修改保留；匹配结果正常应用',()=>{
 const q=baseQuestion(),record={sheet:{questions:[q]},imageJobs:{},reviewedAt:'2026-10-18T00:00:00.000Z'};
 const job=createImageJob(record,{questionId:1,type:'illustration',question:q,id:'i1'});
 const applied=applyImagePayload(record,job,{questionId:1,image:{mime:'image/png',data:'NEW'}});
 assert.equal(applied.changed,true);assert.equal(applied.stale,false);assert.equal(q.diagram.image.data,'NEW');assert.equal(job.status,'ready');assert.equal(record.reviewedAt,null);

 const pending=createImageJob(record,{questionId:1,type:'figure',question:q,id:'f1'});
 q.stem='老师刚刚改过的题干。';record.reviewedAt='teacher-approval';
 const stale=applyImagePayload(record,pending,{questionId:1,diagram:{kind:'plot',caption:'旧图'}});
 assert.equal(stale.stale,true);assert.equal(job.status,'ready');assert.equal(pending.status,'failed');assert.equal(pending.stale,true);assert.match(pending.failure,/题干已在绘图期间修改/);
 assert.equal(q.stem,'老师刚刚改过的题干。','the edited stem must survive');assert.equal(q.diagram.kind,'illustration','the old figure must not replace the current diagram');assert.equal(q.diagram.image.data,'NEW');assert.equal(record.reviewedAt,'teacher-approval');

 const legacy={id:'legacy',type:'illustration',questionId:1,status:'queued'};
 const before=structuredClone(q);const rejected=applyImagePayload(record,legacy,{questionId:1,image:{mime:'image/png',data:'OLD'}});
 assert.equal(rejected.stale,true);assert.equal(legacy.status,'failed');assert.match(legacy.failure,/旧版本任务/);assert.deepEqual(q,before);
});
test('图示结果与返回题目编号不一致时不应用',()=>{
 const q=baseQuestion(),record={sheet:{questions:[q]},imageJobs:{}};const job=createImageJob(record,{questionId:1,type:'figure',question:q,id:'f2'});
 const result=applyImagePayload(record,job,{questionId:2,diagram:{kind:'plot'}});
 assert.equal(result.stale,true);assert.equal(job.status,'failed');assert.equal(q.diagram.kind,'illustration');
});
