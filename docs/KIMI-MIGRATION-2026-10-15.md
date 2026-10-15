# Kimi K3 接入准备与核查

状态：本地适配准备，尚未创建 Kimi 密钥、调用真实 Kimi 模型或切换腾讯云服务。默认仍使用原有 Gemini 配置，正式网页不变。

现有私有云端任务诊断显示，最近三次数学6/8题生成均约127秒返回上游HTTP 524，属于中转链路超时。既有字段校验错误另外保留，不能把所有失败都归为题量或网络问题。

官方 Kimi Code 文档允许个人交互式使用与第三方工具，但不允许脚本批量、转售、篡改客户端身份、账号能力转发等。产品集成指向开放平台。是否接入 Code 会员须先确认实际使用范围；不可将接口返回200视为已确认适用许可。

- Code：[社区使用规范](https://www.kimi.com/code/docs/kimi-code/community-guidelines.html)、[平台对比](https://www.kimi.com/code/docs/#平台对比)、[模型配置](https://www.kimi.com/code/docs/kimi-code/models.html)。模型`k3`，国内地址`https://api.kimi.com/coding/v1`。
- 开放平台：[K3官方文档](https://platform.kimi.com/docs/guide/kimi-k3-quickstart)。模型`kimi-k3`，地址`https://api.moonshot.cn/v1`，与会员订阅分开按量计费。

准备的服务端适配固定`reasoning_effort=max`；使用官方流式接口、逐题JSON Schema与真实应用User-Agent，读取最终content，不解析或保存推理正文，不修复或改写模型输出，不自动换模型重试。保留现有六科提示词、匿名依据、审题与导出约束。输出预算131072 tokens，空闲超时120秒，绝对请求上限840秒；Kimi事件函数部署配置为900秒，任务查询按接收时保存的模型配置和开始时间计算截止点，避免沿用旧模型7.5分钟的查询超时。部署切换前已接收的任务保留原提供方，不自动改成另一模型调用。

部署脚本仅在明确设置`TRAINING_PROVIDER=kimi-platform`或`kimi-code`时读取仓库外同名`.key`文件。默认不启用新提供方。密钥仅进入事件函数，HTTP函数只保存提供方名称；教师动态码、会话签名、任务桶与正式站均不改动。上线前仍须确认使用范围、准备对应密钥、实际联调与较大题量验证，并适配前端等待时间估计。

206项单元检查通过。定向模拟检查覆盖12题Schema、max参数、流式完整性、推理正文隔离、凭据脱敏、任务固定提供方、8分钟后仍能查询同一任务，以及绝对网络截止时间。模拟检查不能替代真实API连通性与出题质量验证。
