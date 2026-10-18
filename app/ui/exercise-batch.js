import {esc} from './html.js';
import {exerciseExams} from '../engine/exercise-basis.js';
// An Atlas is a material snapshot. Caching on the instance keeps per-student
// exam evidence tied to the material version that produced it; a new import
// replaces the Atlas and therefore misses both caches.
const caches=new WeakMap();
function cacheFor(atlas){
 let entry=caches.get(atlas);
 if(!entry||entry.data!==atlas?.data||entry.answers!==atlas?.personAnswers){
  entry={data:atlas?.data,answers:atlas?.personAnswers,exams:new Map(),rosters:new Map()};
  caches.set(atlas,entry);
 }
 return entry;
}
const trim=(map,limit=32)=>{while(map.size>limit)map.delete(map.keys().next().value);};
export function cachedExerciseExams(atlas,sid,subject){
 if(!atlas?.people)return [];
 const entry=cacheFor(atlas);let bySid=entry.exams.get(subject);
 if(!bySid){bySid=new Map();entry.exams.set(subject,bySid);}
 if(!bySid.has(sid))bySid.set(sid,exerciseExams(atlas,sid,subject));
 return bySid.get(sid);
}
export function batchRoster(atlas,subject,exam){
 if(!atlas?.people)return [];
 const entry=cacheFor(atlas),key=String(subject)+'\u0000'+String(exam),hit=entry.rosters.get(key);
 if(hit)return hit;
 const rows=[];
 for(const sid of atlas.people.keys()){
  const list=cachedExerciseExams(atlas,sid,subject),row=list.find(item=>item.exam===exam)||list.at(-1);
  if(row)rows.push({...row,name:atlas.name(sid)});
 }
 rows.sort((a,b)=>a.classNo-b.classNo||a.name.localeCompare(b.name,'zh-CN'));
 entry.rosters.set(key,rows);trim(entry.rosters);
 return rows;
}
// Typing only narrows the cached roster. Each row keeps the exam selected for
// that pupil; filtering never swaps in another pupil's evidence.
export function filterBatchRoster(rows,{classNo=null,query=''}={}){
 const text=String(query??'');
 return rows.filter(row=>(classNo===null||row.classNo===classNo)&&(!text||row.name.includes(text)));
}
export function batchClasses(rows){return [...new Set(rows.map(row=>row.classNo))];}
export function createExerciseBatchPicker({root,getAtlas,getRequest,getContext,create,readInputs}){
 let expanded=false,query='',classNo=null,busy=false,limit=60,selectionKey='';const selected=new Set();
 const roster=()=>batchRoster(getAtlas(),getRequest().subject,getContext().exam);
 function listHTML(){const rows=roster(),filtered=filterBatchRoster(rows,{classNo,query});return '<div class="exercise-batch-classes"><button type="button" class="button chip '+(classNo===null?'selected':'')+'" data-batch-class="all">全部班级</button>'+batchClasses(rows).map(n=>'<button type="button" class="button chip '+(classNo===n?'selected':'')+'" data-batch-class="'+n+'">'+n+'班</button>').join('')+'</div><div class="exercise-batch-roster">'+filtered.slice(0,limit).map(r=>'<label><input type="checkbox" data-batch-sid="'+esc(r.sid)+'" '+(selected.has(r.sid)?'checked':'')+'><span>'+esc(r.name)+'<small>'+r.classNo+'班 · '+esc(getAtlas().exam(r.exam).label)+'</small></span></label>').join('')+'</div>'+(filtered.length>limit?'<button type="button" class="button quiet" data-batch-more>再显示60位 ↓</button>':'')+'<p class="report-help">显示'+Math.min(limit,filtered.length)+'/'+filtered.length+'位 · 已选<span data-batch-count>'+selected.size+'</span>位；切换筛选保留选择。</p>';}
 function html(){const key=getRequest().subject+'|'+getContext().sid+'|'+getContext().exam;if(key!==selectionKey){selectionKey=key;selected.clear();query='';classNo=null;limit=60;expanded=false;}return '<section class="exercise-batch" data-batch-panel><button type="button" class="button quiet" data-batch-open aria-expanded="'+expanded+'">'+(expanded?'收起多学生安排 ↑':'将本次设置用于多位学生 ↗')+'</button>'+(expanded?'<p>沿用教学范围、题型与训练重点；每位学生重新提取自己的考试依据，分别生成独立练习。</p><label class="field"><span>搜索全年级学生</span><input data-batch-search value="'+esc(query)+'" placeholder="输入姓名"></label><div data-batch-list>'+listHTML()+'</div><div class="exercise-batch-footer"><span data-batch-cost>已选'+selected.size+'位 · 共'+selected.size*(getRequest().count||0)+'题</span><button class="button accent" type="button" data-batch-create '+(busy?'disabled':'')+'>建立队列并提交</button></div><p data-batch-status role="status" aria-live="polite"></p>':'')+'</section>';}
 function replace(){const host=root.querySelector('[data-batch-panel]');if(!host)return;const wrap=document.createElement('div');wrap.innerHTML=html();host.replaceWith(wrap.firstElementChild);}
 function status(message){const host=root.querySelector('[data-batch-status]');if(host)host.textContent=message;}
 root.addEventListener('input',e=>{if(!e.target.matches('[data-batch-search]'))return;query=e.target.value;limit=60;root.querySelector('[data-batch-list]').innerHTML=listHTML();});
 root.addEventListener('change',e=>{const sid=e.target.dataset.batchSid;if(!sid)return;e.target.checked?selected.add(sid):selected.delete(sid);root.querySelector('[data-batch-count]').textContent=selected.size;root.querySelector('[data-batch-cost]').textContent='已选'+selected.size+'位 · 共'+selected.size*getRequest().count+'题';});
 root.addEventListener('click',async e=>{if(e.target.closest('[data-batch-more]')){limit+=60;root.querySelector('[data-batch-list]').innerHTML=listHTML();return;}if(e.target.closest('[data-batch-open]')){expanded=!expanded;replace();return;}const cls=e.target.closest('[data-batch-class]');if(cls){classNo=cls.dataset.batchClass==='all'?null:Number(cls.dataset.batchClass);limit=60;root.querySelector('[data-batch-list]').innerHTML=listHTML();return;}const b=e.target.closest('[data-batch-create]');if(!b||busy)return;if(!selected.size){status('请先选择学生。');return;}const startedKey=selectionKey;busy=true;b.disabled=true;status('正在按每名学生匹配依据并建立队列…');try{readInputs();const result=await create([...selected]);if(startedKey!==selectionKey)return;selected.clear();replace();status(result);}catch(error){if(startedKey===selectionKey)status(error.message);}finally{busy=false;if(b.isConnected)b.disabled=false;root.querySelector('[data-batch-create]')?.removeAttribute('disabled');}});
 return {html};
}
