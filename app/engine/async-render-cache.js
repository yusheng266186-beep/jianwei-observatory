// Pending work is shared; only completed values occupy the bounded LRU.
// A failed render is immediately retryable, including after a font/script retry.
export function createAsyncRenderCache({entries=160,maxWeight=1000000,weight=value=>String(value).length}={}){
 const pending=new Map(),saved=new Map();let total=0;
 return {get(key,render){
  if(saved.has(key)){const entry=saved.get(key);saved.delete(key);saved.set(key,entry);return Promise.resolve(entry.value);}
  if(pending.has(key))return pending.get(key);
  const task=Promise.resolve().then(render);pending.set(key,task);
  task.then(value=>{
   pending.delete(key);const size=String(key).length+Math.max(0,weight(value)||0);
   if(size>maxWeight)return;
   saved.set(key,{value,size});total+=size;
   while(saved.size>entries||total>maxWeight){const [old,entry]=saved.entries().next().value;saved.delete(old);total-=entry.size;}
  },()=>pending.delete(key));
  return task;
 }};
}
