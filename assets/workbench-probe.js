// An explicit missing/expired/denied task cannot recover through polling.
// Temporary transport/server failures keep querying the original task only.
export function probeRecovery(error,failures=1,{unconfirmedUntil=0,now=Date.now()}={}){
 const status=Number(error?.status),code=error?.code;
 if((code==='JOB_NOT_FOUND'||status===404)&&now<unconfirmedUntil)return {retry:true,delay:Math.min(5000,unconfirmedUntil-now)};
 if(['JOB_NOT_FOUND','JOB_EXPIRED','JOB_REMOVED'].includes(code)||status===404||status===410)return {retry:false,message:'这次连接测试已过期或不存在，请重新测试。'};
 if(status>=400&&status<500&&![408,429].includes(status))return {retry:false,message:error.message||'本次测试无法继续，请重新验证后再测试。'};
 return {retry:true,delay:Math.min(30000,5000*2**Math.min(3,Math.max(0,failures-1)))};
}
