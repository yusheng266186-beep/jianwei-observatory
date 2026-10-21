'use strict';
const {connectionMatches}=require('./model-control.cjs');
const pause=(ms,signal)=>new Promise((resolve,reject)=>{const timer=setTimeout(done,ms);function done(){signal?.removeEventListener('abort',abort);resolve();}function abort(){clearTimeout(timer);signal?.removeEventListener('abort',abort);reject(Error('JOB_CANCELLED'));}if(signal?.aborted)abort();else signal?.addEventListener('abort',abort,{once:true});});
async function complete(prompt,generation,{probe=false,onProgress,signal,control,runtimeMethods,now=Date.now,sleep=pause}={}){
 if(generation?.provider!=='openai-codex'||generation.protocol!=='codex'||!connectionMatches(generation))throw Error('MODEL_NOT_CONFIGURED');
 const accounts=control||require('./codex-accounts.cjs').createControl();
 // The API freezes the account together with model/effort. A direct probe or
 // operational check can bind here; a saved task must keep its original id.
 const methods=runtimeMethods||require('./codex-runtime.cjs');
 try{const bound=await accounts.bind(generation),deadline=now()+(probe?60000:840000);
  while(true){if(signal?.aborted)throw Error('JOB_CANCELLED');try{return await accounts.withAccount(bound.codexAccountId,rt=>methods.complete(rt,prompt,bound,{probe,onProgress,signal}),{signal,timeoutMs:Math.max(1,deadline-now())});}
   catch(error){if(error.message!=='CODEX_ACCOUNT_BUSY'||deadline-now()<2500)throw error;
    // No model request has been sent when the credential lease is busy.
    // Wait for that lease, rather than failing concurrent personal tasks or
    // racing the account's rotating refresh token. Other failures never retry.
    await onProgress?.({phase:'connecting'});await sleep(2500,signal);
   }
  }
 }
 catch(error){
  if(error.message==='CODEX_ACCOUNT_BUSY')throw Object.assign(Error('MODEL_RATE_LIMIT'),{diagnostic:{kind:'account',reason:'The selected account is currently busy; no upstream request was sent.'}});
  if(['CODEX_ACCOUNT_REAUTH_REQUIRED','CODEX_ACCOUNT_NOT_FOUND','CODEX_ACCOUNT_IDENTITY_INVALID'].includes(error.message))throw Object.assign(Error('MODEL_AUTH_FAILED'),{cause:error});
  throw error;
 }
}
module.exports={complete};
