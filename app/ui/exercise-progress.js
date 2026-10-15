import {esc} from './html.js';
import {richExerciseHTML} from '../io/exercise-math.js';
export const generationPhase=record=>({ready:'练习已生成',failed:'本次生成未完成',removed:'任务已删除',connecting:'正在连接模型',thinking:'模型正在推演',writing:'正在输出练习',validating:'正在校验成稿',illustrating:'正在绘制图示'}[record.progress?.phase]||'正在生成练习');
export function generationActivity(record,at=Date.now()){
 const p=record.progress,offset=Number.isFinite(record.serverTime)&&Number.isFinite(record.lastCheckedAt)?record.serverTime-record.lastCheckedAt:0;
 if(!p)return '等待后台开始，状态会自动同步。';
 const responseAge=p.receivedAt?Math.max(0,Math.floor((at+offset-p.receivedAt)/1000)):null,heartbeatAge=p.heartbeatAt?Math.max(0,Math.floor((at+offset-p.heartbeatAt)/1000)):null;
 if(heartbeatAge>25)return '后台状态暂未更新，正在重新同步；无需重复提交。';
 if(responseAge===null)return '后台在线，等待模型返回首个片段。';
 if(responseAge>25)return '后台在线，服务暂未返回新片段；最近响应在 '+responseAge+' 秒前。';
 return '后台在线 · 模型最近响应：'+(responseAge<2?'刚刚':responseAge+' 秒前');
}
export function modelThinkingHTML(p,{open=true}={}){
 if(!p?.thinkingText&&!p?.summary)return '';
 return '<details class="exercise-thinking-content" data-render-key="thinking-content" '+(open?'open':'')+'><summary>模型返回的思考内容</summary>'+(p.thinkingText?'<pre class="exercise-model-stream" data-stream-scroll="thinking">'+esc(p.thinkingText)+'</pre>':'')+(p.summary?'<div class="exercise-public-summary"><h4>公开思考摘要</h4><p>'+esc(p.summary).replace(/\n/g,'<br>')+'</p></div>':'')+(p.thinkingTruncated?'<small>思考内容较长，展示最近16万字符。</small>':'')+'</details>';
}
export const modelOutputHTML=p=>p?.outputText?'<details class="exercise-source-output" data-render-key="source-output"><summary>实时文档源文本</summary><pre class="exercise-model-stream" data-stream-scroll="output">'+esc(p.outputText)+'</pre>'+(p.responseChars>256000?'<small>正文较长，实时预览展示前25.6万字符，完整成稿仍独立校验。</small>':'')+'</details>':'';
export const generationLogHTML=p=>(p?.thinkingText||p?.summary||p?.outputText)?'<details class="exercise-generation-notes" data-render-key="generation-notes"><summary>模型生成记录 · 思考与输出</summary>'+modelThinkingHTML(p)+modelOutputHTML(p)+'</details>':'';
export async function exerciseProgressHTML(record){
 const p=record.progress||{},draft=p.draft||{},questions=draft.questions||[],rich=async text=>{try{return await richExerciseHTML(text||'');}catch{return esc(text||'');}};
 let output='';for(const q of questions){output+='<details class="exercise-live-question" data-render-key="live-'+q.id+'" '+(q===questions.at(-1)?'open':'')+'><summary>第 '+q.id+' 题'+(q.type?' · '+esc(q.type):'')+'<span>'+ (q.complete?'已输出':'输出中')+'</span></summary><div>'+(q.stem?'<h4>题干</h4><p>'+await rich(q.stem)+'</p>':'<p>正在输出题干…</p>')+(q.answer?'<h4>参考答案</h4><p>'+await rich(q.answer)+'</p>':'')+(q.analysis?'<h4>解析</h4><p>'+await rich(q.analysis)+'</p>':'')+'</div></details>';}
 return '<header><div><span class="overline">实时生成</span><h3>'+esc(generationPhase(record))+'</h3></div><span class="exercise-live-count">已输出 '+(draft.completed||0)+' / '+(p.total||record.request.count)+' 题</span></header><ol class="exercise-live-stages">'+[['connecting','连接'],['thinking','推演'],['writing','输出'],['validating','校验']].map(([id,label])=>'<li class="'+(p.phase===id?'is-current':'')+'">'+label+'</li>').join('')+'</ol><p class="exercise-live-activity" data-ai-live-activity>'+esc(generationActivity(record))+'</p><div class="exercise-live-metrics"><span>正文 <b>'+Number(p.responseChars||0).toLocaleString('zh-CN')+'</b> 字符</span><span>思考 <b>'+Number(p.thinkingChars||0).toLocaleString('zh-CN')+'</b> 字符</span></div>'+modelThinkingHTML(p)+(draft.title?'<h4 class="exercise-live-title">'+esc(draft.title)+'</h4>':'')+(draft.objective?'<p>'+esc(draft.objective)+'</p>':'')+'<div class="exercise-live-output">'+output+'</div>'+modelOutputHTML(p)+'<p class="report-help">'+(output?'正在生成的草稿，完成后进入统一审题。':p.thinkingChars?'模型正在推演，返回的思考内容与正文会持续显示。':'模型返回的题目将在这里逐步显示。')+'</p>';
}
