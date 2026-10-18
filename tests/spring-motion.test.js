import test from 'node:test';
import assert from 'node:assert/strict';
import {springAt,springPlan,animateSpring,springFrame,stopSpring} from '../app/ui/spring-motion.js';

test('非线性位移从静止柔和启动，单调接近终点且无弹跳',()=>{
 const plan=springPlan({x:0},{x:1200});let previous=-1;
 for(const frame of plan.frames){assert(frame.value.x>=previous);assert(frame.value.x<=1200);previous=frame.value.x;}
 assert.equal(plan.frames[0].velocity.x,0);assert.equal(plan.frames.at(-1).value.x,1200);
 assert(plan.sample(20).value.x/1200<.15);assert(plan.sample(150).value.x/1200>.8);
 assert(plan.duration<650);assert(Math.abs(plan.sample(plan.duration).velocity.x)<3);
});
test('反向操作继承当前位置和速度，随后自然制动并抵达新目标',()=>{
 const before=springAt({x:0},{x:600},{},.06),next=springPlan(before.value,{x:-200},before.velocity);
 assert.equal(next.frames[0].value.x,before.value.x);assert.equal(next.frames[0].velocity.x,before.velocity.x);
 assert(next.sample(10).value.x>before.value.x);assert(next.sample(100).velocity.x<0);
 assert.equal(next.frames.at(-1).value.x,-200);assert(next.duration<=900);
});
test('坐标和大小同步，极小距离与负坐标不会产生非法关键帧',()=>{
 const plan=springPlan({x:-123,y:8,width:36,height:40},{x:0,y:0,width:96,height:60});
 assert(plan.frames.every(f=>Object.values(f.value).every(Number.isFinite)));
 assert.deepEqual(plan.frames.at(-1).value,{x:0,y:0,width:96,height:60});
 assert.equal(springPlan({x:1},{x:1}).duration,100);
});
function surface(){const calls=[],element={animate(frames,options){let resolve,reject;const animation={currentTime:0,frames,options,finished:new Promise((a,b)=>{resolve=a;reject=b;}),cancel(){reject(Error('cancelled'));},finish(){resolve();}};calls.push(animation);return animation;}};return {element,calls};}
const map=value=>({transform:'translateX('+value.x+'px)'});
test('连续点选在原生时间线上采样并接续，而非从旧起点重播',async()=>{
 const {element,calls}=surface(),first=animateSpring(element,{x:400},{from:{x:0},map});calls[0].currentTime=75;
 const before=springFrame(element),last=animateSpring(element,{x:100},{map});
 assert.equal(calls.length,2);assert.equal(calls[1].frames[0].transform,map(before.value).transform);
 assert.equal(springFrame(element).velocity.x,before.velocity.x);
 calls[1].finish();await Promise.all([first,last]);assert.deepEqual(springFrame(element),{value:{x:100},velocity:{x:0}});
});
test('相同目标不重启动画；静读立即落位且取消过期回调',async()=>{
 const {element,calls}=surface(),first=animateSpring(element,{x:400},{from:{x:0},map});
 assert.equal(animateSpring(element,{x:400},{map}),first);assert.equal(calls.length,1);
 await animateSpring(element,{x:50},{map,immediate:true});await first;
 assert.deepEqual(springFrame(element),{value:{x:50},velocity:{x:0}});assert.equal(calls.length,1);
 assert.deepEqual(stopSpring(element),{value:{x:50},velocity:{x:0}});assert.equal(springFrame(element),null);
});
test('缺少或异常动画接口仍完成，暂停动画不会遗留过渡状态',async()=>{
 const unavailable={animate(){throw Error('unavailable');}};await animateSpring(unavailable,{x:20},{from:{x:0},map});assert.equal(springFrame(unavailable).value.x,20);
 await animateSpring({}, {x:0},{map});
 const {element,calls}=surface();const promise=animateSpring(element,{x:1},{from:{x:0},map});await promise;assert.equal(springFrame(element).velocity.x,0);assert.equal(calls.length,1);
});
