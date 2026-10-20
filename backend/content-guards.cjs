'use strict';
// Narrow checks for observed, unambiguous defects. Unknown scoring patterns or
// scientific expressions are left to subject review, never guessed or rewritten.
function contentGuards(sheet,input){
 const issues=[];const add=(q,code,reason)=>issues.push({questionId:q.id,code,reason});
 for(const q of sheet.questions||[]){
  if(!['选择','多选'].includes(q.type)&&q.points?.length){
   const marks=q.points.map(p=>{
    if(/每|每[答写点项个]|每.{0,5}[得给]\s*\d|扣|酌|最多|至多|任选|任答|不超过|或.{0,6}\d+\s*分|其余|共计|合计/.test(p))return null;
    const matches=[...p.matchAll(/(\d+(?:\.\d+)?)\s*分/g)];return matches.length===1?Number(matches[0][1]):null;
   });
   if(marks.every(n=>n!==null)&&Math.abs(marks.reduce((n,x)=>n+x,0)-q.maxScore)>.001)add(q,'score-sum','逐项明确给出的评分分值合计为'+marks.reduce((n,x)=>n+x,0)+'分，与满分'+q.maxScore+'分不一致，请核对各评分点，不能改变满分。');
  }
  if(input.subject==='语文'&&/改写|压缩|简明/.test(q.stem)&&/含标点|包括标点|标点计入/.test(q.stem)&&!/不含标点|不包括标点/.test(q.stem)){
   const limit=/(?:不超过|不得超过|至多)\s*(\d{1,3})\s*字/.exec(q.stem),answer=String(q.answer||'');
   if(limit&&!/[\n\r]|参考|答案|示例|示范|方案[一二两123]/.test(answer)){const n=[...answer.replace(/\s/g,'')].length;if(n>Number(limit[1]))add(q,'character-limit','参考答案按含标点计'+n+'字，超过题干'+limit[1]+'字上限。请保留全部要求信息并缩短，不能放宽题干限制。');}
  }
  if(input.subject==='地理'&&!/判断.{0,8}(?:正误|错误|合理)|纠正|错误的|是否合理/.test(q.stem)){
   const coast=/(?:海岸线|海岸).{0,10}东西(?:向|走向|延伸)?/.test(q.stem),sides=/(?:陆地|陆).{0,5}西(?:侧|边|方)?.{0,20}(?:海洋|海).{0,5}东|(?:陆地|陆).{0,5}东(?:侧|边|方)?.{0,20}(?:海洋|海).{0,5}西/.test(q.stem);
   if(coast&&sides&&(q.stem.match(/海岸线/g)||[]).length<=1)add(q,'coast-orientation','题干同时给出东西向海岸线与陆海东西两侧，局部海岸线延伸方向和两侧方位矛盾，需明确一致的空间条件。');
  }
  if(input.subject==='物理')for(const text of [q.answer,q.analysis,...(q.points||[])]){
   for(const m of String(text).matchAll(/\$([^$\n]+)\$/g)){
    if(/错误|不能|误写|不应/.test(text.slice(Math.max(0,m.index-12),m.index))||/错误|不正确|应为|改为|不成立/.test(text.slice(m.index+m[0].length,m.index+m[0].length+12)))continue;
    const formula=m[1].replace(/\\rho/g,'ρ').replace(/\\pi/g,'π').replace(/\\[dt]?frac/g,'frac').replace(/[{}\s]/g,'');
    if(/ρ=frac4R[Ll]πd\^2/.test(formula)||/ρ=4R[Ll]\/\(?πd\^2/.test(formula))add(q,'resistivity-inverted','电阻率公式把πd²与4L的比例倒置；由R=ρL/S和S=πd²/4应得ρ=πRd²/(4L)，请逐处核对答案、解析与评分。');
   }
  }
 }
 return issues;
}
module.exports={contentGuards};
