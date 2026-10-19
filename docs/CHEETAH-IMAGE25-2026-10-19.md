# 猎豹 Image 2.5 调用复核（2026-10-19）

## 已确认的流程

猎豹控制台的无限画布使用 `gpt-image-2.5`（不是 imagine2.5 字面名）。在用户已配置的渠道中选择该模型、质量高、单图，实际于 31 秒生成 1254×1254、约 1.6 MB 的细胞示意图。A、B、C及引线、黑灰线稿在画布可见。图示为接口验收，不包含学生身份或实表成绩。

官方[使用指南](https://www.wefucke.top/image-guide.html)说明生图渠道；画布的[公开实现](https://github.com/basketikun/infinite-canvas/blob/main/web/src/services/api/image.ts)显示默认文本生图为 `/v1/images/generations`，GPT Image 不带 `response_format`，使用 `output_format: png`。自定义脚本编辑器展示的通用模板仍含 `response_format`，不能据此假定它就是实际默认调用。

## 项目适配

新增独立 `cheetah-image25` 入口，冻结 `native-image` 协议、`gpt-image-2.5` 和专用凭据引用。原 `cheetah-image` / ByteCat 的 `gpt-image-2` 聊天协议快照保持兼容，旧任务不被改成新协议。界面服务卡片显示实际型号，不把 Image 2.5 混入出题模型。

请求单图、PNG、高质量，按题目版位选择明确横向/竖向/方形尺寸；实返尺寸可能不同，文档按真实宽高比等比放入预留位置。返回既支持 `data[].b64_json` 也支持已授权主机的 URL，沿用私有候选下载恢复、实际像素核对和教师审题。

## 实测边界

本地曾分别调用通用原生包装和聊天包装，均遇到连接中断；猎豹日志出现至少一条 Image 2.5 27秒 / ¥0.02 的消耗记录，因此断联不等于上游没有计费，不能直接自动重发。

网页画布成功与本地 API 中断是分别记录的结果。后台启用以腾讯云真实调用回执为准；默认服务不自动切离 ByteCat。当前记录不能证明所有图像类别或任意负载均稳定，具体科学结构仍要审阅。
