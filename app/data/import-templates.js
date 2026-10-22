import {FLAT_FIELDS} from './parser.js';
const fields=FLAT_FIELDS.map(([key])=>key);
const headersOf=headers=>Array.isArray(headers)?headers.map(h=>String(h??'').trim()):[];
export function validImportMapping(headers,mapping){
 if(!mapping||typeof mapping!=='object')return null;
 const result={};for(const key of fields){const n=mapping[key];if(n==null||n==='')result[key]=null;else if(Number.isInteger(n)&&n>=0&&n<headers.length)result[key]=n;else return null;}
 if(result.name==null||result.classNo==null||result.name===result.classNo)return null;
 return result;
}
export function importTemplates(rows){
 const result=[];for(const row of Array.isArray(rows)?rows:[]){const headers=headersOf(row?.headers),mapping=validImportMapping(headers,row?.mapping);if(!headers.length||headers.length>300||headers.some(h=>h.length>300)||!mapping)continue;
 const id=JSON.stringify(headers);if(result.some(r=>r.id===id))continue;
 result.push({id,headers,mapping,name:String(row.name||'常用成绩表').slice(0,80),updatedAt:Number.isFinite(row.updatedAt)?row.updatedAt:0});}
 return result.sort((a,b)=>b.updatedAt-a.updatedAt).slice(0,20);
}
export function matchImportTemplate(rows,headers){const id=JSON.stringify(headersOf(headers));return importTemplates(rows).find(r=>r.id===id)||null;}
export function saveImportTemplate(rows,{headers,mapping,name,now=Date.now()}){
 const clean=headersOf(headers),valid=validImportMapping(clean,mapping);if(!valid)throw new Error('请为姓名与班级选择不同的有效列');
 const item={headers:clean,mapping:valid,name:String(name||'常用成绩表').replace(/\.(xlsx|xls|csv)$/i,'').slice(0,80),updatedAt:now};
 return importTemplates([item,...importTemplates(rows).filter(r=>r.id!==JSON.stringify(clean))]);
}
export function mergeImportTemplates(current,incoming){return importTemplates([...importTemplates(current),...importTemplates(incoming)].sort((a,b)=>b.updatedAt-a.updatedAt));}
