import {access,write} from '../data/storage.js';
import {exerciseOutputs} from './exercise-output-cache.js';
// Stored files are scoped to this workspace and keyed by exact reviewed content,
// identity, output kind and layout version. An edit can never reuse an old file.
export function createExerciseFileCache({read,save,entries=6,maxBytes=16*1024*1024}){
 let loaded,epoch=0,writing=Promise.resolve();const files=new Map();
 const load=()=>loaded||(loaded=Promise.resolve().then(read).then(rows=>{for(const row of rows||[])if(typeof row.key==='string'){if(row.bytes instanceof ArrayBuffer)files.set(row.key,new Blob([row.bytes],{type:row.type||'application/octet-stream'}));else if(row.blob instanceof Blob)files.set(row.key,row.blob);};}).catch(()=>{}));
 const trim=()=>{let bytes=[...files.values()].reduce((n,b)=>n+b.size,0);while(files.size>entries||bytes>maxBytes){const [key,blob]=files.entries().next().value;files.delete(key);bytes-=blob.size;}};
 const persist=()=>{const generation=epoch,snapshot=[...files];writing=writing.catch(()=>{}).then(async()=>{if(generation!==epoch)return;const rows=await Promise.all(snapshot.map(async([key,blob])=>({key,bytes:await blob.arrayBuffer(),type:blob.type})));if(generation===epoch)return save(rows);});writing.catch(()=>{});};
 return {async get(key,build){const generation=epoch;await load();if(generation===epoch&&files.has(key)){const blob=files.get(key);files.delete(key);files.set(key,blob);return blob;}const blob=await build();if(generation===epoch){files.set(key,blob);trim();persist();}return blob;},async clear(){epoch++;await load();files.clear();persist();return writing;},flush:()=>writing};
}
const stored=createExerciseFileCache({read:()=>access('exercise-files-v1'),save:rows=>write([['exercise-files-v1',rows]])});
export const exerciseFile=(key,build)=>exerciseOutputs.get(key,()=>stored.get(key,build));
export const clearExerciseFiles=()=>{exerciseOutputs.clear();return stored.clear();};
