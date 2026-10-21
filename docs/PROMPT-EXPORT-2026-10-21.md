# 训练提示词静态导出：教师审阅导览（2026-10-21）

本文件是教师易读的**审阅导览**，不是提示词全文。完整编译原文在同一次导出的 TXT 与 JSON 中；本文件不会用摘要替代原文。导出工具只读取并调用当前仓库的提示词 builder，不访问网络、不调用模型、不读取或写入任何凭据，也不包含真实学生、真实考试或原始成绩表数据。

工具入口：`tools/export-training-prompts.cjs`。测试入口：`tests/prompt-export.test.js`。

## 目录

- [1. 如何导出](#1-如何导出)
- [2. 导出内容与数量](#2-导出内容与数量)
- [3. 目录结构](#3-目录结构)
- [4. 固定规则与动态选项的分工](#4-固定规则与动态选项的分工)
- [5. 各学科特有规则（审阅提示）](#5-各学科特有规则审阅提示)
- [6. 三种训练策略](#6-三种训练策略)
- [7. 分值与作答留白](#7-分值与作答留白)
- [8. 各环节职责](#8-各环节职责)
- [9. 供应商适配差异（审阅重点）](#9-供应商适配差异审阅重点)
- [10. 样例来源与不能声称的内容](#10-样例来源与不能声称的内容)
- [11. 校验与复核方法](#11-校验与复核方法)
- [12. 目录索引](#12-目录索引)

## 1. 如何导出

```sh
node tools/export-training-prompts.cjs --out /绝对路径/新的导出目录
```

- `--out` 必须是不存在的绝对路径目录；工具会新建目录，已有导出目录直接拒绝，不覆盖。
- `--help` 显示用法。
- 导出完成后，导出目录的 `README.md` 末尾会生成本次目录索引；仓库中的 `docs/PROMPT-EXPORT-2026-10-21.md` 不记录某次运行的绝对路径。
- 所有 Markdown、TXT、JSON 与清单均为 UTF-8，换行使用 LF。
- 工具只生成 Markdown/TXT/JSON/清单，不生成 Word、PDF 或成百页的排版文档。
- 工具不打包 ZIP；如需压缩，由调用方在导出完成后自行处理，不引入额外依赖。

## 2. 导出内容与数量

| 内容 | 数量 | 说明 |
| --- | ---: | --- |
| 出题提示词 | 120 | 10 学科 × 3 训练策略 × 4 配图策略，均使用 `separateFigures:true` |
| 内容复核 | 10 | 每学科一份；通过 `reviewContent` 的 `options.complete` 注入捕获 |
| 格式修复 | 10 | 每学科一份；复用 `buildRepairPrompt` |
| 图示规划 | 10 | 每学科一份 |
| 矢量核对 | 10 | 每学科一份；只核对矢量定义，不声称看过像素 |
| 像素核对 | 10 | 每学科一份；实际请求另附图片，导出不含 base64 |
| 无像素委托核对 | 10 | 每学科一份；只核对插图委托，不声称看过实际图片 |
| 代表性生图提示词 | 1 | 生物叶片横切示例；只导出提示词，不生成图片 |
| 供应商行为与 payload 样例 | 1 组（9 个文件） | Gemini、Kimi、官方 responses/chat-completions/anthropic、OpenAI ChatGPT 授权 |

合计 181 个提示词对象（120 + 10 + 10 + 40 + 1），另有 9 个供应商说明/payload 文件、`README.md`、`manifest.json` 与 `SHA256SUMS.txt`。

出题组合固定为：

- 训练策略：`targeted`（薄弱点专项）、`variation`（同类变式）、`retest`（复核小测）。
- 配图策略：`auto`（自动判断）、`none`（不配图）、`vector`（矢量）、`hybrid`（矢量为主、必要复杂外观可生图）。

## 3. 目录结构

```text
<导出目录>/
  README.md                          # 本导览 + 本次目录索引
  manifest.json                      # 数量、版本、文件列表与 SHA256
  SHA256SUMS.txt                     # sha256sum 兼容校验清单
  exercise/<学科>/<策略>-<配图>/     # prompt.txt + prompt.json
  review/<学科>/                     # review.txt + review.json
  repair/<学科>/                     # repair.txt + repair.json
  figures/<学科>/plan/               # plan.txt + plan.json
  figures/<学科>/review-vector/      # review-vector.txt + review-vector.json
  figures/<学科>/review-pixels/      # review-pixels.txt + review-pixels.json
  figures/<学科>/review-brief/       # review-brief.txt + review-brief.json
  illustration/                      # 代表性生图提示词
  providers/                         # 适配行为、尾部原文、Kimi Schema 对照、payload 样例
```

每份出题/复核/修复/图示 JSON（`prompt.json`、`review.json`、`repair.json`、`plan.json`、`review-*.json`）直接包含：

- `system`：实际发送的 system 原文，未润色。
- `rawSystem`：builder 直接返回的 system；复核与图示阶段会因 `structured` 追加 Schema 说明而与 `system` 不同。
- `systemSuffix`：`structured` 实际追加到 system 末尾的原文（出题/修复为空）。
- `input`：示例 user input，未润色。
- `schema`：本次输出 Schema 原文。
- `generation`：Gemini 实际 `generationConfig` 中除 Schema 外的参数（temperature、maxOutputTokens、responseMimeType、thinkingConfig）。
- `outputReminder`：Gemini 官方冻结通道追加的最后一段 user part 原文。
- `provenance`、`notes`：静态编译、匿名教师演示配置等边界说明。

生图 JSON 直接包含 `promptText`，以及 `input.diagram` 与 `input.layout`；没有 system 或输出 Schema，因为生图接口不使用这两项。TXT 是同一内容的教师可读排版，不是另一份摘要。JSON 是机器可读原文。

## 4. 固定规则与动态选项的分工

固定规则来自当前代码，不随某次运行手工改写：

- `backend/prompt-policy.cjs`：环节职责、规则优先级、依据边界。
- `backend/templates.cjs`：学科命题规则、四川高考题型规范、学科题型边界、训练策略文案、图示可选规则。
- `backend/curriculum-boundaries.cjs`：学科教材与考试范围边界。
- `backend/subject-scoring.cjs`：学科题型与分值口径。
- `backend/teacher-brief.cjs`：教师选择落实、题型区分、难度落实、分值、复核边界。
- `backend/document-format.cjs`：JSON 编码、公式、数据表、正文与留白格式。
- `backend/content-check.cjs`：独立复核职责、不可变字段、允许修订字段、判定契约、学科复核清单。
- `backend/figure-prompt-guidance.cjs`、`backend/figure-guidance.cjs`、`backend/advanced-figure-guidance.cjs`、`backend/geography-guidance.cjs`、`backend/science-guidance.cjs`：图示规划、矢量、学科图库与核对边界。
- `backend/exercise-contract.mjs`：请求校验、输出 Schema、逐题槽位、题型枚举、图示字段。
- `backend/generator.cjs`、`backend/content-check.cjs`、`backend/figure-generation.cjs`：提示词组装与修复/复核/图示职责。

动态选项来自教师请求与本次运行：

- 学科、教材范围、训练重点、已选训练点、题型、难度、题数、时长、补充要求。
- 三种训练策略与四种配图策略。
- 逐题槽位的 `id`、`type`、`target`。
- 输出 Schema 的题数、题型枚举、训练点枚举、`prefixItems`、是否含 `figureRequest` 或 `answerLines`。
- 图示委托的 caption、requirements、knownData、labels、precision、placement。

因此，审阅时不要把本导览中的一句话当成完整规则；以对应 TXT/JSON 的 `system` 与 `schema` 为准。

## 5. 各学科特有规则（审阅提示）

以下是便于定位的摘要。完整原文在每个学科的 `template.rule`、复核清单和图示指南中，已完整编译进导出文件。

| 学科 | 审阅时优先核对 |
| --- | --- |
| 语文 | 阅读材料完整且同组逐字一致；古诗文给足文本与注释；原创诗文标自拟，不伪造作者出处；答案要点回指材料；写作明确文体、任务、字数；限字改写逐字核对是否含标点。 |
| 数学 | 定义域、参数范围、边界与退化；答案唯一、无增根漏解；选择题逐项验算；立体几何共面、遮挡与翻折命名；图像、坐标与答案一致；评分点合计等于满分。 |
| 英语 | 阅读与完形材料完整；七选五五空与 A—G 备选句完整；语法填空给必要提示词并核对可接受变体；写作词数逐词核算；不以无出处话语制造权威；无音频不生成听力。 |
| 日语 | 完整日文语境；助词、时态、授受、敬语、词形与语体；新课标语篇完形/语法填空；不生成孤立互译、连线或口头活动；写作任务、字数与语体明确。 |
| 物理 | 研究对象、参考系、正方向、单位与常量；板块/传送带等相对运动端点；力作用期间与撤力后全过程；电阻率公式与量纲；受力图、v-t 图、电路与答案一致；有效数字。 |
| 化学 | 仪器外形、液位、长短导管、气路、洗气/干燥/吸收/防倒吸；元素、电荷与反应条件守恒；洗气副反应（如 NaHCO₃ 吸收 HCl 额外生成 CO₂）；指示剂与滴定终点；试剂作用完整性；鉴别题不提前泄露身份；mhchem 与数据表格式。 |
| 生物 | 概念层级与教材一致；遗传亲代、显隐性、基因位置与概率条件充分；实验自变量、因变量、对照、重复与结论边界；光合/呼吸速率单位与数量级（μmol 与 mmol 不可混写）；净光合与光呼吸的混杂解释；系谱图不提前透露基因型。 |
| 历史 | 起源、发展、普及的时间措辞；自拟材料明确标注，不伪造作者、出处或逐字引文；数据与年代前后一致；分小问分别标分；结论对应可见史料证据；不把未设问内容设为必答得分点。 |
| 政治 | 生产资料公有制基础、公有制主体地位、国有经济主导作用分别表述；不编造政策、法律条文或实时事件；材料题有原理、材料对应与论证；分小问标分；逻辑传导用普通 Unicode 箭头 →。 |
| 地理 | 坐标、比例尺、区域范围交叉复算；海岸线延伸方向与陆海方位相容；海陆风分近地面/高空、昼夜；等高线、剖面、气候与水文数据支持设问；原创数据标示意；待求方向不提前标出。 |

## 6. 三种训练策略

| 策略 | 代码中的含义 | 审阅重点 |
| --- | --- | --- |
| `targeted` 薄弱点专项 | 围绕教师已确认的 `targets` 和 `focus`，先概念后应用；每题 `target` 明确，不按 evidence 未选项扩大知识点；题数不足时优先保证已选目标覆盖，不拆散完整题组。 | 每题是否真正对应已选训练点，而不是只换标签。 |
| `variation` 同类变式 | 保留核心方法，改变情境、已知条件或设问角度；题数允许时使用不止一种设问，但不为凑设问拆散七选五、语法填空等完整题组；答案逐题独立验证，不把数字换皮当迁移。 | 是否真正改变条件或设问角度，答案是否独立成立。 |
| `retest` 复核小测 | 形成能独立计分的复核小测，题干不泄露解法，覆盖确认的知识点，答案评分点便于逐题记录和后续复核。 | 是否可独立计分、是否覆盖已确认知识点、是否泄露解法。 |

难度由 `difficultyProfile` 决定；“适度提升”会按代码映射为“方法进阶”。难度应落实在条件、材料、推理层数与计算负担，不只改 `level` 标签。

### 四种配图策略

| 策略 | 代码中的行为 |
| --- | --- |
| `auto` 自动判断 | 老师授权按题目需要决定是否配图；不强制出图，精确结构优先矢量，必要的复杂外观才使用已配置生图服务且至多一张；不为装饰造题，整份练习可以零图。 |
| `none` 不配图 | 只用文字与公式；Schema 不含 `diagram` 或 `figureRequest`；不使用依赖缺失图片的“如图”、读图或装置识别设问。 |
| `vector` 矢量 | 只使用标准矢量模型、science spec、plot/bars/scatter 或受控 drawing；禁止 `illustration`；复杂结构改成完整文字或可验证的矢量示意。 |
| `hybrid` 矢量为主 | 优先标准矢量；只有确实无法用矢量清楚表达的复杂外观，才允许至多一张 `illustration`，并交独立生图与核对环节。 |

本次出题提示词统一使用 `separateFigures:true`：出题阶段只产生 `figureRequest`，不直接输出 `diagram`；图示规划与核对在单独阶段完成。

## 7. 分值与作答留白

### 7.1 分值口径

当前口径来自 `backend/subject-scoring.cjs`，参考 2025 年四川适用的新高考真卷组织专项练习，不冒称未来年份结构不变，也不强凑整卷题数或 100/150 分。

| 学科 | 主要分值口径 |
| --- | --- |
| 语文 | 客观选择通常每题 3 分；完整材料作文参考 60 分；片段训练按实际设问单独标分。 |
| 数学 | 单项选择每题 5 分，多项选择每题 6 分，独立填空每题 5 分；解答按小问、推导与结果配分。 |
| 英语 | 阅读四选一每小题 2.5 分；七选五每空 2.5 分；完形每空 1 分；语法填空每空 1.5 分；完整应用文 15 分、读后续写 25 分。 |
| 日语 | 阅读每小题 2.5 分；语篇完形每空 1 分、语法填空每空 1.5 分；完整应用文 10 分、完整主题写作 30 分。 |
| 物理 | 单项选择每题 4 分，多项选择每题 6 分；多选全对 6 分、选对不全 3 分、有错或未选 0 分；实验与计算按步骤配分。 |
| 化学 | 单项选择通常每题 3 分；非选择题用填空、实验、计算承载，按方程式、结论、依据与步骤配分。 |
| 生物 | 单项选择通常每题 3 分；非选择题按概念、实验设计、遗传推理与结论配分。 |
| 历史 | 单项选择通常每题 3 分；材料解析与历史解释按子问配分。 |
| 政治 | 单项选择通常每题 3 分；材料分析按原理、材料对应与论证配分。 |
| 地理 | 单项选择通常每题 3 分；综合分析按特征、依据、机制与结论配分。 |

共同要求：

- 一道 `questions` 项可能是独立小题或完整材料题组；题干各小问标明分值，`maxScore` 是该题合计。
- 评分点 `points` 的明确分值合计应等于 `maxScore`；作文用互斥分档或评分维度，不跨档相加。
- 客观题只按选项计分；单选 `points` 用一个字符串写明选对满分、错选或未选 0 分；多选写明全对、部分对、错选与未选规则。
- 保留 1.5、2.5 等正常小数分，不机械取整；不把 1 分拆成难以记录的碎分。
- 扣分最低为 0。

### 7.2 作答留白

- 本次示例均使用 `answerSpaceVersion:1`，Schema 含 `answerLines`。
- 选择、多选、填空统一为 0，只在题间留小间隔。
- 解答、简答、实验、阅读主观问答、翻译、写作按实际书写量估计：短答约 3–5 行，多步骤计算/证明约 6–12 行，分小问实验或综合论述约 10–18 行；复杂题与写作可更多。
- 每行约 6.35 毫米；不按题干长度统一分配，不把已给图表算作作答面积。
- 字段只供排版；学生文档仍是干净留白，不印行号、作答标签或横线。
- 题干已给图示时，不重复留作图空间；只有学生必须自行作图时才另计。

## 8. 各环节职责

| 环节 | 只做什么 | 不做什么 |
| --- | --- | --- |
| 出题 `exercise` | 生成当前题组完整成稿；按请求和 Schema 落实题数、题型、训练点、难度、分值与格式；独立求解并核对条件充分性、答案、选项与评分。 | 不输出思考草稿、覆盖计划、试算、补条件说明或修题过程。 |
| 格式修复 `repair` | 只修可确定的格式问题；以最初原稿为唯一保真基准；保留题意、条件、数值、选项、正确答案、评分点、训练点与图示条件；只改必要格式和显示元数据。 | 不重新命题，不润色题意，不增删条件，不把内容变化伪装成格式修复。 |
| 内容复核 `review` | 独立学科复核；先自己求解再比较原答案、解析、选项与评分；只允许精确修订 `stem`、`choices`、`answer`、`analysis`、`points`、`maxScore`、`figureRequest`、`answerLines`。 | 不处理 JSON 转义、字段名、表格列数、LaTeX 分隔符或排版；不增删题目、训练点、题型、难度；不改 `id`、`type`、`level`、`target`、`minutes`。 |
| 图示规划 `figure-plan` | 把已完成的 `figureRequest` 转为受控图示定义；题干、数值、条件、标签身份与版位不可改写；按 `precision` 选择矢量或允许的复杂插图。 | 不改题、不补条件、不用答案或解析新增学生图条件、不为方便图库替换题目模型。 |
| 矢量核对 `figure-review-vector` | 审查矢量定义与题干、已知条件、标签、数值、单位、方向是否一致；区分可修图问题、题目内容问题与排版建议。 | 不声称看过实际图片像素；不通过改题或补条件让错误图通过。 |
| 像素核对 `figure-review-pixels` | 实际附有图片像素时，核对图中结构、标签位置、相互关系与题文；看不清、缺失或被遮挡要明确列为问题。 | 实际请求才附图片；本导出不包含 base64，不能把导出文本当成已看过图片。 |
| 无像素委托核对 `figure-review-brief` | 只核对插图委托描述是否完整；不能声称已核验实际图片。 | 不把委托描述当成图片像素。 |
| 生图 `illustration` | 只依据已确认的绘图委托生成单张教学插图；尊重版位与横竖比例；白底、适合 A4 黑白打印；不增加题干未给条件、数据、标签或答案。 | 不用位图伪造函数、测量、实验数据、电路连接或几何比例；不加学生姓名、学校、班级、学号等个人信息。 |

## 9. 供应商适配差异（审阅重点）

### 9.1 Gemini 官方冻结通道

- 出题与修复：`generator.generate` 在 `generation.protocol==="gemini"` 时走 `model-completion.completeGemini`。
- 复核与图示：`reviewContent`、`planFigure`、`reviewFigure` 默认走 `figure-generation.structured`，再进入 `completeGemini`。
- `completeGemini` 会在 user parts 末尾追加 `prompt-policy.outputReminder(prompt)`。这是 user 尾部，不是 system。
- 尾注内容取决于本次输出 Schema 与环节：
  - 出题/修复：含“每题完整返回、choices:[]、数据表列数”等文档要求；修复还含“仅定点修复、不重新命题”。
  - 内容复核/图示规划/图示核对：输出 Schema 没有 `questions` 属性，因此只追加通用 JSON 输出约束，不含每题字段要求。
  - 尾注还会按学科追加内容：数学有几何翻折命名提醒，政治有普通 Unicode 箭头提醒；本次 exercise 样例是数学，因此含几何翻折句。
- `structured` 还会在 system 末尾追加“输出JSON Schema（required字段必须全部给出…）”与完整 Schema 文本。因此复核/图示导出的 `system` 比 `rawSystem` 长；`systemSuffix` 保存这段追加原文。出题/修复不经过 `structured`，`system` 等于 builder 原文。
- 旧版 `generator.generate` 的默认直连分支直接发送 `prompt.body`，不经过 `completeGemini`，因此不追加 outputReminder。本导出以官方冻结通道为准，并在供应商说明中保留此差异。

完整尾注原文见 `providers/output-reminders.json`；实际 Gemini 请求体样例见 `providers/gemini-exercise-payload.json`。

### 9.2 Kimi

- `kimi.completeKimi` 发送 `messages:[system, user JSON]`，system 与 user JSON 不润色。
- Schema 放在 `response_format.json_schema.schema`，并先经过 `kimiExerciseSchema`：为 `questions.items` 与 `questions.prefixItems[*]` 的每个 `anyOf` 分支补 `type:"object"`，再把基础字段约束合并进分支。
- Kimi 不追加 Gemini 的 outputReminder。
- 完整前后对照见 `providers/kimi-schema.json`，实际请求体样例见 `providers/kimi-exercise-payload.json`。

### 9.3 官方 chat-completions / responses / anthropic 通道

- `model-completion.completeRemote` 组装 `messages:[{role:"system",content:prompt.system},{role:"user",content:JSON.stringify(prompt.input)}]`，再用纯函数 `model-adapter.adaptModelBody` 生成供应商 payload。
- `adaptModelBody` 只增加传输层字段（模型、token 上限、reasoning/thinking 等），不改写 system 或 user JSON。
- 这些通道不使用 Gemini 的 outputReminder；也不把 Schema 作为独立 `response_format` 字段发送。出题/修复的 Schema 说明在 system 文本内；复核/图示的更完整 Schema 说明由 `structured` 追加在 system 末尾。
- OpenAI ChatGPT 授权的实际发送由 `openai-siwc.complete` 负责凭据刷新，但它同样用 `adaptModelBody` 生成 responses 形状；样例不含凭据。
- 样例 payload 见 `providers/official-responses-payload.json`、`providers/official-chat-payload.json`、`providers/official-anthropic-payload.json`、`providers/openai-chatgpt-payload.json`。

### 9.4 生图与像素

- 生图直接把 `illustrationPrompt` 作为提示词：chat-image 协议放在 user content，native-image 协议放在 `prompt` 字段，并按版位附加 size/quality/output_format。
- 本次像素核对按 Gemini 适配路径导出；实际请求会在 user parts 中附加 `inlineData` 图片。导出只记录 `image.attached`、`mimeType`、`dataChars`，不导出 base64。其他协议由 `model-vision.attachImage` 按各自字段附图片，导出同样不含字节。
- 本导出的代表性生图提示词是生物叶片横切示例；它不包含任何图片字节，也不代表已实际生成或已核对图片。

## 10. 样例来源与不能声称的内容

- 本工具 fixture 中的示例题均带 `【待填原题】` 标记，**不是真实试题**，不能当作考试原题、教材原题或已审定题目。builder 自带的“输出形状”或字段示例只是字段示意，也不是试题。
- fixture 题组仍按当前输出契约构造并通过校验，目的是让复核/修复/图示提示词可被真实编译；通过校验不等于题目内容真实、正确或已审定。
- 所有文字题与图示样例输入均为匿名教师演示配置：出题/复核/修复/图示请求含 `basis.mode="manual"`、`evidence=[]`，不声称来自原始成绩表、失败记录、学生作答或真实考试；生图示例只有图示委托与版位，不含学生或考试数据。
- 示例训练点是演示用教学点，不是从某张原表自动提取的结果。
- 导出是**静态编译**，不是实际模型调用；`outputReminder`、payload、system、input、schema 都来自当前代码，但没有发送给模型，也没有模型输出。
- 不包含学生姓名、学校、班级、学号、排名或隐私信息；不包含鉴权头、令牌、密钥或凭据引用。
- 像素核对的实际请求另附图片；本导出不能证明某张图片已被核对。

## 11. 校验与复核方法

1. 打开 `README.md` 的本次导出索引，先看覆盖矩阵。
2. 任选一份 `prompt.txt`，核对 `SYSTEM 原文`、`USER INPUT`、`OUTPUT SCHEMA` 三部分。
3. 需要机器比对时读同名 JSON；`system`、`input`、`schema` 是未润色原文。
4. 核对 `manifest.json` 的 `counts`、`versions`、`files[].sha256`。
5. 运行 `shasum -a 256 -c SHA256SUMS.txt`（在导出目录内）校验文件。
6. 供应商差异先读 `providers/PROVIDER-BEHAVIOR.md`；Gemini 尾注原文读 `providers/output-reminders.json`；Kimi Schema 对照读 `providers/kimi-schema.json`。

## 12. 目录索引

运行导出工具后，导出目录的 `README.md` 会在本导览末尾追加本次目录索引与每个文件的相对链接。仓库中的 `docs/PROMPT-EXPORT-2026-10-21.md` 不记录某次运行的绝对路径，以免把个人目录或临时路径带入版本库。
