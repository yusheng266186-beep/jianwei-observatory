import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readWorkspace} from '../app/data/storage.js';
import {workspaceBackup} from '../app/data/backup.js';
import {loadOutputVendor} from '../app/io/vendor-loader.js';
import {scheduleIdleWork} from '../app/ui/idle-work.js';
import {exerciseIdentity} from '../app/engine/exercise-identity.js';
import {createResizeWork} from '../app/ui/resize-work.js';
const require=createRequire(import.meta.url),{createProgressWriter}=require('../backend/progress.cjs');

function storage(values,{failCurrent=false,failLegacy=false}={}){
 const hints=new Map([['hengji:workspacePresent','true']]);
 globalThis.localStorage={getItem:key=>hints.get(key)??null,setItem:(key,value)=>hints.set(key,value)};
 globalThis.indexedDB={open(name){const request={};queueMicrotask(()=>{
  if(name==='jianwei-local'?failLegacy:failCurrent){request.error=new Error('TEMPORARY_READ_FAILURE');request.onerror();return;}
  request.result={close(){},objectStoreNames:{contains:()=>true},transaction(){const tx={objectStore:()=>({get(key){const r={};queueMicrotask(()=>{r.result=values[name]?.[key];r.onsuccess();});return r;}})};queueMicrotask(()=>queueMicrotask(()=>tx.oncomplete()));return tx;}};request.onsuccess();
 });return request;}};
 return hints;
}
test('材料库临时读取失败向上传递，保留已保存提示且不误判空工作区',async()=>{
 const hints=storage({},{failCurrent:true});await assert.rejects(readWorkspace(),/TEMPORARY_READ_FAILURE/);assert.equal(hints.get('hengji:workspacePresent'),'true');
});
test('确实为空与历史材料暂不可读分开处理，恢复后仍读取同一份材料',async()=>{
 const hints=storage({},{failLegacy:true});await assert.rejects(readWorkspace());assert.equal(hints.get('hengji:workspacePresent'),'true');
 const dataset={scores:[{total:0}]};storage({'hengji-evidence-workspace':{dataset,prepared:{version:46,stamp:'saved'}}});assert.equal((await readWorkspace()).dataset,dataset);
 storage({});assert.equal((await readWorkspace()).origin,'empty');
});
test('完整备份遇到存储故障仍能下载当前材料和内存练习，未知集合不伪装为空',async()=>{
 const snapshot={students:[{id:'anonymous'}],scores:[{total:0}]},live={exercises:[{id:'kept'}],exerciseComposerDrafts:{version:1,requests:[]}};
 const result=await workspaceBackup(snapshot,{live,read:()=>Promise.reject(Error('blocked'))});
 assert.equal(result.complete,false);assert.deepEqual(result.missing,['exerciseSavedSetups']);assert.deepEqual(result.payload.exercises,live.exercises);assert.equal(result.payload.scores[0].total,0);assert(!Object.hasOwn(result.payload,'exerciseSavedSetups'));
 const full=await workspaceBackup(snapshot,{read:async()=>({exerciseSavedSetups:['saved']})});assert(full.complete);assert.deepEqual(full.payload.exerciseSavedSetups,['saved']);assert.deepEqual(full.payload.exercises,[]);
});
test('Word组件正常时不受独立Excel请求失败影响，失败组件可以重试',async()=>{
 const host={},requests=[];let failExcel=true;
 const doc={createElement:()=>({remove(){}}),head:{append(script){requests.push(script.src);queueMicrotask(()=>{if(script.src.includes('xlsx')&&failExcel)script.onerror();else{host[script.src.includes('xlsx')?'XLSX':'JSZip']={ready:true};script.onload();}});}}};
 await assert.rejects(loadOutputVendor('xlsx.full.min.js','XLSX',{host,document:doc}));
 const before=requests.length;const zip=await loadOutputVendor('jszip.min.js','JSZip',{host,document:doc});assert(zip.ready);assert.equal(requests.length,before+1);assert(requests.at(-1).endsWith('/jszip.min.js'));
 failExcel=false;assert((await loadOutputVendor('xlsx.full.min.js','XLSX',{host,document:doc})).ready);
});
test('同一导出组件的并发请求只加载一次',async()=>{
 const host={};let count=0;const doc={createElement:()=>({remove(){}}),head:{append(script){count++;queueMicrotask(()=>{host.UniqueZip={};script.onload();});}}};
 const a=loadOutputVendor('concurrent.js','UniqueZip',{host,document:doc}),b=loadOutputVendor('concurrent.js','UniqueZip',{host,document:doc});assert.equal(a,b);await a;assert.equal(count,1);
});
test('慢存储下重复心跳合并为一个写入，结束状态和完整文本继续落盘',async()=>{
 let release,began;const gate=new Promise(r=>release=r),begin=new Promise(r=>began=r),snapshots=[];
 const store={get:async()=>null,progress:async(key,value)=>{snapshots.push(value);if(snapshots.length===1){began();await gate;}}};
 const writer=createProgressWriter({store,key:'test',total:3,controller:new AbortController()});writer.update({phase:'writing',draftSource:'{"title":"保留原文"}',responseChars:18});const first=writer.flush();await begin;
 const waiting=Array.from({length:30},()=>writer.flush());release();await Promise.all([first,...waiting]);assert.equal(snapshots.length,1);
 await writer.close('ready');assert.equal(snapshots.at(-1).phase,'ready');assert.equal(snapshots.at(-1).outputText,'{"title":"保留原文"}');
});
test('写入期间有新内容时仅补最新快照，所有等待者等到最新内容保存',async()=>{
 let release,began;const gate=new Promise(r=>release=r),begin=new Promise(r=>began=r),snapshots=[];let removed=false;
 const controller=new AbortController(),store={get:async()=>removed?{value:{}}:null,progress:async(key,value)=>{snapshots.push(value);if(snapshots.length===1){began();await gate;}}};
 const writer=createProgressWriter({store,key:'test',total:3,controller});const first=writer.flush();await begin;
 for(let i=0;i<20;i++){writer.update({phase:'writing',thinkingText:'推演'+i,draftSource:'{"title":"'+i+'"}'});writer.flush();}
 const latest=writer.flush();release();await Promise.all([first,latest]);assert.equal(snapshots.length,2);assert.equal(snapshots.at(-1).thinkingText,'推演19');
 removed=true;await writer.flush();assert(controller.signal.aborted);await writer.close('removed');
});
test('进度存储暂时失败后可重试，不把失败Promise永久留在队列',async()=>{
 let calls=0,last;const store={get:async()=>null,progress:async(key,value)=>{if(++calls===1)throw Error('TEMPORARY_STORAGE');last=value;}};
 const writer=createProgressWriter({store,key:'test',total:3,controller:new AbortController()});writer.update({draftSource:'完整成稿'});await assert.rejects(writer.flush(),/TEMPORARY_STORAGE/);await writer.flush();assert.equal(last.outputText,'完整成稿');await writer.close('ready');assert.equal(last.phase,'ready');
});
test('可选组件按空闲片段加载，输入未完成时让出，取消后不再执行',()=>{
 const timers=new Map(),idles=new Map(),seen=[];let serial=0,input=true;const host={document:{hidden:false},navigator:{scheduling:{isInputPending:()=>input}},setTimeout(fn){timers.set(++serial,fn);return serial;},clearTimeout:id=>timers.delete(id),requestIdleCallback(fn){idles.set(++serial,fn);return serial;},cancelIdleCallback:id=>idles.delete(id)};
 const runTimer=()=>{const [id,fn]=timers.entries().next().value;timers.delete(id);fn();},runIdle=()=>{const [id,fn]=idles.entries().next().value;idles.delete(id);fn({timeRemaining:()=>20});};
 const cancel=scheduleIdleWork([()=>seen.push(1),()=>seen.push(2)],{host});runTimer();runIdle();assert.deepEqual(seen,[]);input=false;runTimer();runIdle();assert.deepEqual(seen,[1]);cancel();assert.equal(idles.size,0);
});
test('试题列表优先读取已保存学生信息，无需逐卡查询完整成绩索引',()=>{
 const atlas={materialAt(){throw Error('unnecessary lookup');},people:new Map(),exam:()=>({label:'本场'})};const record={sid:'one',exam:'52',student:{name:'匿名',classNo:4,examLabel:'第二场'}};assert.deepEqual(exerciseIdentity(atlas,record),{name:'匿名',classNo:4,exam:'第二场'});
});
test('尺寸通知本轮不修改布局，同一元素合并到下一帧，已移除元素不再更新',()=>{
 const frames=new Map(),seen=[];let serial=0;
 const batch=createResizeWork((node,kind)=>seen.push([node.id,kind]),{requestFrame:fn=>(frames.set(++serial,fn),serial),cancelFrame:id=>frames.delete(id)});
 const node={id:'chart',isConnected:true},removed={id:'old',isConnected:false};for(let i=0;i<20;i++)batch.add(node,'plot');batch.add(removed,'table');assert.deepEqual(seen,[]);assert.equal(frames.size,1);
 const [id,frame]=frames.entries().next().value;frames.delete(id);frame();assert.deepEqual(seen,[['chart','plot']]);batch.add(node,'rail');batch.cancel();assert.equal(frames.size,0);
});
