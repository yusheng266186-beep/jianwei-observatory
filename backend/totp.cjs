'use strict';
const crypto=require('node:crypto');
const STEP_MS=30000,VALIDITY_MS=100000;
function decodeSecret(value){
 const clean=String(value||'').replace(/[\s-]/g,'').toUpperCase();
 if(!/^[A-Z2-7]{32,128}$/.test(clean))throw new Error('TOTP_NOT_CONFIGURED');
 const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567',bytes=[];let bits=0,buffer=0;
 for(const ch of clean){buffer=(buffer<<5)|alphabet.indexOf(ch);bits+=5;if(bits>=8){bytes.push((buffer>>>(bits-8))&255);bits-=8;}}
 return Buffer.from(bytes);
}
function encodeSecret(bytes){const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';let bits=0,buffer=0,out='';for(const byte of bytes){buffer=(buffer<<8)|byte;bits+=8;while(bits>=5){out+=alphabet[(buffer>>>(bits-5))&31];bits-=5;}}if(bits)out+=alphabet[(buffer<<(5-bits))&31];return out;}
function codeForCounter(secret,counter){
 if(!Number.isSafeInteger(counter)||counter<0)throw new Error('INVALID_TOTP_COUNTER');
 const message=Buffer.alloc(8);message.writeBigUInt64BE(BigInt(counter));const digest=crypto.createHmac('sha1',decodeSecret(secret)).update(message).digest(),offset=digest.at(-1)&15,number=digest.readUInt32BE(offset)&0x7fffffff;
 return String(number%1000000).padStart(6,'0');
}
function matchingCounter(secret,code,now=Date.now()){
 if(!/^\d{6}$/.test(code)||!Number.isSafeInteger(now)||now<0)return null;
 for(let counter=Math.floor(now/STEP_MS);counter>=0&&now<counter*STEP_MS+VALIDITY_MS;counter--){const expected=codeForCounter(secret,counter);if(crypto.timingSafeEqual(Buffer.from(code),Buffer.from(expected)))return counter;}
 return null;
}
module.exports={STEP_MS,VALIDITY_MS,decodeSecret,encodeSecret,codeForCounter,matchingCounter};
