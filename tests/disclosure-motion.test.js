import test from 'node:test';
import assert from 'node:assert/strict';
import {toggleDisclosure,openDisclosure,installDisclosures} from '../app/ui/disclosure-motion.js';
import {button,table} from '../app/ui/html.js';
import {interfaceIcon} from '../app/ui/icons.js';
const reducedMotion=()=>false;
function fixture(open=false){
 const ownerDocument={activeElement:null},summary={tagName:'SUMMARY',getBoundingClientRect:()=>({height:40}),contains:n=>n===summary,focus(){ownerDocument.activeElement=summary;}};
 const details={open,dataset:{},ownerDocument,children:[summary,{tagName:'DIV'},{tagName:'P'}],contains:n=>n===summary||n?.inside,getBoundingClientRect(){return {height:this.open?248:48};},animations:[]};
 details.animate=function(frames){let resolve,reject;const animation={frames,finished:new Promise((a,b)=>{resolve=a;reject=b;}),resolve:()=>resolve(),cancel:()=>reject(new Error('cancelled'))};this.animations.push(animation);return animation;};
 return {details,summary};
}
const computed=element=>element.tagName==='SUMMARY'?{marginTop:'0px',marginBottom:'0px'}:{paddingTop:'4px',paddingBottom:'4px',borderTopWidth:'0px',borderBottomWidth:'0px',boxSizing:'border-box'};
test('折叠动画使用整个区块高度，多个内容节点不会只动画第一个',async()=>{
 const saved=globalThis.getComputedStyle;globalThis.getComputedStyle=computed;
 try{const {details}=fixture(),promise=toggleDisclosure(details,{reducedMotion});assert.equal(details.open,true);assert.equal(details.animations[0].frames[1].height,'248px');details.animations[0].resolve();assert.equal(await promise,true);assert.equal(details.open,true);assert.equal(details.dataset.disclosurePhase,undefined);}finally{globalThis.getComputedStyle=saved;}
});
test('连续切换只接受最新意图，旧动画完成不会重新打开区块',async()=>{
 const saved=globalThis.getComputedStyle;globalThis.getComputedStyle=computed;
 try{const {details}=fixture();let settled=0;const options={reducedMotion,onSettled:()=>settled++},first=toggleDisclosure(details,options),last=toggleDisclosure(details,options);assert.equal(details.dataset.disclosurePhase,'closing');details.animations.at(-1).resolve();assert.equal(await first,false);assert.equal(await last,true);assert.equal(details.open,false);assert.equal(settled,1);}finally{globalThis.getComputedStyle=saved;}
});
test('程序打开取消尚未完成的关闭，焦点与完整内容保持可用',async()=>{
 const saved=globalThis.getComputedStyle;globalThis.getComputedStyle=computed;
 try{const {details}=fixture(true),closing=toggleDisclosure(details,{reducedMotion});openDisclosure(details);assert.equal(await closing,false);assert.equal(details.open,true);assert.equal(details.dataset.disclosurePhase,undefined);}finally{globalThis.getComputedStyle=saved;}
});
test('缺少动画接口或减少动态时仍能折叠，关闭前将内容焦点放回标题',async()=>{
 const {details,summary}=fixture(true);details.animate=undefined;details.ownerDocument.activeElement={inside:true};await toggleDisclosure(details,{reducedMotion});assert.equal(details.open,false);assert.equal(details.ownerDocument.activeElement,summary);await toggleDisclosure(details,{reducedMotion:()=>true});assert.equal(details.open,true);
});
test('嵌入摘要的按钮和链接保留自身操作，不被折叠处理抢占',()=>{
 let click,removed=false,prevented=false;const root={addEventListener:(_,fn)=>click=fn,removeEventListener:()=>removed=true},dispose=installDisclosures(root),details={matches:()=>true},summary={parentElement:details,dataset:{}};
 click({target:{closest:selector=>selector==='summary'?summary:{}},preventDefault:()=>prevented=true});assert.equal(prevented,false);dispose();assert.equal(removed,true);
});
test('关闭与表格方向控件共用矢量图标，仍保留可读名称',()=>{
 const close=button('×','plan-close',{},'icon-only','aria-label="关闭训练计划"');assert.match(close,/aria-label="关闭训练计划"/);assert.match(close,/<svg class="interface-icon"/);assert(!close.includes('>×<'));const html=table(['学生'],[['甲']]);assert.match(html,/aria-label="向左查看表格"><svg/);assert.match(html,/aria-label="向右查看表格"><svg/);
});
test('共用关闭和方向图标包含可绘制路径，路径数据不会作为SVG纯文本输出',()=>{
 for(const name of ['close','left','right','up','down']){const svg=interfaceIcon(name);assert.match(svg,/<path d="[Mm][^"]+"\/>/);assert.match(svg,/<svg[^>]+><path[^>]+\/><\/svg>$/);assert.match(svg,/aria-hidden="true"/);}
 assert.match(button('↓','report-part-move',{},'icon-only','aria-label="下移班级概况"'),/aria-label="下移班级概况"[^>]*><svg[^>]+><path/);
 assert(!interfaceIcon('unknown').includes('undefined'));
});

test('打开期间内容长高重新指向自然高度，过期动画不会提前完成或遗留观察器',async()=>{
 const names=['getComputedStyle','ResizeObserver','requestAnimationFrame','cancelAnimationFrame'],saved=Object.fromEntries(names.map(n=>[n,globalThis[n]]));let callback,disconnected=0,sequence=0;const frames=new Map();
 try{
  globalThis.getComputedStyle=computed;globalThis.requestAnimationFrame=fn=>{frames.set(++sequence,fn);return sequence;};globalThis.cancelAnimationFrame=id=>frames.delete(id);
  globalThis.ResizeObserver=class{constructor(fn){callback=fn;}observe(){}disconnect(){disconnected++;}};
  const {details,summary}=fixture(),body=details.children[1];Object.assign(summary,{offsetWidth:220,offsetHeight:40});Object.assign(body,{offsetWidth:220,offsetHeight:200,getBoundingClientRect(){return {width:220,height:this.offsetHeight};}});Object.assign(details.children[2],{offsetWidth:220,offsetHeight:0});details.getBoundingClientRect=()=>({height:details.open?body.offsetHeight+48:48});
  let settled=false;const promise=toggleDisclosure(details,{reducedMotion});promise.then(()=>settled=true);body.offsetHeight=400;callback([{target:body,borderBoxSize:[{inlineSize:220,blockSize:400}]}]);for(const fn of [...frames.values()])fn();frames.clear();assert.equal(details.animations.length,2);assert.equal(details.animations[1].frames[1].height,'448px');
  details.animations[0].resolve();await Promise.resolve();await Promise.resolve();assert.equal(settled,false);details.animations[1].resolve();assert.equal(await promise,true);assert.equal(disconnected,1);assert.equal(details.dataset.disclosurePhase,undefined);
 }finally{for(const name of names)if(saved[name]===undefined)delete globalThis[name];else globalThis[name]=saved[name];}
});
