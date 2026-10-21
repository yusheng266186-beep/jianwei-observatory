import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import companion from '../tools/openai-auth-assistant.cjs';
const id='12345678-1234-4234-8234-123456789abc',ticket='t'.repeat(43),state='s'.repeat(43);
async function fixture(fn){
 let now=Date.now(),origin,forwarded=[];
 const server=companion.createAssistant({now:()=>now,request:async(route,body)=>{forwarded.push({route,body});if(route.endsWith('/claim'))return {authorizationUrl:'https://auth.openai.com/api/accounts/authorize?'+new URLSearchParams({state,redirect_uri:origin+'/auth/callback',id_token_hint:'private-identity-hint'}),expiresAt:now+60000};return {status:'complete'};}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));origin='http://127.0.0.1:'+server.address().port;
 const post=(body,headers={Origin:origin})=>fetch(origin+'/launch',{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)});
 try{await fn({origin,post,forwarded,expire:()=>{now+=61000;}});}finally{await new Promise(resolve=>server.close(resolve));}
}
test('本机助手仅接收同源交接，不把ticket或官方账号提示回传到页面JSON',()=>fixture(async({origin,post,forwarded})=>{
 assert.equal((await post({id,ticket},{Origin:'https://evil.example'})).status,403);assert.equal(forwarded.length,0);
 const launch=await post({id,ticket}),body=await launch.json();assert.equal(launch.status,200);assert.equal(body.continueUrl,'/continue?id='+id);assert(!JSON.stringify(body).includes(ticket));assert(!JSON.stringify(body).includes('private-identity-hint'));
 const next=await fetch(origin+body.continueUrl,{redirect:'manual'});assert.equal(next.status,302);assert(new URL(next.headers.get('location')).origin==='https://auth.openai.com');assert.equal(next.headers.get('referrer-policy'),'no-referrer');
 assert.equal(forwarded[0].body.redirectUri,origin+'/auth/callback');
 const conflict=await post({id,ticket:'x'.repeat(43)});assert.equal(conflict.status,409);assert.equal(forwarded.length,1);
}));
test('回调校验state，真实完成后不重复兑换code，状态不泄漏凭据',()=>fixture(async({origin,post,forwarded})=>{
 await post({id,ticket});assert.equal((await fetch(origin+'/auth/callback?state=wrong&code=private-code',{redirect:'manual'})).status,400);assert.equal(forwarded.length,1);
 const callback=await fetch(origin+'/auth/callback?'+new URLSearchParams({state,code:'private-code',client_id:'oaiapp_sample'}),{redirect:'manual'});assert.equal(callback.status,303);
 const status=await(await fetch(origin+'/status?id='+id)).json();assert.equal(status.status,'complete');assert(!JSON.stringify(status).includes(ticket));assert(!JSON.stringify(status).includes('private-code'));
 assert.equal(forwarded[1].body.code,'private-code');assert.equal(forwarded[1].body.clientId,'oaiapp_sample');
 assert.equal((await fetch(origin+'/auth/callback?'+new URLSearchParams({state,code:'private-code'}),{redirect:'manual'})).status,400);assert.equal(forwarded.length,2);
}));
test('过期交接不能再次打开官方入口，助手拒绝DNS重绑定Host',()=>fixture(async({origin,post,expire})=>{
 await post({id,ticket});expire();assert.equal((await fetch(origin+'/continue?id='+id,{redirect:'manual'})).status,410);
 const rebound=await new Promise((resolve,reject)=>{const req=http.get(origin+'/health',{headers:{Host:'evil.example'}},res=>{res.resume();resolve(res.statusCode);});req.on('error',reject);});assert.equal(rebound,403);
 const page=await fetch(origin+'/');assert.match(page.headers.get('content-security-policy'),/frame-ancestors 'none'/);assert.match(await page.text(),/history.replaceState/);
}));
