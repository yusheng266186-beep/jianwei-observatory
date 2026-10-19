import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vision from '../backend/model-vision.cjs';
import models from '../backend/model-control.cjs';
import completion from '../backend/model-completion.cjs';
import figures from '../backend/figure-generation.cjs';
import kimi from '../backend/kimi.cjs';
const image={mime:'image/png',data:fs.readFileSync(new URL('../assets/school-crest-192.png',import.meta.url)).toString('base64')};
const diagram={kind:'illustration',caption:'细胞',description:'叶肉细胞，标注细胞壁。',image},q={id:1,type:'简答',stem:'观察图中的叶肉细胞。',choices:[],answer:'细胞壁。',analysis:'依结构判断。'},input={subject:'生物',visuals:'hybrid'};
const g=models.snapshot({provider:'wefucke-gpt',model:'gpt-6.1-sol',effort:'deep'},{WEFUCKE_GPT_API_KEY:'unit'});
test('位图核对实际附上像素，文本JSON只包含图示说明，不把图片当成题目内容',async()=>{
 let prompt;const result=await figures.reviewFigure(q,input,diagram,{generation:g,complete:async p=>{prompt=p;return {output:'{"approved":true,"issues":[]}'};}});
 assert.deepEqual(prompt.image,image);assert.equal(prompt.input.diagram.image,undefined);assert.match(prompt.system,/必须查看图片本身/);assert(!prompt.system.includes('没有位图像素'));assert.equal(result.reviewScope,'pixels');
});
test('非视觉模型只核对委托，明确标为brief，不假称已看到图片',async()=>{
 let prompt;const result=await figures.reviewFigure(q,input,diagram,{generation:{protocol:'kimi'},complete:async p=>{prompt=p;return {output:'{"approved":true,"issues":[]}'};}});
 assert.equal(prompt.image,undefined);assert.equal(result.reviewScope,'brief');assert.match(prompt.system,/不能声称已核验实际图片/);
});
test('四种协议将图像放在专用多模态内容块，禁止外链或超大图片混入',()=>{
 const cases=[['chat-completions',{messages:[{role:'user',content:'题目'}]},b=>b.messages[0].content[1].image_url.url],['responses',{input:[{role:'user',content:[{type:'input_text',text:'题目'}]}]},b=>b.input[0].content[1].image_url],['anthropic',{messages:[{role:'user',content:[{type:'text',text:'题目'}]}]},b=>b.messages[0].content[1].source.data],['gemini',{contents:[{parts:[{text:'题目'}]}]},b=>b.contents[0].parts[1].inlineData.data]];
 for(const [protocol,body,get]of cases){vision.attachImage(body,protocol,image);assert(get(body).includes(image.data));}
 assert.throws(()=>vision.imageData({mime:'image/png',data:'https://bad.test/image.png'}));assert.throws(()=>vision.imageData({...image,data:'A'.repeat(5200004)}));
 const full=Buffer.alloc(3008341);Buffer.from(image.data,'base64').copy(full);assert.doesNotThrow(()=>vision.imageData({mime:'image/png',data:full.toString('base64')}));
});
test('Sol实际传输适配会带上image_url，普通JSON完成回复继续严格检查结束标记',async()=>{
 let payload;const result=await completion.completeRemote({system:'核对图像',input:{question:'细胞'},image},g,{key:'unit',transport:async(_,o)=>{payload=JSON.parse(o.body);return {status:200,body:JSON.stringify({choices:[{message:{content:'{"approved":true,"issues":[]}'},finish_reason:'stop'}]})};}});
 assert.equal(payload.messages[1].content[1].type,'image_url');assert.match(result.output,/approved/);assert.equal(payload.messages[1].content[0].text,'{"question":"细胞"}');
});
test('Kimi兼容普通JSON完整回复，缺失结束标记或截断仍不能当成成稿',()=>{
 const data={choices:[{index:0,message:{content:'{"value":1}'},finish_reason:'stop'}],usage:{prompt_tokens:12,completion_tokens:21}};
 assert.equal(kimi.readCompletion(JSON.stringify(data)).output,'{"value":1}');
 for(const finish of [undefined,'length','tool_calls']){data.choices[0].finish_reason=finish;assert.throws(()=>kimi.readCompletion(JSON.stringify(data)),/MODEL_INCOMPLETE/);}
});
test('旧generation没有protocol时按冻结路由解析Gemini视觉能力，仍附实际像素',async()=>{
 const oldGemini={provider:'gemini',model:'gemini-3.8-flash',reasoningEffort:'high'};
 assert.equal(vision.supportsImage(oldGemini),true);
 let prompt;const result=await figures.reviewFigure(q,input,diagram,{generation:oldGemini,complete:async p=>{prompt=p;return {output:'{"approved":true,"issues":[]}'};}});
 assert.deepEqual(prompt.image,image);assert.match(prompt.system,/必须查看图片本身/);assert.equal(result.reviewScope,'pixels');
});
test('视觉能力只认已知模型或显式能力，不因gptfamily过度放宽',()=>{
 assert.equal(vision.supportsImage({provider:'wefucke-gpt',model:'gpt-6.1-sol',reasoningEffort:'high'}),true);
 assert.equal(vision.supportsImage({protocol:'chat-completions',model:'gpt-3.5-turbo',adapterProfile:{family:'gpt'}}),false);
 assert.equal(vision.supportsImage({protocol:'chat-completions',model:'gpt-6.1-sol',adapterProfile:{family:'gpt'}}),true);
 assert.equal(vision.supportsImage({protocol:'chat-completions',model:'gpt-6.1-sol',adapterProfile:{family:'gpt',vision:false}}),false);
 assert.equal(vision.supportsImage({protocol:'chat-completions',model:'future-model',adapterProfile:{family:'gpt'},vision:true}),true);
 assert.equal(vision.supportsImage({protocol:'chat-completions',model:'future-model',adapterProfile:{capabilities:{vision:true}}}),true);
 assert.equal(vision.supportsImage({protocol:'chat-completions',model:'deepseek/deepseek-v4-flash-vision-exp'}),true);
 assert.equal(vision.supportsImage({protocol:'chat-completions',model:'deepseek-v4.1-flash'}),false);
 assert.equal(vision.supportsImage({protocol:'gemini',model:'text-only'}),false);
 assert.equal(vision.supportsImage({protocol:'anthropic',model:'claude-opus-5-5'}),true);
});
test('gpt family但未知模型只做brief，不把图片发给上游',async()=>{
 let prompt;const result=await figures.reviewFigure(q,input,diagram,{generation:{protocol:'chat-completions',model:'gpt-3.5-turbo',adapterProfile:{family:'gpt'}},complete:async p=>{prompt=p;return {output:'{"approved":true,"issues":[]}'};}});
 assert.equal(prompt.image,undefined);assert.equal(result.reviewScope,'brief');assert.match(prompt.system,/不能声称已核验实际图片/);
});
test('明确400或422拒绝图片时仅降级brief一次，保留layoutNotes和安全的降级原因',async()=>{
 for(const status of [400,422]){
  const calls=[];const complete=async p=>{
   calls.push(p);
   if(calls.length===1)throw Object.assign(Error('MODEL_REQUEST_FAILED'),{diagnostic:{kind:'upstream',status,message:'image input is not supported by this model'}});
   return {output:'{"approved":true,"issues":[],"layoutNotes":["图片为横版，建议等比放入预留版位"]}'};
  };
  const result=await figures.reviewFigure(q,input,diagram,{generation:g,complete});
  assert.equal(calls.length,2);assert.deepEqual(calls[0].image,image);assert.equal(calls[1].image,undefined);
  assert.match(calls[1].system,/不能声称已核验实际图片/);assert(!calls[1].system.includes('必须查看图片本身'));
  assert.equal(result.reviewScope,'brief');assert.deepEqual(result.visionDowngrade,{code:'VISION_INPUT_UNSUPPORTED',status});
  assert.deepEqual(result.layoutNotes,['图片为横版，建议等比放入预留版位']);
  assert(!JSON.stringify(result.visionDowngrade).includes('not supported'));
 }
});
test('网络断流、5xx、未知400和未完成输出都不降级、不重发',async()=>{
 const failures=[
  Object.assign(Error('NETWORK_TIMEOUT'),{diagnostic:{kind:'network'}}),
  Object.assign(Error('MODEL_REQUEST_FAILED'),{diagnostic:{kind:'upstream',status:500,message:'image input is not supported'}}),
  Object.assign(Error('MODEL_REQUEST_FAILED'),{diagnostic:{kind:'upstream',status:400,message:'bad request: invalid JSON schema'}}),
  Object.assign(Error('MODEL_INCOMPLETE'),{diagnostic:{kind:'completion'}})
 ];
 for(const failure of failures){let calls=0;await assert.rejects(figures.reviewFigure(q,input,diagram,{generation:g,complete:async()=>{calls++;throw failure;}}),error=>error===failure);assert.equal(calls,1);}
});
test('像素核对保留layoutNotes，纯比例问题只作为排版建议',async()=>{
 let prompt;const note='图片比例与横版版位不一致，建议等比缩放后放入预留版位。';
 const result=await figures.reviewFigure(q,input,diagram,{generation:g,complete:async p=>{prompt=p;return {output:JSON.stringify({approved:true,issues:[],layoutNotes:[note]})};}});
 assert.equal(result.reviewScope,'pixels');assert.deepEqual(result.layoutNotes,[note]);assert.deepEqual(result.issues,[]);
 assert.match(prompt.system,/只在layoutNotes/);assert.match(prompt.system,/不因纯比例不同要求付费重画/);
});
test('多MB base64原样附加且不栈溢出，容量和签名边界仍拒绝',()=>{
 const large=Buffer.alloc(3800000);Buffer.from('89504e470d0a1a0a','hex').copy(large,0);large.writeUInt32BE(2048,16);large.writeUInt32BE(2048,20);
 const data=large.toString('base64');assert(data.length<=vision.MAX_IMAGE_CHARS);
 const uri=vision.imageData({mime:'image/png',data});assert.equal(uri,'data:image/png;base64,'+data);
 const body={messages:[{role:'user',content:'题目'}]};vision.attachImage(body,'chat-completions',{mime:'image/png',data});
 assert.equal(body.messages[0].content[1].image_url.url,uri);
 assert.throws(()=>vision.imageData({mime:'image/png',data:'A'.repeat(vision.MAX_IMAGE_CHARS+4)}));
 assert.throws(()=>vision.imageData({mime:'image/png',data:'A'.repeat(vision.MAX_IMAGE_CHARS)}));
 assert.throws(()=>vision.imageData({mime:'image/png',data:'AAAAA'}));
 assert.throws(()=>vision.imageData({mime:'image/gif',data:data}));
 assert.deepEqual(vision.imageRejection({diagnostic:{kind:'upstream',status:422,message:'unsupported image input'}}),{code:'VISION_INPUT_UNSUPPORTED',status:422});
 assert.equal(vision.imageRejection({diagnostic:{kind:'upstream',status:400,message:'bad request: invalid JSON schema'}}),null);
 assert.equal(vision.imageRejection({diagnostic:{kind:'network',message:'image upload reset'}}),null);
});
