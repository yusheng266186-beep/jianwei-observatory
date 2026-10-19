const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const valid=value=>typeof value==='number'&&Number.isFinite(value)&&value>0;
const number=value=>new Intl.NumberFormat('zh-CN',{maximumFractionDigits:2}).format(value);
export function modelSpeedLabel(reference){
 if(!reference)return '';
 if(valid(reference.tps))return number(reference.tps)+' TPS';
 const speeds=(reference.groups||[]).map(group=>group.tps).filter(valid);
 if(!speeds.length)return '';
 const min=Math.min(...speeds),max=Math.max(...speeds);
 return (min===max?number(min):number(min)+'–'+number(max))+' TPS（分组）';
}
export function modelPerformanceHTML(reference){
 if(!reference)return '';
 const label=modelSpeedLabel(reference),groups=(reference.groups||[]).filter(group=>valid(group.tps));
 let source;try{const url=new URL(reference.sourceUrl);if(url.protocol==='https:'&&['www.wefucke.top','www.bytecatcode.org'].includes(url.hostname)&&url.pathname.startsWith('/pricing/'))source=url.href;}catch{}
 const date=/^\d{4}-\d{2}-\d{2}$/.test(reference.observedAt||'')?reference.observedAt:'';
 return '<div class="model-speed-head"><span>广场速度参考</span><strong>'+esc(label||'暂无 TPS 数据')+'</strong></div>'+
  '<p class="model-speed-caption">每秒输出 Token 数 · '+esc(date||'未标注日期')+'</p>'+
  (groups.length?'<details class="model-speed-details"><summary>查看各分组速度</summary><ul>'+groups.map(group=>'<li><span>'+esc(group.name)+'</span><b>'+esc(number(group.tps))+' TPS</b></li>').join('')+'</ul></details>':'')+
  '<p class="model-speed-guide">平台统计快照；实际速度随密钥分组、负载及思考强度变化。'+(source?' <a href="'+esc(source)+'" target="_blank" rel="noopener noreferrer">查看最新数据 ↗</a>':'')+'</p>';
}
