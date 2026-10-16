import {esc} from './html.js';
import {exerciseChoice} from './exercise-choice.js';
import {write} from '../data/storage.js';
import {saveExerciseSetup,savedExerciseSetups} from '../engine/exercise-setups.js';
const button=(label,cmd,kind='outline',disabled=false)=>'<button type="button" class="button '+kind+'" data-ai-action="setup-'+cmd+'" '+(disabled?'disabled':'')+'>'+esc(label)+'</button>';
export function createExerciseSetupShelf({getRequest,apply}){
 let rows=[],selected='',editing=false,name='',feedback='',undo=null;const picked=()=>rows.find(r=>r.id===selected&&r.content.subject===getRequest().subject);
 return {load(value){rows=savedExerciseSetups(value);},subjectChanged(){editing=false;name='';feedback='';},choose(id){selected=id;name=picked()?.name||'';feedback='';},setName(value){name=value;},
  html({locked=false}={}){const request=getRequest(),matching=rows.filter(r=>r.content.subject===request.subject).sort((a,b)=>b.updatedAt-a.updatedAt),row=picked();
   return '<section class="exercise-setup-shelf" aria-label="出题草稿"><header><div><h3>草稿与常用设置</h3><p>保存本次选择，下次为其他学生快速套用。</p></div><span data-ai-draft-status></span></header><div class="exercise-setup-toolbar">'+exerciseChoice('saved-setup','我的'+request.subject+'草稿',row?.id||'',[{value:'',label:matching.length?'选择已保存的草稿':'尚无保存的'+request.subject+'草稿'},...matching.map(r=>({value:r.id,label:r.name+' · '+r.content.count+'题 / '+r.content.minutes+'分钟'}))])+button('套用草稿','apply','outline',!row||locked)+button('保存为草稿','edit','quiet')+'</div>'+(row?'<p class="exercise-setup-context">'+esc(row.content.curriculum||'教学范围待补充')+' · '+esc(row.content.difficulty)+button('管理','manage','quiet')+'</p>':'')+(editing?'<div class="exercise-setup-editor"><label class="field"><span>草稿名称</span><input data-ai-setup-name maxlength="40" value="'+esc(name)+'" placeholder="例如：导数基础巩固 · 课后训练"></label><div>'+button(row?'另存新草稿':'保存草稿','save','accent')+(row?button('更新这份草稿','update')+button('删除草稿','delete','quiet'):'')+button('收起','cancel','quiet')+'</div><p class="report-help">保存教材范围、训练内容与练习设置；套用时使用当前学生的考试依据。草稿保存在当前浏览器。</p></div>':'')+'<p class="exercise-setup-feedback" role="status" aria-live="polite">'+esc(feedback)+(undo&&Date.now()<undo.until?button('撤销删除','undo','quiet'):'')+'</p></section>';
  },
  async handle(cmd,{locked=false}={}){const row=picked(),request=getRequest();
   if(cmd==='setup-edit'||cmd==='setup-manage'){editing=true;name=row?.name||(request.subject+' · '+(request.targets?.[0]||'专项训练'));return;}
   if(cmd==='setup-cancel'){editing=false;return;}
   if(cmd==='setup-apply'){if(locked||!row)return;await apply(row);feedback='已套用“'+row.name+'”，可补充本次要求后生成。';editing=false;return;}
   let next=rows,message='';
   if(cmd==='setup-save'||cmd==='setup-update'){const saved=saveExerciseSetup(rows,request,{id:cmd==='setup-update'?row?.id:undefined,name});next=saved.rows;selected=saved.row.id;message='已保存“'+saved.row.name+'”，下次可直接套用。';}
   if(cmd==='setup-delete'&&row){next=rows.filter(r=>r.id!==row.id);undo={row,until:Date.now()+12000};selected='';message='草稿已删除，12秒内可撤销；已生成练习仍保留。';}
   if(cmd==='setup-undo'&&undo&&Date.now()<undo.until){next=[...rows.filter(r=>r.id!==undo.row.id),undo.row];selected=undo.row.id;undo=null;message='已恢复草稿。';}
   if(next!==rows){await write([['exerciseSavedSetups',next]]);rows=next;feedback=message;editing=false;}
  }
 };
}
