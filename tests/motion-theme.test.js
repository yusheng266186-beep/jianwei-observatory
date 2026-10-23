import test from 'node:test';
import assert from 'node:assert/strict';
import {motion,refreshMotion} from '../app/ui/motion.js';

test('主题在模块预加载之后到达时，挂载重新读取曲线和节奏，不冻结为回退值',()=>{
 const saved={document:globalThis.document,getComputedStyle:globalThis.getComputedStyle};
 try{
  globalThis.document={documentElement:{}};let values={};globalThis.getComputedStyle=()=>({getPropertyValue:name=>values[name]||''});refreshMotion();assert.equal(motion.control.easing,'cubic-bezier(.22,1,.36,1)');
  values={'--motion-ease':'linear(0, .3 20%, 1)','--motion-arrive':'340ms','--motion-disclose':'.28s','--motion-exit-ease':'cubic-bezier(.4,0,.75,.25)'};refreshMotion();assert.equal(motion.control.easing,values['--motion-ease']);assert.equal(motion.arrive.duration,340);assert.equal(motion.disclose.duration,280);assert.equal(motion.leave.easing,values['--motion-exit-ease']);
 }finally{for(const [key,value] of Object.entries(saved))if(value===undefined)delete globalThis[key];else globalThis[key]=value;refreshMotion();}
});
