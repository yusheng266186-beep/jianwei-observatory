import {valid,difference} from './metrics.js?v=glass-20261011';
const cache=new WeakMap();
export const directoryDefaults={search:'',page:1,directoryExam:'latest',track:'all',classes:[],language:'all',standing:'all',trend:'all',records:'all',savedOnly:false,minScore:'',maxScore:'',sort:'total',view:'cards',pageSize:24};
export function directoryEntries(atlas,exam='latest') {
  if(!cache.has(atlas))cache.set(atlas,new Map());
  const index=cache.get(atlas);if(index.has(exam))return index.get(exam);
  const entries=atlas.data.students.flatMap(person=>{
    const story=atlas.story(person.id),row=exam==='latest'?story.at(-1):story.find(r=>r.exam===exam);if(!row)return [];
    const position=story.indexOf(row),previous=story.slice(0,position).reverse().find(r=>valid(r.total)&&atlas.profile(r.classNo).track===atlas.profile(row.classNo).track),points=atlas.percentile(row),change=previous?difference(points,atlas.percentile(previous)):null;
    const top=atlas.gap(row,'top'),under=atlas.gap(row,'under'),standing=top!==null&&top>=0?'top':under!==null&&under>=0?'under':under!==null?'below':'unknown';
    return [{person,row,story,previous,percentile:points,change,standing,top,under,track:atlas.profile(row.classNo).track,answers:(atlas.personAnswers.get(row.sid+'|'+row.exam)||[]).filter(a=>a.classNo===row.classNo)}];
  });index.set(exam,entries);return entries;
}
export function queryDirectory(atlas,state,session) {
  const all=directoryEntries(atlas,state.directoryExam||'latest'),q=(state.search||'').trim(),classes=state.classes||[],saved=new Set(session.savedPeople||[]);
  const matches=all.filter(e=>{
    if(q&&!e.person.name.includes(q)&&!(/^\d+班?$/.test(q)&&Number(q.replace('班',''))===e.row.classNo))return false;
    if(state.track!=='all'&&state.track&&e.track!==state.track)return false;
    if(classes.length&&!classes.includes(Number(e.row.classNo)))return false;
    if(state.standing==='nearUnder'&&!(e.under!==null&&Math.abs(e.under)<=20))return false;
    if(state.standing==='nearTop'&&!(e.top!==null&&Math.abs(e.top)<=20))return false;
    if(state.standing&&state.standing!=='all'&&!['nearUnder','nearTop'].includes(state.standing)&&e.standing!==state.standing)return false;
    if(state.trend==='up'&&!(e.change!==null&&e.change>=3))return false;
    if(state.trend==='down'&&!(e.change!==null&&e.change<=-3))return false;
    if(state.trend==='steady'&&!(e.change!==null&&Math.abs(e.change)<3))return false;
    if(state.trend==='unknown'&&e.change!==null)return false;
    if(state.records==='history'&&e.story.length<2)return false;
    if(state.records==='questions'&&!e.answers.length)return false;
    if(state.savedOnly&&!saved.has(e.person.id))return false;
    if(String(state.minScore??'').trim()!==''&&(!valid(e.row.total)||e.row.total<Number(state.minScore)))return false;
    if(String(state.maxScore??'').trim()!==''&&(!valid(e.row.total)||e.row.total>Number(state.maxScore)))return false;
    return true;
  });
  const metric=state.sort==='growth'?e=>e.change:state.sort==='gap'?e=>e.under:state.sort==='records'?e=>e.story.length:state.sort==='percentile'?e=>e.percentile:e=>e.row.total;
  matches.sort((a,b)=>state.sort==='name'?a.person.name.localeCompare(b.person.name,'zh-CN'):state.sort==='low'?(a.row.total??Infinity)-(b.row.total??Infinity):((metric(b)??-Infinity)-(metric(a)??-Infinity)||a.person.name.localeCompare(b.person.name,'zh-CN')));
  const size=[24,48,96].includes(Number(state.pageSize))?Number(state.pageSize):24,pages=Math.max(1,Math.ceil(matches.length/size)),page=Math.min(state.page||1,pages);
  return {all,matches,shown:matches.slice((page-1)*size,page*size),size,pages,page};
}
export const standingLabels={top:'特控达线',under:'本科达线',below:'本科线下',unknown:'有效线待补'};
