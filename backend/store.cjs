'use strict';
const {cos}=require('./tencent.cjs');
class COSStore{
 constructor({bucket=process.env.TRAINING_BUCKET,region=process.env.TRAINING_REGION||'ap-chengdu',auth}={}){if(!/^[a-z0-9-]+-\d+$/.test(bucket||''))throw new Error('STORE_NOT_CONFIGURED');this.host=bucket+'.cos.'+region+'.myqcloud.com';this.auth=auth;}
 async get(key){const r=await cos(this.host,'/training-v1/'+key,{auth:this.auth});if(r.status===404)return null;if(r.status!==200)throw new Error('STORE_UNAVAILABLE');return {value:JSON.parse(r.body),etag:r.headers.etag};}

 async create(key,value){const r=await cos(this.host,'/training-v1/'+key,{method:'PUT',body:JSON.stringify(value),headers:{'Content-Type':'application/json','x-cos-forbid-overwrite':'true'},auth:this.auth});if(r.status===409)return false;if(r.status!==200)throw new Error('STORE_UNAVAILABLE');return true;}

}
class MemoryStore{
 constructor(){this.data=new Map();}
 async get(key){const value=this.data.get(key);return value?{value:structuredClone(value.value),etag:String(value.version)}:null;}
 async create(key,value){if(this.data.has(key))return false;this.data.set(key,{value:structuredClone(value),version:1});return true;}
}
module.exports={COSStore,MemoryStore};
