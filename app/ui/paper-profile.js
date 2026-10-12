import {button,esc,integer,number,percent} from './html.js?v=workbench-v19';
import {bars,chartButtons} from './plots.js?v=workbench-v19';
import {valid} from '../engine/metrics.js?v=workbench-v19';

// The profile always uses the whole paper in the selected class scope.
// Unknown or out-of-range rates break the line instead of becoming zero.
export function paperProfile(lens,{threshold,selected,metrics,examLabel=lens.exam,scopeLabel='全部参考班'}) {
  const questions=lens.questions,width=Math.max(760,questions.length*43+86),height=238,left=49,right=24,top=23,base=150;
  const x=i=>left+(questions.length===1?(width-left-right)/2:i*(width-left-right)/Math.max(1,questions.length-1));
  const y=rate=>top+(1-rate)*(base-top),normal=q=>valid(q.rate)&&q.rate>=0&&q.rate<=1;
  const segments=[];let segment=[];
  const finish=()=>{if(segment.length)segments.push(segment);segment=[];};
  questions.forEach((q,i)=>{if(normal(q))segment.push([x(i),y(q.rate)]);else finish();});finish();
  const path=points=>points.map(([a,b],i)=>(i?'L':'M')+a+','+b).join(' ');
  const grid=[0,.5,1].map(rate=>'<g aria-hidden="true"><line x1="'+left+'" x2="'+(width-right)+'" y1="'+y(rate)+'" y2="'+y(rate)+'" class="profile-grid" stroke="#a7cde0" stroke-opacity=".14" stroke-dasharray="2 7"/><text x="'+(left-11)+'" y="'+(y(rate)+4)+'" text-anchor="end">'+Math.round(rate*100)+'%</text></g>').join('');
  const curves=segments.map(points=>'<path class="profile-area" d="'+path(points)+' L'+points.at(-1)[0]+','+base+' L'+points[0][0]+','+base+' Z" fill="url(#paper-profile-area)"/><path class="profile-line" d="'+path(points)+'" fill="none" stroke="#d3edf9" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>').join('');
  const points=questions.map((q,i)=>{
    const known=normal(q),cy=known?y(q.rate):182,raw=valid(q.rate)?percent(q.rate):'得分率未知',title='第'+q.label+'题 · '+(q.knowledge||'知识点未标注')+'\n'+raw+' · 均分 '+number(q.mean)+' / 满分 '+number(q.max)+' · 有效作答 '+integer(q.count)+' / '+integer(lens.answers.length);
    const short=String(q.label).length>5?String(q.label).slice(0,4)+'…':q.label;
    const marker=known?'<circle class="profile-dot" cx="'+x(i)+'" cy="'+cy+'" r="4.5" fill="#cde7f5" stroke="#1d3e5e" stroke-width="2"/>':'<path class="profile-unknown" d="M'+(x(i)-4)+','+(cy-4)+' l8,8 m-8,0 l8,-8" stroke="#91b0c8" stroke-width="1.3" stroke-linecap="round" fill="none"/>';
    return '<g class="profile-question'+(selected?.index===q.index?' is-current':'')+'" data-render-key="profile-question-'+q.index+'" data-plot-action="true" data-cmd="question" data-index="'+q.index+'" role="button" tabindex="0" aria-label="'+esc(title.replaceAll('\n','，')+'，按全卷题序打开观察窗')+'"><title>'+esc(title)+'</title><rect x="'+(x(i)-16)+'" y="12" width="32" height="214" fill="transparent"/><line class="profile-guide" x1="'+x(i)+'" x2="'+x(i)+'" y1="15" y2="195" stroke="#aacce0" stroke-dasharray="3 5" opacity="'+(selected?.index===q.index ? .26 : 0)+'"/>'+marker+'<text x="'+x(i)+'" y="218" text-anchor="middle">'+esc(short)+'</text></g>';
  }).join('');
  const low=questions.filter(q=>valid(q.rate)&&q.rate<threshold).length,missing=questions.filter(q=>q.count<lens.answers.length).length,maxMissing=questions.filter(q=>!valid(q.max)||q.max<=0).length;
  const clues=[['low','低得分率',low,'低于 '+percent(threshold)],['missing','有空白的题目',missing,'已有作答记录未填齐'],['max','满分资料待补',maxMissing,'原始分数继续保留']];
  const note=questions.some(q=>!normal(q))?'未知或异常比例不绘制；原始数值保留在题目观察中':'点选任意题目，查看班级差异与学生作答';
  const metadata='<desc>'+esc(lens.subject+' · '+examLabel+' · '+scopeLabel+' · 全卷得分率。固定全卷题序；未知或异常比例不绘制。低得分率口径低于 '+percent(threshold))+'</desc>';
  const compact=questions.length<=4;
  const compactGraph=compact?bars('paper-score-profile',questions.map(q=>({label:'第'+q.label+'题',value:normal(q)?q.rate:null,cmd:'question',data:{index:q.index}})),{percentages:true}).replace('<defs>','<rect width="100%" height="100%" fill="#1d3e5e" aria-hidden="true"/>'+metadata+'<defs>'):'';
  const graph=questions.length?(compact?'<div class="paper-profile-compact">'+compactGraph+'</div>':'<div class="paper-profile-scroll" data-render-key="paper-profile-scroll" tabindex="0" role="region" aria-label="全卷得分率图，可左右滚动"><svg id="paper-score-profile" class="paper-profile-plot" viewBox="0 0 '+width+' '+height+'" style="--profile-width:'+width+'px" role="group" aria-label="全卷逐题得分率，题序固定，缺失与异常处断开"><rect width="'+width+'" height="'+height+'" fill="#1d3e5e" aria-hidden="true"/>'+metadata+'<defs><linearGradient id="paper-profile-area" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#b5dbed" stop-opacity=".24"/><stop offset="1" stop-color="#b5dbed" stop-opacity="0"/></linearGradient></defs>'+grid+'<line class="profile-threshold" x1="'+left+'" x2="'+(width-right)+'" y1="'+y(threshold)+'" y2="'+y(threshold)+'" stroke="#91b9d5" stroke-opacity=".66" stroke-width="1.1" stroke-dasharray="6 7"/>'+curves+points+'</svg></div>'):'<div class="paper-profile-empty">这张卷尚无题号资料，可补充对应的小题材料。</div>';
  return '<section class="paper-overview'+(compact?' is-short-paper':'')+'" aria-label="全卷概况"><div class="paper-profile"><header><div><span class="profile-kicker">从全卷到一道题</span><h2>全卷得分率</h2><p>'+questions.length+' 道题 · 当前班级范围 · 全卷题序</p></div>'+chartButtons('paper-score-profile')+'</header>'+graph+'<footer><span><i aria-hidden="true"></i>低得分率'+(compact?'口径 &lt; ':'界线 ')+percent(threshold)+'</span><span>'+note+'</span><div class="profile-scroll-controls" hidden>'+button('←','paper-profile-shift',{direction:-1},'profile-shift','aria-label="向左查看题号"')+button('→','paper-profile-shift',{direction:1},'profile-shift','aria-label="向右查看题号"')+'</div></footer></div><aside class="paper-study-start">'+metrics+'<div class="paper-clues"><h3>研究起点</h3>'+clues.map(([value,label,count,detail])=>button('<span><b>'+label+'</b><small>'+detail+'</small></span><strong>'+integer(count)+'<small>题</small></strong><i aria-hidden="true">↗</i>','paper-focus',{value},'paper-clue','aria-label="'+label+'，'+count+'道题，查看对应题目"')).join('')+'</div></aside></section>';
}
