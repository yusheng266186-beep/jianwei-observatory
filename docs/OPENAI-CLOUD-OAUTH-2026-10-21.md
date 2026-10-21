# OpenAI 云端 OAuth 账号管理

使用者仍使用现有 ChatGPT/OpenAI 账号，通过官方 OAuth 页面授权，不需要另注册“Codex 账号”。这里的 Codex 是云端采用的官方运行时与授权协议。设备码是 OAuth 的一种方式，适合手机、平板和其他电脑登录，不要求设备安装助手或监听本机端口。

## 两个通道

- **云端官方授权**：工作台优先展示，云端发起设备码流程，账号会话独立保存，支持切换、手动读取官方额度和手动唤醒。
- **现有计划通道**：原有 ChatGPT 计划 API/SIWC 授权继续保留，折叠在“现有计划通道”中。它的客户端、令牌、刷新记录与模型配置保持独立。云端账号列表的切换不会替换该通道的令牌。

本阶段交付账号管理。新云端账号需要所有者完成一次官方授权后，才能验收真实额度和唤醒。出题仍沿用现有已应用模型；新通道的出题适配、任务绑定及真实练习验证在该授权完成后继续，不能把“设备码已生成”描述为“出题已接通”。

## 使用

1. 在模型工作台使用原有动态验证码进入。
2. 在“OpenAI 官方授权”点“添加账号”。等待云端返回一次性设备码，打开官方页面，使用现有账号登录并确认。
3. 回到工作台，授权成功后账号会自动加入云端名单。刷新页面会沿用本次授权查询编号；关闭网页不会终止云端等待，但设备码过期后需要重新开始。
4. 已保存账号可设为该通道的当前账号；“重新授权”用于恢复失效会话。只有官方验证和云端保存均成功后，账号才进入名单。
5. “刷新真实额度”读取官方返回的窗口、已用比例和重置时间。优先显示多限额桶，缺失显示“未返回”；不把项目次数换算为官方额度，也不会自动使用重置券。
6. “手动唤醒”只在点选后发起一次轻量推理，显示实际结果、耗时和用量。不会在刷新名单或打开页面时自动调用。

如果官方账户/工作区未允许设备码登录，需要账号所有者在官方设置中处理；程序不会绕过登录策略。密码、MFA 和授权确认由所有者在官方页面完成。

## 实现与边界

官方运行时固定 `@openai/codex@0.163.0-linux-x64`，校验 npm SHA-512 以及两个执行文件的 SHA-256，再用可复现脚本打包。层 ZIP 不进入 Git；仓库保留版本、校验值和打包脚本。现有腾讯云 Worker 挂载官方运行层与原有代理层，API 只创建任务和查询状态，不在 HTTP 请求中等待用户登录。

每次启动均使用独立临时目录和最小子进程环境，不读取本机或 Cockpit 的现有账号凭据。通过官方 App Server 管理登录和刷新；账号授权记录保存在私有 COS 控制前缀 `openai-codex/`，启用服务端 AES256 加密。与 `openai-siwc/` 完全隔离。前端不接收 OAuth token，只持久化授权查询编号；设备码只在内存显示。

每个账号拥有独立会话 epoch 和不可覆盖的凭据版本，同一刷新链串行运行。新的一次官方授权产生独立 epoch，旧运行不覆盖新会话。写入完成并关闭进程后保存关闭检查点，再释放运行锁；释放标记短暂失败时可恢复。无法确认是否已轮换的异常中断不重放旧 refresh token，改为要求重新授权。取消与提交用不可覆盖的终态记录互斥，取消成功不激活候选账号。官方已确认的候选授权按固定 epoch 分步提交，保存中断后继续提交，不重新发起登录。所有管理端点沿用现有教师会话和来源校验。

`backend/codex-runtime.cjs` 提供官方 RPC、授权、额度及受限文本回合封装；账号层不会将其令牌转换为 SIWC 凭据。工具执行不属于出题功能，关闭工具配置并拒绝运行时的工具/权限请求。

## 维护与验证

2026-10-21 腾讯云正式服务实测：发起设备码任务成功，约 **5.03 秒**取得官方链接与一次性代码；主动取消成功，Worker 确认取消并正常退出。未新增真实账号，原计划授权账号和模型配置保持一致。API/Worker 两份代码包各69文件与源码逐字节一致，内存仍为256MB，时限仍为60秒/900秒。981项单元测试通过；320px、390px、1440px 的匿名界面检查无横向溢出。

尚未由账号所有者完成本次新通道的实际授权，因此**没有声称真实额度、手动唤醒或新通道出题已实测成功**。现有计划通道的历史生成验证继续有效，两者不能混为一次验收。

### 管理接口

以下接口均要求现有教师 Bearer 会话并受来源校验。POST 使用 `X-Request-ID` 保持任务幂等；同编号不同请求返回409。设备码与账号凭据不会进入公开资源或普通生成进度。

| 接口 | 用途 |
| --- | --- |
| `GET /admin/codex/accounts` | 账号名单、当前选择、最近官方额度快照 |
| `POST /admin/codex/accounts/active` | `{accountId, expectedRevision}`，切换本通道当前账号 |
| `POST /admin/codex/authorize` | `{mode:'add'}` 或 `{mode:'reauthorize',accountId}`，创建后台授权任务 |
| `GET /admin/codex/authorize/:id` | 查询排队、设备码等待、完成、取消、失败或到期；已确认候选可继续保存 |
| `POST /admin/codex/authorize/:id/cancel` | 取消等待；提交已取得终态锁时返回409，避免假报取消 |
| `POST /admin/codex/accounts/:id/quota` | 创建官方额度读取任务，不调用模型 |
| `POST /admin/codex/accounts/:id/wake` | `{model,effort}`，创建一次手动轻量推理 |
| `GET /admin/codex/operations/:id` | 查询额度/唤醒任务的真实结果 |

新增配置为 `OPENAI_CODEX_ENABLED=true`、`OPENAI_CODEX_BINARY=/opt/jianwei-codex/bin/codex`；执行层 `jianwei-openai-codex:1` 只挂载 Worker。API 与 Worker 保留原有代理、TOTP、角色和其他服务配置，不能用完整环境覆盖方式重新部署。

```sh
node tools/package-codex-layer.cjs --package-dir /path/to/official/package --out /path/to/layer.zip
node --test tests/codex-accounts.test.js tests/codex-runtime.test.js tests/workbench-cloud-accounts.test.js
```

自动化覆盖 TOTP/Origin、会话隔离、续期持久化、取消、并发锁、断联恢复、官方链接验证、额度缺失、秒级重置时间及重复窗口。视觉验证使用明确的匿名本地夹具，示例额度不是用户实际额度。真实验收记录以发布后的云端检查与所有者授权结果为准。

参考：[官方登录](https://learn.chatgpt.com/docs/auth)、[官方 App Server](https://learn.chatgpt.com/docs/app-server)、[SIWC 计划授权](https://developers.openai.com/siwc/token-sharing-open-source/sign-in)。
