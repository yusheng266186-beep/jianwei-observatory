import test from 'node:test';import assert from 'node:assert/strict';import crypto from 'node:crypto';import {deflateSync} from 'node:zlib';
import {validateExerciseRequest,validateExerciseResult,minimumExerciseMinutes} from '../app/engine/exercise-contract.js';
import {validateExerciseDiagram} from '../app/engine/exercise-diagrams.js';
import {mergeJobSnapshot,jobSnapshotCurrent} from '../app/engine/exercise-jobs.js';
import storeModule from '../backend/store.cjs';import worker from '../backend/worker.cjs';import {resolve as resolveMedia} from '../backend/media-idempotency.cjs';
const {MemoryStore}=storeModule;
const base={subject:'数学',grade:'高三',curriculum:'函数与导数',focus:'单调性',count:3,minutes:15,difficulty:'基础巩固',evidence:[]};
const sheet=(count=3,minutes=5)=>({title:'匿名练习',objective:'核对容量与时长',questions:Array.from({length:count},(_,i)=>({id:i+1,level:i?'巩固':'基础',type:'填空',stem:'第'+(i+1)+'题：计算 $x+1$ 的值。',choices:[],answer:'2',analysis:'依据加法得到结果。',points:['结果正确'],maxScore:5,minutes}))});
function crc32(bytes){let crc=0xffffffff;for(const b of bytes){crc^=b;for(let i=0;i<8;i++)crc=crc>>>1^((crc&1)?0xedb88320:0);}return (crc^0xffffffff)>>>0;}
function chunk(type,data){const name=Buffer.from(type),length=Buffer.alloc(4),crc=Buffer.alloc(4);length.writeUInt32BE(data.length);crc.writeUInt32BE(crc32(Buffer.concat([name,data])));return Buffer.concat([length,name,data,crc]);}
function png(width=1024,height=768){const header=Buffer.alloc(13);header.writeUInt32BE(width,0);header.writeUInt32BE(height,4);header[8]=8;header[9]=2;const pixels=Buffer.alloc((width*3+1)*height);for(let y=0;y<height;y++)crypto.randomBytes(width*3).copy(pixels,y*(width*3+1)+1);return Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),chunk('IHDR',header),chunk('IDAT',deflateSync(pixels)),chunk('IEND',Buffer.alloc(0))]);}
test('题数与客观最短用时不可行的请求在提交前拒绝，合理组合保持不变',()=>{
 assert.equal(minimumExerciseMinutes(12),8);
 assert.throws(()=>validateExerciseRequest({...base,count:12,minutes:5}),/不匹配.*至少8分钟/);
 assert.throws(()=>validateExerciseRequest({...base,count:12,minutes:7}),/不匹配.*至少8分钟/);
 assert.doesNotThrow(()=>validateExerciseRequest({...base,count:12,minutes:8}));
 assert.doesNotThrow(()=>validateExerciseRequest({...base,count:12,minutes:90}));
 assert.doesNotThrow(()=>validateExerciseRequest({...base,count:3,minutes:5}));
 assert.throws(()=>validateExerciseResult(sheet(12,1),{...base,count:12,minutes:5}),/不匹配.*至少8分钟/);
});
test('单张合法插图不再被整份文本上限误拒，文本与图片总量仍各自有界',()=>{
 const image=png().toString('base64'),diagram={kind:'illustration',caption:'匿名图',description:'匿名结构示意',image:{mime:'image/png',data:image}};
 assert(image.length>2*1024*1024&&image.length<4000000);
 assert.doesNotThrow(()=>validateExerciseDiagram(diagram));
 const withImage=sheet();withImage.questions[0].diagram=diagram;
 assert.doesNotThrow(()=>validateExerciseResult(withImage,{...base,visuals:'hybrid'}));
 assert.doesNotThrow(()=>validateExerciseResult(structuredClone(withImage),{...base,visuals:'hybrid'}));
 const longText=sheet();longText.questions[0].answer='大'.repeat(800000);
 assert.throws(()=>validateExerciseResult(longText,base),/文档处理容量/);
 const twoImages=sheet();twoImages.questions[0].diagram=diagram;twoImages.questions[1].diagram=structuredClone(diagram);
 assert.throws(()=>validateExerciseResult(twoImages,{...base,visuals:'hybrid'}),/插图总量/);
 assert.throws(()=>validateExerciseDiagram({...diagram,image:{mime:'image/png',data:'A'.repeat(4000001)}}),/插图文件无效/);
});
test('图示修订号同时兼容顶层与progress嵌套，旧响应不能把ready退回running',()=>{
 const record={};
 assert(mergeJobSnapshot(record,{status:'ready',progress:{figureRevision:5}}));
 assert.equal(record.status,'ready');assert.equal(record.progress.figureRevision,5);
 assert.equal(mergeJobSnapshot(record,{status:'running',progress:{figureRevision:4}}),false);
 assert.equal(record.status,'ready');assert.equal(record.progress.figureRevision,5);
 assert.equal(mergeJobSnapshot(record,{status:'running'}),false);
 assert.equal(record.status,'ready');
 assert(mergeJobSnapshot(record,{status:'ready',figureRevision:6,progress:{figureRevision:6}}));
 assert.equal(record.figureRevision,6);assert.equal(record.progress.figureRevision,6);
 assert(mergeJobSnapshot(record,{status:'ready',progress:{figureRevision:7}}));
 assert.equal(record.figureRevision,7);assert.equal(record.progress.figureRevision,7);
 const fresh={status:'ready',figureRevision:9};
 assert.equal(jobSnapshotCurrent(fresh,{status:'running'}),false);
 assert.equal(mergeJobSnapshot(fresh,{status:'running'}),false);assert.equal(fresh.status,'ready');
});
test('多Records逐条隔离，单条失败不阻断其他任务，并发数有界',async()=>{
 delete process.env.TRAINING_BUCKET;
 const key=()=>'jobs/'+crypto.randomBytes(16).toString('hex')+'/'+crypto.randomUUID(),record=job=>({cos:{cosObject:{key:'/1/bucket/training-v1/'+job+'/meta.json'}},event:{eventSource:'qcs::cos',eventName:'cos:ObjectCreated:Put'}});
 const store=new MemoryStore(),keys=Array.from({length:6},key);
 for(const job of keys)await store.create(job+'/meta.json',{input:{},deadline:Date.now()+60000});
 let active=0,max=0,calls=0;
 const generator=async()=>{calls++;active++;max=Math.max(max,active);await new Promise(resolve=>setTimeout(resolve,5));active--;return {sheet:{title:'匿名'}};};
 const result=await worker.handle({Records:keys.map(record)},{store,generator,concurrency:2});
 assert.deepEqual(result,{handled:6});assert.equal(calls,6);assert(max<=2);

 const isolated=new MemoryStore(),bad=key(),good=key();
 await isolated.create(good+'/meta.json',{input:{},deadline:Date.now()+60000});
 const guarded={get:async name=>{if(name===bad+'/meta.json')throw Object.assign(new Error('STORE_UNAVAILABLE'));return isolated.get(name);},create:(...args)=>isolated.create(...args),progress:(...args)=>isolated.progress(...args)};
 calls=0;
 await assert.rejects(worker.handle({Records:[record(bad),record(good)]},{store:guarded,generator:async()=>{calls++;return {sheet:{title:'匿名'}};}}),/WORKER_RECORD_FAILED/);
 assert.equal(calls,1);assert(await isolated.get(good+'/result.json'));
});
test('近期未落盘的占位请求被并发复用，超时孤儿占位不锁死后续重试',async()=>{
 const owner='anonymous',sourceId='source',questionId=1,type='illustration',prefix='media-requests/'+owner+'/'+sourceId+'/1/'+type+'/';
 const fresh=new MemoryStore(),orphan=crypto.randomUUID();
 await fresh.create(prefix+'0.json',{id:orphan,fingerprint:'old',createdAt:199000});
 let reserved=0;
 const reused=await resolveMedia({store:fresh,owner,sourceId,questionId,type,id:crypto.randomUUID(),fingerprint:'new',now:()=>200000,at:200000,reserve:async()=>{reserved++;}});
 assert.equal(reused.id,orphan);assert.equal(reused.created,false);assert.equal(reserved,0);
 const stale=new MemoryStore(),abandoned=crypto.randomUUID(),next=crypto.randomUUID();
 await stale.create(prefix+'0.json',{id:abandoned,fingerprint:'old',createdAt:1000});
 const retried=await resolveMedia({store:stale,owner,sourceId,questionId,type,id:next,fingerprint:'new',now:()=>200000,at:200000,reserve:async()=>{reserved++;}});
 assert.equal(retried.id,next);assert.equal(retried.created,true);assert.equal(reserved,1);
 assert.equal((await stale.get(prefix+'1.json')).value.id,next);
});
test('部署前遗留的活跃插图pin被一次性接管，失败pin不锁死新尝试',async()=>{
 const owner='anonymous',sourceId='source',questionId=1,type='illustration',legacyId=crypto.randomUUID(),legacyPin='illustration-requests/'+owner+'/'+sourceId+'/1.json',job='jobs/'+owner+'/'+legacyId;
 const store=new MemoryStore();
 await store.create(job+'/meta.json',{id:legacyId,createdAt:1000});await store.create(legacyPin,{id:legacyId});
 let reserved=0;
 const adopted=await resolveMedia({store,owner,sourceId,questionId,type,id:crypto.randomUUID(),fingerprint:'new',now:()=>200000,at:200000,reserve:async()=>{reserved++;}});
 assert.equal(adopted.id,legacyId);assert.equal(adopted.created,false);assert.equal(reserved,0);
 const failed=new MemoryStore(),failedId=crypto.randomUUID(),failedPin='illustration-requests/'+owner+'/'+sourceId+'/1.json',failedJob='jobs/'+owner+'/'+failedId;
 await failed.create(failedJob+'/meta.json',{id:failedId,createdAt:1000});await failed.create(failedJob+'/result.json',{status:'failed',error:'IMAGE_REQUEST_FAILED'});await failed.create(failedPin,{id:failedId});
 const next=crypto.randomUUID(),retried=await resolveMedia({store:failed,owner,sourceId,questionId,type,id:next,fingerprint:'new',now:()=>200000,at:200000,reserve:async()=>{reserved++;}});
 assert.equal(retried.id,next);assert.equal(retried.created,true);assert.equal(reserved,1);
});
