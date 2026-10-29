import {mathKnowledge} from './math-knowledge-data.js';

export const mathKnowledgeCatalog=mathKnowledge;
const topics=mathKnowledge.modules.flatMap(module=>module.branches.flatMap(branch=>branch.groups.flatMap(group=>group.topics.map(label=>({
 id:group.id+'/'+label,label,value:'知识点 / '+[module.name,group.name,label].join(' / '),
 module:module.id,branch:branch.id,group:group.id,path:[module.name,branch.name,group.name]
})))));
const byValue=new Map(topics.map(topic=>[topic.value,topic]));
export const mathKnowledgeTopics=subject=>subject==='数学'?topics:[];
export const mathKnowledgeTopic=(subject,value)=>subject==='数学'?byValue.get(value):undefined;
export const normalizeKnowledgeSearch=value=>String(value||'').toLocaleLowerCase().replaceAll('图像','图象').replaceAll('∩','交集').replaceAll('∪','并集').replaceAll('的','');
