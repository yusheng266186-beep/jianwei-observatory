import {subjectKnowledge} from './subject-knowledge-data.js';
import {mathKnowledgeCatalog,mathKnowledgeTopics,mathKnowledgeTopic,normalizeKnowledgeSearch} from './math-knowledge.js';
export {normalizeKnowledgeSearch};
const cache=new Map(),indexes=new Map();
export const knowledgeCatalog=subject=>subject==='数学'?mathKnowledgeCatalog:subjectKnowledge[subject]||{title:'知识体系',scope:'',modules:[]};
export function knowledgeTopics(subject){
 if(subject==='数学')return mathKnowledgeTopics(subject);
 if(!cache.has(subject)){const topics=knowledgeCatalog(subject).modules.flatMap(module=>module.branches.flatMap(branch=>branch.groups.flatMap(group=>group.topics.map(label=>({id:group.id+'/'+label,label,value:'知识点 / '+[module.name,group.name,label].join(' / '),module:module.id,branch:branch.id,group:group.id,scopeGroup:branch.scopeGroup||module.scopeGroup||module.name,path:[module.name,branch.name,group.name]})))));cache.set(subject,topics);indexes.set(subject,new Map(topics.map(t=>[t.value,t])));}
 return cache.get(subject);
}
export function knowledgeTopic(subject,value){if(subject==='数学')return mathKnowledgeTopic(subject,value);knowledgeTopics(subject);return indexes.get(subject)?.get(value);}
export function knowledgeScopeGroup(subject,name){return knowledgeCatalog(subject).modules.find(m=>m.name===name)?.scopeGroup||name;}
