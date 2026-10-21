# ChatGPT 官方授权与云端连接（2026-10-21）

本项目新增独立提供方 `openai-chatgpt`，工作台显示“OpenAI 官方 · ChatGPT 授权”。可选择 GPT-6.1 Sol、GPT-6 Astra，以及轻快、均衡、深入三档，分别发送 `low`、`high`、`max`。模型列表已使用本次授权账号向官方接口核对；接入不代表每个型号与档位都已实际生成。

本次由维护者本人在 OpenAI 官方页面完成本项目的独立授权。没有复制 Cockpit Tools、Codex 的既有账号令牌，也不通过 ChatGPT 私有网页接口调用。当前为已确认的单人使用，不自动轮换账号，不把一个账号作为多人共享服务。

## 网络与凭据

- 只迁移 v2rayN 正在使用的 Hysteria2 节点配置，Linux 云端运行官方 Xray 26.9.9；没有在服务器上安装 macOS GUI。
- 官方发布包的 SHA-256 已与 `.dgst` 一致；核心作为私有腾讯云层 `jianwei-openai-xray:1` 部署，Worker 从 `/opt/jianwei-openai/xray` 读取。后续只更新函数代码时不会丢失代理核心。
- `openai-proxy.cjs` 只处理固定的 OpenAI 模型、Responses、令牌及公钥接口。保留 TLS 验证和节点证书固定，只监听函数内部回环地址；不开放公网代理，不改变腾讯云、COS 或其他模型提供方的传输路径。
- 核心按调用启动，多项并发请求共享同一启动过程；最后一项结束即关闭并清理临时配置。没有常驻转发服务，运行不依赖本地电脑开机。
- OAuth 使用 PKCE S256、随机 state/nonce、稳定主机标识、签发的应用 client ID，并验证 ID 令牌签名、issuer、audience、nonce 与期限。首次注册名称为 `Jianwei Observatory`；续期和重新登录复用该注册，不冒用其他客户端。
- 访问、刷新与 ID 令牌只保存于仓库外的 0600 文件，以及 COS 私有控制前缀下启用 AES256 服务端加密的凭据记录；不进入 Pages、浏览器存储、普通日志或公开接口。
- 凭据位于 `training-control-v1/openai-siwc/`，与14天试题生命周期分开。导入后由云端负责刷新，本地副本只作为受保护备份，不同时执行刷新。
- 云端采用不可覆盖锁串行刷新、不可变版本保存整组轮换凭据。保存短暂失败只重试保存；刷新响应不确定时不盗锁或重复使用旧刷新令牌，应通过独立授权恢复。

## 请求和现有流程

官方套餐线路要求 `store:false`、`stream:true` 和数组形式的 `input`。系统要求放入 `instructions`，不把显式 system 消息或中转站的 `max_output_tokens`、温度、持久会话等参数直接照搬。无需新增提示词润色模型。

所有已有的学科范围、四川高考题型、题组分拆、内容复核、格式修复、图示规划、教师审题、PDF及Word输出流程继续使用。必须收到 `response.completed` 才算推理完成；断流、失败与未完成分别处理，不把片段当作成稿，不自动切换其他付费服务重发。

服务公开提供的推理摘要和正文增量继续显示；摘要不等于模型完整内部思考。官方套餐本身不提供本线路的托管生图工具，复杂插图仍由工作台已有独立生图服务负责，图示模型的选择仍有效。

ChatGPT 套餐额度与账号共享，不等于无限调用。官方返回套餐用量上限或授权不可用时，界面给出对应的中文处理提示；不误报为 JSON 格式错误或网络断开，不自动换账号。

## 实际验证

| 范围 | 结果 |
| --- | --- |
| 云端节点连接 | 独立两轮与部署后复测均通过；模型接口无令牌返回预期401，授权发现返回200，约1.2～1.4秒 |
| 本地官方授权最小推理 | Sol 6.1轻快档，正确返回 `37×19=703`，约2.5秒，完整SSE结束 |
| 独立云端命题 | Sol 6.1均衡档，导数相关3题，约56秒，通过结构校验 |
| 正式完整流程 · 深入档 | Sol 6.1 max，3题，命题与内容复核约204秒，无格式修复 |
| 正式完整流程 · 均衡档 | Sol 6.1 high，选择、填空、解答各1题，约56秒；指定三个知识点均覆盖，内容复核无修改或意见 |
| PDF实际输出 | 同一正式成稿，学生版1页、教师版2页；逐页查看公式、选项、分页和留白，未见裁切或公式缺字 |
| 回归检查 | 820项单元测试通过；共享训练结构一致；运行时资源检查通过 |

测试中补强了留白约束：建议行数只进入 `answerLines`，不得在题干插入连续空行模拟作答区域，不在解析或答案中打印排版建议。新版实际请求携带 `answerSpaceVersion:1`；选择、填空各0行，实测解答题12行，由原有排版组件应用。

上述耗时为本次少量实测，不是TPS或长期成功率承诺；本轮没有进行其他科目、复杂生图、Astra实际命题或等待满一个令牌周期的真实续期测试。续期并发、保存故障和身份验证错误由专项测试覆盖。测试时短暂冻结官方型号用于新任务，提交后已恢复原模型选择；出题、图示、生图及额度等既有设置未被重置。

## 维护与重新授权

授权与导入工具只由维护者在本机执行，不部署到网页，不对外接收凭据。私有目录必须在仓库外；其中复用 `tencent.credentials.json`、`jianwei-openai-host.json` 与 `jianwei-openai-siwc.json`。`OPENAI_ACCOUNT_FILE` 可指定本地独立记录文件名，不能含路径；不会通过换文件自动切换云端账号。

```sh
TRAINING_PRIVATE_DIR=/absolute/private/directory npm run openai:login
```

打开命令给出的本地入口，在官方页面完成登录、核对应用名称和授权范围。工具只打印本地入口和安全状态，回调成功后跳转不含授权码的完成页面；重新登录复用已有应用 ID，失败注册保留客户端草稿，下一次尝试生成新的PKCE和state。

```sh
TRAINING_PRIVATE_DIR=/absolute/private/directory \
TRAINING_BUCKET=<private-bucket> TRAINING_REGION=ap-chengdu \
npm run openai:import
```

导入工具只接收已验证、未过期的授权记录，使用专属腾讯云凭据写入加密控制前缀，并标记云端拥有续期。它不会改变工作台的模型选择，也不会把其他账号静默覆盖到现有注册。

Worker配置应保留 `OPENAI_PROXY_CONFIG`、`OPENAI_XRAY_PATH`、`OPENAI_SIWC_ENABLED=true` 与已绑定代理核心层；HTTP函数仅在 `TRAINING_CONFIGURED_PROVIDERS` 声明 `openai-chatgpt`，不持上游账号令牌。代码更新应保留现有环境、层、角色、网络、TOTP及控制区；不要用旧的初始化命令覆盖生产设置。

需要停用时先停止选择该提供方，再在 ChatGPT 设置中撤销本项目授权；删除本地试题缓存并不撤销官方授权。代理网络可达与账号实际权限、服务资格、套餐可用性需要分别确认。

官方依据：[注册与登录](https://developers.openai.com/siwc/token-sharing-open-source/sign-in)、[个人自托管VM](https://developers.openai.com/siwc/token-sharing-open-source/self-hosted-vms)、[模型与推理](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference)、[会话与续期](https://developers.openai.com/siwc/token-sharing-open-source/profiles-and-sessions)、[预览限制](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations)。
