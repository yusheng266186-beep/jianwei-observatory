import test from 'node:test';import assert from 'node:assert/strict';
import totp from '../backend/totp.cjs';import storage from '../backend/store.cjs';import serverModule from '../backend/server.cjs';
const seed=totp.encodeSecret(Buffer.from('12345678901234567890'));
test('TOTP符合RFC 4226/6238向量，支持2038年后计数与100秒窗口边界',()=>{
 const hotp=['755224','287082','359152','969429','338314','254676','287922','162583','399871','520489'];hotp.forEach((code,i)=>assert.equal(totp.codeForCounter(seed,i),code));
 for(const [seconds,expected] of [[59,'287082'],[1111111109,'081804'],[1111111111,'050471'],[1234567890,'005924'],[2000000000,'279037'],[20000000000,'353130']])assert.equal(totp.codeForCounter(seed,Math.floor(seconds/30)),expected);
 const code=totp.codeForCounter(seed,1);assert.equal(totp.matchingCounter(seed,code,129999),1);assert.equal(totp.matchingCounter(seed,code,130000),null);assert.equal(totp.matchingCounter(seed,totp.codeForCounter(seed,2),59000),null);assert.equal(totp.matchingCounter(seed,'12345',59000),null);assert.throws(()=>totp.decodeSecret('short'));
 assert.deepEqual(totp.decodeSecret(seed),Buffer.from('12345678901234567890'));
});
const environment={TRAINING_SESSION_SECRET:'test-only-session-secret-with-more-than-32-characters',TRAINING_TOTP_SECRET:seed,TRAINING_ORIGINS:'https://school.test'};
async function start(store,env=environment){const server=serverModule.createServer({store,env,now:()=>59000});await new Promise(r=>server.listen(0,'127.0.0.1',r));return {server,base:'http://127.0.0.1:'+server.address().port};}
const login=(base,code)=>fetch(base+'/session',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://school.test'},body:JSON.stringify({code})});
test('多个云实例只能消费同一动态码一次，七天会话可用且旧固定口令与旧会话失效',async()=>{
 const store=new storage.MemoryStore(),a=await start(store),b=await start(store),rotated=await start(store,{...environment,TRAINING_TOTP_SECRET:totp.encodeSecret(Buffer.from('09876543210987654321'))});try{
  const responses=await Promise.all([login(a.base,'287082'),login(b.base,'287082')]);assert.deepEqual(responses.map(r=>r.status).sort(),[200,401]);const index=responses.findIndex(r=>r.status===200),session=await responses[index].json(),replay=await responses[1-index].json();assert.equal(replay.error,'AUTH_REPLAY');assert.equal(session.authType,'totp');assert.equal(session.expires,59000+7*86400000);
  const path='/jobs/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',headers={Authorization:'Bearer '+session.token};assert.equal((await fetch(a.base+path,{headers})).status,404);assert.equal((await fetch(rotated.base+path,{headers})).status,401);assert.equal((await login(a.base,'teacher-test-only')).status,401);
 }finally{await Promise.all([a,b,rotated].map(({server})=>new Promise(r=>server.close(r))));}
});
test('动态码验证次数跨实例合并限流，不能通过增加云实例绕过',async()=>{
 const store=new storage.MemoryStore(),a=await start(store),b=await start(store);try{const results=await Promise.all(Array.from({length:20},(_,i)=>login(i%2?a.base:b.base,'000000')));assert.equal(results.filter(r=>r.status===401).length,10);assert.equal(results.filter(r=>r.status===429).length,10);}finally{await Promise.all([a,b].map(({server})=>new Promise(r=>server.close(r))));}
});
