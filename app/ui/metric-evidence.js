import {studentMetricEvidence} from '../engine/metric-evidence.js';
import {esc} from './html.js';
export function metricEvidenceHTML(atlas,row){return '<details class="metric-evidence"><summary>数据与统计口径</summary><dl>'+studentMetricEvidence(atlas,row).map(r=>'<div><dt>'+esc(r.label)+' <b>'+(Number.isFinite(r.value)?r.value.toLocaleString('zh-CN',{maximumFractionDigits:12}):'—')+'</b></dt><dd>'+esc(r.basis)+'</dd></div>').join('')+'</dl></details>';}
