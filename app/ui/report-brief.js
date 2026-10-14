import {esc} from './html.js?v=runtime-v45';
// Readable source content while the actual PDF, fonts and pagination prepare.
// This brief is never used as the exported document or as a paper-layout claim.
export function pendingReportBrief(report){
 const first=report.sections.find(s=>s.rows?.length),rows=(first?.rows||[]).slice(0,8);
 return '<article class="pdf-pending-brief" aria-label="报告关键内容"><span class="overline">报告内容速览</span><h3>'+esc(report.title)+'</h3><p>'+esc(report.subtitle||'')+'</p>'+(first?'<h4>'+esc(first.title)+'</h4><dl>'+rows.map(row=>'<div><dt>'+esc(row[0])+'</dt><dd>'+row.slice(1).map(value=>esc(value??'—')).join(' · ')+'</dd></div>').join('')+'</dl>':'')+'</article>';
}
