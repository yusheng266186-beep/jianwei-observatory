'use strict';
const {StringDecoder}=require('node:string_decoder');
// A preview parser only: partial fields are never used to repair the final
// document, whose complete JSON still passes the original strict validator.
function partialDocument(source){
 let at=0;const complete=new WeakSet(),space=()=>{while(/\s/.test(source[at]||'')&&at<source.length)at++;};
 function string(){const start=at++;let escaped=false;while(at<source.length){const c=source[at++];if(c==='"'&&!escaped){try{return JSON.parse(source.slice(start,at));}catch{return '';}}if(c==='\\'&&!escaped)escaped=true;else escaped=false;}let text=source.slice(start+1,at);text=text.replace(/\\(?:u[0-9a-f]{0,3})?$/i,'');try{return JSON.parse('"'+text+'"');}catch{return '';}}
 function value(depth=0){space();if(depth>12||at>=source.length)return undefined;const c=source[at];if(c==='"')return string();if(c==='{'){at++;const out=Object.create(null);space();while(at<source.length&&source[at]!=='}'){if(source[at]!=='"')break;const key=string();space();if(source[at++]!==':')break;out[key]=value(depth+1);space();if(source[at]!==',')break;at++;space();}if(source[at]==='}'){at++;complete.add(out);}return out;}if(c==='['){at++;const out=[];space();while(at<source.length&&source[at]!==']'){const before=at;out.push(value(depth+1));if(before===at)break;space();if(source[at]!==',')break;at++;space();}if(source[at]===']'){at++;complete.add(out);}return out;}const match=source.slice(at).match(/^(?:-?\d+(?:\.\d+)?|true|false|null)/);if(match){at+=match[0].length;return JSON.parse(match[0]);}return undefined;}
 const doc=value()||{},questions=Array.isArray(doc.questions)?doc.questions:[];
 return {title:typeof doc.title==='string'?doc.title.slice(0,100):'',objective:typeof doc.objective==='string'?doc.objective.slice(0,600):'',completed:questions.filter(q=>q&&complete.has(q)).length,questions:questions.filter(q=>q&&typeof q==='object').slice(0,12).map((q,i)=>({id:Number.isInteger(q.id)?q.id:i+1,type:typeof q.type==='string'?q.type:'',complete:complete.has(q),...Object.fromEntries(['stem','answer','analysis'].filter(k=>typeof q[k]==='string').map(k=>[k,q[k].slice(0,1200)]))}))};
}
function streamProgress(protocol,report){
 const decoder=new StringDecoder('utf8');let buffer='',output='',summary='',thinkingText='',thinkingChars=0,responseChars=0;
 const emit=(phase)=>report?.({phase,thinkingChars,responseChars,...(thinkingText?{thinkingText,thinkingTruncated:thinkingChars>160000}:{}),...(summary?{summary}:{}),...(output?{draftSource:output}:{})});
 function event(data){let packet;try{packet=JSON.parse(data);}catch{return;}
  let text='',thinking='',publicSummary='';
  if(protocol==='chat-completions'||protocol==='kimi'){const delta=packet.choices?.[0]?.delta;text=typeof delta?.content==='string'?delta.content:'';thinking=typeof delta?.reasoning_content==='string'?delta.reasoning_content:'';}
  if(protocol==='anthropic'){if(packet.type==='content_block_start'&&packet.content_block?.type==='text')text=packet.content_block.text||'';if(packet.delta?.type==='text_delta')text=packet.delta.text||'';if(packet.delta?.type==='thinking_delta')thinking=packet.delta.thinking||'';}
  if(protocol==='responses'){if(packet.type==='response.output_text.delta')text=packet.delta||'';if(packet.type==='response.reasoning_summary_text.delta')publicSummary=packet.delta||'';if(packet.type==='response.completed'&&!output)text=(packet.response?.output||[]).filter(p=>p.type==='message').flatMap(p=>p.content||[]).filter(p=>p.type==='output_text').map(p=>p.text||'').join('');}
  if(protocol==='gemini')for(const part of packet.candidates?.[0]?.content?.parts||[]){if(part.thought)publicSummary+=part.text||'';else text+=part.text||'';}
  if(thinking){thinkingChars+=thinking.length;thinkingText=(thinkingText+thinking).slice(-160000);emit(output?'writing':'thinking');}if(publicSummary){thinkingChars+=publicSummary.length;summary=(summary+publicSummary).slice(-4000);emit(output?'writing':'thinking');}if(text){responseChars+=text.length;output=(output+text).slice(0,256000);emit('writing');}
 }
 return chunk=>{buffer+=decoder.write(chunk);let match;while((match=/\r?\n\r?\n/.exec(buffer))){const block=buffer.slice(0,match.index);buffer=buffer.slice(match.index+match[0].length);const data=block.split(/\r?\n/).filter(l=>l.startsWith('data:')).map(l=>l.slice(5).trimStart()).join('\n');if(data&&data!=='[DONE]')event(data);}};
}
function createProgressWriter({store,key,total,now=Date.now,controller}){
 let state={phase:'connecting',thinkingChars:0,responseChars:0,total,startedAt:now()},writing=Promise.resolve(),stopped=false,sequence=0;
 const update=event=>{const received=Number(event.responseChars)>state.responseChars||Number(event.thinkingChars)>state.thinkingChars||['thinkingText','summary','draftSource'].some(k=>typeof event[k]==='string'&&event[k]!==state[k]);state={...state,...event,...(received?{receivedAt:now()}:{})};};
 const flush=()=>{writing=writing.catch(()=>{}).then(async()=>{if(stopped)return;if(await store.get(key+'/removed.json')){controller.abort();return;}const {draftSource,...publicState}=state;await store.progress(key+'/progress.json',{...publicState,...(draftSource?{draft:partialDocument(draftSource),outputText:draftSource}:{}),sequence:++sequence,heartbeatAt:now()});});return writing;};
 const timer=setInterval(()=>flush().catch(()=>{}),5000);timer.unref?.();
 return {update,flush,async close(phase){clearInterval(timer);state={...state,phase};await flush().catch(()=>{});stopped=true;}};
}
module.exports={partialDocument,streamProgress,createProgressWriter};
