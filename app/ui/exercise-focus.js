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
