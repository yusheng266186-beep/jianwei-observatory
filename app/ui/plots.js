import {esc,number,percent} from './html.js';
import {valid} from '../engine/metrics.js';
const ink='#2853e7',copper='#dc674b',lime='#cbea55';
export function trajectory(id,labels,series,{suffix='',zero=false}={}) {
  const values=series.flatMap(s=>s.values).filter(valid);
  if(!values.length)return '<div class="plot-empty">暂无可绘制的成绩</div>';
  let low=Math.min(...values),high=Math.max(...values);if(zero){low=Math.min(0,low);high=Math.max(0,high);}if(high===low){low-=1;high+=1;}
  const padding=(high-low)*.15;low-=padding;high+=padding;
  const w=940,h=260,left=60,right=30,top=20,bottom=55;
  const x=i=>left+i*(w-left-right)/Math.max(1,labels.length-1),y=v=>top+(high-v)/(high-low)*(h-top-bottom);
  let content=Array.from({length:5},(_,i)=>{const value=low+(high-low)*i/4;return '<line x1="'+left+'" x2="'+(w-right)+'" y1="'+y(value)+'" y2="'+y(value)+'" stroke="#e4e7ed"/><text x="'+(left-10)+'" y="'+(y(value)+4)+'" text-anchor="end">'+number(value,0)+esc(suffix)+'</text>';}).join('');
  content+=labels.map((label,i)=>'<text x="'+x(i)+'" y="'+(h-19)+'" text-anchor="middle">'+esc(label)+'</text>').join('');
  for(const [index,item] of series.entries()) {
    const color=item.color||[ink,copper,'#647174','#90846b'][index%4];let path='',previous=false;
    item.values.forEach((value,i)=>{if(!valid(value)){previous=false;return;}path+=(previous?'L':'M')+x(i)+','+y(value)+' ';previous=true;});
    content+='<path d="'+path+'" fill="none" stroke="'+color+'" stroke-width="3" stroke-linejoin="round"/>';
    content+=item.values.map((value,i)=>valid(value)?'<circle cx="'+x(i)+'" cy="'+y(value)+'" r="4" fill="white" stroke="'+color+'" stroke-width="2"><title>'+esc(item.name)+' · '+esc(labels[i])+'：'+number(value)+esc(suffix)+'</title></circle>':'').join('');
  }
  return '<div class="plot-legend">'+series.map((s,i)=>'<span><i style="background:'+(s.color||[ink,copper,'#647174','#90846b'][i%4])+'"></i>'+esc(s.name)+'</span>').join('')+'</div><svg id="'+id+'" class="trajectory" viewBox="0 0 '+w+' '+h+'" role="img" aria-label="成绩趋势">'+content+'</svg>';
}
export function bars(id,items,{percentages=false,signed=false}={}) {
  const measured=items.map(r=>r.value).filter(valid),max=Math.max(1,...measured.map(Math.abs));
  const w=780,h=Math.max(70,items.length*38+20);
  return '<svg id="'+id+'" class="bars" viewBox="0 0 '+w+' '+h+'" role="img" aria-label="横向对比">'+items.map((item,i)=>{
    const y=18+i*38,value=item.value,base=signed?400:140,width=valid(value)?Math.abs(value)/max*(signed?260:520):0,start=signed&&value<0?base-width:base;
    return '<text x="125" y="'+(y+15)+'" text-anchor="end">'+esc(item.label)+'</text><line x1="'+base+'" x2="'+base+'" y1="'+y+'" y2="'+(y+22)+'" stroke="#c1c7d1"/><rect x="'+start+'" y="'+y+'" width="'+width+'" height="22" rx="2" fill="'+(value<0?copper:ink)+'"/><text x="'+(signed?700:690)+'" y="'+(y+15)+'">'+(percentages?percent(value):number(value))+'</text>';
  }).join('')+'</svg>';
}
export function spread(id,values,lines=[]) {
  const list=values.filter(valid);if(!list.length)return '<div class="plot-empty">暂无总分</div>';
  const step=25,lo=Math.floor(Math.min(...list)/step)*step,hi=Math.ceil((Math.max(...list)+1)/step)*step;
  const bins=[];for(let v=lo;v<hi;v+=step)bins.push({start:v,count:list.filter(s=>s>=v&&s<v+step).length});
  const w=780,h=205,l=40,r=20,t=20,b=35,bw=(w-l-r)/bins.length,max=Math.max(1,...bins.map(s=>s.count));
  const xy=value=>l+(value-lo)/(hi-lo)*(w-l-r);
  const columns=bins.map((bin,i)=>{const height=bin.count/max*(h-t-b);return '<rect x="'+(l+i*bw+2)+'" y="'+(h-b-height)+'" width="'+Math.max(1,bw-4)+'" height="'+height+'" fill="'+ink+'" opacity=".85"><title>'+bin.start+'–'+(bin.start+step)+'：'+bin.count+'人</title></rect>';}).join('');
  const markers=lines.filter(line=>valid(line.value)&&line.value>=lo&&line.value<=hi).map(line=>'<line x1="'+xy(line.value)+'" x2="'+xy(line.value)+'" y1="8" y2="'+(h-b)+'" stroke="'+copper+'" stroke-width="2" stroke-dasharray="4 4"/><text x="'+(xy(line.value)+4)+'" y="15" fill="'+copper+'">'+esc(line.label)+' '+number(line.value,0)+'</text>').join('');
  return '<svg id="'+id+'" viewBox="0 0 '+w+' '+h+'" class="spread" role="img" aria-label="总分分布">'+columns+markers+bins.filter((_,i)=>i%Math.max(1,Math.ceil(bins.length/10))===0).map(bin=>'<text x="'+xy(bin.start)+'" y="'+(h-8)+'">'+bin.start+'</text>').join('')+'</svg>';
}
export function mini(values) {
  const list=values.filter(valid);if(list.length<2)return '<svg viewBox="0 0 110 28" class="mini"></svg>';
  const low=Math.min(...list),high=Math.max(...list),points=list.map((v,i)=>i*105/(list.length-1)+','+(25-(v-low)/(high-low||1)*22)).join(' ');
  return '<svg viewBox="0 0 110 28" class="mini" aria-hidden="true"><polyline points="'+points+'" fill="none" stroke="currentColor" stroke-width="2"/></svg>';
}
export const rateColor=rate=>rate===null?'#e5e8ed':rate<.5?'#efb39f':rate<.75?'#d8dfa8':'#9cb6fa';
export function chartButtons(id){return '<div class="chart-buttons"><button data-cmd="svg" data-id="'+id+'">SVG ↗</button><button data-cmd="png" data-id="'+id+'">PNG ↗</button></div>';}
