'use strict';
const {adaptModelBody}=require('./model-adapter.cjs'),{withProxy}=require('./openai-proxy.cjs'),{credentials}=require('./openai-credentials.cjs');
async function complete(prompt,generation,{probe=false,onProgress,signal,getCredentials=credentials,network=withProxy}={}){
 const {routes,connectionMatches}=require('./model-control.cjs');if(generation.provider!=='openai-chatgpt'||!connectionMatches(generation)||!routes[generation.provider])throw Error('MODEL_NOT_CONFIGURED');
 let c=await getCredentials();if(!require('./openai-credentials.cjs').validCredentials(c))throw Error('MODEL_AUTH_FAILED');
 const body=adaptModelBody({messages:[{role:'system',content:prompt.system},{role:'user',content:JSON.stringify(prompt.input)}],effort:generation.effort},{name:generation.provider,model:generation.model},generation.effort,{profile:generation.adapterProfile,probe});
 if(prompt.image)require('./model-vision.cjs').attachImage(body,'responses',prompt.image);
 for(let attempt=0;;attempt++){
 const reader=require('./stream-reader.cjs').createStreamReader('responses'),progress=onProgress?require('./progress.cjs').streamProgress('responses',onProgress):null;
 const result=await network(async transport=>{const response=await transport('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:'Bearer '+c.access_token,'Content-Type':'application/json'},body:JSON.stringify(body),timeout:probe?45000:840000,deadlineMs:probe?45000:840000,maxBytes:64*1024*1024,collectBody:false,signal,onChunk:chunk=>{reader.write(chunk);progress?.(chunk);}});const completion=require('./model-completion.cjs');if(response.status===401&&attempt===0)return null;if(response.status!==200)throw completion.upstreamError(response,c.access_token);return {...completion.parseResponse(reader.received?{...response,body:reader.finish()}:response,'responses',{key:c.access_token}),model:generation.model,provider:generation.provider,reasoningEffort:generation.reasoningEffort};});
 if(result)return result;const fresh=await getCredentials({rejectedToken:c.access_token});if(!require('./openai-credentials.cjs').validCredentials(fresh)||fresh.access_token===c.access_token)throw Error('MODEL_AUTH_FAILED');c=fresh;
 }
}
module.exports={complete};
