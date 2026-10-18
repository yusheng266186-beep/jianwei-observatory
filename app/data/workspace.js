import {normalizeDataset} from './compat.js?v=runtime-v45';
import {SITE_NAME} from '../brand.js?v=runtime-v45';
import {access,write,writePrepared,readWorkspace,writeWorkspaceIfCurrent,PREPARED_VERSION} from './storage.js?v=runtime-v45';
import {prepareDataset,prepareWorkspace} from './preparation.js?v=runtime-v45';
export {preference,remember} from './storage.js?v=runtime-v45';
export function save(dataset,{prepared=false}={}){const meta={version:PREPARED_VERSION,stamp:crypto.randomUUID()};const operation=prepared?write([['dataset',dataset],['prepared',meta]]):writePrepared(prepareDataset(dataset).then(ready=>[['dataset',ready],['prepared',meta]]));return operation.then(()=>meta.stamp);}
export const loadNotebook=()=>access('notebook');
export const loadPlans=()=>access('plans');
export const saveNotebook=notebook=>write([['notebook',notebook]]);
export async function saveWorkspace(dataset,prior,notebook,{prepared=false,expectedStamp=null,reduceNotebook=null}={}){
 const captured=structuredClone({prior,notebook}),ready=prepared?dataset:await prepareDataset(dataset);
 const receipt=await writeWorkspaceIfCurrent([['previous',captured.prior],['dataset',ready],['notebook',captured.notebook]],expectedStamp,{reducers:reduceNotebook?{notebook:reduceNotebook}:{}});
 if(!receipt.saved)throw Object.assign(new Error('材料已在另一个页面更新。本页尚未替换材料，请刷新后重新导入。'),{code:'WORKSPACE_CONFLICT'});
 return {stamp:receipt.stamp,notebook:receipt.values.notebook??captured.notebook};
}
export function restoreDataset(dataset) {
  return dataset.anonymous===true&&dataset.userImported!==true?emptyDataset():normalizeDataset(dataset);
}
export function hasMaterials(dataset) {
  return Boolean(dataset.scores.length||dataset.answers.length||dataset.lines.length||Object.keys(dataset.banks).length);
}
export async function hydrate(boot=null) {
  if(boot?.preparation)return boot.preparation;
  if(boot?.stored)return prepareWorkspace();
  if(boot?.stored===false)return {dataset:emptyDataset(),prepared:true,origin:'empty'};
  const source=boot||await readWorkspace();
  if(!source.dataset||source.dataset.anonymous===true&&source.dataset.userImported!==true)return {dataset:emptyDataset(),prepared:true,origin:'empty'};
  const dataset=source.prepared?source.dataset:await prepareDataset(source.dataset);
  return {...source,dataset,prepared:true,needsSave:!source.prepared};
}
export const preserveUndo=dataset=>write([['previous',dataset]]);
export const previous=()=>access('previous');
export function emptyDataset(){return normalizeDataset({title:SITE_NAME+'工作区',school:'',grade:'',anonymous:false});}
