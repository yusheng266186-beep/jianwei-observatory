'use strict';

const reasons={
 ExtraCloseMissingOpen:'分组花括号不匹配',
 MissingCloseBrace:'缺少分组右花括号',
 MissingOpenForSub:'下标前缺少分组',
 MissingOpenForSup:'上标前缺少分组',
 ExtraRight:'右侧定界符缺少对应的左侧定界符',
 MissingRight:'缺少对应的右侧定界符',
 UnknownEnv:'公式环境无法识别',
 unsupported:'公式过长或含排版器不支持的命令'
};
const cached=new Map();
let formulas;

function issueFor(latex,{supportedExerciseFormula,recoverTrailingBrace}){
 if(!supportedExerciseFormula(latex))return 'unsupported';
 if(cached.has(latex))return cached.get(latex);
 const texError=require('./exercise-tex-engine.cjs');
 let issue=texError(latex);
 if(issue==='ExtraCloseMissingOpen'){
  const candidate=recoverTrailingBrace(latex);
  if(candidate)issue=texError(candidate);
 }
 cached.set(latex,issue);
 if(cached.size>1024)cached.delete(cached.keys().next().value);
 return issue;
}

async function exerciseFormulaIssues(sheet,{deferFormulaReview=false}={}){
 formulas??=import('./exercise-formulas.mjs');
 const syntax=await formulas,issues=[];
 const check=(questionId,field,label,value,editable)=>{
  if(typeof value!=='string'||(editable&&deferFormulaReview)||issues.length>=6)return;
  for(const {latex} of syntax.exerciseMathParts(value)){
   if(latex===undefined)continue;
   const problem=issueFor(latex,syntax);
   if(!problem)continue;
   const place=questionId?'第'+questionId+'题'+label:label;
   const reason=place+'的公式'+(reasons[problem]||'未通过排版校验')+'。';
   issues.push({code:'formula-layout',questionId,field,reason,formula:latex.slice(0,180)});
   break;
  }
 };
 check(0,'objective','训练目标',sheet?.objective,false);
 for(const q of sheet?.questions||[]){
  for(const [field,label] of [['stem','题干'],['answer','答案'],['analysis','解析']])check(q.id,field,label,q[field],true);
  for(const [field,label] of [['choices','选项'],['points','评分点']]){
   for(const [i,text] of (q[field]||[]).entries())check(q.id,field,label+'第'+(i+1)+'项',text,true);
  }
  check(q.id,'diagram','图示说明',q.diagram?.caption,false);
 }
 return issues;
}

module.exports={exerciseFormulaIssues};
