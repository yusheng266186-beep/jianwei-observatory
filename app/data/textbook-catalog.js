// Publisher-aligned books and independently authored practice points.
import {textbooks} from './textbook-knowledge.js';
export const textbookCatalog=subject=>textbooks[subject]||{edition:'',books:[],sources:[]};
const cache=new Map();
export function textbookTopics(subject){
 if(!cache.has(subject))cache.set(subject,textbookCatalog(subject).books.flatMap(book=>book.chapters.flatMap(chapter=>chapter.sections.flatMap(section=>section.topics.map(label=>({id:[book.id,chapter.id,section.name,label].join('/'),label,value:book.short+' / '+label,book:book.id,chapter:chapter.id,path:[book.name,chapter.name,section.name],section:section.name}))))));
 return cache.get(subject);
}
export const textbookTopic=(subject,value)=>textbookTopics(subject).find(t=>t.value===value);
