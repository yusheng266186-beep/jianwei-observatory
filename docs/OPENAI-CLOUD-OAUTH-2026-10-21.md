# OpenAI 云端 OAuth 账号管理

2026-10-22 已修复回调后的成功确认跳转，并恢复用户已签发的授权；真实官方额度与腾讯云额度读取均已验证。本页后文的“尚待授权”描述为首次发布时的验收边界，最新结论见[浏览器授权完成修复](BROWSER-OAUTH-COMPLETION-FIX-2026-10-22.md)。新通道出题适配和真实练习生成仍需单独验收。

使用现有 ChatGPT/OpenAI 账号，不需另注册“Codex 账号”。本轮参考 Cockpit 的普通浏览器登录、回环接收与 `submit_callback_url`，将浏览器 OAuth 设为默认。设备码保留为可选备用方式，不再要求用户先启用或输入设备码。

## 使用流程

1. 在模型工作台用原有动态验证码进入，点“OpenAI 官方授权 → 添加账号”。
2. 打开官方登录页面，使用现有账号完成登录、MFA 和权限确认。
3. 官方可能返回 `http://127.0.0.1:1455/auth/callback?...`。其他设备无法访问云端的本机回调监听器时，复制地址栏完整链接，回工作台粘贴并提交即可。该步骤沿用 Cockpit 的手动回调交接；不要把链接发到聊天或其他网站。
4. 云端完成验证和保存后，账号才加入名单。页面轮询不清除尚未提交的输入；提交后立即清空。刷新只恢复授权查询编号，不在浏览器存储回调或令牌。
5. 已保存账号可以切换、重新授权、手动刷新真实额度和手动唤醒。额度来自官方窗口、已用比例和重置时间，不推算出题次数；缺失显示“未返回”。唤醒只在点选后发起一次轻量真实推理。

手机、平板和电脑共用云端名单；普通浏览器授权无需开启设备码设置。备用设备码登录仍受官方账号设置约束。密码、MFA 和最终权限确认均由所有者操作。

## 与现有出题通道的关系

云端账号管理与原有 ChatGPT 计划 API/SIWC 的客户端、令牌和刷新记录隔离。原账号和出题配置保留，新名单的切换不会替换 SIWC 的令牌。

本阶段交付账号管理。新通道须由所有者完成一次真实授权后，继续验收真实额度、唤醒和出题适配。不能把“授权链接已生成”或模拟登录测试描述为“新通道出题已接通”。

## 实现

运行时固定为 `@openai/codex@0.163.0-linux-x64`，校验 npm SHA-512 和两个执行文件 SHA-256，层包不进入 Git。现有腾讯云 Worker 挂载运行层与原有代理层；API 只创建后台任务，不在 HTTP 请求中等待用户登录。每次运行使用独立临时目录与最小子进程环境，不读取 Cockpit 或本机现有账号凭据。

普通浏览器登录调用原运行时的 `account/login/start {type:"chatgpt"}`，保留其客户端、state、PKCE 和注册回调。云端接收手动返回后，仅投递给同一运行时的回环监听器，由原运行时完成换票。不会擅自替换 `redirect_uri` 为未注册的公网地址，也不复制 Cockpit 的客户端身份或账号令牌。

手动回调绑定现有教师身份、本次授权、state、回环端口和路径；拒绝跨会话、过期、取消后及矛盾重复提交。相同返回重复提交幂等。网络目标由原授权确定，用户输入不能指定远程主机；投递仅继续访问同一回环端口的 `/success` 完成确认，不跟随外部或二次跳转。一次性回调通过私有 AES256 加密 COS 交接，不进入普通生成进度、诊断文本或公开资源。

账号授权记录独立保存在控制前缀 `openai-codex/`，与 `openai-siwc/` 隔离。每个账号拥有会话 epoch 和不可覆盖的凭据版本；同一刷新链串行运行。保存完成并关闭进程后写关闭检查点，再释放运行锁。无法确认是否轮换的异常中断不重放旧 refresh token，要求重新授权。取消与提交通过不可覆盖的终态记录互斥；已确认候选在存储中断后按固定 epoch 恢复提交。

`backend/codex-runtime.cjs` 封装登录、额度与文本回合；`backend/browser-oauth.cjs` 校验普通授权和手动回调并投递至原监听器；`backend/codex-accounts.cjs` 处理账号与任务存储。工具配置关闭，运行时工具及权限请求被拒绝。

## 接口

全部管理接口要求现有教师 Bearer 会话并受来源校验。创建任务使用 `X-Request-ID` 幂等，同编号不同请求返回409；回调提交按本次授权和返回摘要保持幂等。

| 接口 | 用途 |
| --- | --- |
| `GET /admin/codex/accounts` | 账号名单、当前选择和官方额度快照 |
| `POST /admin/codex/accounts/active` | `{accountId,expectedRevision}`，切换本通道账号 |
| `POST /admin/codex/authorize` | `{mode:'add',flow:'browser'}` 或重新授权的 `accountId`；默认 browser，备用 device |
| `GET /admin/codex/authorize/:id` | 排队、浏览器/设备码等待、完成、取消、失败或到期；恢复已确认候选提交 |
| `POST /admin/codex/authorize/:id/callback` | `{callbackUrl}`，提交本次普通浏览器登录的完整返回链接 |
| `POST /admin/codex/authorize/:id/cancel` | 取消；提交已取得终态锁时返回409 |
| `POST /admin/codex/accounts/:id/quota` | 创建额度读取任务，不调用模型 |
| `POST /admin/codex/accounts/:id/wake` | `{model,effort}`，一次手动轻量推理 |
| `GET /admin/codex/operations/:id` | 额度和唤醒的真实结果 |

配置为 `OPENAI_CODEX_ENABLED=true`、`OPENAI_CODEX_BINARY=/opt/jianwei-codex/bin/codex`；`jianwei-openai-codex:1` 只挂载 Worker。代码更新保留现有环境、角色、代理、TOTP 和云端模型配置，不能整体覆盖配置。

## 本轮实测

2026-10-21 腾讯云正式服务约 **2.38秒**返回普通浏览器 OAuth 链接，无设备码；错配 state 的手动返回被拒绝，原会话仍等待；取消成功，Worker 确认退出。未新增真实账号，原计划授权账号和模型配置一致。API、Worker 两份代码包各70文件逐字节核对通过，仍为256MB，时限60秒/900秒。

后台 OAuth 相关47项测试通过，包括真实 HTTP 回环交接的模拟登录完成、回调绑定、幂等、持久化与取消。模拟成功不代表账号所有者已完成实登；真实额度、唤醒与新通道出题仍待所有者确认授权后验收。

全仓997项单元测试通过，前端14项交互测试覆盖轮询保留文字与焦点、提交清空、重复提交、401恢复、刷新恢复、取消及关闭后恢复按钮。使用匿名本地夹具在320px、390px和1280px检查，页面宽度与视口一致；手机回调输入为16px，避免小字号输入引起自动缩放。示例账号与示例额度仅用于界面验收。

```sh
node tools/package-codex-layer.cjs --package-dir /path/to/official/package --out /path/to/layer.zip
node --test tests/browser-oauth.test.js tests/codex-accounts.test.js tests/codex-runtime.test.js tests/workbench-cloud-accounts.test.js
```

本轮交互参考：[Cockpit 浏览器 OAuth 实现](https://github.com/jlcodes99/cockpit-tools/blob/main/src-tauri/src/modules/codex_oauth.rs)，本次读取的文件内容 SHA 为 `ad7304b3b48d5db8870c46c3448a9a8799f51d33`。没有读取或复制其中保存的真实账号凭据。
