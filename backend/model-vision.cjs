'use strict';
const {routes,modelProfile}=require('./model-control.cjs');
const MAX_IMAGE_CHARS=5200000,MAX_IMAGE_BYTES=3900000;
const ATTACHABLE=new Set(['chat-completions','responses','anthropic','gemini','codex']);
// Explicit known-model allowlist. Do not infer vision support from adapter
// family alone: many gpt-* models are text-only, and a relay may expose a
// model name that is not the same capability as the upstream model.
const VISION_MODELS=new Set([
 'gpt-4o','gpt-4o-mini','gpt-4.1','gpt-4.1-mini',
 'gpt-5.4','gpt-5.4-mini','gpt-5.5','gpt-5.6',
 'gpt-5.6-sol','gpt-5.6-terra','gpt-5.6-luna',
 'gpt-6-sol','gpt-6.1-sol','gpt-6-astra','gpt-6-luna'
]);
const VISION_NAME=/(?:^|[-_/])vision(?:$|[-_/])/i;
const IMAGE_MENTION=/(?:^|[^a-z])(?:images?|imageurl|vision|visuals?|multimodal|media)(?:[^a-z]|$)|inlineData/i;
const IMAGE_REJECTION=/(?:not[\s_-]+(?:supported|allowed|permitted|available|recognized|accepted|valid)|not[\s_-]+a[\s_-]+valid|unsupported|invalid|unrecognized|unknown|too[\s_-]+large|exceed(?:s|ed)?|limit|only[\s_-]+support(?:ed)?|must[\s_-]+be|requires?|required|cannot|can't|does[\s_-]+not|doesn't|unable)/i;
function explicitFlag(g={}){
 for(const value of [g.vision,g.capabilities?.vision,g.adapterProfile?.vision,g.adapterProfile?.capabilities?.vision])if(value===true||value===false)return value;
 return undefined;
}
function supportsImage(g={}){
 const protocol=g?.protocol||routes[g?.provider]?.protocol;
 if(!ATTACHABLE.has(protocol))return false;
 const explicit=explicitFlag(g);
 if(explicit!==undefined)return explicit;
 const profile={...(modelProfile(g?.provider,g?.model)||{}),...(g?.adapterProfile||{})};
 const profileFlag=profile.capabilities?.vision??profile.vision;
 if(profileFlag===true)return true;
 if(profileFlag===false)return false;
 const model=String(g?.model||'');
 if(protocol==='gemini')return /(?:^|\/)gemini[-.]/i.test(model);
 if(protocol==='anthropic')return /(?:^|\/)claude[-.]/i.test(model);
 return VISION_MODELS.has(model)||VISION_NAME.test(model);
}
// Only an explicit 400/415/422 rejection of image input may degrade to a
// brief review. Network loss, 5xx, timeouts and unknown 4xx must propagate:
// retrying them would hide a broken stream and may repeat a billed call.
function imageRejection(error){
 const status=error?.diagnostic?.status??error?.status;
 if(![400,415,422].includes(status))return null;
 const message=String(error?.diagnostic?.message||error?.message||'');
 if(!IMAGE_MENTION.test(message)||!IMAGE_REJECTION.test(message))return null;
 return {code:'VISION_INPUT_UNSUPPORTED',status};
}
function imageData(image){
 if(!image||!['image/png','image/jpeg'].includes(image.mime)||typeof image.data!=='string'||image.data.length>MAX_IMAGE_CHARS||image.data.length%4||!/^[A-Za-z0-9+/]*={0,2}$/.test(image.data))throw Error('IMAGE_RESPONSE_INVALID');
 const raw=Buffer.from(image.data,'base64');
 if(raw.length<33||raw.length>MAX_IMAGE_BYTES||image.mime==='image/png'&&raw.subarray(0,8).toString('hex')!=='89504e470d0a1a0a'||image.mime==='image/jpeg'&&raw.subarray(0,3).toString('hex')!=='ffd8ff')throw Error('IMAGE_RESPONSE_INVALID');
 // The original bytes are passed through unchanged; never re-encode or resize.
 return 'data:'+image.mime+';base64,'+image.data;
}
function attachImage(body,protocol,image){
 const url=imageData(image);
 if(protocol==='chat-completions'){
  const user=body.messages.findLast(m=>m.role==='user');user.content=[{type:'text',text:user.content},{type:'image_url',image_url:{url,detail:'high'}}];
 }else if(protocol==='responses')body.input.findLast(m=>m.role==='user').content.push({type:'input_image',image_url:url,detail:'high'});
 else if(protocol==='anthropic')body.messages.findLast(m=>m.role==='user').content.push({type:'image',source:{type:'base64',media_type:image.mime,data:image.data}});
 else if(protocol==='gemini')body.contents.at(-1).parts.push({inlineData:{mimeType:image.mime,data:image.data}});
 else throw Error('MODEL_VISION_UNSUPPORTED');
 return body;
}
module.exports={supportsImage,imageData,attachImage,imageRejection,MAX_IMAGE_CHARS,MAX_IMAGE_BYTES};
