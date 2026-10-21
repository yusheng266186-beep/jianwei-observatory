import {contentStamp} from './content-stamp.mjs';
// Shared, deterministic review aids. This module never changes model text and
// never treats an unrecognised expression as either correct or incorrect.
export const EXERCISE_QUALITY_VERSION=6;
export const hasExerciseDraft=text=>/等等[，,]?\s*重新(?:核算|计算)|若我们把选项(?:设定|改)为|重新设计(?:一下)?(?:题目|选项)|重新审视设问|在题干中加上|重新核定已知条件设置|如果题干原意/.test(String(text||''));
function braces(source,start){if(source[start]!=='{')return null;let depth=0;for(let i=start;i<source.length;i++){if(source[i]==='{')depth++;if(source[i]==='}'&&!--depth)return {value:source.slice(start+1,i),end:i+1};}return null;}
function expand(source){
 for(let n=0;n<40;n++){const found=/\\(?:dfrac|tfrac|frac|sqrt)\s*/.exec(source);if(!found)return source;const first=braces(source,found.index+found[0].length);if(!first)return null;const sqrt=found[0].includes('sqrt');let last=first.end,replacement;
  if(sqrt)replacement='sqrt('+expand(first.value)+')';else{let i=first.end;while(/\s/.test(source[i]||'')&&i<source.length)i++;const second=braces(source,i);if(!second)return null;last=second.end;replacement='(('+expand(first.value)+')/('+expand(second.value)+'))';}source=source.slice(0,found.index)+replacement+source.slice(last);
 }return null;
}
export function numericExerciseExpression(value){
 let source=expand(String(value));if(source===null||source.length>1200)return null;
 source=source.replace(/\\(?:times|cdot)/g,'*').replace(/\\div/g,'/').replace(/\\(?:left|right)/g,'').replace(/\\%/g,'%').replace(/\\[,;! ]/g,'').replace(/[−–]/g,'-').replace(/×/g,'*').replace(/÷/g,'/').replace(/[{}]/g,c=>c==='{'?'(':')').replace(/\s/g,'');
 const tokens=source.match(/sqrt|(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?|[+*/()%^-]/g);if(!tokens||tokens.length>200||tokens.join('')!==source)return null;let i=0,depth=0;
 function primary(){if(++depth>24)throw Error();let n;if(tokens[i]==='+'){i++;n=primary();}else if(tokens[i]==='-'){i++;n=-power();}else if(tokens[i]==='sqrt'){i++;if(tokens[i++]!=='(')throw Error();n=Math.sqrt(sum());if(tokens[i++]!==')')throw Error();}else if(tokens[i]==='('){i++;n=sum();if(tokens[i++]!==')')throw Error();}else{if(!/^(?:\d|\.)/.test(tokens[i]||''))throw Error();n=Number(tokens[i++]);}while(tokens[i]==='%'){i++;n/=100;}depth--;return n;}
 function power(){let n=primary();if(tokens[i]==='^'){i++;const p=power();if(Math.abs(p)>20)throw Error();n=n**p;}return n;}
 function product(){let n=power();while(['*','/'].includes(tokens[i])){const op=tokens[i++],b=power();n=op==='*'?n*b:n/b;}return n;}
 function sum(){let n=product();while(['+','-'].includes(tokens[i])){const op=tokens[i++],b=product();n=op==='+'?n+b:n-b;}return n;}
 try{const n=sum();return i===tokens.length&&Number.isFinite(n)?n:null;}catch{return null;}
}
function equations(text){return [...String(text||'').matchAll(/\$\$([\s\S]*?)\$\$|\$([^$\n]+)\$/g)].map(m=>m[1]??m[2]);}
export function exerciseQualityStamp(sheet){return contentStamp([EXERCISE_QUALITY_VERSION,sheet]);}
export function auditExerciseQuality(sheet,request={},notes=[]){
 const issues=[],checks={questions:0,equations:0,consistentEquations:0,figures:0},seen=new Map(),add=(questionId,code,message,detail='',severity='review')=>{const id=[questionId,code,detail||message].join('|');if(!issues.some(x=>x.id===id))issues.push({id,questionId,code,severity,message,detail});};
 for(const q of sheet?.questions||[]){checks.questions++;if(q.diagram)checks.figures++;const signature=String(q.stem||'').replace(/\s/g,'');if(seen.has(signature))add(q.id,'duplicate','与第'+seen.get(signature)+'题题干重复，请确认训练安排。');else seen.set(signature,q.id);
  if(hasExerciseDraft([q.answer,q.analysis,...(q.points||[])].join('\n')))add(q.id,'draft','参考答案或解析出现类似改题说明的措辞，请结合上下文核对是否为引用或已经完成的分析。');
  for(const m of String(q.stem||'').matchAll(/\\triangle\s*([A-Z]{3})\s*\$\s*沿\s*\$([A-Z]{2})\$\s*(?:翻折|折起)(?:至|到)\s*\$\\triangle\s*([A-Z]{3})/g))if([...m[2]].some(point=>!m[1].includes(point)||!m[3].includes(point)))add(q.id,'fold-labels','翻折前后三角形的字母与折叠轴不一致，请核对固定点和运动点。');
  if(request.subject==='英语'&&q.type==='写作'){const target=/词数\s*(?:为|约)?\s*(\d{2,3})\s*(?:左右|词)/.exec(q.stem),words=(String(q.answer||'').match(/\b[A-Za-z]+(?:['’-][A-Za-z]+)*\b/g)||[]).length;if(target&&(words<Number(target[1])*.75||words>Number(target[1])*1.25))add(q.id,'word-count','参考范文约'+words+'词，题干要求约'+target[1]+'词，请按题目给出的计词范围核对字数。');}
  if(q.choices?.length&&new Set(q.choices.map(c=>String(c).replace(/\s/g,''))).size!==q.choices.length)add(q.id,'choices','存在重复选项，请核对答案区分度。');
  for(const text of [q.answer,q.analysis,...(q.points||[])])for(const expression of equations(text)){
   if(!expression.includes('=')||/\\(?:approx|sim|begin|end|cases|le|ge|neq)|[<>≈]/.test(expression))continue;
   const units=[...expression.matchAll(/\\(?:text|mathrm)\s*\{([^{}]*)\}/g)].map(m=>m[1].trim());if(units.some(u=>!['m','km','cm','mm','s','min','h','g','kg','L','mL','mol','mmol','Pa','kPa','J','N','W','V','A','Ω','mmHg'].includes(u))||new Set(units).size>1)continue;
   const parts=expression.replace(/\\(?:text|mathrm)\s*\{[^{}]*\}/g,'').split('=');if(parts.length<2||parts.length>8)continue;const values=parts.map(numericExerciseExpression);if(values.some(v=>v===null))continue;checks.equations++;
   if(values.every(v=>Math.abs(v-values[0])<=1e-7*Math.max(1,...values.map(Math.abs))))checks.consistentEquations++;else add(q.id,'arithmetic','数值算式两侧不一致；如为近似值，请明确近似关系和精度。',expression.slice(0,240));
  }
  if(q.target&&request.targets?.length&&!request.targets.includes(q.target))add(q.id,'target','本题训练点与本次选择不一致，请核对范围。');
 }
 for(const target of request.targets||[])if(!(sheet?.questions||[]).some(q=>q.target===target))add(0,'coverage','所选训练点尚未在逐题目标中体现：'+target,target);
 for(const n of notes)for(const message of n.issues||[])add(n.questionId,'content',message);
 return {version:EXERCISE_QUALITY_VERSION,checks,issues,stamp:exerciseQualityStamp(sheet)};
}
export function exerciseQualityReviewed(record){const report=auditExerciseQuality(record.sheet,record.request,record.figureReviewNotes);return !report.issues.some(i=>i.severity==='block')&&(!report.issues.length||record.qualityReview?.stamp===report.stamp&&report.issues.every(i=>record.qualityReview.acknowledged?.includes(i.id)));}
export function requireExerciseQualityReview(record){if(auditExerciseQuality(record.sheet,record.request,record.figureReviewNotes).issues.some(i=>i.severity==='block'))throw Error('练习仍有未解决的内容问题，请核对后输出。');}
