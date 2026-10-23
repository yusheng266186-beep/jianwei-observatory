import test from 'node:test';
import assert from 'node:assert/strict';
import {createScrollMotion} from '../app/ui/scroll-motion.js';
function fixture({reduced=false}={}){
 let time=0,sequence=0;const frames=new Map(),writes=[];
 const controller=createScrollMotion({now:()=>time,requestFrame:fn=>{frames.set(++sequence,fn);return sequence;},cancelFrame:id=>frames.delete(id),reducedMotion:()=>reduced,read:h=>({left:h.x,top:h.y,maxLeft:h.maxX,maxTop:h.maxY,marker:h}),write:(h,p)=>{h.x=Math.round(p.left);h.y=Math.round(p.top);writes.push({...p});}});
 const host=()=>({x:0,y:0,maxX:1200,maxY:8000,dataset:{},isConnected:true});
 const step=(ms=1000/60)=>{time+=ms;const work=[...frames.values()];frames.clear();for(const fn of work)fn(time);};
 const finish=()=>{for(let i=0;i<100&&frames.size;i++)step();assert.equal(frames.size,0);};
 return {controller,host,step,finish,frames,writes};
}
test('程序滚动从静止非线性推进并完整收束，结束没有常驻帧回调',async()=>{
 const f=fixture(),h=f.host(),p=f.controller.to(h,{top:1200});f.step();assert(h.y>0&&h.y<120);let previous=h.y;
 for(let i=0;i<6;i++){f.step();assert(h.y>=previous);previous=h.y;}
 f.finish();assert.equal(await p,true);assert.equal(h.y,1200);assert.equal(h.dataset.scrollMotion,undefined);assert.deepEqual(f.controller.activeHosts(),[]);
});
test('快速连续按方向以尚未抵达的目标累计距离，不丢掉第二次滚动意图',async()=>{
 const f=fixture(),h=f.host(),first=f.controller.by(h,{left:300});f.step(60);const second=f.controller.by(h,{left:300});assert.equal(await first,false);f.finish();assert.equal(await second,true);assert.equal(h.x,600);
});
test('反向滚动继承当前速度，先自然制动再抵达新目标',async()=>{
 const f=fixture(),h=f.host(),first=f.controller.to(h,{top:1200});f.step(60);const before=h.y,last=f.controller.to(h,{top:0});assert.equal(h.y,before);f.step(10);assert(h.y>before);f.finish();assert.equal(await first,false);assert.equal(await last,true);assert.equal(h.y,0);
});
test('用户或另一个恢复流程改变滚动位置，旧滚动自动退出，不覆盖新位置',async()=>{
 const f=fixture(),h=f.host(),p=f.controller.to(h,{top:1400});f.step();h.y=500;f.step();assert.equal(await p,false);assert.equal(h.y,500);assert.equal(f.frames.size,0);
});
test('多个阅读区共享一个有界帧队列，中断其中一个不影响另一个',async()=>{
 const f=fixture(),a=f.host(),b=f.host(),one=f.controller.to(a,{top:600}),two=f.controller.to(b,{left:1000});assert.equal(f.frames.size,1);f.step();f.controller.cancel(a);assert.equal(await one,false);f.finish();assert.equal(await two,true);assert.equal(b.x,1000);
});
test('静读模式立即抵达合法范围，不创建帧循环',async()=>{
 const f=fixture({reduced:true}),h=f.host();assert.equal(await f.controller.to(h,{left:-40,top:99999}),true);assert.equal(h.x,0);assert.equal(h.y,h.maxY);assert.equal(f.frames.size,0);
});
test('窗口偏好改变时可立即完成；离开的内容会释放旧滚动',async()=>{
 const f=fixture(),h=f.host(),p=f.controller.to(h,{top:900});f.step();f.controller.finishAll();assert.equal(await p,true);assert.equal(h.y,900);assert.equal(f.frames.size,0);
 const next=f.controller.to(h,{top:1500});h.isConnected=false;f.step();assert.equal(await next,false);assert.equal(h.dataset.scrollMotion,undefined);
});
test('内容缩短与越界意图保持合法范围；取消所有滚动释放每个等待者',async()=>{
 const f=fixture(),h=f.host(),one=f.controller.to(h,{top:8000});f.step();h.maxY=900;f.finish();assert.equal(await one,true);assert.equal(h.y,900);assert(f.writes.every(p=>Number.isFinite(p.top)&&p.top>=0));
 const a=f.host(),b=f.host(),pa=f.controller.to(a,{top:600}),pb=f.controller.to(b,{left:800});f.controller.cancelAll();assert.equal(await pa,false);assert.equal(await pb,false);assert.equal(f.frames.size,0);
});

test('重复定位同一目标复用正在运行的过程，不重新计时或分配帧队列',async()=>{
 const f=fixture(),h=f.host(),p=f.controller.to(h,{top:1000});f.step();assert.equal(f.controller.to(h,{top:1000}),p);assert.equal(f.frames.size,1);f.finish();assert.equal(await p,true);assert.equal(h.y,1000);
});
