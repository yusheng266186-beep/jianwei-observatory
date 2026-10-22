# 鹈鹕测智：原版提示词与HTML动画

本次以本机安装的 **Cockpit Tools 1.3.73** 为参照。原来的实现把任务改成了静态SVG，额外禁止动画，与该版本鹈鹕测智不一致；现已恢复HTML动画任务。

## 原版提示词

默认用户消息逐字如下，直接作为文本发送，不加JSON包装：

```text
创建一个 HTML，内容是 SVG 绘制一个鹈鹕骑自行车的 2D 动画，你不需要任何测试，不要有任何限制
```

交付指令也逐字保留：

```text
Follow the output format requested by the user. For HTML or SVG creation tasks, return a complete standalone HTML document without Markdown fences or external dependencies. For other tasks, answer directly in the requested format; do not wrap plain text or JSON in HTML. Do not use external tools or search.
```

来源是 [v1.3.73 用户提示词](https://github.com/jlcodes99/cockpit-tools/blob/5330f75ae6b3c39fbd72f528ac2188207047d49a/src/types/codexPelican.ts)及[交付指令](https://github.com/jlcodes99/cockpit-tools/blob/5330f75ae6b3c39fbd72f528ac2188207047d49a/src-tauri/src/modules/codex_pelican_transport.rs)。没有读取或迁移Cockpit账号凭据。

| 字段 | UTF-8 SHA-256 |
| --- | --- |
| 用户提示词 | `d214d1f703014e106834f745536f9d92301c59f8f89b9a5d2a2a8f6f4046d03c` |
| 交付指令 | `4301f6c6072367bfeebf92a618f296fab3af16c85b629bd007a72125aa455579` |

云端来源文件为 [pelican-prompt.json](../backend/pelican-prompt.json)，界面默认值为 [pelican-prompt.js](../assets/pelican-prompt.js)。单元测试同时核对文本一致性与哈希，防止后续无意改写。用户可以在工作台查看、调整并恢复原版提示词；旧版本自动填入的静态SVG默认文字会迁移，自定义文字保留。

## 发送、保存与展示

- 每轮冻结实际提示词、交付指令和 `promptVersion`，当前默认版本为 `cockpit-1.3.73`。比较候选仍由教师自行选择，不修改当前出题模型、思考强度或账号。
- 新任务请求完整HTML，不再额外追加只许SVG、禁止动画或练习JSON规则。Gemini使用文本输出；Kimi不附加练习JSON Schema；官方运行时直接发送原始用户文本。
- 返回的完整HTML、闭合HTML/SVG围栏或完整SVG可以显示。保留原文、CSS和脚本，不经过模型二次改写；没有完整文档则显示说明并保留原文。旧SVG历史继续读取，不因升级重新请求模型。
- 预览保留动画，提供放大窗口和HTML/SVG原稿下载。后台轮询保留已经完成的预览节点，避免动画因状态刷新重新开始。
- 模型原文按文本显示，HTML仅在独立预览页的无同源权限沙箱中运行，不能读取工作台DOM、账号或浏览器存储。预览禁止联网、子框架和浏览器弹窗；这些是浏览器隔离措施，没有附加到模型提示词中。工作台主文档仍禁止内联脚本。

提示词复制部分遵循上游标注的CC BY-NC-SA 4.0，具体来源及归属见[第三方声明](../THIRD_PARTY_NOTICES.md)。

## 验证范围

自动测试覆盖逐字提示词、官方运行时原始输入、Gemini/Kimi文本协议、完整文档提取、原稿保留、旧记录恢复和预览消息隔离，本轮共1025项通过。

真实云端比较 `f708d8e8-5ad8-4688-a83e-756cc8a69402` 使用当前官方 Sol6.1／high，一次完成完整HTML：首段正文39.7秒，总耗时120.2秒，原稿16046字符，上游报告输入5765、输出7387 token。模型、思考档位、当前账号和生图配置前后相同。

已在390×844及1280×900视口检查实际HTML及放大窗口；下载HTML与云端原稿逐字一致，刷新记录保留相同预览节点，浏览器未记录执行错误。历史SVG也可显示；其中固定尺寸SVG增加预览适配，不改下载原稿。真实样本用于确认传输、保存和呈现链路，不把一次完成等同于模型能力评分。
