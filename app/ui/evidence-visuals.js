import {esc,number,integer,percent,button} from './html.js?v=refine-v17';
import {valid} from '../engine/metrics.js?v=refine-v17';
import {plotPalette as palette} from './palette.js?v=refine-v17';
import {rateColor} from './plots.js?v=refine-v17';

export function thresholdProfile(id,summary) {
  const prefix='profile-'+[...String(id)].map(c=>c.codePointAt(0).toString(16)).join('-');
  const tiers=[['under','本科',0,palette.profileUnder,palette.profileUnderLight],['top','特控',118,palette.profileTop,palette.profileTopLight]];
  const rate=tier=>valid(summary[tier])?summary[tier+'Rate']:null;
  const defs=tiers.map(([tier,,,color,light])=>'<linearGradient id="'+prefix+'-'+tier+'"><stop stop-color="'+light+'"/><stop offset="1" stop-color="'+color+'"/></linearGradient>').join('');
  const rows=tiers.map(([tier,label,offset,color])=>{
    const value=rate(tier),known=valid(value),width=known?Math.max(0,Math.min(1,value))*308:0,x=26+width,y=offset+54;
    const ticks=Array.from({length:5},(_,i)=>'<line x1="'+(26+i*77)+'" x2="'+(26+i*77)+'" y1="'+(y+19)+'" y2="'+(y+24)+'" stroke="'+palette.tick+'"/>').join('');
    return '<g><title>'+label+'达线率 '+percent(value)+'，'+integer(summary[tier])+' / '+integer(summary[tier+'Base'])+'人</title><text class="profile-label" x="26" y="'+(offset+31)+'" fill="'+palette.label+'" font-size="18">'+label+'</text><text class="profile-value" x="334" y="'+(offset+32)+'" text-anchor="end" fill="'+color+'" font-size="30" font-family="system-ui,sans-serif">'+percent(value)+'</text><rect x="26" y="'+y+'" width="308" height="15" rx="3" fill="'+palette.well+'" stroke="#fff"'+(!known?' stroke-dasharray="3 5"':'')+'/>'+(known?'<rect class="threshold-progress" x="26" y="'+y+'" width="'+width+'" height="15" rx="3" fill="url(#'+prefix+'-'+tier+')"/>':'')+(known?'<path class="profile-marker" d="M'+x+' '+(y-6)+'l4 4-4 4-4-4Z" fill="'+color+'"/>':'')+ticks+'<text class="profile-caption" x="26" y="'+(offset+99)+'" fill="'+palette.caption+'" font-size="13">达线 '+integer(summary[tier])+' / 可判定 '+integer(summary[tier+'Base'])+' 人</text><text class="profile-axis" x="334" y="'+(offset+99)+'" text-anchor="end" fill="'+palette.caption+'" font-size="11">0 — 100%</text></g>';
  }).join('');
  return '<figure class="threshold-figure"><svg id="'+esc(id)+'" class="threshold-profile" viewBox="0 0 360 230" role="img" aria-label="本科达线率'+percent(rate('under'))+'，特控达线率'+percent(rate('top'))+'，分别按各自可判定人数计算"><defs>'+defs+'</defs>'+rows+'</svg><figcaption>两条标尺分别按各自可判定人数计算</figcaption></figure>';
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
    const high=Math.max(...bins),plot=bins.map((count,i)=>'<rect x="'+i*16+'" y="'+(44-count/high*38)+'" width="12" height="'+count/high*38+'" rx="3" fill="'+palette.distribution+'"><title>'+count+'人</title></rect>').join('');
    return '<div><span>'+g.title+'<small>'+number(min,0)+'–'+number(max,0)+' 分</small></span><svg viewBox="0 0 192 48" role="img" aria-label="'+g.title+'总分分布，'+values.length+'份有效总分，范围'+number(min)+'至'+number(max)+'分">'+plot+'</svg></div>';
  }).join('')+'</div>';
}
