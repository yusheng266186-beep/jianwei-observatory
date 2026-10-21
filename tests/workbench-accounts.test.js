import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {accountHelperLaunch,accountHelperDownload,accountStatusLabel,accountTime,accountErrorText} from '../assets/workbench-accounts.js';
const launch='http://127.0.0.1:24765/#id=11111111-1111-4111-8111-111111111111&ticket=short-lived';

test('只接受固定本机助手的授权入口，其他主机、协议、端口和路径一律拒绝',()=>{
 assert.equal(accountHelperLaunch(launch),launch);
 for(const value of [
  'https://127.0.0.1:24765/#id=x&ticket=y',
  'http://localhost:24765/#id=x&ticket=y',
  'http://127.0.0.1:24766/#id=x&ticket=y',
  'http://127.0.0.1:24765/admin#id=x',
  'http://user:pass@127.0.0.1:24765/#id=x',
  'http://127.0.0.1:24765/?next=x#id=x',
  'http://127.0.0.1:24765/#',
  'javascript:alert(1)',
  '',
  null
 ])assert.equal(accountHelperLaunch(value),'','reject '+String(value));
});

test('助手下载只认仓库内的相对路径，不跟随云端返回的外部地址',()=>{
 assert.equal(accountHelperDownload('./tools/openai-auth-assistant.cjs'),'./tools/openai-auth-assistant.cjs');
 assert.equal(accountHelperDownload('./assets/downloads/jianwei-auth-helper-macos.zip'),'./assets/downloads/jianwei-auth-helper-macos.zip');
 for(const value of ['https://example.com/tool.cjs','../tools/x.cjs','./tools/other.cjs','/tools/openai-auth-assistant.cjs','',null])assert.equal(accountHelperDownload(value),'');
});

test('账号状态、时间和错误都给出可读中文，未知错误不泄露服务细节',()=>{
 assert.equal(accountStatusLabel('active'),'当前使用');
 assert.equal(accountStatusLabel('saved'),'已保存');
 assert.equal(accountStatusLabel('reauthorize'),'需重新授权');
 assert.equal(accountStatusLabel('other'),'已保存');
 assert.equal(accountTime(null),'');
 assert.equal(accountTime(0),'');
 assert.match(accountTime(Date.parse('2026-10-21T09:00:00Z')),/10\/21|\d+:\d+/);
 assert.match(accountErrorText({code:'OPENAI_AUTHORIZATION_CONFLICT'}),/当前账号未改变/);
 assert.match(accountErrorText({code:'AUTH_EXPIRED'}),/重新输入动态验证码/);
 assert.match(accountErrorText({code:'OPENAI_SOMETHING_NEW'}),/当前账号未改变/);
 assert.equal(accountErrorText({message:'自定义提示'}),'自定义提示');
});

test('账号面板不在浏览器持久化授权票据或令牌，登录后才由主页面加载',()=>{
 const source=fs.readFileSync(new URL('../assets/workbench-accounts.js',import.meta.url),'utf8');
 const page=fs.readFileSync(new URL('../model-workbench.html',import.meta.url),'utf8');
 const main=fs.readFileSync(new URL('../assets/model-workbench.js',import.meta.url),'utf8');
 assert(!/localStorage|sessionStorage|indexedDB/.test(source),'account module must not persist secrets');
 assert(!/console\.(log|info|warn|error)/.test(source),'launch tickets must not be logged');
 assert(source.includes('accountHelperLaunch(result.launchUrl)'));
 assert(page.includes('id="account-flow"')&&page.includes('id="account-helper-download"'));
 assert(page.includes('node ~/Downloads/openai-auth-assistant.cjs'));
 const loadLines=main.split('\n').filter(line=>line.includes('accountsPanel.load()'));
 assert.equal(loadLines.length,2,'accounts load after sign-in and after session restore only');
 assert(loadLines.every(line=>line.includes('await load()')),'the model state is authenticated before accounts load');
});
