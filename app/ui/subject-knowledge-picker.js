import {esc} from './html.js';
import {exerciseChoice} from './exercise-choice.js';
import {knowledgeCatalog,knowledgeTopics,knowledgeTopic,normalizeKnowledgeSearch} from '../data/subject-knowledge.js';

export function createKnowledgePicker(subject){
 const catalog=knowledgeCatalog(subject),modules=catalog.modules;
 let module=modules[0],branch=module.branches[0],group=branch.groups[0];
 function select(id){
  const root=modules.find(m=>m.id===id);if(root){module=root;branch=root.branches[0];group=branch.groups[0];return;}
  for(const m of modules)for(const b of m.branches){if(b.id===id){module=m;branch=b;group=b.groups[0];return;}const g=b.groups.find(g=>g.id===id);if(g){module=m;branch=b;group=g;return;}}
 }
 function restore(request){
  const exact=(request.targets||[]).map(t=>knowledgeTopic(subject,t)).find(Boolean);if(exact){select(exact.group);return;}
  const labels=[...(request.targets||[]),request.focus||''].filter(Boolean),score=(label,text)=>{const query=normalizeKnowledgeSearch(label);if(text.includes(query))return 50+query.length;const grams=[...new Set(Array.from({length:Math.max(0,query.length-1)},(_,i)=>query.slice(i,i+2)))];return grams.reduce((n,g)=>n+(text.includes(g)?1:0),0)+(query.length>=2&&text.includes(query.slice(0,2))?4:0);};
  const ranked=knowledgeTopics(subject).map((t,i)=>({t,i,score:labels.reduce((n,label)=>n+score(label,normalizeKnowledgeSearch(t.label+' '+t.path.join(' '))),0)})).sort((a,b)=>b.score-a.score||a.i-b.i);if(ranked[0]?.score)select(ranked[0].t.group);
 }
 function options(parts,{search='',limit=40}={}){
  const terms=normalizeKnowledgeSearch(search).trim().split(/\s+/).filter(Boolean),all=knowledgeTopics(subject),matches=all.filter(t=>terms.length?terms.every(word=>normalizeKnowledgeSearch(t.label+' '+t.path.join(' ')).includes(word)):t.group===group.id),shown=matches.slice(0,terms.length?limit:300),sections=new Map();
  for(const t of shown){const key=terms.length?t.path.join(' / '):group.name;if(!sections.has(key))sections.set(key,[]);sections.get(key).push(t);}
  return '<div class="exercise-topic-result-status" role="status" aria-live="polite">'+(terms.length?'找到 '+matches.length+' 个考点':esc(module.name+' / '+branch.name+' / '+group.name)+' · '+matches.length+' 个考点')+'</div>'+[...sections].map(([name,topics])=>'<section class="exercise-topic-group"><h5>'+esc(name)+'</h5><div class="exercise-topic-grid" role="group" aria-label="'+esc(name)+'考点">'+topics.map(t=>'<button type="button" class="exercise-topic-point'+(parts.includes(t.value)?' selected':'')+'" data-ai-action="focus-option" data-ai-value="'+esc(t.value)+'" aria-pressed="'+parts.includes(t.value)+'"><span>'+esc(t.label)+'</span><i aria-hidden="true">'+(parts.includes(t.value)?'✓':'+')+'</i></button>').join('')+'</div></section>').join('')+(!matches.length?'<p class="exercise-topic-empty">未找到匹配的知识点。试试专题名、考点或更短的关键词。</p>':'')+(terms.length&&matches.length>shown.length?'<button type="button" class="button outline" data-ai-action="knowledge-more">继续显示 '+Math.min(40,matches.length-shown.length)+' 项</button>':'');
 }
 return {
  select,restore,reset(){select(modules[0].id);},selectTopic(value){const topic=knowledgeTopic(subject,value);if(topic)select(topic.group);},options,
  html(parts,{search='',limit=40}={}){
   return '<div class="exercise-textbook-heading"><div><span class="eyebrow">按现行高中课程整理</span><h4>'+esc(catalog.title)+'</h4></div><span>'+modules.length+' 个板块 · '+knowledgeTopics(subject).length+' 个考点</span></div><div class="exercise-knowledge-toolbar">'+exerciseChoice('knowledge-module','知识板块',module.id,modules.map(m=>({value:m.id,label:m.name})))+'<label class="field exercise-knowledge-search"><span>搜索'+esc(subject)+'考点</span><input type="search" data-ai-knowledge-search value="'+esc(search)+'" placeholder="输入知识点、子专题或关键词" autocomplete="off" aria-label="搜索'+esc(subject)+'知识点"></label></div><div class="exercise-knowledge-browser exercise-math-browser"><nav class="exercise-knowledge-chapters exercise-knowledge-tree" aria-label="'+esc(subject)+'知识分级">'+module.branches.map(b=>'<div class="exercise-knowledge-tree-branch"><button type="button" class="exercise-knowledge-branch'+(b.id===branch.id?' is-current':'')+'" data-ai-action="knowledge-group" data-ai-value="'+b.id+'" aria-expanded="'+(b.id===branch.id)+'" aria-controls="'+b.id+'-children"><span>'+esc(b.name)+'</span><i aria-hidden="true">'+(b.id===branch.id?'−':'+')+'</i></button><div id="'+b.id+'-children" '+(b.id===branch.id?'':'hidden')+'>'+b.groups.map(g=>'<button type="button" data-ai-action="knowledge-group" data-ai-value="'+g.id+'" aria-current="'+(g.id===group.id)+'" class="exercise-knowledge-tree-group'+(g.id===group.id?' selected':'')+'">'+esc(g.name)+'<small>'+g.topics.length+'</small></button>').join('')+'</div></div>').join('')+'</nav><div class="exercise-knowledge-mobile-chapter exercise-math-mobile-levels">'+exerciseChoice('knowledge-branch','子专题',branch.id,module.branches.map(b=>({value:b.id,label:b.name})))+exerciseChoice('knowledge-subtopic','考点分类',group.id,branch.groups.map(g=>({value:g.id,label:g.name})))+'</div><div class="exercise-knowledge-results" data-ai-knowledge-options>'+options(parts,{search,limit})+'</div></div>';
  }
 };
}
