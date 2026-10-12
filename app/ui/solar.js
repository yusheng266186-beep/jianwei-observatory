import {esc,number,integer,percent,button} from './html.js?v=solar-20261012d';
import {valid} from '../engine/metrics.js?v=solar-20261012d';
import {rateColor} from './plots.js?v=solar-20261012d';

export function achievementDial(id,summary) {
  const prefix='sun-'+[...id].map(c=>c.codePointAt(0).toString(16)).join('-');
  const tiers=[['under','本科',130,'#bd8c45'],['top','特控',108,'#6d938a']];
  const ticks=Array.from({length:48},(_,i)=>{const angle=i*Math.PI/24,x=r=>180+Math.cos(angle)*r,y=r=>170+Math.sin(angle)*r;return '<line x1="'+x(150)+'" y1="'+y(150)+'" x2="'+x(i%4===0?156:153)+'" y2="'+y(i%4===0?156:153)+'" stroke="#b8945a" stroke-opacity=".33"/>';}).join('');
  const rings=tiers.map(([tier,label,r,color])=>{const rate=summary[tier]===null?null:summary[tier+'Rate'],known=valid(rate),amount=known?Math.max(0,Math.min(1,rate))*1000:0;return '<g><title>'+label+'达线率 '+percent(rate)+'，'+integer(summary[tier])+' / '+integer(summary[tier+'Base'])+'人</title><circle cx="180" cy="170" r="'+r+'" fill="none" stroke="#d4c7a740" stroke-width="12"'+(!known?' stroke-dasharray="3 7"':'')+'/>'+(known?'<circle class="solar-progress" cx="180" cy="170" r="'+r+'" pathLength="1000" fill="none" stroke="'+color+'" stroke-width="12" stroke-linecap="round" stroke-dasharray="'+amount+' 1000" style="--ring-length:'+amount+'" stroke-opacity="'+(amount?1:0)+'" transform="rotate(-90 180 170)"/>':'')+'</g>';}).join('');
  const under=summary.under===null?null:summary.underRate,top=summary.top===null?null:summary.topRate;
  return '<figure class="achievement-dial"><svg id="'+esc(id)+'" class="solar-dial" viewBox="0 0 360 340" role="img" aria-label="本科达线率'+percent(under)+'，特控达线率'+percent(top)+'，分别按各自可判定人数计算"><defs><radialGradient id="'+prefix+'-light" cx=".34" cy=".27" r=".8"><stop stop-color="#fffdf1"/><stop offset=".58" stop-color="#f8e5b7"/><stop offset="1" stop-color="#ebc57e"/></radialGradient></defs><circle cx="180" cy="170" r="95" fill="url(#'+prefix+'-light)" fill-opacity=".67"/>'+ticks+rings+'<text x="180" y="135" text-anchor="middle" fill="#866d47" font-size="18">本科达线率</text><text x="180" y="181" text-anchor="middle" fill="#6a522e" font-size="42" font-family="system-ui,sans-serif">'+percent(under)+'</text><text x="180" y="209" text-anchor="middle" fill="#55796f" font-size="18">特控 '+percent(top)+'</text></svg><figcaption><span>本科可判定 '+integer(summary.underBase)+' 人</span><span>特控可判定 '+integer(summary.topBase)+' 人</span></figcaption></figure>';
}

export function progressMeter(actual,target,label='完成率') {
  const set=valid(target)&&target>0,known=set&&valid(actual),rate=known?actual/target:null;
  return '<div class="goal-meter" data-known="'+known+'"><div><span>'+(set?label:'人数任务')+'</span><b>'+(set?percent(rate):'未设任务')+'</b></div><i><em style="width:'+(known?Math.max(0,Math.min(1,rate))*100:0)+'%"></em></i></div>';
}

export function goalCards(atlas,nos,exam) {
  return '<div class="goal-gallery"><div class="goal-gallery-caption"><span>'+nos.length+' 个班级 · 左右滑动查看任务卡片</span><small>完整明细保留在下方</small></div><div class="goal-cards" data-scroll-key="'+esc('goals-'+exam+'-'+nos.join('-'))+'">'+nos.map(no=>{
    const profile=atlas.profile(no),summary=atlas.summary(atlas.classAt(no,exam));
    const levels=[['under','本科'],['top','特控']].map(([tier,label])=>{
      const target=profile.targets?.[tier],known=summary[tier]!==null;
      const action=known?{cmd:'people-lens',values:{lens:tier==='under'?'passUnder':'passTop',no,exam}}:{cmd:'library-open',values:{tab:'lines',exam}};
      const count=button('<strong>'+integer(summary[tier])+'</strong><small>'+(valid(target)&&target>0?' / '+integer(target)+' 人任务':' 人')+'</small>',action.cmd,action.values,'goal-pass','aria-label="'+no+'班'+label+(known?'达线'+integer(summary[tier])+'人，查看名单':'有效线尚未齐全，补充口径')+'"');
      return '<section><span>'+label+'达线</span>'+count+progressMeter(summary[tier],target)+'</section>';
    }).join('');
    return '<article class="goal-card"><header>'+button(no+'班 ↗','class',{no,exam,tab:'targets'},'person-link')+'<span>'+esc(profile.lead||'班主任未填写')+'</span></header><div class="goal-levels">'+levels+'</div></article>';
  }).join('')+'</div></div>';
}

export function routePreview(atlas,target,exam,groups,papers) {
  if(target==='targets')return '<div class="route-preview route-pass"><span class="route-caption">本科达线率 · 各按可判定人数</span>'+groups.map(g=>'<div><span>'+g.title+'</span><b>'+percent(g.summary.underRate)+'</b><i><em style="width:'+(valid(g.summary.underRate)?Math.max(0,Math.min(1,g.summary.underRate))*100:0)+'%"></em></i></div>').join('')+'</div>';
  if(target==='papers') {
    const paper=papers[0];if(!paper)return '<div class="route-preview route-no-material">导入小题材料，逐题展开观察</div>';
    const questions=atlas.paper(paper.key).questions.slice(0,6);
    if(!questions.length)return '<div class="route-preview route-no-material">补充题号与分值，再展开题目地图</div>';
    return '<div class="route-preview route-questions"><span class="route-caption">'+esc(paper.subject)+' · '+paper.questions.length+' 题中的前 '+questions.length+' 题预览</span><div style="--preview-columns:'+questions.length+'">'+questions.map(q=>'<span style="--preview-color:'+rateColor(q.rate)+'"><small>第'+esc(q.label)+'题</small><b>'+percent(q.rate)+'</b></span>').join('')+'</div></div>';
  }
  if(target==='history')return '<div class="route-preview route-exams"><span class="route-caption">最近 '+Math.min(3,atlas.exams.length)+' 次材料 · 完整记录继续保留</span><div>'+atlas.exams.slice(-3).map(e=>'<span><i aria-hidden="true"></i><b>'+esc(e.id)+'</b><small>'+esc(e.label)+'</small></span>').join('')+'</div></div>';
  return '<div class="route-preview route-distributions"><span class="route-caption">两科类分别预览总分分布 · 横轴各取本组范围</span>'+groups.map(g=>{
    const values=g.rows.map(r=>r.total).filter(valid);if(!values.length)return '<div><span>'+g.title+'</span><small>暂无可绘制总分</small></div>';
    const min=Math.min(...values),max=Math.max(...values),bins=Array.from({length:12},()=>0);for(const v of values)bins[Math.min(11,Math.floor((v-min)/(max-min||1)*12))]++;
    const high=Math.max(...bins),plot=bins.map((count,i)=>'<rect x="'+i*16+'" y="'+(44-count/high*38)+'" width="12" height="'+count/high*38+'" rx="3" fill="#c7a669"><title>'+count+'人</title></rect>').join('');
    return '<div><span>'+g.title+'<small>'+number(min,0)+'–'+number(max,0)+' 分</small></span><svg viewBox="0 0 192 48" role="img" aria-label="'+g.title+'总分分布，'+values.length+'份有效总分，范围'+number(min)+'至'+number(max)+'分">'+plot+'</svg></div>';
  }).join('')+'</div>';
}
