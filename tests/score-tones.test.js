import test from 'node:test';
import assert from 'node:assert/strict';
import {scoreTone,scoreTones} from '../app/ui/score-tones.js';

const rgb=hex=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));
const luminance=rgb=>rgb.reduce((sum,v,i)=>{const c=v/255;return sum+(c<=.04045?c/12.92:((c+.055)/1.055)**2.4)*[.2126,.7152,.0722][i];},0);
const contrast=(a,b)=>(Math.max(luminance(a),luminance(b))+.05)/(Math.min(luminance(a),luminance(b))+.05);

test('真实零分、分段边界与未知/异常比例分别处理',()=>{
  const cases=[[0,'foundation'],[.2499,'foundation'],[.25,'developing'],[.4999,'developing'],[.5,'steady'],[.7499,'steady'],[.75,'secure'],[.8999,'secure'],[.9,'mastered'],[1,'mastered']];
  for(const [rate,key] of cases)assert.equal(scoreTone(rate).key,key);
  for(const rate of [null,undefined,NaN,Infinity,-.01,1.01,'0.9'])assert.equal(scoreTone(rate).key,'unknown');
  assert.notEqual(scoreTone(0).fill,scoreTone(null).fill);
});

test('得分率越高，蓝色明度持续降低',()=>{
  const values=scoreTones.map(t=>luminance(rgb(t.fill)));
  for(let i=1;i<values.length;i++)assert.ok(values[i]<values[i-1],scoreTones[i].key);
  assert.ok(values[0]-values.at(-1)>.65);
});

test('得分色块的前景文字在透明底和最亮高光处仍可读',()=>{
  for(const tone of [...scoreTones,scoreTone(null)]){
    const base=rgb(tone.fill).map(v=>v*235/255+255*(1-235/255));
    const highlight=tone.key==='mastered'?20/255:61/255;
    const light=base.map(v=>v*(1-highlight)+255*highlight);
    for(const background of [rgb(tone.fill),base,light]){
      assert.ok(contrast(rgb(tone.ink),background)>=4.5,tone.key+' 主文字');
      assert.ok(contrast(rgb(tone.muted),background)>=4.5,tone.key+' 小字');
    }
  }
});
