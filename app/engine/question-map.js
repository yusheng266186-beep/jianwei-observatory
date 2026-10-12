import {valid} from './metrics.js?v=slides-v13';

const normalize=value=>String(value??'').normalize('NFKC').trim().toLocaleLowerCase('zh-CN');
export function queryQuestionMap(lens,state={},rules={}) {
  const threshold=valid(rules.lowRate)&&rules.lowRate>=0&&rules.lowRate<=1?rules.lowRate:.5;
  const query=normalize(state.questionSearch),terms=query.split(/\s+/).filter(Boolean);
  const searched=lens.questions.filter(q=>{
    const text=normalize('第'+q.label+'题 '+(q.knowledge||'知识点未标注'));
    return terms.every(term=>text.includes(term));
  });
  const conditions=[
    {id:'all',label:'全部题目',test:()=>true},
    {id:'low',label:'低得分率',test:q=>valid(q.rate)&&q.rate<threshold},
    {id:'missing',label:'作答未齐',test:q=>q.count<lens.answers.length},
    {id:'max',label:'满分待补',test:q=>!valid(q.max)||q.max<=0}
  ];
  const selected=conditions.find(f=>f.id===state.questionFocus)||conditions[0];
  const matches=searched.filter(selected.test);
  if(state.order==='loss')matches.sort((a,b)=>{
    if(!valid(a.loss))return valid(b.loss)?1:a.index-b.index;
    if(!valid(b.loss))return -1;
    return b.loss-a.loss||a.index-b.index;
  });
  return {matches,query,selected:selected.id,label:selected.label,threshold,filters:conditions.map(f=>({id:f.id,label:f.label,count:searched.filter(f.test).length})),orderLabel:state.order==='loss'?'平均失分从高到低':'原卷题目顺序'};
}

// Saved map sequences keep their order; unavailable or duplicate indices are discarded.
export function questionSequence(lens,state={}) {
  const byIndex=new Map(lens.questions.map(q=>[q.index,q]));
  const indices=Array.isArray(state.queue)?[...new Set(state.queue.filter(index=>Number.isInteger(index)&&byIndex.has(index)))]:[];
  const fromMap=indices.includes(Number(state.question));
  return {questions:fromMap?indices.map(index=>byIndex.get(index)):lens.questions,fromMap};
}
