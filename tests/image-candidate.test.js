import test from 'node:test';import assert from 'node:assert/strict';import crypto from 'node:crypto';import {readFileSync} from 'node:fs';import {EventEmitter} from 'node:events';
import {MemoryStore} from '../backend/store.cjs';import illustration from '../backend/illustration.cjs';import candidates from '../backend/image-candidate.cjs';
const png=readFileSync(new URL('../assets/school-crest-192.png',import.meta.url));
const owner='a'.repeat(32),diagram={caption:'结构图',description:'只包含题干给出的对象与结构'};
const url='https://pre-signed-firefly-prod.s3-accelerate.amazonaws.com/example.png?X-Amz-Signature=private-test-signature';
const body=JSON.stringify({data:[{url}]});
const job=()=>crypto.randomUUID();
const run=(id,options={})=>illustration.generateIllustration(diagram,{key:'private-model-key',owner,job:id,...options});
const successDownload=calls=>({status:200,mime:'image/png',bytes:png});
test('首轮下载失败后resume只重下私有候选，不再调用生图且不降质',async()=>{
 const store=new MemoryStore(),id=job();let generated=0,downloads=0;
 await assert.rejects(run(id,{store,transport:async()=>{generated++;return{status:200,body};},download:async()=>{downloads++;return{status:503,mime:'text/plain',bytes:Buffer.from('busy')};},downloadAttempts:1,downloadDelayMs:0}),error=>error.message==='IMAGE_REQUEST_FAILED'&&error.diagnostic.kind==='image-download'&&error.diagnostic.status===503&&error.diagnostic.resumeAvailable===true);
 assert.equal(generated,1);assert.equal(downloads,1);
 const status=await illustration.candidateStatus(diagram,{store,owner,job:id});
 assert.equal(status.exists,true);assert.equal(status.source,'url');assert.equal(status.unusable,null);
 const publicText=JSON.stringify(status);assert(!publicText.includes('X-Amz-Signature')&&!publicText.includes('private-model-key'));
 const jobKey='jobs/'+owner+'/'+id;
 const image=await illustration.resumeIllustration(diagram,{store,jobKey,download:async()=>{downloads++;return successDownload();},downloadAttempts:1,downloadDelayMs:0});
 assert.equal(generated,1);assert.equal(downloads,2);assert.equal(image.mime,'image/png');assert.equal(image.data,png.toString('base64'));
 // The same checkpoint can be recovered by a normal call even after the
 // provider credential has disappeared; only a fresh paid call needs the key.
 const keyless=await illustration.generateIllustration(diagram,{store,owner,job:id,download:async()=>{downloads++;return successDownload();},downloadAttempts:1,downloadDelayMs:0});
 assert.equal(generated,1);assert.equal(downloads,3);assert.equal(keyless.data,png.toString('base64'));
});
test('下载只做有限次安全重试，5xx恢复后首次成功且生图只调用一次',async()=>{
 const store=new MemoryStore(),id=job();let generated=0,downloads=0;
 const image=await run(id,{store,transport:async()=>{generated++;return{status:200,body};},download:async()=>{downloads++;return downloads<3?{status:503,mime:'text/plain',bytes:Buffer.from('busy')}:successDownload();},downloadAttempts:3,downloadDelayMs:0,sleep:async()=>{}});
 assert.equal(generated,1);assert.equal(downloads,3);assert.equal(image.data,png.toString('base64'));
});
test('resume在没有私有候选时明确报缺失，不发起下载也不调用生图',async()=>{
 const store=new MemoryStore(),id=job();let downloads=0;
 await assert.rejects(illustration.resumeIllustration(diagram,{store,owner,job:id,download:async()=>{downloads++;return successDownload();}}),/IMAGE_CANDIDATE_MISSING/);
 assert.equal(downloads,0);
 await assert.rejects(illustration.resumeIllustration(diagram,{}),/IMAGE_CANDIDATE_CONTEXT_REQUIRED/);
});
test('URL过期或404不自动重新生图，只有显式regenerate才再次付费',async()=>{
 const store=new MemoryStore(),id=job();let generated=0,downloads=0;
 await assert.rejects(run(id,{store,transport:async()=>{generated++;return{status:200,body};},download:async()=>{downloads++;return{status:404,mime:'image/png',bytes:png};},downloadAttempts:3,downloadDelayMs:0}),error=>error.message==='IMAGE_CANDIDATE_EXPIRED'&&error.diagnostic.status===404);
 assert.equal(generated,1);assert.equal(downloads,1);
 assert.equal((await illustration.candidateStatus(diagram,{store,owner,job:id})).unusable,'HTTP_404');
 await assert.rejects(run(id,{store,transport:async()=>{generated++;return{status:200,body};},download:async()=>{downloads++;return successDownload();},downloadAttempts:1,downloadDelayMs:0}),/IMAGE_CANDIDATE_EXPIRED/);
 assert.equal(generated,1);assert.equal(downloads,1);
 const image=await run(id,{store,regenerate:true,transport:async()=>{generated++;return{status:200,body};},download:async()=>{downloads++;return successDownload();},downloadAttempts:1,downloadDelayMs:0});
 assert.equal(generated,2);assert.equal(downloads,2);assert.equal(image.data,png.toString('base64'));
 assert.equal((await illustration.candidateStatus(diagram,{store,owner,job:id})).unusable,null);
});
test('拒绝未授权图片主机、私网解析结果和302，不把模型密钥转给对象存储',async()=>{
 const store=new MemoryStore(),id=job();let generated=0,downloads=0;
 await assert.rejects(run(id,{store,transport:async()=>{generated++;return{status:200,body:JSON.stringify({data:[{url:'https://unknown.test/p.png?token=x'}]})};},download:()=>{downloads++;}}),error=>error.message==='IMAGE_URL_REJECTED'&&error.diagnostic.status===200);
 assert.equal(generated,1);assert.equal(downloads,0);assert.deepEqual(await illustration.candidateStatus(diagram,{store,owner,job:id}),{exists:false});
 for(const blocked of ['http://pre-signed-firefly-prod.s3-accelerate.amazonaws.com/a.png','https://other.s3-accelerate.amazonaws.com/a.png','https://pre-signed-firefly-prod.s3-accelerate.amazonaws.com.attacker.test/a.png','https://user:password@pre-signed-firefly-prod.s3-accelerate.amazonaws.com/a.png','https://pre-signed-firefly-prod.s3-accelerate.amazonaws.com:444/a.png'])await assert.rejects(illustration.imageFromResult(blocked,{download:()=>assert.fail('不能访问未授权图片地址')}),/IMAGE_URL_REJECTED/);
 for(const address of ['127.0.0.1','10.1.2.3','169.254.1.1','172.16.0.1','192.168.1.1','100.64.0.1','::1','fc00::1','fe80::1','::ffff:10.0.0.1','::ffff:7f00:1','::10.0.0.1'])assert.equal(illustration.isPublicAddress(address),false,address);
 for(const address of ['8.8.8.8','1.1.1.1','2606:4700:4700::1111'])assert.equal(illustration.isPublicAddress(address),true,address);
 const redirectJob=job();
 await assert.rejects(run(redirectJob,{store,transport:async()=>{generated++;return{status:200,body};},download:async()=>{downloads++;return{status:302,mime:'image/png',bytes:png};},downloadAttempts:3,downloadDelayMs:0}),error=>error.message==='IMAGE_REQUEST_FAILED'&&error.diagnostic.status===302);
 assert.equal(downloads,1);
});
test('默认下载不携带Authorization且URL签名和模型密钥不出现在公开错误中',async()=>{
 const store=new MemoryStore(),id=job();
 await assert.rejects(run(id,{store,transport:async()=>({status:200,body}),download:async()=>({status:503,mime:'text/plain',bytes:Buffer.from('busy')}),downloadAttempts:1,downloadDelayMs:0}),error=>{
  const text=JSON.stringify(error);assert(!text.includes('private-model-key')&&!text.includes('X-Amz-Signature')&&!text.includes('example.png'));return error.message==='IMAGE_REQUEST_FAILED';
 });
 const nodeHttps=(await import('node:https')).default,original=nodeHttps.get;let seen;
 nodeHttps.get=(target,options,callback)=>{
  seen={target:String(target),options};
  const response=new EventEmitter();response.statusCode=200;response.headers={'content-type':'image/png'};
  process.nextTick(()=>{callback(response);response.emit('data',png);response.emit('end');});
  const request=new EventEmitter();request.setTimeout=()=>{};request.destroy=error=>request.emit('error',error);return request;
 };
 try{const image=await illustration.downloadImage(url);assert.equal(image.status,200);assert.equal(image.mime,'image/png');assert.equal(image.bytes.equals(png),true);}
 finally{nodeHttps.get=original;}
 assert.equal(seen.target,url);assert.equal(seen.options.lookup instanceof Function,true);assert.equal(seen.options.headers,undefined);assert.equal(seen.options.auth,undefined);
});
test('候选存储读失败直接失败绝不再调用生图，写失败后下载失败也不静默重发',async()=>{
 const id=job();let generated=0,downloads=0;
 const brokenRead={get:async()=>{throw new Error('STORE_UNAVAILABLE');},create:async()=>true};
 await assert.rejects(run(id,{store:brokenRead,transport:async()=>{generated++;return{status:200,body};},download:async()=>{downloads++;return successDownload();}}),error=>error.message==='IMAGE_CANDIDATE_STORE_FAILED'&&error.diagnostic.stage==='read');
 assert.equal(generated,0);assert.equal(downloads,0);
 const writeFail={get:async()=>null,create:async()=>{throw new Error('STORE_UNAVAILABLE');}};
 await assert.rejects(run(id,{store:writeFail,transport:async()=>{generated++;return{status:200,body};},download:async()=>{downloads++;return{status:503,mime:'text/plain',bytes:Buffer.from('busy')};},downloadAttempts:1,downloadDelayMs:0}),error=>error.message==='IMAGE_CANDIDATE_STORE_FAILED'&&error.diagnostic.stage==='write');
 assert.equal(generated,1);assert.equal(downloads,1);
 const readFailedLate={get:async()=>{throw new Error('STORE_UNAVAILABLE');},create:async()=>{throw new Error('STORE_UNAVAILABLE');}};
 await assert.rejects(run(id,{store:readFailedLate,transport:async()=>{generated++;return{status:200,body};},download:async()=>{downloads++;return successDownload();}}),/IMAGE_CANDIDATE_STORE_FAILED/);
 assert.equal(generated,1);assert.equal(downloads,1);
});
test('候选绑定owner/job/request/provider，绑定不符时拒绝下载与生图',async()=>{
 const store=new MemoryStore(),id=job(),context=candidates.context({store,owner,job:id,provider:'bytecat-image',model:'gpt-image-2',diagram});
 await store.create(candidates.slotKey(context,0),{v:1,owner,job:id,request:context.request,provider:'other-image',model:'gpt-image-2',source:'url',url,createdAt:Date.now()});
 let generated=0,downloads=0;
 await assert.rejects(run(id,{store,transport:async()=>{generated++;return{status:200,body};},download:async()=>{downloads++;return successDownload();}}),/IMAGE_CANDIDATE_BINDING_MISMATCH/);
 assert.equal(generated,0);assert.equal(downloads,0);
});
test('取消信号和移除检查在生图前及生图后生效，不保存也不下载',async()=>{
 const store=new MemoryStore(),id=job();let generated=0,downloads=0;
 await assert.rejects(run(id,{store,isRemoved:async()=>true,transport:async()=>{generated++;return{status:200,body};},download:async()=>{downloads++;return successDownload();}}),/JOB_CANCELLED/);
 assert.equal(generated,0);assert.equal(downloads,0);
 const controller=new AbortController();controller.abort();
 await assert.rejects(run(id,{store,signal:controller.signal,transport:async()=>{generated++;return{status:200,body};},download:async()=>{downloads++;return successDownload();}}),/JOB_CANCELLED/);
 assert.equal(generated,0);assert.equal(downloads,0);
 let checks=0;
 await assert.rejects(run(id,{store,isRemoved:async()=>++checks>1,transport:async()=>{generated++;return{status:200,body};},download:async()=>{downloads++;return successDownload();}}),/JOB_CANCELLED/);
 assert.equal(generated,1);assert.equal(downloads,0);
 assert.deepEqual(await illustration.candidateStatus(diagram,{store,owner,job:id}),{exists:false});
});
test('下载返回的MIME和文件签名必须一致，否则拒绝且保持私有候选',async()=>{
 const store=new MemoryStore(),id=job();let generated=0;
 await assert.rejects(run(id,{store,transport:async()=>{generated++;return{status:200,body};},download:async()=>({status:200,mime:'text/html',bytes:png}),downloadAttempts:1,downloadDelayMs:0}),error=>error.message==='IMAGE_RESPONSE_INVALID'&&error.diagnostic.status===200&&error.diagnostic.image?.stage==='image-signature');
 assert.equal(generated,1);
 assert.equal((await illustration.candidateStatus(diagram,{store,owner,job:id})).exists,true);
 const jpeg=(width,height)=>{const bytes=Buffer.alloc(48);bytes[0]=0xff;bytes[1]=0xd8;bytes[2]=0xff;bytes[3]=0xc0;bytes.writeUInt16BE(17,4);bytes[6]=8;bytes.writeUInt16BE(height,7);bytes.writeUInt16BE(width,9);bytes[46]=0xff;bytes[47]=0xd9;return bytes;};
 assert.equal((await illustration.imageFromResult('data:image/jpeg;base64,'+jpeg(640,480).toString('base64'))).mime,'image/jpeg');
 await assert.rejects(illustration.imageFromResult('data:image/jpeg;base64,'+jpeg(32,32).toString('base64')),error=>error.message==='IMAGE_RESPONSE_INVALID'&&error.imageDiagnostic.stage==='jpeg-dimensions');
});
