import {valid} from './metrics.js';
const clean=value=>{const result=Number(value.toPrecision(12));return Object.is(result,-0)?0:result;};
export function trajectoryScale(values,{zero=false,floor=null,ceiling=null,integerTicks=false}={}) {
 const measured=values.filter(valid);if(!measured.length)return null;
 const observedLow=Math.min(...measured),observedHigh=Math.max(...measured);
 let low=zero?Math.min(0,observedLow):observedLow,high=zero?Math.max(0,observedHigh):observedHigh;
 if(low===high){const room=Math.max(1,Math.abs(low)*.02);low-=room;high+=room;}
 const padding=(high-low)*.15;low-=padding;high+=padding;
 const lower=valid(floor)&&observedLow>=floor?floor:null,upper=valid(ceiling)&&observedHigh<=ceiling?ceiling:null;
 if(lower!==null)low=Math.max(lower,low);if(upper!==null)high=Math.min(upper,high);
 const raw=(high-low)/4,magnitude=10**Math.floor(Math.log10(raw)),step=Math.max(integerTicks?1:0,([1,2,2.5,5,10].find(n=>n>=raw/magnitude)||10)*magnitude);
 low=clean(Math.floor(low/step)*step);high=clean(Math.ceil(high/step)*step);
 if(lower!==null)low=Math.max(lower,low);if(upper!==null)high=Math.min(upper,high);
 const ticks=[];for(let i=Math.ceil((low-step*1e-8)/step);i*step<=high+step*1e-8&&ticks.length<12;i++)ticks.push(clean(i*step));
 if(lower!==null&&low===lower&&ticks.length&&ticks[0]!==low&&ticks[0]-low>=step*.5)ticks.unshift(low);
 let digits=0;while(digits<6&&Math.abs(step*10**digits-Math.round(step*10**digits))>1e-7)digits++;
 return {low,high,ticks,digits,step};
}
export function researchPlotOptions(metric,{aggregate=false}={}) {
 if(metric.includes('Rate'))return {unit:'%',suffix:'%',floor:0,ceiling:100};
 if(aggregate&&['top','under'].includes(metric))return {unit:'人',floor:0,integerTicks:true};
 if(['rank','gradeRank','classRank'].includes(metric))return {unit:'名',inverse:true,floor:1,integerTicks:true};
 if(metric==='percentile')return {unit:'点',floor:0,ceiling:100};
 if(['top','under','topGap','underGap'].includes(metric))return {unit:'分',zero:true};
 return {unit:'分',floor:0};
}
