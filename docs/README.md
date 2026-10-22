# 项目文档索引

更新于 **2026-10-22**。本页按用途组织项目手册、专题实现与历史验证记录，不按每次修改重复堆叠更新摘要。

## 从哪里开始

| 你要做的事 | 优先阅读 |
| --- | --- |
| 了解项目、导入材料与使用六个入口 | [项目README](../README.md) |
| 理解数据、排名、存储与浏览器恢复 | [系统架构](ARCHITECTURE.md) |
| 本地开发、发布、迁移或回退 | [部署维护手册](DEPLOYMENT.md)及[README开发章节](../README.md#development) |
| 维护HTTP、Worker、账号、模型或额度 | [后端手册](../backend/README.md) |
| 了解当前官方通道、模型比较与代理 | [2026-10-22工作台整合](WORKBENCH-UNIFIED-2026-10-22.md) |
| 核对鹈鹕测智原版提示词与HTML动画预览 | [Cockpit原版提示词与HTML预览](PELICAN-HTML-2026-10-22.md) |
| 排查浏览器授权完成后一直等待 | [OAuth完成确认与恢复](BROWSER-OAUTH-COMPLETION-FIX-2026-10-22.md) |
| 导出完整的云端前置提示词 | [提示词导出与复核](PROMPT-EXPORT-2026-10-21.md) |
| 查看生成、格式、题型及评分的改进 | [官方通道出题与验收](OFFICIAL-GENERATION-IMPROVEMENT-2026-10-21.md) |
| 查看PDF/Word纸面规则 | [文档排版与学科计分](DOCUMENT-POLISH-2026-10-21.md) |
| 查看构建产物清理与旧资源兼容 | [导入与构建维护](IMPORT-AND-BUILD-MAINTENANCE-2026-10-18.md) |
| 排查试题中心首次打开、存储恢复及Word等待 | [启动、恢复与交互优化](STARTUP-RESILIENCE-2026-10-22.md) |

## 当前状态与阅读原则

- 日常更新直接发布主仓库 `main` 对应的正式站，历史预览仅作为迁移和历史记录参考。
- 当前官方服务为云端OAuth账号通道；旧“现有计划通道”及本机助手不是现行使用入口。
- 项目README、后端手册和当前实现说明现行行为；专题文件保留当时的变更、失败、恢复及验证样本。
- 历史文件中的默认模型、测试数量、分组权限、“仅预览”或“正式未修改”等描述属于当时阶段，不能覆盖当前配置。
- 测试通过、请求完成、格式合格、图示合格、教师内容审定和导出成功分别记录，不能彼此替代。

## 按主题查阅全部记录

下面列出本目录全部专题和说明快照；有日期的专题在各组内按日期从新到旧排列，无日期的早期专题保留原文件名。展开对应主题即可查阅。

<details>
<summary>模型、账号与工作台（16篇）</summary>

- [鹈鹕测智：原版提示词与HTML动画 · 2026-10-22](PELICAN-HTML-2026-10-22.md)
- [模型工作台整合 · 2026-10-22](WORKBENCH-UNIFIED-2026-10-22.md)
- [浏览器授权等待不结束：修复与恢复](BROWSER-OAUTH-COMPLETION-FIX-2026-10-22.md) · 2026-10-22
- [工作台与教师设置页维护 · 2026-10-21](WORKBENCH-TEACHER-2026-10-21.md)
- [ChatGPT 官方授权与云端连接（2026-10-21）](OPENAI-SIWC-2026-10-21.md)
- [OpenAI 云端 OAuth 账号管理](OPENAI-CLOUD-OAUTH-2026-10-21.md) · 2026-10-21
- [工作台 ChatGPT 官方多账号授权（2026-10-21）](OPENAI-ACCOUNT-WORKBENCH-2026-10-21.md)
- [Cockpit 账号能力与跨设备授权审查 · 2026-10-21](COCKPIT-REMOTE-ACCOUNT-REVIEW-2026-10-21.md)
- [模型工作台视觉协调与适配](WORKBENCH-VISUAL-2026-10-20.md) · 2026-10-20
- [Kimi K2.8 与思考强度选择](KIMI-K28-AND-EFFORT-2026-10-20.md) · 2026-10-20
- [猎豹 GPT‑6 Astra 接入](CHEETAH-ASTRA-2026-10-20.md) · 2026-10-20
- [猎豹新增模型与速度参考](MODEL-SPEED-REFERENCE-2026-10-19.md) · 2026-10-19
- [猎豹词元工厂 Gemini 线路](CHEETAH-GEMINI-2026-10-19.md) · 2026-10-19
- [ByteCat Grok 接入 · 2026-10-16](TRAINING-GROK-RELAY-2026-10-16.md)
- [模型工作台](MODEL-WORKBENCH-2026-10-15.md) · 2026-10-15
- [Kimi K3 接入准备与核查](KIMI-MIGRATION-2026-10-15.md) · 2026-10-15

</details>

<details>
<summary>教师流程、训练设置与草稿（14篇）</summary>

- [教师设置页：底部核对与自适应排版](TEACHER-BOTTOM-REVIEW-2026-10-21.md) · 2026-10-21
- [训练提示词静态导出：教师审阅导览（2026-10-21）](PROMPT-EXPORT-2026-10-21.md)
- [分环节提示词与自动配图（2026-10-20）](PROMPT-STAGES-AND-AUTO-FIGURES-2026-10-20.md)
- [学科细分与出题草稿](TRAINING-REUSABLE-DRAFTS-2026-10-16.md) · 2026-10-16
- [出题草稿与命题范围打磨 · 2026-10-16](TRAINING-DRAFT-SAFETY-POLISH-2026-10-16.md)
- [教师操作连续性打磨](TEACHER-CONTINUITY-2026-10-16.md) · 2026-10-16
- [辅导交互、外框、实时文本与次数管理](UI-FEEDBACK-STREAM-AND-USAGE-2026-10-15.md) · 2026-10-15
- [辅导界面、四川高考题型与云端失败记录复盘](TRAINING-STYLE-AND-CLOUD-ERROR-AUDIT-2026-10-15.md) · 2026-10-15
- [个性化辅导与模型工作台：三轮打磨](TRAINING-MULTIROUND-POLISH-2026-10-15.md) · 2026-10-15
- [练习提交反馈、教学选项与滚轮选择](EXERCISE-FEEDBACK-AND-CHOICES-2026-10-15.md) · 2026-10-15
- [个性化辅导控件与输出复核（2026-10-15）](EXERCISE-CONTROLS-AND-QA-2026-10-15.md)
- [专项练习：选择内容与生成质量](EXERCISE-CONTENT-REFINEMENT-2026-10-15.md) · 2026-10-15
- [专项练习设置页重设计](EXERCISE-COMPOSER-2026-10-15.md) · 2026-10-15
- [试题中心（预览分支）](EXERCISE-CENTER.md)

</details>

<details>
<summary>生成稳定性与学科质量验证（18篇）</summary>

- [官方通道出题优化：本轮目标与验收（2026-10-21）](OFFICIAL-GENERATION-IMPROVEMENT-2026-10-21.md)
- [生成审核与定点修复调整（2026-10-21）](GENERATION-TOLERANCE-2026-10-21.md)
- [生成全链路误拦截与恢复复查（2026-10-21）](GENERATION-PIPELINE-AUDIT-2026-10-21.md)
- [十科差异化生成与内容复核](VARIED-GENERATION-2026-10-20.md) · 2026-10-20
- [数理化生实测中的程序修复](SCIENCE-VALIDATION-FIXES-2026-10-20.md) · 2026-10-20
- [数理化生真实生成与试题质量评估](SCIENCE-QUALITY-2026-10-20.md) · 2026-10-20
- [数学物理复测与复杂生图验证](RETEST-MATH-PHYSICS-IMAGES-2026-10-20.md) · 2026-10-20
- [其余六科真实生成、内容核对与导出复核](REMAINING-SUBJECT-QUALITY-2026-10-20.md) · 2026-10-20
- [数学分组命题超时修复](MATH-GROUP-SCOPE-2026-10-20.md) · 2026-10-20
- [学科复核、三维翻折与失败恢复](GENERATION-RELIABILITY-2026-10-20.md) · 2026-10-20
- [生成校检保真、成稿与图片恢复（2026-10-19）](GENERATION-RECOVERY-2026-10-19.md)
- [化学练习连续失败排查（2026-10-19）](GENERATION-FORMAT-2026-10-19.md)
- [成稿格式校检与模型修复](FORMAT-REPAIR-2026-10-19.md) · 2026-10-19
- [实际工作簿跨学科生成与导出校检](CROSS-SUBJECT-GENERATION-2026-10-19.md) · 2026-10-19
- [猎豹 Gemini 多学科实测与稳定性修复（2026-10-19）](CHEETAH-CROSS-SUBJECT-2026-10-19.md)
- [练习流程可靠性打磨](WORKFLOW-POLISH-2026-10-16.md) · 2026-10-16
- [任务恢复与历史练习续轮打磨](TRAINING-RECOVERY-AND-HISTORY-2026-10-16.md) · 2026-10-16
- [出题稳定性与分组恢复](TRAINING-GENERATION-STABILITY-2026-10-16.md) · 2026-10-16

</details>

<details>
<summary>图示、配图与生图服务（7篇）</summary>

- [猎豹 Image 2 原生接口（2026-10-20）](CHEETAH-IMAGE2-2026-10-20.md)
- [独立生图服务切换（2026-10-19）](IMAGE-SERVICE-WORKBENCH-2026-10-19.md)
- [猎豹 Image 2.5 调用复核（2026-10-19）](CHEETAH-IMAGE25-2026-10-19.md)
- [ByteCat新分组生图接收修复（2026-10-19）](BYTECAT-IMAGE-RESPONSE-2026-10-19.md)
- [练习图示分离与纸面版式](TRAINING-FIGURE-PIPELINE-2026-10-16.md) · 2026-10-16
- [练习审阅中的图示缩放](EXERCISE-FIGURE-RESIZE-2026-10-16.md) · 2026-10-16
- [学科图示覆盖与优先级](学科图示覆盖与优先级.md)

</details>

<details>
<summary>报告、公式与文档输出（11篇）</summary>

- [Word与PDF排版及学科计分](DOCUMENT-POLISH-2026-10-21.md) · 2026-10-21
- [练习表格与科学上下标修复](EXERCISE-TABLES-AND-SCIENTIFIC-FONTS-2026-10-17.md) · 2026-10-17
- [逐题作答留白与分页修复](EXERCISE-ANSWER-SPACE-2026-10-17.md) · 2026-10-17
- [实时预览公式对齐修复 · 2026-10-16](TRAINING-LIVE-FORMULA-ALIGNMENT-2026-10-16.md)
- [导出基线、试题清理与实时进度](EXERCISE-PROGRESS-AND-POLISH-2026-10-15.md) · 2026-10-15
- [生成即成稿与直接导出（2026-10-15）](EXERCISE-DIRECT-DOCUMENT-2026-10-15.md)
- [学生报告的排名、纸面分块与试卷知识点](REPORT-ACCURACY-2026-10-14.md) · 2026-10-14
- [分类打印报告与结构化专项训练](TEACHING-REPORTS.md)
- [报告、排名和玻璃材质修正](REPORT-GLASS-V36.md)
- [小题材质与报告阅读](GLASS-REPORT-READING.md)
- [跟进控件、滚动稳定性、小题材质与自选报告](CONTROLS-AND-REPORT-COMPOSITION.md)

</details>

<details>
<summary>成绩研究、数据保存与跟进（13篇）</summary>

- [即时筛选与研究线索找回（2026-10-18）](WORKSPACE-RESUME-2026-10-18.md)
- [教学跟进：训练与复核日程（2026-10-18）](TEACHING-AGENDA-2026-10-18.md)
- [浏览器返回与研究上下文](RESEARCH-NAVIGATION-2026-10-18.md) · 2026-10-18
- [数据阅读：刻度、单位与未知人数](DATA-READING-CLARITY-2026-10-18.md) · 2026-10-18
- [成绩研究主线：阶段变化与名单衔接](RESEARCH-CONTINUITY-2026-10-17.md) · 2026-10-17
- [练后批改与教学跟进衔接](FEEDBACK-CONTINUITY-2026-10-17.md) · 2026-10-17
- [试题中心查找与整理](EXERCISE-COLLECTION-2026-10-17.md) · 2026-10-17
- [研究留存与证据阅读打磨](ARCHIVE-CONTINUITY-2026-10-17.md) · 2026-10-17
- [练习跨页面一致性打磨](RECORD-CONSISTENCY-2026-10-16.md) · 2026-10-16
- [2026-10-12：题目研究与操作衔接](RESEARCH-POLISH.md)
- [入口、返回与成绩口径](ENTRY-CLARITY.md)
- [学生目录：从材料条件继续研究](DIRECTORY-READING.md)
- [2026-10-12：单题证据与抽屉阅读](ANSWER-READING.md)

</details>

<details>
<summary>视觉、动效、响应式与性能（28篇）</summary>

- [全站视觉与交互协调（2026-10-18）](VISUAL-LANGUAGE-2026-10-18.md)
- [全站多尺寸布局复核（2026-10-18）](RESPONSIVE-GLOBAL-2026-10-18.md)
- [动画连续性与非线性缓动（2026-10-18）](MOTION-CONTINUITY-2026-10-18.md)
- [视觉与使用体验细化](VISUAL-EXPERIENCE-2026-10-16.md) · 2026-10-16
- [首页与表格导入优化 · 2026-10-16](ENTRY-PERFORMANCE-2026-10-16.md)
- [移动端启动 辅导入口和文档导出](MOBILE-STARTUP-AND-WORD-2026-10-15.md) · 2026-10-15
- [全站视觉与动效统一](VISUAL-LANGUAGE-2026-10-14.md) · 2026-10-14
- [全端布局检查 · runtime-v37](RESPONSIVE-LAYOUT-2026-10-14.md) · 2026-10-14
- [2026-10-12 页面层次与参考设计](VISUAL-POLISH-2026-10-12.md)
- [2026-10-12 视觉与动效更新](VISUAL-MOTION-2026-10-12.md)
- [2026-10-12 阳光视觉与内容呈现](SUNLIGHT-2026-10-12.md)
- [动效与页面切换检查 · 2026-10-11](MOTION-AUDIT-2026-10-11.md)
- [字体与阅读层级](TYPOGRAPHY.md)
- [小题方块与得分率](SCORE-SQUARES.md)
- [得分块的透光渐变](SCORE-OPTICS.md)
- [荣县第一中学高三成绩分析](SCHOOL-IDENTITY.md)
- [runtime-v47：触摸、关注色阶与完整阶段图](RUNTIME-V47.md)
- [runtime-v46：完整视觉下的启动、复用与作答材质](RUNTIME-V46.md)
- [2026-10-13：试卷研究的展示重组](PAPER-STUDIO.md)
- [试卷研究：全部大小卡片的无边框材质](PAPER-BORDERLESS-MATERIAL.md)
- [全卷题序与透明玻璃 Dock](PAPER-ATLAS-AND-GLASS-DOCK.md)
- [2026-10-13：全站材质与试卷研究工作台](MATERIAL-WORKBENCH.md)
- [全站光影层次与得分色阶](MATERIAL-COHESION.md)
- [2026-10-12：关闭操作与小题卡片](DIALOG-AND-QUESTION-POLISH.md)
- [衡迹 · 研究图册](DESIGN-FOLIO.md)
- [校徽色系与内容密度](CREST-THEME.md)
- [滚动与控件细节](CONTROL-DETAILS.md)
- [内容密度与空列修复](CONTENT-DENSITY.md)

</details>

<details>
<summary>工程维护、综合审查与发布（16篇）</summary>

- [数据与运行可靠性复核修复](AUDIT-REPAIRS-2026-10-19.md) · 2026-10-19
- [导入、构建与资源保留维护 · 2026-10-18](IMPORT-AND-BUILD-MAINTENANCE-2026-10-18.md)
- [正式合并与实际工作簿校检](PRODUCTION-RELEASE-2026-10-17.md) · 2026-10-17
- [六项系统优化项目](SIX-DIRECTION-PROJECT-2026-10-16.md) · 2026-10-16
- [代码与实际使用复查 · 2026-10-13](CODE-USAGE-REVIEW-2026-10-13.md)
- [全场景控件与显示检查 · 2026-10-11](SURFACE-AUDIT-2026-10-11.md)
- [代码审核与修复 · 2026-10-11](CODE-AUDIT-2026-10-11.md)
- [2026-10-11 校检与修复](AUDIT-2026-10-11.md)
- [分数线与分布图](THRESHOLD-GUIDES.md)
- [用户要求与实现对应](REQUIREMENTS.md)
- [荣县第一中学高三成绩分析的持续打磨目标](PRODUCT_GOAL.md)
- [v45：线上有效线标签收尾](FULL-REVIEW-V45.md)
- [v44：学生身份、教学摘要与复核闭环](FULL-REVIEW-V44.md)
- [持续打磨 · runtime-v43](FULL-REVIEW-V43.md)
- [持续打磨 · runtime-v42](FULL-REVIEW-V42.md)
- [全站审查与报告完善 · runtime-v41](FULL-REVIEW-V41.md)

</details>

<details>
<summary>历史说明快照（5篇）</summary>

- [根 README整理前快照 · 2026-10-22](HISTORY-README-BEFORE-2026-10-22.md)
- [后端 README整理前快照 · 2026-10-22](HISTORY-BACKEND-BEFORE-2026-10-22.md)
- [荣县第一中学高三成绩分析](HISTORY-README-BEFORE-2026-10-17.md) · 2026-10-17
- [个性化学科练习 · 独立测试服务](HISTORY-BACKEND-BEFORE-2026-10-17.md) · 2026-10-17
- [衡迹：按对象组织研究](HISTORY-ARCHITECTURE-BEFORE-2026-10-17.md) · 2026-10-17

</details>

## 维护约定

新增功能先更新项目或后端手册中的相应章节；具体修改、真实调用、失败与恢复经过写入专题，再将链接加入合适主题。架构或部署边界变化时同步维护对应手册，避免把新旧通道或历史预览写成同一当前状态。

公开文档只使用匿名材料和脱敏结果。真实表格、完整备份、原始诊断、OAuth令牌、TOTP种子、密钥及含凭据部署包留在仓库外私有目录。
