import {esc} from './html.js';
import {exerciseChoice} from './exercise-choice.js';
import {access,update} from '../data/storage.js';
import {saveExerciseSetup,savedExerciseSetups,renameExerciseSetup,deleteExerciseSetup,restoreExerciseSetup,exerciseSetupStamp,exerciseSetupContent,filterExerciseSetups} from '../engine/exercise-setups.js';
import {exerciseTypeLabel} from '../engine/exercise-contract.js';
const button=(label,cmd,kind='outline',disabled=false)=>'<button type="button" class="button '+kind+'" data-ai-action="setup-'+cmd+'" '+(disabled?'disabled':'')+'>'+esc(label)+'</button>';
const stamp=value=>JSON.stringify(exerciseSetupContent({...value,targets:value.targets||[],questionTypes:value.questionTypes||[],requirements:value.requirements||'',visuals:value.visuals||'none',template:value.template||'targeted'}));
export function createExerciseSetupShelf({getRequest,apply,mutate=reduce=>update('exerciseSavedSetups',value=>reduce(savedExerciseSetups(value))),read=()=>access('exerciseSavedSetups'),now=Date.now}){
 let rows=[],editing=false,name='',feedback='',undo=null,editTarget=null,pending=false,query='',tags='',purpose='课后巩固';
 const selected=new Map(),applied=new Map(),picked=()=>rows.find(r=>r.id===selected.get(getRequest().subject)&&r.content.subject===getRequest().subject);
 const match=()=>{const row=picked();if(!row)return '';try{if(stamp(row.content)===stamp(getRequest()))return '与草稿一致';}catch{}return applied.get(row.content.subject)===row.id?'本次设置已调整':'尚未套用';};
 async function refresh(){rows=savedExerciseSetups(await read());}
 return {get pending(){return pending;},load(value){rows=savedExerciseSetups(value);editing=false;editTarget=null;},refresh,subjectChanged(){query='';editing=false;editTarget=null;name='';feedback='';},choose(id){selected.set(getRequest().subject,id);name=picked()?.name||'';editing=false;editTarget=null;feedback='';tags=(picked()?.tags||[]).join('、');purpose=picked()?.purpose||'课后巩固';},setQuery(value){query=value;},setTags(value){tags=value;},setPurpose(value){purpose=value;},setName(value){name=value;},refreshStatus(root){const node=root.querySelector('[data-setup-match]');if(node)node.textContent=match();},
 html({locked=false}={}){const request=getRequest(),matching=filterExerciseSetups(rows,{subject:request.subject,query}),row=picked(),c=row?.content;
 const preview=row?'<details class="exercise-setup-preview"><summary><b>查看草稿内容</b><span data-setup-match>'+esc(match())+'</span></summary><dl>'+[['用途与标签',(row.purpose||'课后巩固')+((row.tags||[]).length?' · '+row.tags.join('、'):'')],['教学范围',c.curriculum||'待补充'],['训练重点',c.focus||'待补充'],['练习安排',c.count+'题 / '+c.minutes+'分钟 · '+c.difficulty],['题型',c.questionTypes?.length?c.questionTypes.map(exerciseTypeLabel).join('、'):'按学科自动搭配'],['配图',{none:'不配图 · 文字与公式',vector:'按需SVG图示',hybrid:'按需图示与复杂插图'}[c.visuals||'none']],...(c.requirements?[['补充要求',c.requirements]]:[])].map(([label,value])=>'<div><dt>'+label+'</dt><dd>'+esc(value)+'</dd></div>').join('')+'</dl>'+button('管理这份草稿','manage','quiet',pending)+'</details>':'';
 return '<section class="exercise-setup-shelf" aria-label="出题草稿"><header><div><h3>草稿与教学模板</h3><p>保存本次选择，下次为其他学生快速套用。</p></div><span data-ai-draft-status></span></header><label class="field exercise-setup-search"><span>查找模板</span><input data-ai-setup-search placeholder="名称、标签或教学范围" value="'+esc(query)+'"></label><div class="exercise-setup-toolbar">'+exerciseChoice('saved-setup','我的'+request.subject+'草稿',row?.id||'',[{value:'',label:matching.length?'选择已保存的草稿':'尚无保存的'+request.subject+'草稿'},...(row&&!matching.some(r=>r.id===row.id)?[row,...matching]:matching).map(r=>({value:r.id,label:r.name+' · '+r.content.count+'题 / '+r.content.minutes+'分钟'}))])+button('套用草稿','apply','outline',!row||locked||pending)+button(pending?'正在保存…':'保存为草稿','edit','quiet',pending)+'</div>'+preview+(editing?'<div class="exercise-setup-editor"><label class="field"><span>草稿名称</span><input data-ai-setup-name maxlength="40" value="'+esc(name)+'" placeholder="例如：导数基础巩固 · 课后训练"></label>'+exerciseChoice('setup-purpose','模板用途',purpose,['课后巩固','课堂练习','考前复习','错题复测','分层辅导'].map(v=>({value:v,label:v})))+'<label class="field"><span>标签 · 最多6个</span><input data-ai-setup-tags value="'+esc(tags)+'" placeholder="例如：导数、计算规范，用顿号分隔"></label><div>'+button(row?'另存新草稿':'保存草稿','save','accent',pending)+(row?button('用本次设置更新','update','outline',pending)+button('仅修改名称','rename','outline',pending)+button('删除草稿','delete','quiet',pending):'')+button('收起','cancel','quiet',pending)+'</div><p class="report-help">“用本次设置更新”会替换草稿内容；“仅修改名称”保留原内容。草稿保存在当前浏览器，并随完整工作区备份导出。</p></div>':'')+'<p class="exercise-setup-feedback" role="status" aria-live="polite">'+esc(feedback)+(undo&&now()<undo.until?button('撤销删除','undo','quiet',pending):'')+'</p></section>';
 },
 async handle(cmd,{locked=false}={}){if(pending)return false;const row=picked(),request=structuredClone(getRequest()),subject=request.subject;
 if(cmd==='setup-edit'||cmd==='setup-manage'){editing=true;editTarget=row?structuredClone(row):null;tags=(row?.tags||[]).join('、');purpose=row?.purpose||'课后巩固';name=row?.name||(subject+' · '+(request.targets?.[0]||'专项训练'));return;}
 if(cmd==='setup-cancel'){editing=false;editTarget=null;return;}
 if(cmd==='setup-apply'){if(locked||!row)return;await apply(row);applied.set(subject,row.id);feedback='已套用“'+row.name+'”，可补充本次要求后生成。';editing=false;return;}
 if(!['setup-save','setup-update','setup-rename','setup-delete','setup-undo'].includes(cmd))return;
 const target=editTarget||row,expected=exerciseSetupStamp(target),savedName=name,restoring=undo;let result,deleted,restored=false;pending=true;
 try{const saved=await mutate(latest=>{
 if(cmd==='setup-save'||cmd==='setup-update'){result=saveExerciseSetup(latest,request,{id:cmd==='setup-update'?target?.id:undefined,name:savedName,tags,purpose,expected,now:now()});return result.rows;}
 if(cmd==='setup-rename'){result=renameExerciseSetup(latest,target?.id,savedName,{expected,now:now()});return result.rows;}
 if(cmd==='setup-delete'){const next=deleteExerciseSetup(latest,target?.id,expected);deleted=target;return next;}
 if(cmd==='setup-undo'&&restoring&&now()<restoring.until){restored=true;return restoreExerciseSetup(latest,restoring.row);}return latest;
 });rows=savedExerciseSetups(saved);
 if(deleted){undo={row:deleted,until:now()+12000};selected.delete(subject);}if(restored){selected.set(restoring.row.content.subject,restoring.row.id);undo=null;}
 if(result){selected.set(subject,result.row.id);if(cmd!=='setup-rename')applied.set(subject,result.row.id);}
 if(getRequest().subject===subject){editing=false;editTarget=null;feedback=deleted?'草稿已删除，12秒内可撤销；已生成练习仍保留。':restored?'已恢复草稿。':result?(cmd==='setup-rename'?'已改名为“'+result.row.name+'”，原训练内容保留。':'已保存“'+result.row.name+'”，下次可直接套用。'):'撤销时间已结束。';}
 }catch(error){if(error.code==='SETUP_STALE'){await refresh().catch(()=>{});editing=false;editTarget=null;}throw error;}finally{pending=false;}
 }
 };
}
