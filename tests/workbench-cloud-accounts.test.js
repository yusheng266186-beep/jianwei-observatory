import test from 'node:test';import assert from 'node:assert/strict';
import {verificationUrl,quotaRows,accountIdentity,operationStatusText,cloudTime} from '../assets/workbench-cloud-accounts.js';

const resetAt=1760000000;
const expectedReset=new Date(resetAt*1000).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'});

test('官方链接只接受 HTTPS auth.openai.com/codex/device，拒绝外站、凭据、查询串和端口',()=>{
 assert.equal(verificationUrl('https://auth.openai.com/codex/device'),'https://auth.openai.com/codex/device');
 for(const value of [
  'http://auth.openai.com/codex/device',
  'https://auth.openai.com.evil.example/codex/device',
  'https://auth.openai.com@evil.example/codex/device',
  'https://evil.example@auth.openai.com/codex/device',
  'https://auth.openai.com:444/codex/device',
  'https://auth.openai.com/codex/device/',
  'https://auth.openai.com/codex/device?user_code=ABC',
  'https://auth.openai.com/codex/device#code',
  'https://auth.openai.com/codex/device?',
  'https://auth.openai.com/codex/device#',
  'https://auth.openai.com/codex/other',
  '//auth.openai.com/codex/device',
  ' https://auth.openai.com/codex/device ',
  'javascript:alert(1)',
  '',
  null
 ])assert.equal(verificationUrl(value),'','reject '+String(value));
});

test('额度只读官方 primary/secondary 桶，缺失为未返回而不是 0',()=>{
 assert.deepEqual(quotaRows(null),[]);
 assert.deepEqual(quotaRows({}),[]);
 const rows=quotaRows({rateLimits:{primary:{usedPercent:25,windowMinutes:300,resetsAt:resetAt},secondary:null}});
 assert.equal(rows.length,2);
 assert.equal(rows[0].usedPercent,25);
 assert.equal(rows[0].usedText,'25%');
 assert.equal(rows[0].remaining,75);
 assert.equal(rows[0].remainingText,'75%');
 assert.equal(rows[0].windowText,'5 小时');
 assert.equal(rows[0].resetsText,expectedReset);
 assert.equal(rows[1].usedPercent,null);
 assert.equal(rows[1].usedText,'未返回');
 assert.equal(rows[1].remaining,null);
 assert.equal(rows[1].remainingText,'未返回');
 assert.equal(rows[1].windowText,'未返回');
 assert.equal(rows[1].resetsText,'未返回');
 const zero=quotaRows({rateLimits:{primary:{usedPercent:0,windowMinutes:0,resetsAt:0}}});
 assert.equal(zero[0].remainingText,'100%');
 assert.equal(zero[0].windowText,'0 分钟');
 assert.equal(zero[0].resetsText,'未返回');
});

test('多限额额度按官方 limit id 展开，仍只做 100-used 的剩余换算',()=>{
 const rows=quotaRows({
  rateLimits:{primary:{usedPercent:10,windowMinutes:60,resetsAt:resetAt}},
  rateLimitsByLimitId:{'gpt-6.1-sol':{primary:{usedPercent:50,windowMinutes:300,resetsAt:resetAt},secondary:{usedPercent:80,windowMinutes:10080,resetsAt:resetAt}}}
 });
 assert.equal(rows.length,2);
 assert.equal(rows[0].limitId,'gpt-6.1-sol');
 assert.equal(rows[0].remainingText,'50%');
 assert.equal(rows[1].windowText,'7 天');
 assert.equal(rows[1].remainingText,'20%');
});

test('秒级 resetsAt 与毫秒时间显示一致，空时间不显示 0',()=>{
 assert.notEqual(cloudTime(resetAt),'');
 assert.equal(cloudTime(resetAt),cloudTime(resetAt*1000));
 assert.equal(cloudTime('2026-10-21T09:00:00Z'),cloudTime(Date.parse('2026-10-21T09:00:00Z')));
 assert.equal(cloudTime(0),'');
 assert.equal(cloudTime(null),'');
 assert.equal(cloudTime(''),'');
});

test('账号名称、邮箱掩码与账号 ID 在渲染前转义',()=>{
 const identity=accountIdentity({
  label:'<img src=x onerror=alert(1)>',
  emailMasked:'a&b<svg onload=alert(1)>@example.com',
  id:'"><script>alert(1)</script>',
  planType:'<b>plus</b>'
 });
 for(const value of Object.values(identity))assert(!/[<>"]/.test(value),'must not contain raw markup: '+value);
 assert.match(identity.label,/&lt;img/);
 assert.match(identity.email,/&amp;b&lt;svg/);
 assert.match(identity.id,/&#39;&#39;|&quot;&gt;&lt;script/);
 assert.match(identity.plan,/&lt;b&gt;plus&lt;\/b&gt;/);
});

test('少量操作状态给出排队、进行、失败和唤醒结果，不把缺失额度当成 0',()=>{
 assert.match(operationStatusText({kind:'quota',status:'queued'}),/排队/);
 assert.match(operationStatusText({kind:'quota',status:'running'}),/正在读取/);
 assert.match(operationStatusText({kind:'quota',status:'ready',result:{quota:{}}}),/已刷新/);
 assert.match(operationStatusText({kind:'quota',status:'ready',result:{}}),/未返回额度/);
 assert.match(operationStatusText({kind:'wake',status:'ready',result:{probe:{passed:true,latencyMs:420},model:'gpt-6.1-sol',reasoningEffort:'deep',quota:{}}}),/手动唤醒通过.*420 ms.*gpt-6\.1-sol.*deep/);
 assert.match(operationStatusText({kind:'wake',status:'ready',result:{probe:{passed:false,latencyMs:120}}}),/未通过/);
 assert.match(operationStatusText({kind:'wake',status:'failed',error:'额度不足'}),/未完成.*额度不足/);
});
