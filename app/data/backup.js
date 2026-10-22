// An emergency export must not depend on the same failing store it protects.
// Missing collections are omitted, never represented as confirmed empty lists.
export async function workspaceBackup(snapshot,{read,live=null,setups=value=>value}={}){
 let saved={},complete=true;
 try{saved=await read()||{};}catch{complete=false;}
 const payload={...snapshot},source={...saved,...(live||{})},missing=[];
 for(const key of ['exercises','exerciseSavedSetups','exerciseComposerDrafts']){
  if(Object.hasOwn(source,key))payload[key]=key==='exerciseSavedSetups'?setups(source[key]):key==='exerciseComposerDrafts'?(source[key]?.version===1?source[key]:{version:1,requests:[],focuses:[],bases:[],applied:[]}):Array.isArray(source[key])?source[key]:[];
  else if(complete)payload[key]=key==='exerciseComposerDrafts'?{version:1,requests:[],focuses:[],bases:[],applied:[]}:[];
  else missing.push(key);
 }
 return {payload,complete:missing.length===0,missing};
}
