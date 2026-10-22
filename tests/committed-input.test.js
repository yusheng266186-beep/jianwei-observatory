import test from 'node:test';
import assert from 'node:assert/strict';
import {installCommittedInput} from '../app/ui/committed-input.js';
function setup(){const root=new EventTarget(),target={value:'',matches:()=>true},calls=[];let starts=0;const controller=new AbortController();installCommittedInput(root,e=>calls.push(e.target.value),{signal:controller.signal,onCompositionStart:()=>starts++});return {target,calls,controller,get starts(){return starts;},send(type,value,composing=false){target.value=value;const event=new Event(type);Object.defineProperties(event,{target:{value:target},isComposing:{value:composing}});root.dispatchEvent(event);}};}
test('中文选字期间不筛选，包括没有 isComposing 标记的浏览器；确认后只处理一次',()=>{
 const t=setup();t.send('compositionstart','');t.send('input','wang',true);t.send('input','王',false);assert.deepEqual(t.calls,[]);assert.equal(t.starts,1);
 t.send('compositionend','王');t.send('input','王');assert.deepEqual(t.calls,['王']);t.send('input','王同学');assert.deepEqual(t.calls,['王','王同学']);
});
test('没有结尾 input 的浏览器也提交中文，普通输入和程序重设后的输入不被吞掉',()=>{
 const t=setup();t.send('compositionstart','');t.send('compositionend','王');t.send('input','陈');t.send('input','王');t.send('input','王');assert.deepEqual(t.calls,['王','陈','王','王']);
 t.controller.abort();t.send('input','不触发');assert.equal(t.calls.length,4);
});
