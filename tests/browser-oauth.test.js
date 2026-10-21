import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import oauth from '../backend/browser-oauth.cjs';
const auth=(port=1455)=>'https://auth.openai.com/oauth/authorize?'+new URLSearchParams({response_type:'code',client_id:'runtime-client',redirect_uri:'http://127.0.0.1:'+port+'/auth/callback',state:'this-attempt-state',code_challenge:'runtime-pkce',code_challenge_method:'S256'});
const returned=(port=1455)=>'http://localhost:'+port+'/auth/callback?state=this-attempt-state&code=one-use-code';
test('browser login preserves the runtime authorization URL and validates its loopback return',()=>{
 assert.equal(oauth.authorization(auth()).authorizationUrl,auth());
 const value=new URL(oauth.callback(returned(),auth()));
 assert.equal(value.origin,'http://127.0.0.1:1455');assert.equal(value.searchParams.get('code'),'one-use-code');
 for(const url of ['https://evil.test/oauth/authorize','https://auth.openai.com@evil.test/oauth/authorize',auth().replace('127.0.0.1','192.168.1.1'),auth().replace('S256','plain'),auth()+'&state=extra'])assert.throws(()=>oauth.authorization(url),/CODEX_AUTHORIZATION_URL_INVALID/);
});
test('manual returns are tied to this PKCE attempt, local port and callback path',()=>{
 for(const value of [returned().replace('localhost','evil.test'),returned().replace('1455','18080'),returned().replace('http:','https:'),returned().replace('/auth/callback','/admin'),returned()+'&code=another',returned()+'#fragment',returned()+'&error=access_denied'])assert.throws(()=>oauth.callback(value,auth()),/CODEX_CALLBACK_INVALID/);
 assert.throws(()=>oauth.callback(returned().replace('this-attempt-state','other-attempt'),auth()),/CODEX_CALLBACK_STATE_MISMATCH/);
 assert.throws(()=>oauth.callback(returned()+'&state=this-attempt-state',auth()),/CODEX_CALLBACK_STATE_MISMATCH/);
});
test('delivery calls only the runtime loopback listener and does not follow a success redirect',async()=>{
 let received,second=0;
 const server=http.createServer((req,res)=>{received=req.url;if(req.url==='/success')second++;res.writeHead(302,{Location:'https://example.invalid/success'});res.end('not returned');});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{const port=server.address().port;assert.equal(await oauth.deliver(returned(port),auth(port)),undefined);assert.equal(new URL(received,'http://test').searchParams.get('code'),'one-use-code');assert.equal(second,0);}
 finally{await new Promise(r=>server.close(r));}
});
