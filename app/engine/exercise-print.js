// Print an exactly repeated reading passage once; retain every question verbatim.
export function exercisePrintSections(questions){
 const sections=[];
 for(let i=0;i<questions.length;){
  const first=questions[i],next=questions[i+1];let shared='';
  if(next){let end=0;while(end<first.stem.length&&first.stem[end]===next.stem[end])end++;const common=first.stem.slice(0,end),blank=common.lastIndexOf('\n\n'),line=common.lastIndexOf('\n');shared=common.slice(0,blank>=0?blank+2:line+1);}
  if(shared.trim().length<200||first.stem.length===shared.length||next?.stem.length===shared.length){sections.push({material:'',questions:[first]});i++;continue;}
  let end=i+2;while(end<questions.length&&questions[end].stem.startsWith(shared)&&questions[end].stem.length>shared.length)end++;
  sections.push({material:shared,questions:questions.slice(i,end).map(q=>({...q,stem:q.stem.slice(shared.length)}))});i=end;
 }
 return sections;
}
