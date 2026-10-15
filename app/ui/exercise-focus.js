// A preset or imported knowledge label can itself contain the separator used
// in the editable focus text. Recognize whole labels before splitting notes.
export function exerciseFocusParts(value,labels=[]){
 const text=String(value||''),options=[...new Set(labels.filter(Boolean))].sort((a,b)=>b.length-a.length),parts=[];
 let cursor=0;
 while(cursor<text.length){
  while(cursor<text.length&&/[\s、]/.test(text[cursor]))cursor++;
  if(cursor===text.length)break;
  const option=options.find(label=>text.startsWith(label,cursor)&&/^\s*(?:[、\r\n]|$)/.test(text.slice(cursor+label.length)));
  if(option){parts.push(option);cursor+=option.length;continue;}
  const offset=text.slice(cursor).search(/[、\r\n]/),end=offset<0?text.length:cursor+offset,part=text.slice(cursor,end).trim();
  if(part)parts.push(part);cursor=end;
 }
 return parts;
}

export function toggleExerciseFocus(value,label,labels=[]){
 const parts=exerciseFocusParts(value,[...labels,label]);
 return (parts.includes(label)?parts.filter(part=>part!==label):[...parts,label]).join('、');
}

// Imported labels may contain punctuation: keep them intact and rank only
// documented score evidence, never infer a weakness from a preset name.
export function quickExerciseFocus({groups=[],curriculumMatches=[],scopeRestricted=false,mode='recommended',count=6}={}){
 const allowed=new Set(curriculumMatches),known=groups.filter(g=>g.knowledge&&Number.isFinite(g.score)&&Number.isFinite(g.max)&&g.max>0),scoped=scopeRestricted||allowed.size?known.filter(g=>allowed.has(g.knowledge)):known;
 if(mode==='clear')return {focus:'',labels:[],message:'已清空训练重点，可重新点选或补充。'};
 if(!scoped.length)return {focus:null,labels:[],message:scopeRestricted||allowed.size?'所选教学范围暂无可核对的薄弱知识点，请直接点选训练模块。':'当前依据没有可推荐的知识点，请选择其他考试，或直接点选训练模块。'};
 const sorted=[...scoped].sort(mode==='weakest'?(a,b)=>a.score/a.max-b.score/b.max:(a,b)=>(b.examCount||0)-(a.examCount||0)||a.score/a.max-b.score/b.max),labels=[...new Set(sorted.map(g=>g.knowledge))].slice(0,mode==='weakest'?1:Math.min(3,count));
 return {focus:labels.join('、'),labels,message:(mode==='weakest'?'已选本范围得分率最低项：':'已采用推荐重点：')+labels.join('、')+'。'};
}
