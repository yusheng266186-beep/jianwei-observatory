export const valid=v=>typeof v==='number'&&Number.isFinite(v);
export const sum=values=>values.filter(valid).reduce((a,b)=>a+b,0);
export const average=values=>{const v=values.filter(valid);return v.length?sum(v)/v.length:null;};
export const difference=(a,b)=>valid(a)&&valid(b)?a-b:null;
export function quantile(values,p) {
  const list=values.filter(valid).sort((a,b)=>a-b);if(!list.length)return null;
  const position=(list.length-1)*p,lo=Math.floor(position);
  return list[lo]+(list[Math.min(lo+1,list.length-1)]-list[lo])*(position-lo);
}
export function distribution(values) {
  const list=values.filter(valid),mean=average(list);
  return {count:list.length,mean,median:quantile(list,.5),lower:quantile(list,.25),upper:quantile(list,.75),min:list.length?Math.min(...list):null,max:list.length?Math.max(...list):null,sd:mean===null?null:Math.sqrt(average(list.map(v=>(v-mean)**2)))};
}
export const maxScore=subject=>['语文','数学','英语','日语'].includes(subject)?150:100;
export const groupKey=profile=>profile.track;
export const GROUPS=[{key:'physics',title:'物理类',short:'物理类'},{key:'history',title:'历史类',short:'历史类'}];
