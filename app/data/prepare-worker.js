import {normalizeDataset} from './compat.js?v=runtime-v45';
import {readWorkspace,savePreparedIfCurrent} from './storage.js?v=runtime-v45';
import {Atlas} from '../engine/atlas.js?v=runtime-v45';
import {mergeDatasets} from './parser.js?v=runtime-v45';
self.onmessage=async({data})=>{try{
 if(data.operation==='hydrate'){
  const source=await readWorkspace();
  if(!source.dataset||source.dataset.anonymous===true&&source.dataset.userImported!==true){self.postMessage({result:{dataset:normalizeDataset({anonymous:false}),prepared:true,origin:'empty'}});return;}
  const dataset=source.prepared?source.dataset:normalizeDataset(source.dataset);
  if(!source.prepared)await savePreparedIfCurrent(dataset,source.stamp??null).catch(()=>{});
  const atlas=new Atlas(dataset,{prepared:true});
  self.postMessage({result:{dataset,index:atlas.indexSnapshot(),prepared:true,origin:source.origin}});
 }else if(data.operation==='material'){
  const dataset=normalizeDataset(data.mode==='replace'?data.incoming:mergeDatasets(data.before,data.incoming));dataset.userImported=true;
  const atlas=new Atlas(dataset,{prepared:true});self.postMessage({result:{dataset,index:atlas.indexSnapshot()}});
 }else self.postMessage({dataset:normalizeDataset(data.dataset)});
}catch(error){self.postMessage({error:error.message});}};
