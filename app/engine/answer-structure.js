import {valid} from './metrics.js?v=paper-v30';

export function answerStructure(answers,question,rules={}) {
  const score=answer=>answer.values[question.index],knownMax=valid(question.max)&&question.max>0;
  const low=valid(rules?.lowRate)?Math.max(0,Math.min(1,rules.lowRate)):.5;
  const focus=valid(rules?.focusRate)?Math.max(low,Math.min(1,rules.focusRate)):Math.max(low,.75);
  // Stabilize decimal threshold comparisons without changing stored scores.
  const rate=a=>Number((score(a)/question.max).toPrecision(12));
  const pct=value=>(value*100).toLocaleString('zh-CN',{maximumFractionDigits:2})+'%';
  const groups=[{id:'zero',label:'零分',range:'真实填写的0分',test:a=>score(a)===0}];
  if(knownMax)groups.push(
    {id:'low',label:'低分段',range:'低于'+pct(low)+'，不含0分',test:a=>valid(score(a))&&score(a)!==0&&rate(a)<low},
    {id:'focus',label:'中段',range:pct(low)+'至'+pct(focus)+'以下，不含0分',test:a=>valid(score(a))&&score(a)!==0&&rate(a)>=low&&rate(a)<focus&&score(a)<question.max},
    {id:'secure',label:'高分段',range:pct(focus)+'至100%以下，不含0分',test:a=>valid(score(a))&&score(a)!==0&&rate(a)>=focus&&score(a)<question.max},
    {id:'full',label:'满分及以上',range:'不低于明确满分，保留原始得分',test:a=>valid(score(a))&&score(a)>=question.max}
  );
  else groups.push({id:'scored',label:'已填非零',range:'满分未知，保留原始得分',test:a=>valid(score(a))&&score(a)!==0});
  groups.push({id:'missing',label:'未填写',range:'空白与缺失分数',test:a=>!valid(score(a))});
  let min=null,max=null,filled=0;
  for(const answer of answers){const value=score(answer);if(valid(value)){filled++;min=min===null?value:Math.min(min,value);max=max===null?value:Math.max(max,value);}}
  return {knownMax,low,focus,filled,total:answers.length,min,max,groups:groups.map(g=>{const count=answers.filter(g.test).length;return {...g,count,share:answers.length?count/answers.length:null};})};
}
