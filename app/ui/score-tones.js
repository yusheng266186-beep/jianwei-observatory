import {valid} from '../engine/metrics.js?v=runtime-v36';

// Higher measured rates use deeper school blue. Unknown and abnormal rates
// have a neutral treatment; neither is colored as a real zero or a full score.
export const scoreTones=Object.freeze([
  {key:'foundation',min:0,fill:'#e8f0f6',light:'#f8fbfd',shade:'#dfebf4',ink:'#3e5e78',muted:'#48667e',edge:'#ccdeeb',label:'低于25%'},
  {key:'developing',min:.25,fill:'#e1eef8',light:'#f6fafc',shade:'#d3e5f0',ink:'#335e7e',muted:'#3e607c',edge:'#b6cfe1',label:'25%至不足50%'},
  {key:'steady',min:.5,fill:'#c8dfee',light:'#edf6fb',shade:'#bcd5e6',ink:'#244f70',muted:'#2b526f',edge:'#9bbcd4',label:'50%至不足75%'},
  {key:'secure',min:.75,fill:'#9fc0d8',light:'#d8e7f0',shade:'#94b4ce',ink:'#193f5e',muted:'#1b405c',edge:'#7ba5c4',label:'75%至不足90%'},
  {key:'mastered',min:.9,fill:'#789ab6',light:'#adc8dc',shade:'#7396b3',ink:'#0c2b44',muted:'#0c2b44',edge:'#92b0c6',label:'90–100%'}
].map(Object.freeze));
const unknown=Object.freeze({key:'unknown',fill:'#edf2f6',light:'#f8fafc',shade:'#e2eaf0',ink:'#4b667b',muted:'#4b6478',edge:'#c8d6e1',label:'未知或异常'});
export function scoreTone(rate){return !valid(rate)||rate<0||rate>1?unknown:scoreTones.findLast(tone=>rate>=tone.min);}
export function scoreStyle(rate){const tone=scoreTone(rate);return '--score-base:'+tone.fill+';--score-light:'+tone.light+';--score-shade:'+tone.shade+';--score-fill:'+tone.fill+'eb;--score-ink:'+tone.ink+';--score-muted:'+tone.muted+';--score-edge:'+tone.edge+';--score-highlight:'+(tone.key==='mastered'?'#ffffff14':'#ffffff3d')+';--score-glow:'+(tone.key==='mastered'?'#ffffff1a':'#ffffff82')+';--score-depth:'+(tone.key==='mastered'?'#122e4b30':'#658ba81c')+';';}
export function scoreLegend(){return '<div class="score-tone-legend" aria-label="得分率颜色说明"><span>蓝色越深，得分率越高</span>'+[...scoreTones,unknown].map(tone=>'<span><i style="background:'+tone.fill+'" aria-hidden="true"></i>'+tone.label+'</span>').join('')+'</div>';}
