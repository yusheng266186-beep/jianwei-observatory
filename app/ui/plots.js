import {esc,number,percent,attrs} from './html.js?v=controls-v12';
import {valid} from '../engine/metrics.js?v=controls-v12';
import {plotPalette as palette} from './palette.js?v=controls-v12';
export const seriesColors=palette.series;
const colors=seriesColors;
const action=item=>item?.cmd?' data-plot-action="true" data-cmd="'+esc(item.cmd)+'"'+attrs(item.data||{})+' role="button" tabindex="0"':'';
const key=id=>'glass-'+[...String(id)].map(char=>char.codePointAt(0).toString(16)).join('-');
const gradient=(id,from,to,vertical=false)=>'<linearGradient id="'+id+'" x1="0" y1="0" x2="'+(vertical?'0':'1')+'" y2="'+(vertical?'1':'0')+'"><stop stop-color="'+from+'"/><stop offset="1" stop-color="'+to+'"/></linearGradient>';
// Each segment stays within its two values; missing records break the curve and area.
function curve(points){return points.map((p,i)=>i?'C'+(points[i-1].x+p.x)/2+','+points[i-1].y+' '+(points[i-1].x+p.x)/2+','+p.y+' '+p.x+','+p.y:'M'+p.x+','+p.y).join(' ');}
export function trajectory(id,labels,series,{suffix='',zero=false,inverse=false,floor=null,integerTicks=false}={}) {
  const values=series.flatMap(s=>s.values).filter(valid);if(!values.length)return '<div class="plot-empty">暂无可绘制的成绩</div>';
  let low=Math.min(...values),high=Math.max(...values);if(zero){low=Math.min(0,low);high=Math.max(0,high);}if(high===low){low-=1;high+=1;}
  const padding=(high-low)*.15;low-=padding;high+=padding;if(valid(floor))low=Math.max(floor,low);
  const w=940,h=275,left=60,right=30,top=25,bottom=55,x=i=>left+i*(w-left-right)/Math.max(1,labels.length-1),y=v=>top+(inverse?v-low:high-v)/(high-low)*(h-top-bottom),prefix=key(id);
  let defs='',areas='',curves='',passivePoints='',activePoints='';
  const ticks=Array.from({length:5},(_,i)=>low+(high-low)*i/4),axis=integerTicks?[...new Set(ticks.map(Math.round))].filter(v=>v>=low&&v<=high):ticks;
  let content=axis.map(value=>'<line class="plot-grid" x1="'+left+'" x2="'+(w-right)+'" y1="'+y(value)+'" y2="'+y(value)+'" stroke="'+palette.grid+'" stroke-dasharray="2 6"/><text x="'+(left-10)+'" y="'+(y(value)+4)+'" text-anchor="end">'+number(value,0)+esc(suffix)+'</text>').join('');
  content+=labels.map((label,i)=>'<text x="'+x(i)+'" y="'+(h-19)+'" text-anchor="middle">'+esc(label)+'</text>').join('');
  for(const [index,item] of series.entries()) {
    const color=item.color||colors[index%colors.length],segments=[];let points=[];
    const finish=()=>{if(points.length){segments.push(points);points=[];}};
    item.values.forEach((value,i)=>{if(!valid(value)){finish();return;}points.push({x:x(i),y:y(value)});});finish();
    if(index===0){
      const fill=prefix+'-area';defs+='<linearGradient id="'+fill+'" x1="0" y1="0" x2="0" y2="1"><stop stop-color="'+color+'" stop-opacity=".18"/><stop offset="1" stop-color="'+color+'" stop-opacity="0"/></linearGradient>';
      areas+=segments.filter(s=>s.length>1).map(s=>'<path class="plot-area" d="'+curve(s)+' L'+s.at(-1).x+','+(h-bottom)+' L'+s[0].x+','+(h-bottom)+' Z" fill="url(#'+fill+')"/>').join('');
    }
    curves+='<path class="plot-line" pathLength="1000" d="'+segments.map(curve).join(' ')+'" fill="none" stroke="'+color+'" stroke-width="'+(index===0?'3':'2.4')+'" stroke-linejoin="round" stroke-linecap="round"/>';
    item.values.forEach((value,i)=>{
      if(!valid(value))return;
      const title=series.filter(s=>s.values[i]===value).map(s=>s.name+' · '+labels[i]+'：'+number(value)+suffix).join('\n');
      const point='<circle class="plot-point" cx="'+x(i)+'" cy="'+y(value)+'" r="4" fill="'+palette.point+'" stroke="'+color+'" stroke-width="2"'+action(item.points?.[i])+'><title>'+esc(title)+'</title></circle>';
      if(item.points?.[i]?.cmd)activePoints+=point;else passivePoints+=point;
    });
  }
  content+=areas+curves+passivePoints+activePoints;
  return '<div class="plot-legend">'+series.map((s,i)=>'<span><i style="background:'+(s.color||colors[i%colors.length])+'"></i>'+esc(s.name)+'</span>').join('')+'</div><svg id="'+esc(id)+'" class="trajectory" viewBox="0 0 '+w+' '+h+'" role="'+(series.some(s=>s.points?.some(p=>p?.cmd))?'group':'img')+'" aria-label="成绩趋势"><defs>'+defs+'</defs>'+content+'</svg>';
}
export function bars(id,items,{percentages=false,signed=false}={}) {
  const measured=items.map(r=>r.value).filter(valid),max=Math.max(1,...measured.map(Math.abs)),w=1060,h=Math.max(70,items.length*37+20),base=signed?490:190,prefix=key(id);
  const defs=gradient(prefix+'-positive',palette.positiveLight,palette.positive)+gradient(prefix+'-negative',palette.negativeLight,palette.negative);
  return '<svg id="'+esc(id)+'" class="bars" viewBox="0 0 '+w+' '+h+'" role="group" aria-label="横向比较"><defs>'+defs+'</defs>'+items.map((item,i)=>{
    const y=15+i*37,value=item.value,width=valid(value)?Math.abs(value)/max*(signed?260:540):0,start=signed&&value<0?base-width:base,label=String(item.label),display=label.length>14?label.slice(0,13)+'…':label;
    const track=!signed&&valid(value)?'<rect class="plot-track" x="'+base+'" y="'+y+'" width="540" height="22" rx="6" fill="'+palette.well+'"/>':'';
    return '<g class="plot-item"'+action(item)+'><title>'+esc(label)+'：'+(percentages?percent(value):number(value))+'</title><rect x="0" y="'+(y-4)+'" width="'+w+'" height="33" fill="transparent"/><text x="174" y="'+(y+15)+'" text-anchor="end">'+esc(display)+'</text>'+track+'<line class="plot-axis" x1="'+base+'" x2="'+base+'" y1="'+y+'" y2="'+(y+22)+'" stroke="'+palette.axis+'"/><rect class="plot-bar" x="'+start+'" y="'+y+'" width="'+width+'" height="22" rx="6" fill="url(#'+prefix+(value<0?'-negative':'-positive')+')"/><text class="plot-value" x="790" y="'+(y+15)+'">'+(percentages?percent(value):number(value))+'</text></g>';
  }).join('')+'</svg>';
}
export function spread(id,values,lines=[],scope=null) {
  const list=values.filter(valid);if(!list.length)return '<div class="plot-empty">暂无总分</div>';
  const step=25,lo=Math.floor(Math.min(...list)/step)*step,hi=Math.ceil((Math.max(...list)+1)/step)*step,bins=[];for(let v=lo;v<hi;v+=step)bins.push({start:v,count:list.filter(s=>s>=v&&s<v+step).length});
  const thresholds=lines.filter(line=>valid(line.value)),w=780,h=thresholds.length?315:255,l=40,r=20,t=thresholds.length?110:50,b=50,bw=(w-l-r)/bins.length,max=Math.max(1,...bins.map(s=>s.count)),xy=value=>l+(value-lo)/(hi-lo)*(w-l-r),prefix=key(id);
  const grid=Array.from({length:3},(_,i)=>'<line class="plot-grid" x1="'+l+'" x2="'+(w-r)+'" y1="'+(t+i*(h-b-t)/2)+'" y2="'+(t+i*(h-b-t)/2)+'" stroke="'+palette.grid+'" stroke-dasharray="2 6"/>').join('');
  const columns=bins.map((bin,i)=>{const height=bin.count/max*(h-t-b),x=l+i*bw+2;return '<g class="plot-item"'+action(scope?{cmd:'inspect-bin',data:{...scope,min:bin.start,max:bin.start+step}}:null)+'><title>'+bin.start+'–'+(bin.start+step)+'分（不含上界）：'+bin.count+'人</title><rect x="'+x+'" y="'+t+'" width="'+Math.max(1,bw-4)+'" height="'+(h-b-t)+'" fill="transparent"/><rect class="plot-column" x="'+x+'" y="'+(h-b-height)+'" width="'+Math.max(1,bw-4)+'" height="'+height+'" rx="4" fill="url(#'+prefix+'-column)"/>'+(bins.length<=18?'<text class="plot-value" paint-order="stroke" stroke="#eff5fa" stroke-width="4" stroke-linejoin="round" x="'+(x+(bw-4)/2)+'" y="'+(h-b-height-7)+'" text-anchor="middle">'+bin.count+'</text>':'')+'</g>';}).join('');
  const markers=thresholds.map((line,i)=>{const x=l+i*(w-l-r)/thresholds.length;return '<g class="spread-threshold"><line x1="'+x+'" x2="'+(x+22)+'" y1="30" y2="30" stroke="'+palette.threshold+'" stroke-width="2" stroke-dasharray="4 4"/><text class="spread-threshold-label" x="'+(x+32)+'" y="38">'+esc(line.label)+' '+number(line.value,0)+'</text></g>'+(line.value>=lo&&line.value<=hi?'<line class="spread-threshold-line" x1="'+xy(line.value)+'" x2="'+xy(line.value)+'" y1="'+t+'" y2="'+(h-b)+'" stroke="'+palette.threshold+'" stroke-width="1.5" stroke-dasharray="4 4"/>':'');}).join('');
  return '<svg id="'+esc(id)+'" viewBox="0 0 '+w+' '+h+'" class="spread" role="group" aria-label="总分分布"><defs>'+gradient(prefix+'-column',palette.distributionLight,palette.distribution,true)+'</defs>'+grid+markers+columns+bins.filter((_,i)=>i%Math.max(1,Math.ceil(bins.length/10))===0).map(bin=>'<text class="spread-tick" text-anchor="middle" x="'+xy(bin.start)+'" y="'+(h-8)+'">'+bin.start+'</text>').join('')+'</svg>';
}
export function mini(values) {
  const list=values.filter(valid);if(list.length<2)return '<svg viewBox="0 0 110 28" class="mini"></svg>';
  const low=Math.min(...list),high=Math.max(...list);let path='',previous=false;
  values.forEach((v,i)=>{if(!valid(v)){previous=false;return;}path+=(previous?'L':'M')+i*105/Math.max(1,values.length-1)+','+(25-(v-low)/(high-low||1)*22)+' ';previous=true;});
  return '<svg viewBox="0 0 110 28" class="mini" aria-hidden="true"><path d="'+path+'" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
}
export const rateColor=rate=>!valid(rate)?palette.rates.missing:rate<.5?palette.rates.low:rate<.75?palette.rates.medium:palette.rates.high;
export function rateLegend() {
  return '<div class="rate-legend" aria-label="得分率颜色说明"><span>得分率</span>'+[[.25,'低于50%'],[.6,'50%至75%以下'],[.9,'75%及以上'],[null,'无法计算']].map(([rate,label])=>'<span><i style="background:'+rateColor(rate)+'"></i>'+label+'</span>').join('')+'</div>';
}
export function chartButtons(id){return '<div class="chart-buttons"><button data-cmd="svg" data-id="'+id+'">SVG ↗</button><button data-cmd="png" data-id="'+id+'">PNG ↗</button></div>';}
