import assert from 'node:assert/strict';
import test from 'node:test';
import parser from '../tools/workbuddy-cli-events.cjs';
import modelControl from '../backend/model-control.cjs';
import completion from '../backend/model-completion.cjs';

const {createWorkbuddyDeltas}=parser;
const stream=event=>({type:'stream_event',event,parent_tool_use_id:null});
const delta=(type,key,value)=>stream({type:'content_block_delta',index:0,delta:{type,[key]:value}});
const assistant=content=>({type:'assistant',message:{role:'assistant',content}});
const packet=(delta,finish_reason=null)=>Buffer.from('data: '+JSON.stringify({choices:[{index:0,delta,finish_reason}]})+'\r\n\r\n');

test('CLI只转发公开思考及正文，增量和完整助手帧不重复，忽略签名与子任务',()=>{
 const events=[],read=createWorkbuddyDeltas(value=>events.push(value));
 read({type:'system',secret:'not-for-progress'});
 read(stream({type:'message_start'}));
 read(stream({type:'content_block_start',content_block:{type:'thinking',thinking:'开始'}}));
 read(delta('thinking_delta','thinking','核对'));
 read(delta('signature_delta','signature','private-signature'));
 read({type:'stream_event',parent_tool_use_id:'child',event:{type:'content_block_delta',delta:{type:'thinking_delta',thinking:'child'}}});
 read(assistant([{type:'thinking',thinking:'开始核对',signature:'private'},{type:'redacted_thinking',data:'opaque'},{type:'text',text:'临时正文'}]));
 read(assistant([{type:'thinking',thinking:'开始核对'},{type:'text',text:'临时正文'}]));
 read(stream({type:'message_start'}));
 read(delta('text_delta','text','后续正文'));
 assert.deepEqual(events,[{reasoning_content:'开始'},{reasoning_content:'核对'},{preview_content:'临时正文'},{preview_reset:true},{preview_content:'后续正文'}]);
});

test('账号CLI思考和正文草稿先出现，最终JSON从正式正文独立解析',async()=>{
 const provider='workbuddy-account',env={WORKBUDDY_ACCOUNT_BASE_URL:'https://123456-example.ap-chengdu.tencentscf.com/v1/workbench',WORKBUDDY_ACCOUNT_TOKEN:'t'.repeat(40)};
 const generation=modelControl.snapshot({provider,model:'hy3',effort:'deep'},env),seen=[];
 const final='{"value":703}',rawDraft='{"value":';
 const result=await completion.completeRemote({system:'测试',input:{task:'37×19'}},generation,{
  env,key:env.WORKBUDDY_ACCOUNT_TOKEN,onProgress:value=>seen.push(value),
  transport:async(_url,options)=>{
   const segments=[];
   const read=createWorkbuddyDeltas(value=>segments.push(packet(value)));
   read(delta('thinking_delta','thinking','先计算乘积'));
   read(delta('text_delta','text',rawDraft));
   segments.push(packet({content:final}),packet({},'stop'),Buffer.from('data: [DONE]\r\n\r\n'));
   const source=Buffer.concat(segments);
   for(let i=0;i<source.length;i+=7)options.onChunk(source.subarray(i,i+7));
   return {status:200,body:''};
  }
 });
 assert.equal(result.output,final);
 assert.deepEqual(seen.map(p=>p.phase),['thinking','writing','writing']);
 assert.equal(seen[0].thinkingText,'先计算乘积');
 assert.equal(seen[1].draftSource,rawDraft);
 assert.equal(seen[2].draftSource,final);
 assert.equal(seen[2].responseChars,final.length);
});
