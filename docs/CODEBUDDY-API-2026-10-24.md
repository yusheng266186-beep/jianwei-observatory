# CodeBuddy CLI API

模型工作台新增独立的 **CodeBuddy · CLI API** 服务。沿用用户为CodeBuddy CLI配置的API Key，云端直接请求`https://www.codebuddy.cn/v2/chat/completions`，不启动本机CLI，不依赖Mac持续在线。认证使用Bearer，流式请求沿用本项目真实User-Agent。

目录依据本机官方CLI 2.174.0声明的14个可选型号：Hy4 Preview、Hy3、Step 5 Preview、Space Bunny、DeepSeek V4.1 Flash、GLM 5.3 Flash/FlashX、Hy3-X、MiniMax M3/M2.7/M3.1 Flash、Kimi K3.1 Pro/Highspeed和MiMo V2.6 Pro。目录不代表每款均已真实调用或有账号权益。

轻快、标准、深入映射至各型号官方配置声明的档位；只声明固定档位的型号保持该值，不虚构max。北辰工作台同时提供相同型号的原生档位。请求始终开启流式，按型号限制输出上限；不发送关闭思考或工具执行请求。完整系统指令、对话角色及任务输入沿用各项目现有流程。

`CODEBUDDY_API_KEY`只保存在现有Worker和北辰云函数环境，Jianwei API仅增加已配置提供方标记。前端、公开仓库、私有工作台HTML与状态文件都不含该密钥。两个网站与CLI共用该Key所属账号的额度和限流；模型不可用时沿用既有明确失败行为，不静默更换服务。

本次增加目录，不替用户切换当前模型。北辰同步公开源码、私有维护工具和远端工作台目录；无需替换已有v1.7 HTML。

依据：[CodeBuddy身份与访问管理](https://www.codebuddy.cn/docs/cli/iam)、[环境变量参考](https://www.codebuddy.cn/docs/cli/env-vars)，以及本机官方CLI模型配置。该模型网关路径不属于官方已承诺稳定的独立REST API，后续CLI网关变化需维护适配；本轮实际调用与部署结果另存维护回执。
