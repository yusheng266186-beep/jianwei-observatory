# 工作台 ChatGPT 官方多账号授权（2026-10-21）

后续更新：[云端 OAuth 账号管理](OPENAI-CLOUD-OAUTH-2026-10-21.md)已新增不依赖本机助手的独立入口；原有计划通道保留。教师页最新排版见[底部核对](TEACHER-BOTTOM-REVIEW-2026-10-21.md)。以下保留本文件所述阶段的设计与验证记录。

本轮将官方账号管理接入模型工作台，提供本机回调助手，并补齐 HTTP API 的官方代理连接环境。模型选择与授权账号分别管理，继续使用现有凭据版本和续期机制。

## 目标与非目标

- 工作台可列出当前账号、已保存账号，并添加账号、重新授权、切换账号。
- 切换已保存账号必须重新走一次官方授权，验证全部成功后才追加新的 active 凭据版本。
- 不复制 Cockpit、Codex 或其他客户端的令牌；不伪造公网回调；不使用 device grant；不建立第二套 refresh 轮换逻辑。
- 不自动轮换账号，不清空当前账号；新签入失败、取消、超时都保留当前账号与模型选择。
- 账号列表只读，不在读取时刷新令牌或探测上游。访问令牌过期不代表 refresh 授权失效，响应中的 `automaticRefresh` 区分可续期与已知终止状态。

## 存储

继续使用 `backend/openai-credentials.cjs` 的全局不可变凭据版本和加密 `secureStore`：

- active 凭据：`training-control-v1/openai-siwc/credentials/0000000001.json` 等不可覆盖版本。现有续期模块仍从这里读取；本模块只在验证成功后追加新版本。
- 账号注册表：`training-control-v1/openai-siwc/accounts/0000000001.json` 等不可覆盖序列。每条记录保存当时完整的账号元数据快照；读取最新序列并按 `id` 去重。元数据包含验证过的 issuer、client_id、subject、id_token_hint、脱敏邮箱、最近授权时间与访问令牌到期时间，全部位于 AES256 加密对象中。
- 尝试记录：`training-control-v1/openai-siwc/authorization/<attemptId>/`。`attempt.json` 保存 ticket 哈希、state、nonce、PKCE verifier、预期身份、开始时的 active 版本与账号、固定 redirect_uri；另有无覆盖的 `exchange.json`、`candidate.json`、`verified.json`、`activation.json`、`finalized.json`、`failure.json`、`cancelled.json` 阶段记录。
- 账号 `id = sha256(issuer + "\n" + client_id + "\n" + subject)`，只用于本地索引，不返回 subject/client_id。
- 旧环境只有 active 凭据、没有注册表时，列表会从当前凭据自动生成一条 active 展示记录；不需要先迁移。

所有记录均通过现有 `secureStore` 写入，启用 COS 服务端 AES256，键名限定在 `openai-siwc/` 下。浏览器响应只包含下列公开字段，不包含 access/refresh/id token、id_token_hint、subject、client_id、邮箱原文或 PKCE verifier。

## Admin API（均需现有 TOTP 会话）

时间字段均为 Unix epoch 毫秒。

### GET `/admin/openai/accounts`

```json
{
  "enabled": true,
  "activeId": "<sha256>",
  "accounts": [
    {
      "id": "<sha256>",
      "label": "t***@example.com",
      "emailMasked": "t***@example.com",
      "status": "active",
      "active": true,
      "authorizedAt": 1792580000000,
      "accessExpiresAt": 1792583600000
    }
  ],
  "helper": {
    "origin": "http://127.0.0.1:24765",
    "download": "./tools/openai-auth-assistant.cjs",
    "launcherDownload": "./assets/downloads/jianwei-auth-helper-macos.zip"
  },
  "automaticRefresh": true
}
```

- `enabled` 与现有提供方配置一致：`OPENAI_SIWC_ENABLED === "true"`，或 `TRAINING_CONFIGURED_PROVIDERS` 声明了 `openai-chatgpt`。
- `status`：`active` 为当前账号；`saved` 为可通过官方重新授权切换的已保存账号；`reauthorize` 为缺少可复用注册元数据的已保存账号，或云端已记录续期终止的当前账号；当前账号仍保留 `active: true`。
- `accessExpiresAt` 是上一次访问令牌的到期时间，不代表 refresh 授权失效；读取本接口不会刷新或探测。
- 注册表损坏或身份字段对不上的条目不会展示。

### POST `/admin/openai/authorize`

添加：

```json
{ "mode": "add" }
```

重新授权或切换：

```json
{ "mode": "reauthorize", "accountId": "<sha256>" }
```

响应：

```json
{
  "id": "<uuid>",
  "expiresAt": 1792580900000,
  "launchUrl": "http://127.0.0.1:24765/#id=<uuid>&ticket=<43字符>"
}
```

- `add` 使用 `client_id=dynamic_agent_client`、`agent_name_hint=Jianwei Observatory`，不复用旧账号的客户端；`ext_agent_host_id` 复用当前 active 凭据中的云主机 ID（无 active 时使用 `OPENAI_AGENT_HOST_ID`，再退到加密保存的稳定主机 ID）。
- `reauthorize` 必须指向已知账号，复用保存的 issued client 与 `id_token_hint`；可选 `login_hint` 只使用保存的邮箱。
- 每次尝试都生成新的 256-bit ticket（43 字符 base64url）、state、nonce 与 PKCE verifier；15 分钟有效。
- `launchUrl` 的片段只含 attempt id 和 ticket，不含 state、账号令牌或 verifier。ticket 只以 SHA-256 形式保存。
- 当前账号未被修改；失败或取消不会触碰凭据版本。

### GET `/admin/openai/authorize/:id`

```json
{ "id": "<uuid>", "status": "waiting", "expiresAt": 1792580900000 }
```

状态：`waiting | exchanging | complete | failed | expired | cancelled`。失败时增加 `error`（安全错误码，见下）。本接口可在已有 `candidate`/`activation` 时继续完成验证、激活和注册表保存；不会重新交换授权码。并发投票不会重复交换。

### POST `/admin/openai/authorize/:id/cancel`

请求体必须为空对象 `{}`。仅取消本次尝试，不撤销当前账号，不删除已保存账号。

## 本机 Node 助手 capability 路由

两条路由位于 `authenticate` 之前，但仍先执行现有 `TRAINING_ORIGINS`/CORS 检查。本机助手请求不带 Origin，因此可以通过；响应不会给任意浏览器来源开放 CORS。

### POST `/openai/authorization/claim`

```json
{
  "id": "<uuid>",
  "ticket": "<43字符>",
  "redirectUri": "http://127.0.0.1:24765/auth/callback"
}
```

响应：

```json
{ "authorizationUrl": "https://auth.openai.com/api/accounts/authorize?...", "expiresAt": 1792580900000 }
```

- `redirectUri` 必须精确等于 `http://127.0.0.1:24765/auth/callback`，不接受任意 URL。
- ticket 按哈希恒时比较；state/nonce/PKCE verifier 只存在加密尝试记录中。
- 同一 attempt 可安全重复 claim，返回同一授权 URL 和同一 state，不重复签发。
- 授权码交换开始、完成、失败、过期或取消后，claim 返回冲突/已结束错误。

### POST `/openai/authorization/complete`

```json
{
  "id": "<uuid>",
  "ticket": "<43字符>",
  "state": "<state>",
  "code": "<authorization code>",
  "clientId": "oaiapp_..."
}
```

取消/拒绝时使用 `{ "error": "access_denied" }` 代替 `code`。响应为 `{id,status,expiresAt,error?}`。

- state 恒时比较；不匹配时不交换授权码。
- 新注册必须返回 issued client（`oaiapp_...`），且 ID token 的 `aud` 与 nonce 必须匹配；不接受 `dynamic_agent_client` 作为最终注册身份。
- 重新授权必须使用保存的同一 client，验证 ID token 的 issuer、签名、audience、nonce、期限与 subject 是否匹配保存身份。
- token 响应必须包含 access_token、refresh_token、id_token、正数 `expires_in`，scope 必须同时包含 `resource.invoke` 与 `chatgpt.tokens.use.direct`。
- 只访问官方 token/JWKS 接口，走现有 `withProxy`；token 请求 20 秒、JWKS 请求 10 秒有界。异常原文、上游响应体和令牌不会进入公开错误。
- 每个 attempt 只能创建一个 `exchange.json` 锁，授权码最多交换一次。交换成功后先写加密 `candidate.json`，再验证身份与激活。
- JWKS 临时失败时保持 `exchanging`，由后续状态查询从 candidate 继续验证，不重新使用授权码。
- 交换结果未知（网络中断、响应无法解析、无 candidate）明确返回 `OPENAI_AUTHORIZATION_UNCERTAIN`，必须另起尝试，不盲目重放。
- 验证成功后按最新全局 revision 做无覆盖 CAS 追加。若 active 身份在 begin 后已改变且不是本候选账号，返回 `OPENAI_AUTHORIZATION_CONFLICT`，保留原账号。同账号自动续期导致 revision 前进时重新读取后重试。
- 激活前先把原 active 账号元数据写入注册表；激活后写入新账号。注册表保存失败时不返回 `complete`，状态保持 `exchanging`，后续查询可恢复；不会误报成功。
- 只有 `finalized.json` 写入后才返回 `complete`。

## 安全与竞态要点

- TOTP 会话只保护 admin 路由；claim/complete 使用 ticket + state 双 capability，ticket 为 256-bit，state 恒时比较。
- 回调地址固定在本机 HTTP 回环；不支持 HTTPS 公网回调、伪造 device grant 或任意 redirect。
- 浏览器端公开数据与错误均经过白名单构造；账号注册元数据与所有令牌只在加密存储中。
- 读取账号列表不触发刷新、不访问 OpenAI、不改变模型选择。
- 新授权失败、取消、超时只留下尝试记录，active 凭据版本不变。
- 不自动切换账号，不自动轮换账号，不撤销旧账号。
- 现有 `openai-credentials.cjs` 的 refresh 逻辑未修改；本模块只追加已验证的凭据版本。

## 错误码

常见 admin/claim/complete 错误：

- `AUTH_REQUIRED` / `AUTH_EXPIRED`：缺少或过期 TOTP 会话。
- `OPENAI_AUTHORIZATION_REQUEST_INVALID`：请求字段不符合契约。
- `OPENAI_AUTHORIZATION_ID_INVALID` / `OPENAI_AUTHORIZATION_NOT_FOUND`：attempt id 非法或不存在。
- `OPENAI_AUTHORIZATION_TICKET_INVALID`：ticket 不匹配。
- `OPENAI_AUTHORIZATION_REDIRECT_INVALID`：回调地址不是固定回环地址。
- `OPENAI_AUTHORIZATION_STATE_INVALID`：state 不匹配。
- `OPENAI_AUTHORIZATION_ALREADY_COMPLETE` / `OPENAI_AUTHORIZATION_IN_PROGRESS`：attempt 已结束或已进入交换。
- `OPENAI_AUTHORIZATION_EXPIRED` / `OPENAI_AUTHORIZATION_CANCELLED`：尝试已过期或取消。
- `OPENAI_AUTHORIZATION_CODE_INVALID` / `OPENAI_AUTHORIZATION_CLIENT_MISSING` / `OPENAI_AUTHORIZATION_CLIENT_MISMATCH`：授权码或客户端不符合要求。
- `OPENAI_AUTHORIZATION_SCOPE_MISSING`：缺少 `resource.invoke` 或 `chatgpt.tokens.use.direct`。
- `OPENAI_AUTHORIZATION_IDENTITY_INVALID` / `OPENAI_AUTHORIZATION_IDENTITY_MISMATCH` / `OPENAI_AUTHORIZATION_NONCE_INVALID`：签名、issuer、audience、期限、nonce 或 subject 核验失败。
- `OPENAI_AUTHORIZATION_TOKEN_INVALID`：token 响应字段不完整。
- `OPENAI_AUTHORIZATION_REJECTED` / `OPENAI_AUTHORIZATION_UPSTREAM_UNAVAILABLE`：官方 token 接口明确拒绝或暂时不可用；该授权码已消费，需重新发起。
- `OPENAI_AUTHORIZATION_UNCERTAIN`：交换结果未知；禁止重复使用授权码。
- `OPENAI_AUTHORIZATION_CONFLICT`：begin 后 active 身份已被其他操作改变，原账号保留。
- `OPENAI_AUTHORIZATION_STORE_BUSY`：内部写法冲突，查询状态可继续；公开接口通常以 `exchanging` 表示可恢复状态。
- `OPENAI_ACCOUNT_NOT_FOUND` / `OPENAI_ACCOUNT_ID_INVALID` / `OPENAI_ACCOUNT_REAUTH_UNAVAILABLE`：重新授权目标不可用。
- `STORE_UNAVAILABLE`：私有存储暂时不可用（HTTP 503）。

## 局限

- 本机助手必须监听 `127.0.0.1:24765`；端口占用或被改动时 claim 会被拒绝，这是固定回调安全约束，不提供任意端口回退。
- 服务器从当前 active 凭据的 `ext_agent_host_id` 复用 cloudHostId；没有 active 时读取 `OPENAI_AGENT_HOST_ID`，两者都没有才生成并加密保存新的主机 ID。迁移到全新云端且已有旧注册时，应先配置该环境变量，避免产生第二个主机注册。
- 官方仍可能要求用户在页面上确认账号或权限；不能保证每次 reauthorize 都完全静默。
- 15 分钟内已交换的 candidate 可恢复 JWKS 验证；若到期仍未验证，结束等待并保留原账号，需重新发起。已经验证、激活但尚未完成落盘的任务可继续恢复，不会再次使用授权码。
- 访问令牌过期不等于 refresh 授权仍有效；列表不主动探测，已撤销的远端授权可能在下一次实际调用或重新授权时才暴露。
- 后端只维护一个 active 账号。保存账号的切换必须重新授权，不能靠复制 refresh token 完成。
- 本功能面向现有单人 TOTP 管理场景，不是多租户账号池，不自动轮换、不共享账号。

## 测试

`tests/openai-authorization.test.js` 使用 `MemoryStore`、本地 RSA/JWKS 与假 token 网络覆盖：

- TOTP 保护、账号列表脱敏与旧 active 自动展示。
- ticket/state/redirect/TTL 拒绝、claim 幂等、PKCE 绑定。
- 新账号、重新授权 subject 不匹配、成功切换、失败不覆盖。
- 并发回调只交换一次授权码。
- 取消与超时保留当前账号。
- JWKS 短暂失败后从 candidate 恢复。
- 交换结果未知明确失败且不重放。
- 激活前/后注册表保存失败的恢复。
- 缺少 scope、未知账号与非法 accountId。
- 未注入授权控制时不会初始化云端授权存储。

## 教师操作与部署要求

工作台“ChatGPT 官方账号”区可添加账号、重新授权当前账号、选择已保存账号切换。切换时通过官方重新验证；不是无需授权的令牌池。已有账号在新授权验证成功前继续保留。此功能不会自动选择模型，模型职责仍在下方分别配置。

Mac 首次下载 `assets/downloads/jianwei-auth-helper-macos.zip`，解压后双击“启动授权助手.command”。启动器查找已安装的 Node.js 或 Codex 内置 Node；普通电脑需安装 Node.js 22。保持终端开启，再从工作台发起授权。通用 `.cjs` 脚本也可在其他桌面电脑运行。重启电脑后须重新启动助手；未安装后台常驻服务。手机可使用现有云端账号出题；新增或切换官方账号需在能运行本机助手的电脑上完成。

API 函数需要和 Worker 相同的私有代理配置与 Xray 层。配置更新必须保留其余环境、内存、超时、角色、网络与现有层；不把代理地址或配置放进网页、下载包或公开文档。授权助手无第三方 npm 依赖、不保存密码或令牌、不复制 Cockpit / Codex 的登录凭据。
