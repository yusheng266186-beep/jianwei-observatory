import test from 'node:test';
import assert from 'node:assert/strict';
import {warmExerciseMath} from '../app/io/exercise-math.js';
test('公式脚本已下载但初始化不结束仍可退出等待，失败后下一次可正常重试',async t=>{
 const oldWindow=globalThis.window,oldDocument=globalThis.document,scripts=[];t.mock.timers.enable({apis:['setTimeout']});
 globalThis.window={};globalThis.document={createElement:()=>({remove(){this.removed=true;}}),head:{append(script){scripts.push(script);}}};
 try{
  const pending=warmExerciseMath(),rejected=assert.rejects(pending,/加载超时/);window.MathJax={startup:{promise:new Promise(()=>{})}};scripts[0].onload();await Promise.resolve();t.mock.timers.tick(20001);await rejected;assert(scripts[0].removed);
  const retry=warmExerciseMath();assert.equal(scripts.length,2);window.MathJax={startup:{promise:Promise.resolve()}};scripts[1].onload();await retry;
 }finally{globalThis.window=oldWindow;globalThis.document=oldDocument;t.mock.timers.reset();}
});
