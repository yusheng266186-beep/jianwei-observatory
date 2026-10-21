'use strict';
// HTTP 200 can still carry a provider error as a JSON envelope or an SSE event.
// Keep a small, pure-data diagnostic so the failure is diagnosable later without
// retaining the response, prompt, request body, credentials or private URLs.
const MAX_MESSAGE=4000,MAX_FIELD=160;
function text(value){return value===undefined||value===null?'':String(value);}
function redactSecrets(value,key){
 let out=text(value);
 const secret=text(key);
 if(secret)out=out.split(secret).join('[REDACTED]');
 out=out.replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi,'Bearer [REDACTED]');
 out=out.replace(/\bsk[-_][A-Za-z0-9_-]+/gi,'sk-[REDACTED]');
 out=out.replace(/https?:\/\/[^\s"'<>]+/gi,'[URL]');
 return out;
}
function field(value,key,limit=MAX_FIELD){
 const out=redactSecrets(value,key).replace(/[\u0000-\u001f\u007f]+/g,' ').replace(/\s+/g,' ').trim();
 return out?out.slice(0,limit):'';
}
function inspectEvent(event,key){
 const data=event&&typeof event==='object'?event:{};
 const error=data.error&&typeof data.error==='object'?data.error:{};
 const response=data.response&&typeof data.response==='object'?data.response:{};
 const nested=response.error&&typeof response.error==='object'?response.error:{};
 const eventType=field(data.type,key,80);
 const upstreamType=field(error.type||nested.type||(typeof error.status==='string'?error.status:'')||(typeof data.status==='string'&&!['failed','incomplete'].includes(data.status)?data.status:'')||(typeof data.error==='string'?data.error:''),key,120);
 const code=field(error.code!==undefined?error.code:nested.code!==undefined?nested.code:data.code!==undefined?data.code:(typeof error.status==='number'?error.status:''),key,120);
 const message=field(error.message||nested.message||data.message||data.error_description||(typeof data.error==='string'?data.error:''),key,MAX_MESSAGE);
 const param=field(error.param||nested.param||data.param,key,120);
 const reason=field(response.incomplete_details?.reason||data.incomplete_details?.reason||nested.reason||data.reason||data.delta?.stop_reason,key,120);
 const numericStatus=[error.status,data.status,nested.status,response.status].find(value=>Number.isInteger(value));
 return {event:eventType,type:upstreamType,code,message,param,reason,upstreamStatus:Number.isInteger(numericStatus)?numericStatus:undefined};
}
function classifyUpstream(info={}){
 const token=[info.event,info.type,info.code,info.reason].filter(Boolean).join(' ').toLowerCase();
 const message=String(info.message||'').toLowerCase();
 if(/subscription_sharing_usage_limit_exceeded/.test(token))return 'MODEL_RATE_LIMIT';
 if(/subscription_sharing_usage_unavailable/.test(token))return 'MODEL_AUTH_FAILED';
 if(/subscription[_ -]?expired|subscription[^.]{0,40}expired|订阅[^.]{0,8}(?:已)?(?:到期|过期)/.test(token+' '+message))return 'MODEL_SUBSCRIPTION_EXPIRED';
 // An explicit balance/pre-charge business error wins over the generic 401/403
 // auth fallback below: providers commonly return quota failures as HTTP 403.
 if(/insufficient[_ -]?(?:user[_ -]?)?(?:quota|credits?|balance|funds)|billing_(?:hard|soft)_limit|payment[_ -]?required|余额[^.]{0,8}不足|额度不足|预扣费[^.]{0,20}失败|account balance/.test(token+' '+message))return 'MODEL_BALANCE_REQUIRED';
 if(/invalid[_ -]?(?:api[_ -]?)?key|(?:api[_ -]?)?key[_ -]?(?:invalid|not[_ -]?valid)|incorrect api key|api key not valid|authentication|unauthorized|permission[_ -]?error|permission[_ -]?denied|access[_ -]?denied|forbidden|unauthenticated|无效[^.]{0,10}(?:api)?(?:key|密钥|秘钥)|(?:密钥|秘钥)[^.]{0,8}(?:无效|错误)|权限不足|无权限/.test(token+' '+message))return 'MODEL_AUTH_FAILED';
 if(/rate[_ -]?limit|too[_ -]?many[_ -]?requests|resource[_ -]?exhausted|throttl|overloaded|请求过于频繁|限流/.test(token+' '+message))return 'MODEL_RATE_LIMIT';
 if(/timeout|timed[_ -]?out|deadline[_ -]?exceeded|etimedout|超时/.test(token+' '+message))return 'MODEL_UPSTREAM_TIMEOUT';
 const status=Number(info.upstreamStatus);
 if(status===401||status===403)return 'MODEL_AUTH_FAILED';
 if(status===429)return 'MODEL_RATE_LIMIT';
 if([408,504,524].includes(status))return 'MODEL_UPSTREAM_TIMEOUT';
 return '';
}
function eventError(event,{protocol='unknown',key='',outputChars,partial=false}={}){
 const info=inspectEvent(event,key);
 if(!info.event&&protocol==='responses'&&event?.status==='incomplete')info.event='response.incomplete';
 let code=classifyUpstream(info);
 if(!code)code=info.event==='response.incomplete'?(/^(?:max[ _]?(?:output[ _]?)?tokens?|length)$/i.test(info.reason)?'MODEL_OUTPUT_LIMIT':'MODEL_INCOMPLETE'):'MODEL_REQUEST_FAILED';
 // Never expose inband status 502/503/529 as diagnostic.status: figure
 // generation treats that as a safe-to-resend HTTP rejection, but these
 // streams may already be billed.
 const diagnostic={kind:'upstream-event',protocol:field(protocol,key,80)||'unknown',httpStatus:200};
 if(info.event)diagnostic.event=info.event;
 if(info.type)diagnostic.type=info.type;
 if(info.code)diagnostic.code=info.code;
 if(info.message)diagnostic.message=info.message;
 if(info.param)diagnostic.param=info.param;
 if(info.reason)diagnostic.reason=info.reason;
 if(info.upstreamStatus!==undefined)diagnostic.upstreamStatus=info.upstreamStatus;
 if(outputChars!==undefined){const size=Number(outputChars);diagnostic.outputChars=Number.isFinite(size)?Math.max(0,Math.min(size,64*1024*1024)):0;diagnostic.partial=!!partial;}
 return Object.assign(new Error(code),{diagnostic});
}
// Non-200 transport responses go through the same classifier as HTTP 200
// envelopes so a protocol cannot drift into a different category for the same
// upstream error. Keep diagnostic.status only for real HTTP failures; inband
// 200 events deliberately have no status so they are never automatically resent.
function httpError(response,key=''){
 const data=response&&typeof response==='object'?response:{};
 const status=Number.isInteger(data.status)?data.status:undefined,raw=text(data.body);
 let payload;if(raw.trimStart().startsWith('{')){try{payload=JSON.parse(raw);}catch{}}
 const info=inspectEvent(payload||{},key);
 if(!info.message)info.message=field(raw,key,MAX_MESSAGE);
 if(status!==undefined)info.upstreamStatus=status;
 const code=classifyUpstream(info)||'MODEL_REQUEST_FAILED',diagnostic={kind:'upstream'};
 if(status!==undefined)diagnostic.status=status;
 const message=field(raw,key,MAX_MESSAGE);
 if(message)diagnostic.message=message;
 if(info.type)diagnostic.type=info.type;
 if(info.code)diagnostic.code=info.code;
 if(info.param)diagnostic.param=info.param;
 if(info.reason)diagnostic.reason=info.reason;
 return Object.assign(new Error(code),{diagnostic});
}
function userFailureDetail(error){
 if(error?.diagnostic?.code==='subscription_sharing_usage_limit_exceeded')return 'ChatGPT账号的套餐用量已达到当前上限。请在ChatGPT设置的用量页面查看恢复时间，或在模型工作台选择其他服务。';
 if(error?.diagnostic?.code==='subscription_sharing_usage_unavailable')return '当前ChatGPT授权的套餐调用暂不可用。请检查该账号的应用授权和套餐状态，再重新测试连接。';
 return '';
}
module.exports={MAX_MESSAGE,redactSecrets,inspectEvent,classifyUpstream,eventError,httpError,userFailureDetail};
