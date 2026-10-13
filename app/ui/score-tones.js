import {valid} from '../engine/metrics.js?v=reports-v24';

// Higher measured rates use deeper school blue. Unknown and abnormal rates
// have a neutral treatment; neither is colored as a real zero or a full score.
export const scoreTones=Object.freeze([
  {key:'foundation',min:0,fill:'#f1f7fb',ink:'#466b88',muted:'#526f85',edge:'#ccdeeb',label:'低于25%'},
  {key:'developing',min:.25,fill:'#e1eef8',ink:'#335e7e',muted:'#486a83',edge:'#b6cfe1',label:'25%至不足50%'},
  {key:'steady',min:.5,fill:'#c8dfee',ink:'#244f70',muted:'#355e7a',edge:'#9bbcd4',label:'50%至不足75%'},
  {key:'secure',min:.75,fill:'#9fc0d8',ink:'#193f5e',muted:'#234a66',edge:'#7ba5c4',label:'75%至不足90%'},
  {key:'mastered',min:.9,fill:'#2e5676',ink:'#f3faff',muted:'#f0f8ff',edge:'#92b0c6',label:'90–100%'}
].map(Object.freeze));
const unknown=Object.freeze({key:'unknown',fill:'#edf2f6',ink:'#536e83',muted:'#536e83',edge:'#c8d6e1',label:'未知或异常'});
export function scoreTone(rate){return !valid(rate)||rate<0||rate>1?unknown:scoreTones.findLast(tone=>rate>=tone.min);}
export function scoreStyle(rate){const tone=scoreTone(rate);return '--score-base:'+tone.fill+';--score-fill:'+tone.fill+'eb;--score-ink:'+tone.ink+';--score-muted:'+tone.muted+';--score-edge:'+tone.edge+';--score-highlight:'+(tone.key==='mastered'?'#ffffff14':'#ffffff3d')+';';}
export function scoreLegend(){return '<div class="score-tone-legend" aria-label="得分率颜色说明"><span>蓝色越深，得分率越高</span>'+[...scoreTones,unknown].map(tone=>'<span><i style="background:'+tone.fill+'" aria-hidden="true"></i>'+tone.label+'</span>').join('')+'</div>';}
