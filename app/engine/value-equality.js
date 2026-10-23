// Compare persisted JSON values without allocating full-document JSON strings.
// Missing/undefined object fields and null array slots follow JSON semantics.
const serializable=value=>value!==undefined&&typeof value!=='function'&&typeof value!=='symbol';
const arrayValue=value=>serializable(value)?value:null;
export function sameJSONValue(a,b){
 if(a===b)return true;
 if(typeof a==='number'&&!Number.isFinite(a))a=null;
 if(typeof b==='number'&&!Number.isFinite(b))b=null;
 if(a===b)return true;
 if(!a||!b||typeof a!=='object'||typeof b!=='object')return false;
 if(Array.isArray(a)||Array.isArray(b)){if(!Array.isArray(a)||!Array.isArray(b)||a.length!==b.length)return false;for(let i=0;i<a.length;i++)if(!sameJSONValue(arrayValue(a[i]),arrayValue(b[i])))return false;return true;}
 const plain=value=>{const prototype=Object.getPrototypeOf(value);return prototype===null||prototype===Object.prototype;};
 if(!plain(a)||!plain(b))return JSON.stringify(a)===JSON.stringify(b);
 const keys=Object.keys(a).filter(key=>serializable(a[key])),other=Object.keys(b).filter(key=>serializable(b[key]));
 return keys.length===other.length&&keys.every(key=>Object.hasOwn(b,key)&&serializable(b[key])&&sameJSONValue(a[key],b[key]));
}
