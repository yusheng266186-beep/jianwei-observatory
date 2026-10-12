import test from 'node:test';
import assert from 'node:assert/strict';
import {finishAnimation,cancelOwnMotion} from '../app/ui/motion.js';

test('暂停且永不完成的退场仍能释放关闭操作，并清理动画',async()=>{
  let cancelled=0;const animation={finished:new Promise(()=>{}),cancel(){cancelled++;}};
  await Promise.race([finishAnimation(animation,10),new Promise((_,reject)=>setTimeout(()=>reject(new Error('关闭被暂停动画阻塞')),400))]);
  assert.equal(cancelled,1);
});
test('取消退场动画也能完成退出，缺少动画接口不阻止关闭',async()=>{
  const animation={finished:Promise.reject(new Error('cancelled')),cancel(){}};
  await finishAnimation(animation,10);await finishAnimation(undefined,10);
  assert.doesNotThrow(()=>cancelOwnMotion({}));
});
