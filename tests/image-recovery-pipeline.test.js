import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import stores from '../backend/store.cjs';
import pipeline from '../backend/figure-pipeline.cjs';
import images from '../backend/illustration.cjs';
const png=fs.readFileSync(new URL('../assets/school-crest-192.png',import.meta.url));
const diagram={kind:'illustration',caption:'叶肉细胞',description:'叶肉细胞结构示意，细胞壁完整。'},g={provider:'gemini',protocol:'gemini',model:'gemini-3.8-flash'};
async function context(){
 const store=new stores.MemoryStore(),key='jobs/'+'a'.repeat(32)+'/'+crypto.randomUUID(),queue=[],input={subject:'生物',grade:'高三',curriculum:'细胞',focus:'细胞结构',count:3,minutes:15,difficulty:'基础巩固',visuals:'hybrid',evidence:[]},job={type:'exercise',input,generation:g,figureGeneration:g,pipeline:2};
 const sheet={title:'细胞结构',objective:'辨识细胞结构',questions:[1,2,3].map(id=>({id,type:'简答',level:id===1?'基础':'巩固',stem:id===1?'叶肉细胞结构如图所示。\n识别细胞壁。':'第'+id+'题：说明细胞的基本功能。',choices:[],answer:'具有细胞壁。',analysis:'依据植物细胞结构。',points:['正确得5分。'],maxScore:5,minutes:5,...(id===1?{figureRequest:{caption:'叶肉细胞',requirements:'完整细胞壁',knownData:'植物叶肉细胞',labels:[],precision:'illustrative',placement:{after:'叶肉细胞结构如图所示。',width:'standard',aspect:'square'}}}:{})}))};
 await store.create(key+'/meta.json',job);const c={store,key,queue,job,now:()=>Date.now(),dispatch:async k=>queue.push(k)};await pipeline.begin(store,key,job,{sheet,model:g.model},c);return c;
}
async function drain(c,options){let n=0;while(c.queue.length){assert(++n<20);const key=c.queue.shift(),job=(await c.store.get(key+'/meta.json')).value;await pipeline.runStep(c.store,key,job,{...c,planner:async()=>({diagram}),reviewer:async()=>({approved:true,issues:[],reviewScope:'pixels'}),...options});}}
const response={status:200,body:JSON.stringify({data:[{url:'https://files.oaiusercontent.com/unit.png?signature=private-test'}]})};
test('render下载失败后跨attempt恢复相同图片，不重出题、不重新规划和付费生图',async()=>{
 const c=await context();let calls=0,plans=0;
 await drain(c,{planner:async()=>{plans++;return {diagram};},illustrator:(d,o)=>images.generateIllustration(d,{...o,key:'unit',transport:async()=>{calls++;return response;},download:async()=>({status:503}),downloadAttempts:1})});
 let result=await pipeline.snapshot(c.store,c.key,c);assert.equal(result.status,'failed');assert.equal(result.requiresImageRegeneration,false);
 await pipeline.resume(c.store,c.key,c);
 await drain(c,{planner:async()=>assert.fail('原规划保留'),illustrator:async()=>assert.fail('不能再付费生图'),imageResumer:(d,o)=>images.resumeIllustration(d,{...o,download:async()=>({status:200,mime:'image/png',bytes:png})})});
 result=await pipeline.snapshot(c.store,c.key,c);assert.equal(result.status,'ready');assert.equal(calls,1);assert.equal(plans,1);assert.equal(result.sheet.questions[0].diagram.image.data,png.toString('base64'));
 assert(!JSON.stringify(result).includes('signature=private-test'));
});
test('图链过期时恢复不再付费；明确重新生成才开启新的图片候选',async()=>{
 const c=await context();let calls=0;
 await drain(c,{illustrator:(d,o)=>images.generateIllustration(d,{...o,key:'unit',transport:async()=>{calls++;return response;},download:async()=>({status:404}),downloadAttempts:1})});
 let result=await pipeline.snapshot(c.store,c.key,c);assert.equal(result.requiresImageRegeneration,true);assert.match(result.failureDetail,/再次调用生图服务/);
 await pipeline.resume(c.store,c.key,c);await drain(c,{illustrator:async()=>assert.fail('禁止默认重付费')});assert.equal(calls,1);
 await pipeline.resume(c.store,c.key,{...c,regenerateImage:true});
 await drain(c,{illustrator:(d,o)=>images.generateIllustration(d,{...o,key:'unit',transport:async()=>{calls++;return response;},download:async()=>({status:200,mime:'image/png',bytes:png})})});
 result=await pipeline.snapshot(c.store,c.key,c);assert.equal(result.status,'ready');assert.equal(calls,2);
});

test('像素审查失败不自动重付费，明确重画时传入审查反馈并使用新候选',async()=>{
 const c=await context();let rendered=0,reviewed=0,feedback;
 await drain(c,{illustrator:async()=>{rendered++;return {mime:'image/png',data:png.toString('base64')};},reviewer:async()=>{reviewed++;return {approved:false,issues:['A引线应指向细胞壁'],reviewScope:'pixels'};}});
 let r=await pipeline.snapshot(c.store,c.key,c);assert.equal(rendered,1);assert.equal(reviewed,1);assert.equal(r.requiresImageRegeneration,true);assert.equal(r.status,'failed');
 await pipeline.resume(c.store,c.key,c);assert.equal(c.queue.length,0);
 await pipeline.resume(c.store,c.key,{...c,regenerateImage:true});await drain(c,{illustrator:async(_,o)=>{rendered++;feedback=o.feedback;assert(o.request.imageAttempt>0);return {mime:'image/png',data:png.toString('base64')};}});
 r=await pipeline.snapshot(c.store,c.key,c);assert.equal(r.status,'ready');assert.equal(rendered,2);assert(feedback.includes('A引线应指向细胞壁'));
});
