import test from 'node:test';import assert from 'node:assert/strict';
import {createCenterTicker} from '../app/ui/center-ticker.js';
function fakeClock(){let now=0,next=0;const timers=new Map();return {
 setTimeoutFn(fn,ms){const id=++next;timers.set(id,{fn,at:now+ms});return id;},
 clearTimeoutFn(id){timers.delete(id);},
 advance(ms){const target=now+ms;for(;;){let due=null;for(const entry of timers)if(entry[1].at<=target&&(!due||entry[1].at<due[1].at))due=entry;if(!due)break;timers.delete(due[0]);now=due[1].at;due[1].fn();}now=target;},
 get pending(){return timers.size;}
};}
test('试题中心只在有进行中任务、页面可见且中心已挂载时每秒调度',()=>{
 const clock=fakeClock();let ticks=0,needed=true,visible=true,mounted=true;
 const ticker=createCenterTicker({tick:()=>ticks++,needed:()=>needed,visible:()=>visible,mounted:()=>mounted,setTimeoutFn:clock.setTimeoutFn,clearTimeoutFn:clock.clearTimeoutFn});
 assert.equal(ticker.sync(),true);assert.equal(ticker.running,true);assert.equal(clock.pending,1);
 clock.advance(1000);assert.equal(ticks,1);assert.equal(ticker.running,true);
 clock.advance(2000);assert.equal(ticks,3);
 visible=false;clock.advance(1000);assert.equal(ticks,3,'hidden pages stop ticking');assert.equal(ticker.running,false);assert.equal(clock.pending,0);
 visible=true;ticker.sync();clock.advance(1000);assert.equal(ticks,4);
 mounted=false;clock.advance(1000);assert.equal(ticks,4,'an unmounted center stops ticking');assert.equal(ticker.running,false);
 mounted=true;ticker.sync();clock.advance(1000);assert.equal(ticks,5);
 needed=false;clock.advance(1000);assert.equal(ticks,5,'no pending task means no timer');assert.equal(ticker.running,false);assert.equal(ticker.sync(),false);
});
test('没有需要时不启动定时器，停止后不会残留',()=>{
 const clock=fakeClock();let ticks=0;
 const ticker=createCenterTicker({tick:()=>ticks++,needed:()=>false,setTimeoutFn:clock.setTimeoutFn,clearTimeoutFn:clock.clearTimeoutFn});
 assert.equal(ticker.sync(),false);assert.equal(ticker.running,false);assert.equal(clock.pending,0);clock.advance(5000);assert.equal(ticks,0);
 ticker.stop();assert.equal(ticker.running,false);
});
