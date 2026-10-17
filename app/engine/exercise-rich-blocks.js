// Parse presentation blocks without changing the stored question or its review.
// Pipes inside formulas, escaped pipes and fenced examples are not delimiters.
function pipeRow(line){
 const cells=[];let cell='',math='',code=false,delimiters=0;
 for(let i=0;i<line.length;i++){
  const c=line[i];
  if(c==='\\'&&i+1<line.length){cell+=line[i+1]==='|'&&!math&&!code?'|':line.slice(i,i+2);i++;continue;}
  if(c==='`'&&!math)code=!code;
  if(c==='$'&&!code){const delimiter=line.slice(i,i+2)==='$$'?'$$':'$';if(!math)math=delimiter;else if(math===delimiter)math='';cell+=delimiter;i+=delimiter.length-1;continue;}
  if(c==='|'&&!math&&!code){cells.push(cell.trim());cell='';delimiters++;}else cell+=c;
 }
 if(!delimiters||math||code)return null;
 cells.push(cell.trim());if(line.trim().startsWith('|'))cells.shift();if(line.trim().endsWith('|')&&!line.trim().endsWith('\\|'))cells.pop();
 return cells.length>1?cells:null;
}
const rule=row=>row.every(cell=>/^:?-{3,}:?$/.test(cell));
export function exerciseRichBlocks(value){
 const lines=String(value??'').replace(/\r\n?/g,'\n').split('\n'),blocks=[];let text=[],fence=false,displayMath=false;
 const flush=()=>{if(text.length){blocks.push({kind:'text',text:text.join('\n')});text=[];}};
 for(let i=0;i<lines.length;){
  if(/^\s*```/.test(lines[i])){fence=!fence;text.push(lines[i++]);continue;}
  const markers=lines[i].match(/(?<!\\)\$\$/g)||[];if(!fence&&(displayMath||markers.length%2)){if(markers.length%2)displayMath=!displayMath;text.push(lines[i++]);continue;}
  const header=!fence&&pipeRow(lines[i]);
  if(!header||rule(header)){text.push(lines[i++]);continue;}
  const rows=[header];let end=i+1;
  while(end<lines.length){const row=pipeRow(lines[end]);if(!row)break;rows.push(row);end++;}
  const separated=rows.length>1&&rule(rows[1]),valid=rows.every(row=>row.length===header.length)&&!rows.slice(separated?2:1).some(rule);
  if(!valid||rows.length<3){text.push(...lines.slice(i,end));i=end;continue;}
  flush();blocks.push({kind:'table',header,rows:rows.slice(separated?2:1),alignments:header.map((_,n)=>separated?(rows[1][n].endsWith(':')?(rows[1][n].startsWith(':')?'center':'right'):rows[1][n].startsWith(':')?'left':'center'):'center')});i=end;
 }
 flush();return blocks;
}
// Reserve a narrower label column in wide measurement tables; all numeric
// columns retain the same width so units wrap rather than compressing values.
export function exerciseTableWidths(columns,width){
 const label=columns>=5?.65:1,unit=width/(columns-1+label);return Array.from({length:columns},(_,i)=>unit*(i?1:label));
}
