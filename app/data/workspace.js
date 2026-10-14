import {normalizeDataset} from './compat.js?v=runtime-v45';
import {SITE_NAME} from '../brand.js?v=runtime-v45';
import {access,write,writePrepared,readWorkspace,PREPARED_VERSION} from './storage.js?v=runtime-v45';
import {prepareDataset,prepareWorkspace} from './preparation.js?v=runtime-v45';
export {preference,remember} from './storage.js?v=runtime-v45';
export function save(dataset,{prepared=false}={}){const meta={version:PREPARED_VERSION,stamp:crypto.randomUUID()};return prepared?write([['dataset',dataset],['prepared',meta]]):writePrepared(prepareDataset(dataset).then(ready=>[['dataset',ready],['prepared',meta]]));}
export const loadNotebook=()=>access('notebook');
export const saveNotebook=notebook=>write([['notebook',notebook]]);
export function saveWorkspace(dataset,prior,notebook,{prepared=false}={}){const meta={version:PREPARED_VERSION,stamp:crypto.randomUUID()};if(prepared)return write([['previous',prior],['dataset',dataset],['notebook',notebook],['prepared',meta]]);const captured=structuredClone({prior,notebook});return writePrepared(prepareDataset(dataset).then(ready=>[['previous',captured.prior],['dataset',ready],['notebook',captured.notebook],['prepared',meta]]));}
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
