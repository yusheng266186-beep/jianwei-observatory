import {esc,number} from './html.js';
import {rankMetric} from '../engine/research-history.js';
export function researchChangeText(comparison){
 const {change,metric,reason}=comparison;
 if(change===null)return ({insufficient:'不足两次有效记录',track:'科类不同，分别观察',class:'班级不同，分别观察',scope:'排名范围不同'}[reason]||'暂无可比变化');
 if(change===0)return '持平';
 if(rankMetric(metric))return (change<0?'前移':'后移')+number(Math.abs(change),0)+'名';
 return (change>0?'上升':'下降')+number(Math.abs(change))+(metric==='percentile'?'点':'分');
}
export function researchChangeHTML(comparison){const tone=comparison.improvement>0?'positive':comparison.improvement<0?'negative':'neutral',title=comparison.first&&comparison.last?comparison.first.value+' → '+comparison.last.value:'';return '<span class="research-change '+tone+'"'+(title?' title="'+esc(title)+'"':'')+'>'+researchChangeText(comparison)+'</span>';}
