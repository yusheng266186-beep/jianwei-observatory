import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import http from 'node:http';

import runtimeModule from '../backend/codex-runtime.cjs';

const { createRuntime, login, readQuota, complete } = runtimeModule;

const AUTH = {
  auth_mode: 'chatgpt',
  tokens: {
    access_token: 'test-private-access-token',
    refresh_token: 'test-private-refresh-token',
  },
  last_refresh: '2026-10-21T00:00:00.000Z',
};

function defaultFeatures() {
  return [
    { name: 'shell_tool', stage: 'stable', enabled: false, defaultEnabled: true },
    { name: 'multi_agent', stage: 'stable', enabled: false, defaultEnabled: true },
    { name: 'unified_exec', stage: 'stable', enabled: true, defaultEnabled: true },
    { name: 'unified_exec_tty', stage: 'stable', enabled: false, defaultEnabled: true },
    { name: 'view_image', stage: 'stable', enabled: false, defaultEnabled: true },
    { name: 'image_generation', stage: 'stable', enabled: false, defaultEnabled: true },
    { name: 'apps', stage: 'stable', enabled: false, defaultEnabled: true },
    { name: 'multi_agent_v2', stage: 'stable', enabled: false, defaultEnabled: true },
    { name: 'standalone_web_search', stage: 'underDevelopment', enabled: false, defaultEnabled: false },
    { name: 'tool_suggest', stage: 'stable', enabled: false, defaultEnabled: true },
    { name: 'hooks', stage: 'stable', enabled: false, defaultEnabled: true },
    { name: 'browser_use', stage: 'stable', enabled: false, defaultEnabled: true },
    { name: 'computer_use', stage: 'stable', enabled: false, defaultEnabled: true },
    { name: 'request_permissions_tool', stage: 'underDevelopment', enabled: false, defaultEnabled: false },
    { name: 'deferred_executor', stage: 'underDevelopment', enabled: false, defaultEnabled: false },
    { name: 'plugins', stage: 'stable', enabled: false, defaultEnabled: true },
  ];
}

function defaultConfig() {
  return { web_search: 'disabled', sandbox_mode: 'read-only', approval_policy: 'never' };
}

class FakeChild extends EventEmitter {
  constructor({ autoExit = true } = {}) {
    super();
    this.autoExit = autoExit;
    this.exited = false;
    this.killed = [];
    this.writes = [];
    this.stdin = new EventEmitter();
    this.stdin.writable = true;
    this.stdin.write = (chunk) => {
      const text = String(chunk);
      this.writes.push(text);
      this.emit('line', text);
      return true;
    };
    this.stdin.end = () => {
      this.stdin.writable = false;
      if (this.autoExit) this.exit(0, null);
    };
    this.stdout = new EventEmitter();
    this.stdout.setEncoding = () => {};
    this.stderr = new EventEmitter();
    this.stderr.resume = () => {};
  }

  kill(signal) {
    this.killed.push(signal);
    this.exit(null, signal);
    return true;
  }

  exit(code, signal) {
    if (this.exited) return;
    this.exited = true;
    this.emit('exit', code, signal);
  }

  send(message) {
    this.stdout.emit('data', typeof message === 'string' ? message : `${JSON.stringify(message)}\n`);
  }

  sendRaw(text) {
    this.stdout.emit('data', text);
  }
}

class FakeCodex {
  constructor({ autoExit = true, features = defaultFeatures(), config = defaultConfig(), handlers = {} } = {}) {
    this.child = new FakeChild({ autoExit });
    this.features = features;
    this.config = config;
    this.requests = [];
    this.responses = [];
    this.notifications = [];
    this.realCodexHome = null;
    this.handlers = new Map(Object.entries({
      initialize: () => ({ codexHome: this.realCodexHome, platformFamily: 'unix', platformOs: 'linux', userAgent: 'fake-codex' }),
      'experimentalFeature/list': () => ({ data: this.features, nextCursor: null }),
      'config/read': () => ({ config: this.config }),
      'account/read': () => ({ account: { type: 'chatgpt', email: 'teacher@example.invalid', planType: 'plus' }, requiresOpenaiAuth: true }),
      'account/login/cancel': () => ({ status: 'canceled' }),
      'turn/interrupt': () => ({}),
      ...handlers,
    }));
    this.child.on('line', (chunk) => {
      for (const line of chunk.split('\n')) {
        if (!line.trim()) continue;
        this.handle(JSON.parse(line));
      }
    });
  }

  handle(message) {
    if (!message || typeof message !== 'object') return;
    if (message.id !== undefined && typeof message.method !== 'string') {
      this.responses.push(message);
      return;
    }
    if (message.id === undefined && typeof message.method === 'string') {
      this.notifications.push(message);
      return;
    }
    if (typeof message.method !== 'string') return;
    const request = { id: message.id, method: message.method, params: message.params };
    this.requests.push(request);
    const handler = this.handlers.get(message.method);
    if (!handler) {
      this.respondError(message.id, -32601, 'method not found');
      return;
    }
    try {
      const result = handler(message.params, request);
      if (result !== undefined) this.respond(message.id, result);
    } catch (error) {
      this.respondError(message.id, -32000, error && error.message ? error.message : 'fake failure');
    }
  }

  respond(id, result) {
    this.child.send({ jsonrpc: '2.0', id, result });
  }

  respondError(id, code, message) {
    this.child.send({ jsonrpc: '2.0', id, error: { code, message } });
  }

  notify(method, params) {
    this.child.send({ jsonrpc: '2.0', method, params });
  }

  request(id, method, params) {
    this.child.send({ jsonrpc: '2.0', id, method, params });
  }

  find(method) {
    return this.requests.filter((request) => request.method === method).at(-1);
  }

  waitRequest(method, timeoutMs = 1500) {
    return waitFor(() => this.find(method), timeoutMs);
  }
}

async function waitFor(predicate, timeoutMs = 1500) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await predicate();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error('waitFor timeout');
}

function mode(file) {
  return fs.statSync(file).mode & 0o777;
}

async function startRuntime(t, options = {}) {
  const { runtime: runtimeOptions = {}, ...fakeOptions } = options;
  const fake = new FakeCodex(fakeOptions);
  const runtime = await createRuntime({
    binaryPath: '/fake/codex',
    ...runtimeOptions,
    spawnImpl: (binaryPath, args, spawnOptions) => {
      fake.spawn = { binaryPath, args, spawnOptions };
      fake.realCodexHome = fs.realpathSync(spawnOptions.env.CODEX_HOME);
      return fake.child;
    },
  });
  t.after(async () => {
    await runtime.close().catch(() => {});
  });
  return { runtime, fake };
}

async function startTurn(t, options = {}) {
  let fake;
  const { runtime: runtimeOptions = {}, thread = {}, turn = null, onTurnStart = null } = options;
  const result = await startRuntime(t, {
    autoExit: options.autoExit !== undefined ? options.autoExit : true,
    runtime: {
      auth: AUTH,
      ...runtimeOptions,
    },
    handlers: {
      'thread/start': (params) => ({
        thread: { id: 'thread-1' },
        model: params.model,
        modelProvider: 'openai',
        cwd: fake.spawn.spawnOptions.cwd,
        approvalPolicy: 'never',
        approvalsReviewer: 'user',
        sandbox: { type: 'readOnly', networkAccess: false },
        ...thread,
      }),
      'turn/start': () => {
        setTimeout(() => {
          if (onTurnStart) onTurnStart(fake);
          fake.notify('turn/started', { threadId: 'thread-1', turn: { id: 'turn-1', rootTurnId: 'turn-1', status: 'inProgress', items: [] } });
          if (turn) fake.notify('turn/completed', { threadId: 'thread-1', turn });
        }, 0);
        return { turn: { id: 'turn-1', status: 'inProgress', items: [] } };
      },
      ...(options.handlers || {}),
    },
  });
  fake = result.fake;
  return result;
}

test('初始化只使用私有 CODEX_HOME，写入 0600 auth.json，并完成官方握手', async (t) => {
  const previousAws = process.env.AWS_SECRET_ACCESS_KEY;
  const previousOpenAi = process.env.OPENAI_API_KEY;
  process.env.AWS_SECRET_ACCESS_KEY = 'parent-cloud-secret';
  process.env.OPENAI_API_KEY = 'sk-parent-key';
  t.after(() => {
    if (previousAws === undefined) delete process.env.AWS_SECRET_ACCESS_KEY;
    else process.env.AWS_SECRET_ACCESS_KEY = previousAws;
    if (previousOpenAi === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousOpenAi;
  });

  const { runtime, fake } = await startRuntime(t, {
    runtime: { auth: AUTH, proxyUrl: 'http://127.0.0.1:18080' },
  });
  const { binaryPath, args, spawnOptions } = fake.spawn;
  assert.equal(binaryPath, '/fake/codex');
  assert.equal(args[0], 'app-server');
  assert(args.includes('cli_auth_credentials_store="file"'));
  assert(args.includes('web_search="disabled"'));
  assert(args.includes('features.shell_tool=false'));
  assert(args.includes('features.multi_agent=false'));
  assert(args.includes('features.view_image=false'));
  assert(args.includes('features.browser_use=false'));

  assert.equal(spawnOptions.cwd, spawnOptions.env.CODEX_HOME);
  assert.equal(spawnOptions.env.HOME, spawnOptions.cwd);
  assert.equal(spawnOptions.env.TMPDIR, path.join(spawnOptions.cwd, 'tmp'));
  assert.equal(spawnOptions.env.AWS_SECRET_ACCESS_KEY, undefined);
  assert.equal(spawnOptions.env.OPENAI_API_KEY, undefined);
  assert.equal(spawnOptions.env.HTTP_PROXY, 'http://127.0.0.1:18080');
  assert.equal(spawnOptions.env.HTTPS_PROXY, 'http://127.0.0.1:18080');
  assert.equal(spawnOptions.env.ALL_PROXY, 'http://127.0.0.1:18080');
  assert.equal(mode(spawnOptions.cwd), 0o700);
  assert.equal(mode(path.join(spawnOptions.cwd, 'tmp')), 0o700);

  const authPath = path.join(spawnOptions.cwd, 'auth.json');
  assert.equal(JSON.parse(fs.readFileSync(authPath, 'utf8')).tokens.access_token, AUTH.tokens.access_token);
  assert.equal(mode(authPath), 0o600);

  const initialize = fake.find('initialize');
  assert.deepEqual(initialize.params.clientInfo, { name: 'jianwei_observatory', version: '1.0.0' });
  assert.equal(initialize.params.capabilities.experimentalApi, true);
  assert.equal(initialize.params.capabilities.requestAttestation, false);
  assert(fake.notifications.some((message) => message.method === 'initialized'));
  assert(fake.find('experimentalFeature/list'));
  assert(fake.find('config/read'));
  assert.deepEqual(runtime.getAuth(), AUTH);
});

test('代理只接受私有 Xray 回环地址', async () => {
  for (const proxyUrl of [
    'http://127.0.0.1:18081',
    'https://127.0.0.1:18080',
    'http://localhost:18080',
    'http://127.0.0.1:18080/path',
    'socks5://127.0.0.1:18080',
  ]) {
    await assert.rejects(
      createRuntime({ binaryPath: '/fake/codex', proxyUrl, spawnImpl: () => { throw new Error('must not spawn'); } }),
      /OPENAI_PROXY_CONFIG_INVALID/,
    );
  }
});

test('无法确认 shell/agent 工具关闭时拒绝创建运行时', async () => {
  const cases = [
    [{ name: 'shell_tool', enabled: true }, { name: 'multi_agent', enabled: false }],
    [{ name: 'shell_tool', enabled: false }, { name: 'multi_agent', enabled: true }],
    [{ name: 'shell_tool', enabled: false }],
  ];
  for (const features of cases) {
    const fake = new FakeCodex({ features });
    const spawnImpl = (binaryPath, args, spawnOptions) => {
      fake.spawn = { binaryPath, args, spawnOptions };
      fake.realCodexHome = fs.realpathSync(spawnOptions.env.CODEX_HOME);
      return fake.child;
    };
    await assert.rejects(createRuntime({ binaryPath: '/fake/codex', spawnImpl }), /CODEX_TOOLS_UNSUPPORTED/);
    assert.equal(fs.existsSync(fake.spawn.spawnOptions.cwd), false);
  }
});

test('web_search 未明确关闭时拒绝创建运行时', async () => {
  const fake = new FakeCodex({ config: { web_search: 'live', sandbox_mode: 'read-only', approval_policy: 'never' } });
  const spawnImpl = (binaryPath, args, spawnOptions) => {
    fake.spawn = { binaryPath, args, spawnOptions };
    fake.realCodexHome = fs.realpathSync(spawnOptions.env.CODEX_HOME);
    return fake.child;
  };
  await assert.rejects(createRuntime({ binaryPath: '/fake/codex', spawnImpl }), /CODEX_TOOLS_UNSUPPORTED/);
  assert.equal(fs.existsSync(fake.spawn.spawnOptions.cwd), false);
});

test('CODEX_HOME 被改写时拒绝启动', async () => {
  const fake = new FakeCodex();
  const spawnImpl = (binaryPath, args, spawnOptions) => {
    fake.spawn = { binaryPath, args, spawnOptions };
    fake.realCodexHome = '/tmp/not-this-codex-home';
    return fake.child;
  };
  await assert.rejects(createRuntime({ binaryPath: '/fake/codex', spawnImpl }), /CODEX_HOME_ESCAPED/);
  assert.equal(fs.existsSync(fake.spawn.spawnOptions.cwd), false);
});

test('并发请求按 id 匹配，跨 chunk 解析，通知同步分发并拒绝服务端请求', async (t) => {
  const external = [];
  const { runtime, fake } = await startRuntime(t, {
    runtime: { onNotification: (method, params) => external.push([method, params]) },
    handlers: {
      'test/one': () => undefined,
      'test/two': () => undefined,
    },
  });
  const observed = [];
  const unsubscribe = runtime.on('demo/event', (params) => observed.push(params));
  fake.notify('demo/event', { value: 1, auth: { access_token: 'must-not-leak' }, tokens: { refresh_token: 'must-not-leak' } });
  await waitFor(() => observed.length === 1);
  assert.deepEqual(observed[0], { value: 1, auth: '[REDACTED]', tokens: '[REDACTED]' });
  assert(!JSON.stringify(external).includes('must-not-leak'));
  assert.equal(external.at(-1)[0], 'demo/event');

  const first = runtime.call('test/one', { n: 1 });
  const second = runtime.call('test/two', { n: 2 });
  const requestOne = await fake.waitRequest('test/one');
  const requestTwo = await fake.waitRequest('test/two');
  const responseTwo = `${JSON.stringify({ jsonrpc: '2.0', id: requestTwo.id, result: { value: 2 } })}\n`;
  fake.child.sendRaw(responseTwo.slice(0, 7));
  fake.child.sendRaw(responseTwo.slice(7));
  fake.respond(requestOne.id, { value: 1 });
  assert.deepEqual(await first, { value: 1 });
  assert.deepEqual(await second, { value: 2 });

  fake.request(900, 'item/commandExecution/requestApproval', { threadId: 'thread-1', turnId: 'turn-1' });
  const rejected = await waitFor(() => fake.responses.find((message) => message.id === 900));
  assert.equal(rejected.error.code, -32601);

  unsubscribe();
  fake.notify('demo/event', { value: 2 });
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(observed.length, 1);
});

test('请求超时明确映射 MODEL_UPSTREAM_TIMEOUT', async (t) => {
  const { runtime } = await startRuntime(t, {
    runtime: { timeoutMs: 30 },
    handlers: { slow: () => undefined },
  });
  await assert.rejects(runtime.call('slow', {}), (error) => error.message === 'MODEL_UPSTREAM_TIMEOUT' && error.diagnostic.timeoutMs === 30);
});

test('进程异常退出拒绝挂起请求并清理目录', async (t) => {
  const { runtime, fake } = await startRuntime(t, {
    autoExit: false,
    handlers: { never: () => undefined },
  });
  const directory = fake.spawn.spawnOptions.cwd;
  const pending = runtime.call('never', {});
  fake.child.exit(7, null);
  await assert.rejects(pending, (error) => error.message === 'MODEL_CONNECTION_LOST' && error.diagnostic.exitCode === 7);
  await waitFor(() => !fs.existsSync(directory));
});

test('运行时 AbortSignal 取消挂起请求并终止子进程', async (t) => {
  const controller = new AbortController();
  const { runtime, fake } = await startRuntime(t, {
    runtime: { signal: controller.signal },
    handlers: { never: () => undefined },
  });
  const pending = runtime.call('never', {});
  controller.abort();
  await assert.rejects(pending, (error) => error.name === 'AbortError' && error.message === 'MODEL_CANCELLED');
  await waitFor(() => fake.child.exited);
});

test('close 前刷新 auth、终止子进程并删除临时目录', async (t) => {
  const saved = [];
  const { runtime, fake } = await startRuntime(t, {
    runtime: { auth: AUTH, onAuth: async (auth) => saved.push(auth) },
    handlers: { never: () => undefined },
  });
  const directory = fake.spawn.spawnOptions.cwd;
  const pending = runtime.call('never', {});
  const pendingCheck = assert.rejects(pending, (error) => error.name === 'AbortError' && error.message === 'MODEL_CANCELLED');
  await fsp.writeFile(path.join(directory, 'auth.json'), JSON.stringify({ ...AUTH, tokens: { ...AUTH.tokens, access_token: 'closing-token' } }), { mode: 0o600 });
  await runtime.close();
  await pendingCheck;
  assert.equal(saved.at(-1).tokens.access_token, 'closing-token');
  assert.equal(fs.existsSync(directory), false);
});

test('auth.json 变动调用 onAuth，重复内容不重复持久化，异常退出也 flush', async (t) => {
  const saved = [];
  const { runtime, fake } = await startRuntime(t, {
    runtime: { auth: AUTH, onAuth: async (auth) => saved.push(auth) },
  });
  const authPath = path.join(fake.spawn.spawnOptions.cwd, 'auth.json');
  const changed = { ...AUTH, tokens: { ...AUTH.tokens, access_token: 'rotated-token' } };
  await fsp.writeFile(authPath, JSON.stringify(changed), { mode: 0o600 });
  await waitFor(() => saved.length === 1);
  assert.equal(saved[0].tokens.access_token, 'rotated-token');
  await fsp.writeFile(authPath, JSON.stringify(changed), { mode: 0o600 });
  await new Promise((resolve) => setTimeout(resolve, 350));
  assert.equal(saved.length, 1);

  const abnormalSaved = [];
  const abnormal = new FakeCodex({ autoExit: false });
  let directory;
  const abnormalRuntime = await createRuntime({
    binaryPath: '/fake/codex',
    auth: AUTH,
    onAuth: async (auth) => abnormalSaved.push(auth),
    spawnImpl: (binaryPath, args, spawnOptions) => {
      abnormal.spawn = { binaryPath, args, spawnOptions };
      abnormal.realCodexHome = fs.realpathSync(spawnOptions.env.CODEX_HOME);
      directory = spawnOptions.cwd;
      return abnormal.child;
    },
  });
  t.after(async () => {
    await abnormalRuntime.close().catch(() => {});
  });
  await fsp.writeFile(path.join(directory, 'auth.json'), JSON.stringify({ ...AUTH, tokens: { ...AUTH.tokens, access_token: 'exit-token' } }), { mode: 0o600 });
  abnormal.child.exit(2, null);
  await waitFor(() => abnormalSaved.some((auth) => auth.tokens.access_token === 'exit-token'));
  await waitFor(() => !fs.existsSync(directory));
  await abnormalRuntime.close().catch(() => {});
});

test('设备码登录只向 onReady 暴露安全字段并确认 ChatGPT 身份', async (t) => {
  const { runtime, fake } = await startRuntime(t, {
    handlers: {
      'account/login/start': () => ({
        type: 'chatgptDeviceCode',
        loginId: 'login-1',
        userCode: 'ABCD-EFGH',
        verificationUrl: 'https://auth.openai.com/codex/device',
        access_token: 'must-not-be-forwarded',
      }),
      'account/read': () => ({ account: { type: 'chatgpt', email: 'teacher@example.invalid', planType: 'plus' }, requiresOpenaiAuth: true }),
    },
  });
  const ready = [];
  const pending = login(runtime, { flow: 'device', onReady: (value) => ready.push(value), deadlineMs: 2000 });
  await fake.waitRequest('account/login/start');
  await fsp.writeFile(path.join(fake.spawn.spawnOptions.cwd, 'auth.json'), JSON.stringify({ ...AUTH, tokens: { ...AUTH.tokens, access_token: 'device-token' } }), { mode: 0o600 });
  fake.notify('account/login/completed', { success: true, loginId: 'login-1', error: null });
  const result = await pending;
  assert.deepEqual(ready, [{ flow: 'device', verificationUrl: 'https://auth.openai.com/codex/device', userCode: 'ABCD-EFGH', loginId: 'login-1' }]);
  assert.deepEqual(result.account, { type: 'chatgpt', email: 'teacher@example.invalid', planType: 'plus' });
  assert.equal(result.auth.tokens.access_token, 'device-token');
});

test('登录拒绝非官方 verificationUrl 并取消后台登录', async (t) => {
  const { runtime, fake } = await startRuntime(t, {
    handlers: {
      'account/login/start': () => ({
        type: 'chatgptDeviceCode',
        loginId: 'login-bad',
        userCode: 'CODE',
        verificationUrl: 'https://evil.example/codex/device',
      }),
    },
  });
  let ready = false;
  await assert.rejects(login(runtime, { flow: 'device', onReady: () => { ready = true; }, deadlineMs: 1000 }), /LOGIN_URL_UNTRUSTED/);
  assert.equal(ready, false);
  assert.equal(fake.find('account/login/cancel').params.loginId, 'login-bad');
});

test('登录取消、超时与失败通知均映射明确错误并取消登录', async (t) => {
  const base = {
    'account/login/start': () => ({
      type: 'chatgptDeviceCode',
      loginId: 'login-x',
      userCode: 'CODE',
      verificationUrl: 'https://auth.openai.com/codex/device',
    }),
  };

  {
    const { runtime, fake } = await startRuntime(t, { handlers: base });
    let cancelled = false;
    setTimeout(() => { cancelled = true; }, 20);
    await assert.rejects(login(runtime, { flow: 'device', deadlineMs: 1000, isCancelled: () => cancelled }), /LOGIN_CANCELLED/);
    assert.equal(fake.find('account/login/cancel').params.loginId, 'login-x');
  }

  {
    const { runtime, fake } = await startRuntime(t, { handlers: base });
    await assert.rejects(login(runtime, { flow: 'device', deadlineMs: 20 }), /LOGIN_TIMEOUT/);
    assert.equal(fake.find('account/login/cancel').params.loginId, 'login-x');
  }

  {
    const { runtime, fake } = await startRuntime(t, { handlers: base });
    const pending = login(runtime, { flow: 'device', deadlineMs: 1000 });
    await fake.waitRequest('account/login/start');
    fake.notify('account/login/completed', { success: false, loginId: 'login-x', error: 'access_denied' });
    await assert.rejects(pending, (error) => error.message === 'LOGIN_FAILED' && error.diagnostic.reason === 'access_denied');
  }
});

test('浏览器授权默认使用普通 OAuth，手动返回交给原运行时后才保存账号', async (t) => {
 let fake,received=0,confirmed=0,callbackUrl,ready;
 const listener=http.createServer(async(req,res)=>{
  const u=new URL(req.url,'http://local');
  if(u.pathname==='/success'){
   confirmed++;res.writeHead(200);res.end('success');
   fake.notify('account/login/completed',{success:true,loginId:'browser-login'});return;
  }
  received++;
  assert.equal(u.searchParams.get('state'),'browser-state');assert.equal(u.searchParams.get('code'),'one-use-code');
  await fsp.writeFile(path.join(fake.spawn.spawnOptions.cwd,'auth.json'),JSON.stringify(AUTH),{mode:0o600});
  res.writeHead(302,{Location:'/success'});res.end();
 });
 await new Promise(r=>listener.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>listener.close(r)));
 const port=listener.address().port,authUrl='https://auth.openai.com/oauth/authorize?'+new URLSearchParams({response_type:'code',client_id:'runtime-client',redirect_uri:'http://127.0.0.1:'+port+'/auth/callback',state:'browser-state',code_challenge:'runtime-pkce',code_challenge_method:'S256'});
 const started=await startRuntime(t,{handlers:{'account/login/start':params=>{assert.equal(params.type,'chatgpt');return {type:'chatgpt',loginId:'browser-login',authUrl};}}});fake=started.fake;
 const pending=login(started.runtime,{onReady:value=>{ready=value;},readCallback:()=>callbackUrl,deadlineMs:2500});
 await waitFor(()=>ready);assert.equal(ready.authorizationUrl,authUrl);assert.equal(ready.flow,'browser');assert.equal(ready.userCode,undefined);
 assert.equal(started.runtime.getAuth(),null);
 callbackUrl='http://localhost:'+port+'/auth/callback?state=browser-state&code=one-use-code';
 const result=await pending;assert.equal(received,1);assert.equal(confirmed,1);assert.equal(result.auth.tokens.access_token,AUTH.tokens.access_token);
});

test('手动返回状态不匹配时取消当前浏览器登录，不交付账号', async (t) => {
 const authUrl='https://auth.openai.com/oauth/authorize?'+new URLSearchParams({response_type:'code',client_id:'runtime-client',redirect_uri:'http://127.0.0.1:1455/auth/callback',state:'current-state',code_challenge:'runtime-pkce',code_challenge_method:'S256'});
 const {runtime,fake}=await startRuntime(t,{handlers:{'account/login/start':()=>({type:'chatgpt',loginId:'browser-login',authUrl})}});
 await assert.rejects(login(runtime,{readCallback:()=> 'http://127.0.0.1:1455/auth/callback?state=old-state&code=old-code',deadlineMs:1000}),/CODEX_CALLBACK_STATE_MISMATCH/);
 assert.equal(fake.find('account/login/cancel').params.loginId,'browser-login');assert.equal(runtime.getAuth(),null);
});

test('额度读取原样返回官方结果，不补造字段', async (t) => {
  const quota = { rateLimits: { limitId: 'codex', primary: { usedPercent: 12 } }, planType: 'plus' };
  const { runtime } = await startRuntime(t, {
    handlers: { 'account/rateLimits/read': () => quota },
  });
  assert.deepEqual(await readQuota(runtime), quota);
});

test('文本流只转发官方 summary/text delta，最终输出取 completed 回合', async (t) => {
  const { runtime, fake } = await startTurn(t, {
    turn: {
      id: 'turn-1',
      status: 'completed',
      items: [{ type: 'agentMessage', id: 'msg-1', text: '{"ok":true}', phase: 'final_answer' }],
    },
    onTurnStart: (server) => {
      server.notify('thread/settings/updated', {
        threadId: 'thread-1',
        threadSettings: { approvalPolicy: 'never', sandboxPolicy: { type: 'readOnly', networkAccess: false } },
      });
      server.notify('item/started', { threadId: 'thread-1', turnId: 'turn-1', item: { type: 'agentMessage', id: 'msg-1', text: '', phase: null } });
      server.notify('item/reasoning/summaryTextDelta', { threadId: 'thread-1', turnId: 'turn-1', itemId: 'reasoning-1', summaryIndex: 0, delta: '检查条件。' });
      server.notify('item/reasoning/textDelta', { threadId: 'thread-1', turnId: 'turn-1', itemId: 'reasoning-1', contentIndex: 0, delta: 'RAW-REASONING-MUST-NOT-LEAK' });
      server.notify('item/agentMessage/delta', { threadId: 'thread-1', turnId: 'turn-1', itemId: 'msg-1', delta: '{"ok":' });
      server.notify('item/agentMessage/delta', { threadId: 'thread-1', turnId: 'turn-1', itemId: 'msg-1', delta: 'true}' });
      server.notify('thread/tokenUsage/updated', {
        threadId: 'thread-1',
        turnId: 'turn-1',
        tokenUsage: {
          last: { inputTokens: 10, cachedInputTokens: 0, cacheWriteInputTokens: 0, outputTokens: 5, reasoningOutputTokens: 2, totalTokens: 15 },
          total: { inputTokens: 10, cachedInputTokens: 0, cacheWriteInputTokens: 0, outputTokens: 5, reasoningOutputTokens: 2, totalTokens: 15 },
        },
      });
      server.notify('item/completed', { threadId: 'thread-1', turnId: 'turn-1', item: { type: 'agentMessage', id: 'msg-1', text: '{"ok":true}', phase: 'final_answer' } });
    },
  });
  const progress = [];
  const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nWQAAAAASUVORK5CYII=';
  let imagePath = null;
  let imageMode = null;
  const originalHandler = fake.handlers.get('turn/start');
  fake.handlers.set('turn/start', (params, request) => {
    const image = params.input.find((item) => item.type === 'localImage');
    if (image) {
      imagePath = image.path;
      imageMode = mode(image.path);
    }
    return originalHandler(params, request);
  });

  const result = await complete(
    runtime,
    { system: 'SYSTEM-INSTRUCTIONS', input: { q: 1 }, image: { mime: 'image/png', data: png } },
    { model: 'gpt-6.1-sol', reasoningEffort: 'high' },
    { onProgress: (event) => progress.push(event) },
  );
  assert.deepEqual(result, {
    output: '{"ok":true}',
    model: 'gpt-6.1-sol',
    provider: 'openai-codex',
    reasoningEffort: 'high',
    usage: { input: 10, output: 5, thinking: 2 },
  });
  assert.equal(progress.some((event) => event.summary === '检查条件。'), true);
  assert.equal(progress.some((event) => event.draftSource && event.draftSource.includes('"ok"')), true);
  assert.equal(JSON.stringify(progress).includes('RAW-REASONING-MUST-NOT-LEAK'), false);

  const threadStart = fake.find('thread/start').params;
  assert.equal(threadStart.baseInstructions, 'SYSTEM-INSTRUCTIONS');
  assert.equal(threadStart.sandbox, 'read-only');
  assert.equal(threadStart.approvalPolicy, 'never');
  assert.equal(threadStart.ephemeral, true);
  assert.equal(threadStart.cwd, fake.spawn.spawnOptions.cwd);

  const turnStart = fake.find('turn/start').params;
  assert.deepEqual(turnStart.input[0], { type: 'text', text: '{"q":1}' });
  assert.equal(turnStart.model, 'gpt-6.1-sol');
  assert.equal(turnStart.effort, 'high');
  assert.equal(turnStart.summary, 'auto');
  assert.deepEqual(turnStart.sandboxPolicy, { type: 'readOnly', networkAccess: false });
  assert.equal(turnStart.approvalPolicy, 'never');
  assert(imagePath && imagePath.startsWith(fake.spawn.spawnOptions.cwd));
  assert.equal(imageMode, 0o600);
  assert.equal(fs.existsSync(imagePath), false);
});

test('HTML 比较逐字发送 Cockpit 原始用户提示词及交付指令，不加 JSON 包装', async (t) => {
 const definition=JSON.parse(fs.readFileSync(new URL('../backend/pelican-prompt.json',import.meta.url),'utf8'));
 const {runtime,fake}=await startTurn(t,{turn:{id:'turn-1',status:'completed',items:[{type:'agentMessage',id:'msg-1',text:'<html></html>',phase:'final_answer'}]}});
 await complete(runtime,{system:definition.deliveryInstructions,inputText:definition.prompt,outputFormat:'html'},{model:'gpt-6.1-sol',reasoningEffort:'high'});
 assert.equal(fake.find('thread/start').params.baseInstructions,definition.deliveryInstructions);
 assert.deepEqual(fake.find('turn/start').params.input,[{type:'text',text:definition.prompt}]);
});

test('失败、拒绝、空输出与工具调用均映射明确错误', async (t) => {
  const cases = [
    ['认证失败', { id: 'turn-1', status: 'failed', items: [], error: { message: 'unauthorized' } }, 'MODEL_AUTH_FAILED'],
    ['限流', { id: 'turn-1', status: 'failed', items: [], error: { message: 'rate limit exceeded' } }, 'MODEL_RATE_LIMIT'],
    ['超时', { id: 'turn-1', status: 'failed', items: [], error: { message: 'turn timed out' } }, 'MODEL_UPSTREAM_TIMEOUT'],
    ['中断', { id: 'turn-1', status: 'interrupted', items: [] }, 'MODEL_REQUEST_FAILED'],
    ['空输出', { id: 'turn-1', status: 'completed', items: [{ type: 'agentMessage', id: 'msg-1', text: '   ', phase: 'final_answer' }] }, 'MODEL_INCOMPLETE'],
    ['工具项', { id: 'turn-1', status: 'completed', items: [{ type: 'commandExecution', id: 'command-1' }] }, 'CODEX_TOOLS_BLOCKED'],
  ];
  for (const [label, turn, expected] of cases) {
    const { runtime, fake } = await startTurn(t, { turn });
    await assert.rejects(
      complete(runtime, { system: 'SYS', input: {} }, { model: 'gpt-6.1-sol', reasoningEffort: 'low' }),
      (error) => error.message === expected,
      label,
    );
    if (expected === 'CODEX_TOOLS_BLOCKED') assert(fake.find('turn/interrupt'));
  }
});

test('工具 item 开始与服务端权限请求均中止回合', async (t) => {
  {
    const { runtime, fake } = await startTurn(t, {
      turn: null,
      onTurnStart: (server) => server.notify('item/started', {
        threadId: 'thread-1',
        turnId: 'turn-1',
        item: { type: 'commandExecution', id: 'command-1', command: 'echo no' },
      }),
    });
    await assert.rejects(
      complete(runtime, { system: 'SYS', input: {} }, { model: 'gpt-6.1-sol', reasoningEffort: 'low' }),
      /CODEX_TOOLS_BLOCKED/,
    );
    assert(fake.find('turn/interrupt'));
  }

  {
    const { runtime, fake } = await startTurn(t, {
      turn: null,
      onTurnStart: (server) => server.request(77, 'item/commandExecution/requestApproval', { threadId: 'thread-1', turnId: 'turn-1' }),
    });
    await assert.rejects(
      complete(runtime, { system: 'SYS', input: {} }, { model: 'gpt-6.1-sol', reasoningEffort: 'low' }),
      /CODEX_TOOLS_BLOCKED/,
    );
    const rejection = await waitFor(() => fake.responses.find((message) => message.id === 77));
    assert.equal(rejection.error.code, -32601);
    assert(fake.find('turn/interrupt'));
  }
});

test('线程未进入只读沙箱时拒绝发送用户内容', async (t) => {
  const { runtime, fake } = await startTurn(t, {
    turn: null,
    thread: { sandbox: { type: 'workspaceWrite', writableRoots: [], networkAccess: false } },
  });
  await assert.rejects(
    complete(runtime, { system: 'SYS', input: { secret: true } }, { model: 'gpt-6.1-sol', reasoningEffort: 'low' }),
    /CODEX_TOOLS_UNSUPPORTED/,
  );
  assert.equal(fake.find('turn/start'), undefined);
});

test('缺少 auth 时不启动回合', async (t) => {
  const { runtime, fake } = await startTurn(t, { turn: null, runtime: { auth: null } });
  await assert.rejects(
    complete(runtime, { system: 'SYS', input: {} }, { model: 'gpt-6.1-sol', reasoningEffort: 'low' }),
    /MODEL_AUTH_FAILED/,
  );
  assert.equal(fake.find('thread/start'), undefined);
});

test('回合等待期间进程退出映射 MODEL_CONNECTION_LOST', async (t) => {
  const { runtime, fake } = await startTurn(t, { turn: null, autoExit: false });
  const pending = complete(runtime, { system: 'SYS', input: {} }, { model: 'gpt-6.1-sol', reasoningEffort: 'low' });
  await fake.waitRequest('turn/start');
  fake.child.exit(3, null);
  await assert.rejects(pending, /MODEL_CONNECTION_LOST/);
});
