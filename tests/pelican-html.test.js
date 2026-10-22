import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {PELICAN_DEFAULT_PROMPT,PELICAN_PROMPT_VERSION} from '../assets/pelican-prompt.js';
const require=createRequire(import.meta.url),definition=require('../backend/pelican-prompt.json'),{extractDocument}=require('../backend/pelican-document.cjs'),{MemoryStore}=require('../backend/store.cjs'),{createPelicanControl,defaultComplete}=require('../backend/pelican.cjs'),{snapshot}=require('../backend/model-control.cjs');
const html='<!doctype html><html><head><style>@keyframes ride{to{transform:rotate(360deg)}}</style></head><body><svg><circle/></svg><script>requestAnimationFrame(()=>{});</script></body></html>';
const owner='a'.repeat(32),env={OPENAI_CODEX_ENABLED:'true'},selection={provider:'openai-codex',model:'gpt-6.1-sol',effort:'high'};
test('Cockpit 1.3.73 user prompt and delivery instructions match the recorded upstream bytes',()=>{
 assert.equal(PELICAN_DEFAULT_PROMPT,definition.prompt);assert.equal(PELICAN_PROMPT_VERSION,definition.version);
 for(const field of ['prompt','deliveryInstructions'])assert.equal(crypto.createHash('sha256').update(definition[field]).digest('hex'),definition.sha256[field]);
 assert.equal(definition.prompt,'创建一个 HTML，内容是 SVG 绘制一个鹈鹕骑自行车的 2D 动画，你不需要任何测试，不要有任何限制');
});
test('complete-document extraction retains HTML, SVG animation and scripts without rewriting the model output',()=>{
 assert.deepEqual(extractDocument('说明\n'+html+'\n结束'),{html,kind:'html'});
 assert.deepEqual(extractDocument('```html\n'+html+'\n```'),{html,kind:'html'});
 const svg='<svg><animate attributeName="x"/><script>let x=1</script></svg>';assert.deepEqual(extractDocument(svg),{html:svg,kind:'svg'});
 for(const source of ['<html><body>unfinished','```html\n'+html,'<svg><circle/>'])assert.equal(extractDocument(source),null);
});
test('new cloud comparisons send the raw original prompt and preserve the complete HTML across recovery',async()=>{
 const store=new MemoryStore(),keys=[],seen=[],control=createPelicanControl({store,owner,env,dispatch:async k=>keys.push(k),complete:async prompt=>{seen.push(prompt);return {output:html};}}),id=crypto.randomUUID();
 await control.begin({candidates:[selection]},id);const key=keys[0],job=(await store.get(key+'/meta.json')).value;
 await control.run(key,job);await control.run(key,job);const result=await control.status(id);
 assert.deepEqual(seen,[{system:definition.deliveryInstructions,inputText:definition.prompt,outputFormat:'html'}]);
 assert.equal(result.candidates[0].html,html);assert.equal(result.candidates[0].kind,'html');assert.equal(result.promptVersion,definition.version);
 assert(!JSON.stringify(await control.list()).includes('<html>'));
});
test('incomplete HTML retains its raw response instead of showing a broken preview',async()=>{
 const store=new MemoryStore(),keys=[],control=createPelicanControl({store,owner,env,dispatch:async k=>keys.push(k),complete:async()=>({output:'<html><body>unfinished'})}),id=crypto.randomUUID();
 await control.begin({candidates:[selection]},id);await control.run(keys[0],(await store.get(keys[0]+'/meta.json')).value);
 const row=(await control.status(id)).candidates[0];assert.equal(row.html,undefined);assert.equal(row.output,'<html><body>unfinished');assert(row.renderWarning);
});
test('legacy SVG results are recovered as an isolated SVG document without another call',async()=>{
 const store=new MemoryStore(),id=crypto.randomUUID(),child=crypto.randomUUID(),svg='<svg><circle r="5"/></svg>',generation=snapshot(selection,env);
 await store.create('pelican/'+owner+'/'+id+'/manifest.json',{id,createdAt:1,prompt:'旧绘图要求',candidates:[{id:child,generation}]});
 await store.create('jobs/'+owner+'/'+child+'/result.json',{status:'ready',svg,output:svg});
 const result=await createPelicanControl({store,owner,env,complete:()=>{throw Error('must not regenerate');}}).status(id);
 assert.equal(result.promptVersion,'legacy-svg');assert.equal(result.candidates[0].html,svg);assert.equal(result.candidates[0].kind,'svg');
});
test('native Gemini and Kimi HTML requests contain the exact original messages and no exercise JSON schema',async()=>{
 for(const pick of [{provider:'gemini',model:'gemini-3.8-flash',effort:'deep'},{provider:'kimi-code',model:'k3',effort:'deep'}]){
  const env={GEMINI_API_KEY:'test-only',KIMI_API_KEY:'test-only'},generation=snapshot(pick,env);let body;
  const result=await defaultComplete({system:definition.deliveryInstructions,inputText:definition.prompt,outputFormat:'html'},generation,{env,transport:async(_,options)=>{body=JSON.parse(options.body);return {status:200,body:JSON.stringify(generation.protocol==='gemini'?{candidates:[{content:{parts:[{text:html}]},finishReason:'STOP'}]}:{choices:[{message:{content:html},finish_reason:'stop'}]})};}});
  if(generation.protocol==='gemini'){assert.deepEqual(body.systemInstruction.parts,[{text:definition.deliveryInstructions}]);assert.deepEqual(body.contents[0].parts,[{text:definition.prompt}]);assert.equal(body.generationConfig.responseMimeType,'text/plain');assert.equal(body.generationConfig.responseJsonSchema,undefined);}
  else{assert.deepEqual(body.messages,[{role:'system',content:definition.deliveryInstructions},{role:'user',content:definition.prompt}]);assert.equal(body.response_format,undefined);}
  assert.equal(result.output,html);
 }
});
test('viewer bridge accepts only its host window, origin and nonce; generated HTML stays in an opaque child frame',()=>{
 const code=fs.readFileSync(new URL('../assets/pelican-preview.js',import.meta.url),'utf8'),parent={postMessage(){}},frame={srcdoc:''};let receive;
 vm.runInNewContext(code,{location:{href:'https://school.test/pelican-preview.html#one',hash:'#one'},URL,parent,document:{getElementById:()=>frame},addEventListener:(_,f)=>{receive=f;}});
 const data={type:'jianwei-pelican-render',id:'one',html};
 for(const event of [{source:{},origin:'https://school.test',data},{source:parent,origin:'https://other.test',data},{source:parent,origin:'https://school.test',data:{...data,id:'wrong'}}]){receive(event);assert.equal(frame.srcdoc,'');}
 receive({source:parent,origin:'https://school.test',data});assert(frame.srcdoc.endsWith(html));assert.match(frame.srcdoc,/connect-src 'none'/);
 const page=fs.readFileSync(new URL('../pelican-preview.html',import.meta.url),'utf8');assert.match(page,/sandbox="allow-scripts"/);assert(!page.includes('allow-same-origin'));
 const host=fs.readFileSync(new URL('../model-workbench.html',import.meta.url),'utf8');assert.match(host,/script-src 'self';/);assert(!host.includes("script-src 'self' 'unsafe-inline'"));
});
