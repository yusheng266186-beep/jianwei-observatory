'use strict';
const http=require('node:http'),crypto=require('node:crypto');
const {COSStore}=require('./store.cjs'),{hash}=require('./tencent.cjs'),{loadContract}=require('./generator.cjs');
const version='training-v1',uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const error=(status,code)=>Object.assign(new Error(code),{status});
const safeEqual=(a,b)=>{a=Buffer.from(String(a));b=Buffer.from(String(b));return a.length===b.length&&crypto.timingSafeEqual(a,b);};
function read(req){return new Promise((resolve,reject)=>{let size=0,chunks=[];req.on('data',c=>{size+=c.length;if(size>24000){reject(error(413,'REQUEST_TOO_LARGE'));req.destroy();}else chunks.push(c);});req.on('end',()=>{try{resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')||'{}'));}catch{reject(error(400,'INVALID_JSON'));}});req.on('error',reject);});}
function createServer({store=new COSStore(),env=process.env,now=Date.now,dispatch=async()=>{}}={}){
 const origins=(env.TRAINING_ORIGINS||'https://yusheng266186-beep.github.io').split(','),secret=env.TRAINING_SESSION_SECRET,codeHash=env.TRAINING_TEACHER_CODE_HASH,owner=secret?hash(secret).slice(0,32):'',attempts=new Map();
 if(!secret||secret.length<32||!/^[a-f0-9]{64}$/.test(codeHash||''))throw new Error('AUTH_NOT_CONFIGURED');
 const sign=body=>crypto.createHmac('sha256',secret).update(body).digest('base64url');
 const authenticate=req=>{const token=(req.headers.authorization||'').replace(/^Bearer /,''),[payload,signature]=token.split('.');if(!payload||!signature||!safeEqual(sign(payload),signature))throw error(401,'AUTH_REQUIRED');let data;try{data=JSON.parse(Buffer.from(payload,'base64url'));}catch{throw error(401,'AUTH_REQUIRED');}if(data.owner!==owner||data.expires<now())throw error(401,'AUTH_EXPIRED');return data;};
 const server=http.createServer(async(req,res)=>{
  const origin=req.headers.origin||'',allowed=!origin||origins.includes(origin);const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer',...(origin&&allowed?{'Access-Control-Allow-Origin':origin,Vary:'Origin','Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type, Authorization, X-Request-ID','Access-Control-Max-Age':'600'}:{})};
  const send=(status,data)=>{if(res.destroyed||res.writableEnded)return;res.writeHead(status,headers);res.end(JSON.stringify(data));};
  try{
   if(!allowed)throw error(403,'ORIGIN_REJECTED');if(req.method==='OPTIONS')return send(204,{});
   const url=new URL(req.url,'https://service.local');
   if(req.method==='GET'&&url.pathname==='/health')return send(200,{version,model:'gemini-3.8-flash',subject:'数学'});
   if(req.method==='POST'&&url.pathname==='/session'){
    const ip=req.socket.remoteAddress||'',window=Math.floor(now()/60000),prior=attempts.get(ip)||{window,count:0};if(prior.window!==window)prior.count=0;prior.window=window;prior.count++;attempts.set(ip,prior);if(attempts.size>256)attempts.clear();if(prior.count>10)throw error(429,'AUTH_RATE_LIMIT');const input=await read(req);if(typeof input.code!=='string'||input.code.length>200||!safeEqual(hash(input.code.trim()),codeHash))throw error(401,'AUTH_INVALID');const expires=now()+7*86400000,payload=Buffer.from(JSON.stringify({owner,expires})).toString('base64url');return send(200,{token:payload+'.'+sign(payload),expires});
   }
   authenticate(req);
   if(req.method==='POST'&&url.pathname==='/jobs'){
    const id=String(req.headers['x-request-id']||'');if(!uuid.test(id))throw error(400,'REQUEST_ID_REQUIRED');const {validateExerciseRequest}=await loadContract();let input;try{input=validateExerciseRequest(await read(req));}catch{throw error(400,'TRAINING_INPUT_INVALID');}const fingerprint=hash(JSON.stringify(input)),key='jobs/'+owner+'/'+id;let saved=await store.get(key+'/meta.json');
    if(saved&&saved.value.fingerprint!==fingerprint)throw error(409,'REQUEST_ID_CONFLICT');
    const createdAt=saved?.value.createdAt||now();if(saved&&saved.value.deadline<now())throw error(409,'JOB_EXPIRED');
    const date=new Date(createdAt+8*3600000).toISOString().slice(0,10),limit=Number(env.TRAINING_DAILY_LIMIT||30);let reserved=false;
    for(let slot=0;slot<limit;slot++){const quotaKey='budget/'+owner+'/'+date+'/'+slot+'.json',old=await store.get(quotaKey);if(old){if(old.value.id===id){reserved=true;break;}continue;}if(await store.create(quotaKey,{id})){reserved=true;break;}if((await store.get(quotaKey))?.value.id===id){reserved=true;break;}}
    if(!reserved)throw error(429,'DAILY_LIMIT');
    if(!saved){const created=await store.create(key+'/meta.json',{id,fingerprint,input,status:'queued',createdAt,deadline:createdAt+600000});saved=await store.get(key+'/meta.json');if(saved.value.fingerprint!==fingerprint)throw error(409,'REQUEST_ID_CONFLICT');if(created)await dispatch(key);}
    return send(202,{id,status:'queued',createdAt:saved.value.createdAt});
   }
   const match=url.pathname.match(/^\/jobs\/([a-f0-9-]+)$/);if(req.method==='GET'&&match&&uuid.test(match[1])){const key='jobs/'+owner+'/'+match[1],record=await store.get(key+'/meta.json');if(!record)throw error(404,'JOB_NOT_FOUND');const result=await store.get(key+'/result.json'),run=await store.get(key+'/run.json'),deadline=run?run.value.startedAt+450000:record.value.deadline+15000,expired=deadline<now();const output=result?.value||{status:expired?'failed':run?'running':'queued',...(expired?{error:'JOB_EXPIRED'}:{})};return send(200,{id:match[1],createdAt:record.value.createdAt,...output});}
   throw error(404,'NOT_FOUND');
  }catch(e){send(e.status||503,{error:e.status?e.message:'SERVICE_UNAVAILABLE'});}
 });
 server.requestTimeout=20000;server.headersTimeout=15000;return server;
}
if(require.main===module)createServer().listen(Number(process.env.PORT||9000),'0.0.0.0');
module.exports={createServer};
