import {button} from './html.js?v=paper-v30';
import {paperSettings} from '../engine/paper-settings.js?v=paper-v30';
export function reportPaperOptions(report){
 const p=paperSettings(report),choices=(key,options)=>'<div class="chips" role="group">'+options.map(([value,label])=>button(label,'report-paper-setting',{key,value},String(p[key])===String(value)?'chip selected':'chip','aria-pressed="'+(String(p[key])===String(value))+'"')).join('')+'</div>';
 return '<section class="report-paper-options"><h3>纸面版式</h3><p>A4 · 黑白打印；修改后重新分页，PDF与Word同步应用。</p><label>纸张方向</label>'+choices('orientation',[['portrait','纵向'],['landscape','横向']])+'<label>文字与表格间距</label>'+choices('density',[['compact','紧凑'],['standard','标准'],['spacious','舒展']])+'<label>章节排版</label>'+choices('chapterPages',[[false,'连续编排'],[true,'新章另起一页']])+'<label>纸面说明</label>'+choices('includeCaptions',[[true,'保留统计依据'],[false,'只保留正文与表格']])+choices('skipEmpty',[[false,'保留空章说明'],[true,'隐藏无记录空章']])+'</section>';
}
