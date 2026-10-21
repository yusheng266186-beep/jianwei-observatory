'use strict';
const https=require('node:https'),dns=require('node:dns'),net=require('node:net');
const {request}=require('./tencent.cjs'),candidates=require('./image-candidate.cjs');
// Leave response/store headroom while accepting full 2048px provider PNGs.
const IMAGE_MAX_CHARS=5200000,IMAGE_MAX_BYTES=IMAGE_MAX_CHARS/4*3;
// Exact Cloudflare R2 bucket host returned by the native images/generations
// endpoint. Never widen this to *.r2.dev or any other wildcard.
// Exact delivery host observed in the configured Cheetah Image 2 response.
// Public-address lookup and TLS validation still apply; no redirects or keys.
const CHEETAH_IMAGE_HOST='nx1.cc2api.xyz';
const R2_IMAGE_HOST='pub-13fd1d3607a441b4a9d232b3a223f5f6.r2.dev';
const IMAGE_HOSTS=['www.bytecatcode.org','bytecatcode.org','files.oaiusercontent.com','oaidalleapiprodscus.blob.core.windows.net','pre-signed-firefly-prod.s3-accelerate.amazonaws.com',R2_IMAGE_HOST,CHEETAH_IMAGE_HOST];
const CANDIDATE_URL_MAX_CHARS=8192;
const RETRYABLE_STATUS=new Set([408,425,429,500,502,503,504]);
const EXPIRED_STATUS=new Set([400,401,403,404,410]);
const NETWORK_CODES=new Set(['NETWORK_TIMEOUT','NETWORK_INTERRUPTED','ETIMEDOUT','ECONNRESET','EPIPE','EAI_AGAIN','ENOTFOUND','ECONNREFUSED','EHOSTUNREACH','ENETUNREACH']);
function responseImage(body){
 let data;try{data=JSON.parse(body);}catch{
  const chunks=body.split(/\r?\n/).filter(line=>line.startsWith('data:')).map(line=>line.slice(5).trim()).filter(line=>line&&line!=='[DONE]');let content='',images=[];for(const chunk of chunks){let event;try{event=JSON.parse(chunk);}catch{continue;}if(event.error)throw new Error('IMAGE_REQUEST_FAILED');const delta=event.choices?.[0]?.delta||event.choices?.[0]?.message;if(typeof delta?.content==='string')content+=delta.content;if(Array.isArray(delta?.images))images.push(...delta.images);}data={choices:[{message:{content,images}}]};
 }
 if(!data||typeof data!=='object')throw new Error('IMAGE_RESPONSE_INVALID');
 if(data.error)throw new Error(/model not found|model_not_found/i.test(String(data.error.message||data.error.code))?'IMAGE_UNAVAILABLE':'IMAGE_REQUEST_FAILED');
 const message=data.choices?.[0]?.message,candidates=[];
 for(const part of Array.isArray(data.data)?data.data:[]){if(typeof part?.b64_json==='string')candidates.push('data:image/png;base64,'+part.b64_json);if(typeof part?.url==='string')candidates.push(part.url);}
 for(const part of [...(Array.isArray(message?.content)?message.content:[]),...(Array.isArray(message?.images)?message.images:[])]){const url=part.image_url?.url||part.image_url||part.url;if(typeof url==='string')candidates.push(url);}
 if(typeof message?.content==='string'){
  const text=message.content;for(const match of text.matchAll(/data:image\/(?:png|jpeg);base64,[A-Za-z0-9+/=]+/g))candidates.push(match[0]);
  for(const match of text.matchAll(/!\[[^\]]*\]\((https:\/\/[^\s)]+)\)/g))candidates.push(match[1]);
  if(/^https:\/\/\S+$/.test(text.trim()))candidates.push(text.trim());
 }
 const candidate=candidates.find(s=>/^data:image\/(?:png|jpeg);base64,/.test(s))||candidates.find(s=>s.startsWith('https://'));if(!candidate)throw new Error('IMAGE_RESPONSE_INVALID');return candidate;
}
function dataImage(value){const match=typeof value==='string'?/^data:(image\/(?:png|jpeg));base64,([A-Za-z0-9+/=]+)$/.exec(value):null;return match?{mime:match[1],data:match[2]}:null;}
// Basic URL shape that may be kept in a private candidate checkpoint. This
// grants no download permission: the exact host allowlist is applied by
// imageUrl() immediately before every request. Only HTTPS without credentials
// or a custom port, and within a bounded length, qualifies for persistence.
function candidateUrl(value){
 if(typeof value!=='string'||!value||value.length>CANDIDATE_URL_MAX_CHARS||/[\u0000-\u0020\u007f]/.test(value))throw new Error('IMAGE_URL_REJECTED');
 let url;try{url=new URL(value);}catch{throw new Error('IMAGE_URL_REJECTED');}
 if(url.protocol!=='https:'||url.username||url.password||url.port||!url.hostname)throw new Error('IMAGE_URL_REJECTED');
 return url;
}
// Strict host allowlist. Credentials, ports and non-HTTPS schemes are rejected
// before a request is made; no redirect is followed anywhere in this module.
function imageUrl(value){
 const url=candidateUrl(value);
 if(!IMAGE_HOSTS.includes(url.hostname))throw new Error('IMAGE_URL_REJECTED');
 return url;
}
function jpegDimensions(bytes){
 let offset=2;
 while(offset+3<bytes.length){
  if(bytes[offset]!==0xff){offset++;continue;}
  let marker=bytes[offset+1];
  while(marker===0xff&&offset+2<bytes.length){offset++;marker=bytes[offset+1];}
  if(marker===0xd8||marker===0x01||(marker>=0xd0&&marker<=0xd7)){offset+=2;continue;}
  if(marker===0xd9||marker===0xda)break;
  if(offset+4>bytes.length)break;
  const length=bytes.readUInt16BE(offset+2);
  if(length<2||offset+2+length>bytes.length)break;
  if([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker)){
   if(offset+9>bytes.length)break;
   return {height:bytes.readUInt16BE(offset+5),width:bytes.readUInt16BE(offset+7)};
  }
  offset+=2+length;
 }
 return null;
}
function validateImage(image){
 const bytes=Buffer.from(image.data,'base64'),invalid=stage=>Object.assign(new Error('IMAGE_RESPONSE_INVALID'),{imageDiagnostic:{stage,imageBytes:bytes.length,mime:/^image\/[a-z0-9.+-]+$/.test(image.mime||'')?image.mime:'other'}});if(bytes.length<33||image.data.length>IMAGE_MAX_CHARS)throw invalid('image-size');
 if(image.mime==='image/png'){if(bytes.subarray(0,8).toString('hex')!=='89504e470d0a1a0a'||bytes.toString('ascii',12,16)!=='IHDR')throw invalid('png-signature');const w=bytes.readUInt32BE(16),h=bytes.readUInt32BE(20);if(w<64||h<64||w>4096||h>4096)throw invalid('png-dimensions');}
 else if(image.mime==='image/jpeg'){if(bytes[0]!==255||bytes[1]!==216||bytes[2]!==255)throw invalid('image-signature');const size=jpegDimensions(bytes);if(!size||size.width<64||size.height<64||size.width>4096||size.height>4096)throw invalid('jpeg-dimensions');}
 else throw invalid('image-signature');return image;
}
function isPublicAddress(address){
 const family=net.isIP(address);if(!family)return false;
 if(family===4){
  const p=address.split('.').map(Number);
  if(p.some(n=>!Number.isInteger(n)||n<0||n>255))return false;
  if(p[0]===0||p[0]===10||p[0]===127||p[0]>=224)return false;
  if(p[0]===100&&p[1]>=64&&p[1]<=127)return false;
  if(p[0]===169&&p[1]===254)return false;
  if(p[0]===172&&p[1]>=16&&p[1]<=31)return false;
  if(p[0]===192&&p[1]===168)return false;
  if(p[0]===192&&p[1]===0&&[0,2].includes(p[2]))return false;
  if(p[0]===198&&(p[1]===18||p[1]===19))return false;
  if(p[0]===198&&p[1]===51&&p[2]===100)return false;
  if(p[0]===203&&p[1]===0&&p[2]===113)return false;
  if(p[0]===255&&p[1]===255&&p[2]===255&&p[3]===255)return false;
  return true;
 }
 const value=address.toLowerCase();
 if(value.includes('%'))return false;
 if(value==='::'||value==='::1')return false;
 if(value.startsWith('::ffff:'))return false;
 const first=parseInt(value.split(':')[0],16);
 // Only global unicast 2000::/3 is acceptable for object storage. This
 // rejects IPv4-mapped/compatible forms, ULA, link-local and multicast.
 if(!(first>=0x2000&&first<=0x3fff)||/^2001:db8:/.test(value))return false;
 return true;
}
// DNS rebinding guard: the allowlisted hostname is resolved here, and every
// answer must be a public unicast address before the TLS connection starts.
function guardedLookup(hostname,options,callback){
 dns.lookup(hostname,{...options,all:true,order:'verbatim'},(error,addresses)=>{
  if(error)return callback(error);
  const list=(Array.isArray(addresses)?addresses:[]).filter(item=>item&&item.address);
  if(!list.length||list.some(item=>!isPublicAddress(item.address)))return callback(Object.assign(new Error('IMAGE_HOST_REJECTED'),{code:'IMAGE_HOST_REJECTED'}));
  if(options?.all)return callback(null,list);
  return callback(null,list[0].address,list[0].family);
 });
}
function pause(ms,{signal}={}){
 return new Promise((resolve,reject)=>{
  if(!ms)return resolve();
  const timer=setTimeout(()=>{cleanup();resolve();},ms),abort=()=>{clearTimeout(timer);cleanup();reject(new Error('JOB_CANCELLED'));},cleanup=()=>signal?.removeEventListener('abort',abort);
  if(signal){if(signal.aborted)return abort();signal.addEventListener('abort',abort,{once:true});}
 });
}
async function checkStop({signal,isRemoved}={}){
 if(signal?.aborted)throw new Error('JOB_CANCELLED');
 if(isRemoved&&await isRemoved())throw new Error('JOB_CANCELLED');
}
function downloadImage(url,{signal}={}){
 return new Promise((resolve,reject)=>{
  const target=imageUrl(url);let settled=false,req,abort;
  const finish=(error,result)=>{if(settled)return;settled=true;if(abort)signal?.removeEventListener('abort',abort);if(error)reject(error);else resolve(result);};
  try{
   // No upstream credential is ever forwarded to the object storage host.
   req=https.get(target,{lookup:guardedLookup},res=>{
    const chunks=[];let bytes=0;
    res.on('data',chunk=>{bytes+=chunk.length;if(bytes>IMAGE_MAX_BYTES){res.destroy();finish(Object.assign(new Error('IMAGE_RESPONSE_INVALID'),{imageDiagnostic:{stage:'download-size',imageBytes:bytes}}));return;}chunks.push(chunk);});
    res.on('end',()=>finish(null,{status:res.statusCode,mime:String(res.headers['content-type']||'').split(';')[0].trim().toLowerCase(),bytes:Buffer.concat(chunks)}));
    res.on('error',finish);res.on('aborted',()=>finish(new Error('NETWORK_INTERRUPTED')));
   });
  }catch(error){return finish(error);}
  req.setTimeout(45000,()=>req.destroy(new Error('NETWORK_TIMEOUT')));req.on('error',finish);
  if(signal){abort=()=>req.destroy(new Error('JOB_CANCELLED'));if(signal.aborted){abort();return;}signal.addEventListener('abort',abort,{once:true});}
 });
}
function networkError(error,attempts){
 if(error?.message==='JOB_CANCELLED')return error;
 const code=error?.code||error?.message;
 if(!NETWORK_CODES.has(code))return error;
 const normalized=new Error(code==='NETWORK_TIMEOUT'?'NETWORK_TIMEOUT':'IMAGE_REQUEST_FAILED');
 normalized.diagnostic={kind:'image-download',attempts,retryable:true,network:code};
 return normalized;
}
async function downloadRemote(value,{download=downloadImage,downloadAttempts=3,downloadDelayMs=500,sleep=pause,signal,isRemoved,classifyExpired=false}={}){
 const url=imageUrl(value),attempts=Math.max(1,Math.min(5,Number.isInteger(downloadAttempts)?downloadAttempts:3)),delay=Math.max(0,Math.min(10000,Number.isFinite(downloadDelayMs)?downloadDelayMs:500));
 let last;
 for(let attempt=1;attempt<=attempts;attempt++){
  await checkStop({signal,isRemoved});
  try{
   const result=signal?await download(url.href,{signal}):await download(url.href);
   if(!result||typeof result!=='object')throw new Error('IMAGE_REQUEST_FAILED');
   if(result.status===200){
    if(!Buffer.isBuffer(result.bytes)&&!(result.bytes instanceof Uint8Array))throw new Error('IMAGE_RESPONSE_INVALID');
    return {...result,attempts:attempt};
   }
   const expired=EXPIRED_STATUS.has(result.status),retryable=RETRYABLE_STATUS.has(result.status);
   const error=new Error(classifyExpired&&expired?'IMAGE_CANDIDATE_EXPIRED':'IMAGE_REQUEST_FAILED');
   error.diagnostic={kind:'image-download',status:result.status,attempts:attempt,retryable,...(classifyExpired&&expired?{expired:true}:{})};
   if(!retryable||attempt===attempts)throw error;
   last=error;
  }catch(error){
   const normalized=error?.diagnostic?.kind==='image-download'?error:networkError(error,attempt);
   if(normalized?.message==='JOB_CANCELLED')throw normalized;
   if(normalized?.diagnostic?.kind!=='image-download')throw normalized;
   if(!normalized.diagnostic.retryable||attempt===attempts)throw normalized;
   last=normalized;
  }
  if(attempt<attempts)await sleep(delay*attempt,{signal});
 }
 throw last||new Error('IMAGE_REQUEST_FAILED');
}
function imageFromDownload(result){return validateImage({mime:String(result?.mime||'').split(';')[0].trim().toLowerCase(),data:Buffer.from(result.bytes).toString('base64')});}
async function imageFromResult(result,{download,downloadAttempts,downloadDelayMs,sleep,signal,isRemoved}={}){
 const data=dataImage(result);if(data)return validateImage(data);
 const url=imageUrl(result);if(!download)throw new Error('IMAGE_RESPONSE_INVALID');
 return imageFromDownload(await downloadRemote(url.href,{download,downloadAttempts,downloadDelayMs,sleep,signal,isRemoved,classifyExpired:false}));
}
function decorateUpstream(error,response){
 if(error?.diagnostic?.kind==='image-candidate'||error?.diagnostic?.kind==='image-download')return error;
 let data;try{data=JSON.parse(response.body);}catch{}const native=Array.isArray(data?.data)?data.data:[],detail=error.imageDiagnostic;delete error.imageDiagnostic;
 error.diagnostic={kind:'image-response',status:response.status,nativeImages:native.length,hasChatMessage:!!data?.choices?.[0]?.message,imageHosts:native.slice(0,2).flatMap(p=>{try{return typeof p?.url==='string'?[new URL(p.url).hostname]:[];}catch{return [];}}),base64Chars:native.reduce((n,p)=>n+(typeof p?.b64_json==='string'?p.b64_json.length:0),0),...(detail?{image:detail}:{})};
 return error;
}
async function downloadAndValidate(url,options){return imageFromDownload(await downloadRemote(url.href,{...options,classifyExpired:true}));}
function unusableReason(error){return Number.isInteger(error?.diagnostic?.status)?'HTTP_'+error.diagnostic.status:'EXPIRED';}
async function deliverGenerated(result,{context,regenerate,download,downloadAttempts,downloadDelayMs,sleep,signal,isRemoved}={}){
 const data=dataImage(result);
 if(data){
  const image=validateImage(data);
  if(context)try{await candidates.save(context,{source:'data',...data},{regenerate});}catch{}
  return image;
 }
 const url=candidateUrl(result);let saved=null,saveError=null;
 // Persist the provider's original URL before any host/download check. An
 // unknown CDN must never discard the only paid artifact; saving here only
 // keeps a bounded HTTPS URL in the private candidate prefix.
 if(context){try{saved=await candidates.save(context,{source:'url',url:url.href},{regenerate});}catch(error){saveError=error;}}
 const downloadOptions={download,downloadAttempts,downloadDelayMs,sleep,signal,isRemoved};
 try{return await downloadAndValidate(imageUrl(url.href),downloadOptions);}
 catch(error){
  if(error?.message==='JOB_CANCELLED')throw error;
  if(error?.message==='IMAGE_CANDIDATE_EXPIRED'&&saved)await candidates.markUnusable(context,saved.slot,{reason:unusableReason(error),status:error.diagnostic?.status,attempts:error.diagnostic?.attempts});
  if(saveError){
   const combined=candidates.storeFailure('write');
   combined.diagnostic.download=error?.diagnostic?.kind==='image-download'?{kind:'image-download',status:error.diagnostic.status,retryable:error.diagnostic.retryable}:{kind:'image-download'};
   throw combined;
  }
  if(saved&&error?.diagnostic?.kind==='image-download')error.diagnostic.resumeAvailable=true;
  throw error;
 }
}
async function deliverCandidate(found,{context,...options}={}){
 const record=found.record;
 if(record.source==='data')return validateImage({mime:record.mime,data:record.data});
 const url=imageUrl(record.url);
 try{return await downloadAndValidate(url,options);}
 catch(error){
  if(error?.message==='IMAGE_CANDIDATE_EXPIRED')await candidates.markUnusable(context,found.slot,{reason:unusableReason(error),status:error.diagnostic?.status,attempts:error.diagnostic?.attempts});
  else if(error?.diagnostic?.kind==='image-download')error.diagnostic.resumeAvailable=true;
  throw error;
 }
}
async function generateIllustration(diagram,{key,model,generation,transport=request,download=downloadImage,layout,store,owner,job,jobKey,request:requestDescriptor,regenerate=false,signal,isRemoved,downloadAttempts,downloadDelayMs,sleep,feedback}={}){
 const imageProviders=require('./image-providers.cjs'),profile=generation||imageProviders.snapshot();if(!imageProviders.connectionMatches(profile))throw Error('IMAGE_NOT_CONFIGURED');key=key||process.env[profile.credentialRef];model=model||profile.model;
 const context=candidates.context({store,owner,job,jobKey,request:requestDescriptor,provider:profile.provider,model,diagram,layout});
 await checkStop({signal,isRemoved});
 if(context){
  const found=await candidates.latest(context);
  if(found?.unusable&&!regenerate)throw candidates.expiredError(found);
  if(found&&!regenerate)return deliverCandidate(found,{context,download,downloadAttempts,downloadDelayMs,sleep,signal,isRemoved});
 }
 // Recovery never needs the provider key; only a fresh paid call does.
 if(!key||!['gpt-image-2','gpt-image-2.5'].includes(model))throw new Error('IMAGE_NOT_CONFIGURED');
 const prompt=require('./figure-prompt-guidance.cjs').illustrationPrompt(diagram,{layout,feedback});
 // ByteCat's web reverse image group exposes Chat Completions, not native Images.
 const native=profile.protocol==='native-image',response=await transport(profile.base+(native?'/images/generations':'/chat/completions'),{method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify(native?{model,prompt,n:1,size:({wide:'1536x1024',portrait:'1024x1536',square:'1024x1024'}[layout?.aspect]||'1024x1024'),quality:'high',output_format:'png'}:{model,messages:[{role:'user',content:prompt}],stream:false}),timeout:600000,deadlineMs:600000,maxBytes:8*1024*1024,signal});
 try{
  if(response.status!==200)throw new Error(response.status===429?'IMAGE_RATE_LIMIT':[401,403].includes(response.status)?'IMAGE_AUTH_FAILED':'IMAGE_REQUEST_FAILED');
  const result=responseImage(response.body);
  await checkStop({signal,isRemoved});
  return await deliverGenerated(result,{context,regenerate,download,downloadAttempts,downloadDelayMs,sleep,signal,isRemoved});
 }catch(error){throw decorateUpstream(error,response);}
}
// Download-only recovery. Never calls the paid generation endpoint, so a
// failed download can be retried without another charge. Missing candidates
// and expired URLs are explicit outcomes for the caller to surface to a user.
async function resumeIllustration(diagram,{generation,layout,store,owner,job,jobKey,request:requestDescriptor,download=downloadImage,signal,isRemoved,downloadAttempts,downloadDelayMs,sleep}={}){
 const imageProviders=require('./image-providers.cjs'),fallback=imageProviders.snapshot(),profile=generation||fallback;
 // Download-only recovery accepts a frozen/partial selection: it must keep
 // working even when the generation credential has been rotated or removed.
 const context=candidates.context({store,owner,job,jobKey,request:requestDescriptor,provider:profile.provider||fallback.provider,model:profile.model||fallback.model,diagram,layout});
 if(!context)throw new Error('IMAGE_CANDIDATE_CONTEXT_REQUIRED');
 await checkStop({signal,isRemoved});
 const found=await candidates.latest(context);
 if(!found)throw new Error('IMAGE_CANDIDATE_MISSING');
 if(found.unusable)throw candidates.expiredError(found);
 return deliverCandidate(found,{context,download,downloadAttempts,downloadDelayMs,sleep,signal,isRemoved});
}
async function candidateStatus(diagram,{generation,layout,store,owner,job,jobKey,request:requestDescriptor}={}){
 if(!store)return {exists:false};
 const imageProviders=require('./image-providers.cjs'),fallback=imageProviders.snapshot(),profile=generation||fallback;
 const context=candidates.context({store,owner,job,jobKey,request:requestDescriptor,provider:profile.provider||fallback.provider,model:profile.model||fallback.model,diagram,layout});
 return candidates.status(await candidates.latest(context));
}
module.exports={generateIllustration,resumeIllustration,candidateStatus,responseImage,imageFromResult,downloadImage,isPublicAddress,IMAGE_HOSTS,IMAGE_MAX_CHARS,IMAGE_MAX_BYTES};
