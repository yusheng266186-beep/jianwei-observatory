export const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const number=(value,digits=1)=>typeof value==='number'&&Number.isFinite(value)?value.toLocaleString('zh-CN',{minimumFractionDigits:digits,maximumFractionDigits:digits}):'—';
export const integer=value=>number(value,0);
export const percent=value=>typeof value==='number'&&Number.isFinite(value)?number(value*100,1)+'%':'—';
export const signed=(value,digits=1)=>typeof value==='number'&&Number.isFinite(value)?(value>0?'+':'')+number(value,digits):'—';
export const attrs=values=>Object.entries(values).map(([key,value])=>' data-'+key+'="'+esc(value)+'"').join('');
export function button(label,cmd,values={},style='quiet',extra='') {return '<button type="button" class="button '+style+'" data-cmd="'+cmd+'"'+attrs(values)+' '+extra+'>'+label+'</button>';}
export function chips(key,options,value,multi=false) {return '<div class="chips" role="group">'+options.map(option=>{const [id,label]=Array.isArray(option)?option:[option,option];const on=multi?value.includes(id):String(value)===String(id);return button(esc(label),multi?'toggle':'set',{key,value:id},on?'chip selected':'chip','aria-pressed="'+on+'"');}).join('')+'</div>';}
export const badge=(label,style='')=>'<span class="badge '+style+'">'+esc(label)+'</span>';
export const empty=(title,detail='')=>'<div class="empty"><span class="empty-symbol">＋</span><h3>'+esc(title)+'</h3><p>'+esc(detail)+'</p></div>';
export function head(kicker,title,detail='',actions='') {return '<header class="scene-head"><div><div class="overline">'+esc(kicker)+'</div><h1>'+esc(title)+'</h1><p>'+esc(detail)+'</p></div><div class="head-actions">'+actions+'</div></header>';}
export function table(headers,rows,{className='',label='分析明细'}={}) {
  const key=(label+'|'+headers.join('|')).split('').reduce((h,c)=>Math.imul(h^c.charCodeAt(0),16777619),2166136261)>>>0,editable=rows.some(row=>row.some(cell=>/<(?:input|textarea|select)\b/i.test(String(cell)))),tools='<div class="table-tools"><span>'+rows.length+' 行 <i>·</i> '+headers.length+' 列</span><div><button class="table-shift" data-cmd="table-shift" data-direction="-1" aria-label="向左查看表格">←</button><button class="table-shift" data-cmd="table-shift" data-direction="1" aria-label="向右查看表格">→</button>'+(!editable?button('展开阅读 ↗','table-open',{},'table-expand'):'')+'</div></div>';
  return '<div class="table-frame" data-table-key="'+key+'" data-render-key="table-'+key+'">'+tools+'<div class="table-scroll '+className+'" tabindex="0" role="region" aria-label="'+esc(label)+'"><table aria-label="'+esc(label)+'"><thead><tr>'+headers.map(h=>'<th scope="col">'+esc(h)+'</th>').join('')+'</tr></thead><tbody>'+rows.map(row=>{const id=String(row[0]||'').match(/data-sid="([^"]+)"/);return '<tr'+(id?' data-motion-key="row-'+id[1]+'"':'')+'>'+row.map(cell=>'<td>'+String(cell??'—')+'</td>').join('')+'</tr>';}).join('')+'</tbody></table></div><div class="table-overflow-note" aria-hidden="true"><span>左右滚动，查看其余列</span><i></i></div></div>';
}

export function block(title,body,caption='',action='') {return '<section class="block"><div class="block-head"><div><h2>'+esc(title)+'</h2>'+(caption?'<p>'+esc(caption)+'</p>':'')+'</div>'+action+'</div>'+body+'</section>';}
export function ribbon(items) {return '<div class="number-ribbon">'+items.map(([label,value,detail])=>'<div><span>'+esc(label)+'</span><strong>'+value+'</strong><small>'+esc(detail||'')+'</small></div>').join('')+'</div>';}
export function examRail(atlas,selected,key='exam',exams=atlas.exams,multi=false) {
  return '<div class="exam-rail" aria-label="考试时间轴">'+exams.map((exam,i)=>{
    const on=multi?selected.includes(exam.id):String(selected)===String(exam.id);
    return '<button class="exam-stop '+(on?'selected':'')+'" data-cmd="'+(multi?'toggle':'set')+'"'+attrs({key,value:exam.id})+' aria-pressed="'+on+'"><span class="stop-index">'+String(i+1).padStart(2,'0')+'</span><b>'+esc(exam.id)+'</b><small>'+esc(exam.label)+'</small></button>';
  }).join('')+'</div>';
}
export const personButton=(atlas,sid,exam='')=>button(esc(atlas.name(sid)),'peek',{sid,exam},'person-link');
export const delta=value=>'<span class="delta '+(value>0?'positive':value<0?'negative':'')+'">'+signed(value)+'</span>';
export function classPicker(atlas,no,compact=false) {
  return '<div class="class-picker '+(compact?'compact':'')+'">'+['physics','history'].map((key,i)=>{
    const classes=atlas.classes.filter(n=>atlas.profile(n).track===key);
    return classes.length?'<section><span>'+['物理类','历史类'][i]+'</span><div>'+classes.map(n=>button('<b>'+n+'</b><small>班</small>','class',{no:n},Number(no)===n?'class-key selected':'class-key','aria-pressed="'+(Number(no)===n)+'"')).join('')+'</div></section>':'';
  }).join('')+'</div>';
}
export function field(label,name,value,type='text',extra='') {return '<label class="field"><span>'+esc(label)+'</span><input name="'+esc(name)+'" type="'+type+'" value="'+esc(value??'')+'" '+extra+'></label>';}
export function radio(name,options,value) {return '<div class="radio-line">'+options.map(([id,label])=>'<label><input type="radio" name="'+esc(name)+'" value="'+esc(id)+'" '+(String(id)===String(value)?'checked':'')+'><span>'+esc(label)+'</span></label>').join('')+'</div>';}
export function toolbar(key,options,value,label='') {return '<div class="toolbar">'+(label?'<span class="toolbar-label">'+esc(label)+'</span>':'')+chips(key,options,value)+'</div>';}
export const search=(key,value,placeholder='查找姓名')=>'<input class="search-input" type="search" data-field="'+esc(key)+'" value="'+esc(value||'')+'" placeholder="'+esc(placeholder)+'" aria-label="'+esc(placeholder)+'">';
export const footnote=text=>'<p class="footnote">'+esc(text)+'</p>';
