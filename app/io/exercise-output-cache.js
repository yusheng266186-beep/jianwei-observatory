// Reuse the same prepared file for repeat downloads; edits naturally change
// the content key. Pending requests share one build, including warm-up/clicks.
export function createExerciseOutputCache({entries=4,maxBytes=8*1024*1024}={}){
 const saved=new Map();let bytes=0;
 const remove=(key,entry)=>{if(saved.get(key)!==entry)return;saved.delete(key);bytes-=entry.bytes;};
 const trim=()=>{while(saved.size>entries||bytes>maxBytes){const [key,entry]=saved.entries().next().value;remove(key,entry);}};
 return {
  get(key,build){let entry=saved.get(key);if(entry){saved.delete(key);saved.set(key,entry);return entry.task;}
   entry={bytes:0};entry.task=new Promise((resolve,reject)=>{try{resolve(build());}catch(error){reject(error);}});saved.set(key,entry);trim();
   entry.task.then(blob=>{if(saved.get(key)!==entry)return;entry.bytes=blob.size||0;bytes+=entry.bytes;trim();},()=>remove(key,entry));return entry.task;
  },
  remove(predicate){for(const [key,entry] of saved)if(predicate(key))remove(key,entry);},
  clear(){saved.clear();bytes=0;}
 };
}
export const exerciseOutputs=createExerciseOutputCache();
