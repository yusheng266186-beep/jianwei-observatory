import test from 'node:test';import assert from 'node:assert/strict';import crypto from 'node:crypto';
import auth from '../backend/openai-authorization.cjs';
import {MemoryStore} from '../backend/store.cjs';
import {versionKey} from '../backend/openai-credentials.cjs';
test('云端已确认授权撤销时显示需重新授权，保留当前身份与已保存账号',async()=>{
 const store=new MemoryStore(),now=Date.now();await store.create(versionKey(1),{revision:1,credentials:{issuer:'https://auth.openai.com',subject:'fixture-account',client_id:'oaiapp_fixture',ext_agent_host_id:'urn:uuid:12345678-1234-4234-8234-123456789abc',id_token:'fixture-identity-only',email:'teacher@example.test',saved_at:new Date(now).toISOString(),expires_at:now+1000}});
 await store.create('openai-siwc/renewals/0000000002/terminal.json',{reason:'reauthorization-required'});
 const state=await auth.createAuthorizationControl({store,env:{OPENAI_SIWC_ENABLED:'true'},now:()=>now}).accounts();assert.equal(state.accounts[0].status,'reauthorize');assert.equal(state.accounts[0].active,true);assert.equal(state.automaticRefresh,false);assert(state.helper.launcherDownload.endsWith('.zip'));assert(!JSON.stringify(state).includes('fixture-identity-only'));
});
test('真实签名校验同时绑定官方issuer、客户端、nonce与返回账号，拒绝篡改和过期ID令牌',async()=>{
 const at=Date.now(),{publicKey,privateKey}=crypto.generateKeyPairSync('rsa',{modulusLength:2048}),jwk={...publicKey.export({format:'jwk'}),kid:'fixture-signing',alg:'RS256',use:'sig'},expected={clientId:'oaiapp_fixture',nonce:'one-attempt-only',subject:'subject-a'},base={iss:'https://auth.openai.com',aud:expected.clientId,sub:expected.subject,nonce:expected.nonce,exp:Math.floor(at/1000)+300};let calls=0;
 const verify=auth.createIdTokenVerifier({now:()=>at,network:run=>run(async url=>{assert.equal(url,'https://auth.openai.com/.well-known/jwks.json');calls++;return {status:200,body:JSON.stringify({keys:[jwk]})};})});
 const token=claims=>{const head=Buffer.from(JSON.stringify({alg:'RS256',kid:jwk.kid})).toString('base64url'),payload=Buffer.from(JSON.stringify(claims)).toString('base64url'),source=head+'.'+payload;return source+'.'+crypto.sign('sha256',Buffer.from(source),privateKey).toString('base64url');};
 assert.equal((await verify(token(base),expected)).sub,expected.subject);
 for(const change of [{iss:'https://evil.example'},{aud:'oaiapp_other'},{sub:'another-subject'},{nonce:'another-attempt'},{exp:Math.floor(at/1000)-1},{iat:Math.floor(at/1000)+120},{nbf:Math.floor(at/1000)+120},{aud:[expected.clientId,'oaiapp_other'],azp:'oaiapp_other'}])await assert.rejects(verify(token({...base,...change}),expected),/OPENAI_AUTHORIZATION_/);
 const good=token(base),parts=good.split('.');parts[1]=Buffer.from(JSON.stringify({...base,sub:'forged'})).toString('base64url');await assert.rejects(verify(parts.join('.'),expected),/OPENAI_AUTHORIZATION_IDENTITY_INVALID/);assert.equal(calls,1);
});
