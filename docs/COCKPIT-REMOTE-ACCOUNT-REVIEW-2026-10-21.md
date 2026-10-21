# Cockpit 账号能力与跨设备授权审查 · 2026-10-21

## 已确认的问题

上一版工作台使用 ChatGPT 计划 API 的开放源码授权流程，入口为 `http://127.0.0.1:24765` 的本机助手。它指向使用者正在操作的设备，不是腾讯云服务器。因此，没有启动助手的电脑和手机不能完成新增或重新授权；当前的“切换”同样依赖重新授权，不能满足任意设备管理的预期。本轮不把它描述为已经完成的跨设备授权。

本项目目前的 saved 记录只保留身份与注册信息，不是各账号独立的可用会话。直接把历史版本 refresh token 再读出使用可能重放已轮换令牌。若建设独立账号会话，须按账号隔离保存、串行续期、处理终止状态与在途任务，不能通过复制历史令牌补齐。

## Cockpit 实际如何实现

参考了本机 Cockpit Tools 1.3.72 的账号页、账号测智界面，以及作者公开仓库的以下代码；未导出或迁移用户账号令牌，未运行任何测智/唤醒调用。

| 能力 | 公开源码中的实现 | 对本项目的意义 |
| --- | --- | --- |
| Codex 设备码登录 | `codex_oauth.rs` 的 `start_device_auth`，使用官方设备验证页面，后台轮询结果；设备码有期限 | 可以让网页显示官方验证链接和一次性代码，由用户在任意设备完成登录；不依赖该设备监听本机端口 |
| ChatGPT 计划授权 | `chatgpt_plan_oauth.rs` 仍监听 `127.0.0.1` 并用 `dynamic_agent_client` 注册 | Cockpit 也没有把此类回调随意改成公网地址；与 Codex 设备码是两套注册与令牌，不能混用 |
| 5h、周额度 | `codex_quota.rs` 使用 Codex 的 `wham/usage` 等后台接口 | 这些额度不能从本项目的“每日生成次数”或 token 到期时间推算，也不能声称当前计划 API 已提供等价接口 |
| 唤醒账号 | `codex_wakeup.rs` 调用统一账号通道发起最小实际推理 | 会消耗额度，作用是验证/激活正常请求，不会凭空增加额度，也不保证改变官方额度窗口 |
| 鹈鹕/账号测智 | `codex_pelican.rs` 保留批次和流式回复，逐账号隔离、可选并发、同题比较 | 可以对比延迟、输出、实际 token 用量；单次得分不等于模型能力或账号质量的长期结论 |

源码链接：

- [Codex OAuth / 设备码](https://github.com/jlcodes99/cockpit-tools/blob/main/src-tauri/src/modules/codex_oauth.rs)（本次读取 blob `ad7304b3b48d5db8870c46c3448a9a8799f51d33`）
- [ChatGPT 计划授权](https://github.com/jlcodes99/cockpit-tools/blob/main/src-tauri/src/modules/chatgpt_plan_oauth.rs)（`ae14f534a9bc482d48dea2dbed801f0160a6d6aa`）
- [额度](https://github.com/jlcodes99/cockpit-tools/blob/main/src-tauri/src/modules/codex_quota.rs)（`fe881302dc1adbbcb55904c8882e029d17786627`）
- [唤醒](https://github.com/jlcodes99/cockpit-tools/blob/main/src-tauri/src/modules/codex_wakeup.rs)（`cbfe18ed6707b6111c23e5cb0f0284469ba370c6`）
- [账号测智](https://github.com/jlcodes99/cockpit-tools/blob/main/src-tauri/src/modules/codex_pelican.rs)（`d17544c1ca63e9b14a438de7c0b7e2d47ab1f9ce`）

## 推荐的独立云端 Codex 通道

这里的“Codex 通道”指官方运行时和 OAuth 接入方式，使用的仍是现有 ChatGPT/OpenAI 账号，不需要另注册“Codex 账号”。设备码也是 OAuth 授权流程，目的是让使用者在任意设备的官方页面完成登录，而不是要求使用者安装命令行工具。

优先通过官方 Codex App Server 接口实现，不复制 Cockpit 的现有令牌、不冒用它的应用身份，也不直接照搬私有网页接口。

1. **远程登录**：云端启动受限的官方运行时，调用 `account/login/start`，类型为 `chatgptDeviceCode`。工作台只展示 `verificationUrl`、`userCode`、到期与等待状态；用户直接在官方页面登录确认。前端不接收账号令牌。取消、超时和浏览器断联都有明确状态。
2. **账号保存与切换**：每个账号拥有独立加密记录及续期锁，云端保管。账号选择由同一 TOTP 保护，手机、平板、电脑操作相同名单。激活只影响后续任务，在途练习保留提交时冻结的账号/模型。不能混用不同账号或协议的 client、token 和 workspace。
3. **真实额度**：使用 `account/rateLimits/read` 获取实际返回的窗口、已用比例与重置时间。优先多桶 `rateLimitsByLimitId`，剩余比例由 100 减已用比例；缺失显示未返回，不伪装为0或不限。展示更新时间和读取失败状态；不会自动消费官方重置券。
4. **唤醒**：明确为一次轻量真实请求，显示所选账号、型号、耗时、结果与实际用量；只在用户点选后执行，不后台定时消耗额度。先区分刷新身份与实际推理探测。
5. **账号测智**：提供与项目相关的规范题目（题型/计分、公式、表格、图示需求），支持账号/型号/思考强度、预览原始输出、耗时、首字时间和格式/内容分项结果。先小范围单次比较，不默认批量重试，不因一次失误给账号贴“降智”结论。
6. **出题接入**：新增独立 provider，将官方运行时的文本与进度适配回现有命题、校检、图示、导出链路；保留当前已可用的 ChatGPT 计划 API 通道。验证图像输入、结构化结果、取消和长任务后再用于主要出题，不能只完成登录就宣称生成链路接通。

现有腾讯云函数是按次执行的环境，不能假设适合永久运行 App Server。需实测官方 Linux 运行时与现有代理、层容量、进程生命周期以及中断后的凭据恢复；若需要常驻实例或新的收费资源，部署前应把具体配置与费用交由用户确认。

## 官方文档边界

- [ChatGPT 计划注册与登录](https://developers.openai.com/siwc/token-sharing-open-source/sign-in)：OSS 流程要求 HTTP `127.0.0.1` 回调，不能把现有注册直接替换成任意公网域名。
- [网页授权](https://developers.openai.com/siwc/website)：需要另外申请的客户端和准确注册的公网回调；网页身份授权与计划调用是不同能力。
- [Codex 登录](https://learn.chatgpt.com/docs/auth#login-on-headless-devices)：官方支持设备码用于无界面环境，账户/工作区需允许该方式。
- [Codex App Server](https://learn.chatgpt.com/docs/app-server#3b-log-in-with-chatgpt-device-code-flow)：记录设备码登录、账号状态、额度读取及进度接口。使用官方运行时管理授权，不把其令牌塞入当前 SIWC 令牌结构。
- [计划授权使用量](https://developers.openai.com/siwc/token-sharing-open-source/profiles-and-sessions#tracking-usage)：当前计划 API 按文档链接官方 Usage 页面；项目计数、实际 token 用量、官方额度须分别展示。

本文件是已完成的调研与下一阶段设计，**不代表设备码、云端多账号切换、内嵌官方额度或账号测智已经部署**。教师设置页的排版修改属于本轮独立修复，可先发布。
