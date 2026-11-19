const closing={'$':'$','$$':'$$','\\(':'\\)','\\[':'\\]'};

// Scan complete pairs only. Escaped dollars and delimiters in ordinary text
// stay literal, and an unmatched opening cannot swallow later passages.
export function exerciseMathSpans(source){
 if(!/[$\\]/.test(source))return [];
 const markers=[...source.matchAll(/\\[()[\]]|\\[^\r\n]|\$\$?|\n/g)];
 const ends=new Map(),spans=[];
 for(let i=markers.length-1;i>=0;i--){
  const {0:marker,index:start}=markers[i];
  const end=ends.get(closing[marker]),contentStart=start+marker.length;
  if(end&&end.index>contentStart){
   spans.push({start,end:end.index+end[0].length,latex:source.slice(contentStart,end.index),display:marker==='$$'||marker==='\\['});
  }
  if(marker==='\n'||marker==='$$')ends.delete('$');
  if(marker==='\n'||marker==='\\(')ends.delete('\\)');
  if(marker==='\\[')ends.delete('\\]');
  if(['$','$$','\\)','\\]'].includes(marker))ends.set(marker,markers[i]);
 }
 const complete=[];let at=0;
 for(const span of spans.reverse())if(span.start>=at){complete.push(span);at=span.end;}
 return complete;
}

export function exerciseMathParts(value){
 const source=String(value),parts=[];let at=0;
 for(const {start,end,latex} of exerciseMathSpans(source)){
  if(start>at)parts.push({text:source.slice(at,start)});
  parts.push({latex});at=end;
 }
 if(at<source.length)parts.push({text:source.slice(at)});
 return parts;
}

export const supportedExerciseFormula=latex=>latex.length<=2500&&!/\\(?:href|html|includegraphics|url|require|def|newcommand)\b/.test(latex);

// A suffix made only of unmatched group closers contains no visible math.
// Callers still try the original first and require the candidate to render.
export function recoverTrailingBrace(latex){
 let depth=0;
 for(let i=0;i<latex.length;i++){
  if(latex[i]==='\\'){i++;continue;}
  if(latex[i]==='{')depth++;
  else if(latex[i]==='}'){
   depth--;
   if(depth<0)return /^[}\s]+$/.test(latex.slice(i))&&latex.slice(0,i).trim()?latex.slice(0,i):null;
  }
 }
 return null;
}
