import {exerciseMathSpans} from './exercise-formulas.js';

// Parse presentation blocks without changing the stored question or its review.
// Pipes inside formulas, escaped pipes and fenced examples are not delimiters.
function pipeRow(line){
 const cells=[],math=new Map(exerciseMathSpans(line).map(span=>[span.start,span]));
 let cell='',code=false,delimiters=0;
 for(let i=0;i<line.length;i++){
  const c=line[i];
  const span=!code&&math.get(i);
  if(span){cell+=line.slice(i,span.end);i=span.end-1;continue;}
  if(c==='\\'&&i+1<line.length){cell+=line[i+1]==='|'&&!code?'|':line.slice(i,i+2);i++;continue;}
  if(c==='`')code=!code;
  if(c==='|'&&!code){cells.push(cell.trim());cell='';delimiters++;}else cell+=c;
 }
 if(!delimiters||code)return null;
 cells.push(cell.trim());if(line.trim().startsWith('|'))cells.shift();if(line.trim().endsWith('|')&&!line.trim().endsWith('\\|'))cells.pop();
 return cells.length>1?cells:null;
}
const rule=row=>row.every(cell=>/^:?-+:?$/.test(cell));
function presentationLines(value){
 const source=String(value??'').replace(/\r\n?/g,'\n'),lines=source.split('\n');
 const displays=exerciseMathSpans(source).filter(span=>span.display&&span.latex.includes('\n'));
 const mathLines=new Set();let offset=0,i=0;
 for(const [line,text] of lines.entries()){
  while(displays[i]?.end<=offset)i++;
  if(displays[i]?.start<=offset+text.length)mathLines.add(line);
  offset+=text.length+1;
 }
 return {lines,mathLines};
}
export function exerciseTableFormatIssues(value){
 const {lines,mathLines}=presentationLines(value),issues=[];let fence=false;
 for(let i=0;i<lines.length;i++){
  if(/^\s*```/.test(lines[i])){fence=!fence;continue;}
  if(fence||mathLines.has(i))continue;const header=pipeRow(lines[i]);if(!header||rule(header))continue;
  const separator=pipeRow(lines[i+1]||'');if(!separator||!rule(separator))continue;
  // The separator only controls alignment. Real data rows must still match.
  for(i+=2;i<lines.length;i++){const row=!mathLines.has(i)&&pipeRow(lines[i]);if(!row){i--;break;}if(row.length!==header.length||rule(row))issues.push({line:i+1,columns:header.length,actual:row.length});}
 }
 return issues;
}
export function exerciseRichBlocks(value){
 const {lines,mathLines}=presentationLines(value),blocks=[];let text=[],fence=false;
 const flush=()=>{if(text.length){blocks.push({kind:'text',text:text.join('\n')});text=[];}};
 for(let i=0;i<lines.length;){
  if(/^\s*```/.test(lines[i])){fence=!fence;text.push(lines[i++]);continue;}
  const header=!fence&&!mathLines.has(i)&&pipeRow(lines[i]);
  if(!header||rule(header)){text.push(lines[i++]);continue;}
  const rows=[header];let end=i+1;
  while(end<lines.length&&!mathLines.has(end)){const row=pipeRow(lines[end]);if(!row)break;rows.push(row);end++;}
  const separated=rows.length>1&&rule(rows[1]),data=rows.slice(separated?2:1),valid=data.every(row=>row.length===header.length)&&!data.some(rule);
  if(!valid||rows.length<3){text.push(...lines.slice(i,end));i=end;continue;}
  // A legacy delimiter row contains alignment, never question data. If only
  // its column count is wrong, show all intact cells with neutral alignment.
  flush();blocks.push({kind:'table',header,rows:data,alignments:header.map((_,n)=>separated&&rows[1].length===header.length?(rows[1][n].endsWith(':')?(rows[1][n].startsWith(':')?'center':'right'):rows[1][n].startsWith(':')?'left':'center'):'center')});i=end;
 }
 flush();return blocks;
}
// Reserve a narrower label column in wide measurement tables; all numeric
// columns retain the same width so units wrap rather than compressing values.
export function exerciseTableWidths(columns,width){
 const label=columns>=5?.65:1,unit=width/(columns-1+label);return Array.from({length:columns},(_,i)=>unit*(i?1:label));
}
