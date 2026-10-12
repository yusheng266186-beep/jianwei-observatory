# 字体与阅读层级

2026-10-12，固定入口继续使用 https://yusheng266186-beep.github.io/jianwei-observatory/ 。

本轮阅读了北辰主页面与南溟主前端的字体配置：两者均偏向宋体，采用 Cormorant Garamond 点缀英文和数字。参考的是凝练的书卷感与阅读节奏；本页面向密集成绩研究，采用独立的三种职责，不沿用参考项目的全页宋体或展示数字方案。上一版大面积文楷与轻宋体混用已撤下。

- 页面主标题、学校字标、考试重点标题和抽屉标题：Source Han Serif SC SemiBold（思源宋体），真实 600 字重，深校徽蓝。大标题紧凑，短标题保留完整字形。
- 正文、章节、学生姓名、筛选、表格及导航：Source Han Sans SC（思源黑体）400 / 500 两个真实字重。章节比说明更大、更明确，说明保持清楚的行距，密集控件不使用手写字形。
- 成绩、人数、排名、图表数字：IBM Plex Sans，保留可变字重轴，启用直立等宽数字。单位与中文说明回到界面字体，避免数字字体接管整段中文。图表中文也使用界面字体。

主标题约 40px、章节 19px、正文 13–14px，辅助说明 11–12px；移动端分别收敛为 27–29px、18px 与 12px。重要标题与章节使用不同字形和真实字重，比例与间距在 styles/typography.css 中统一。颜色沿用校徽蓝白色系，无新增装饰色。

三个 OFL 字体家族的发布子集更名为 Rongxian Display / Interface / Metric。完整授权位于 assets/fonts/reading-LICENSE.txt，字形覆盖、字重和文件大小位于 reading-manifest.json。撤下的文楷、旧宋体与旧数字子集不再发布，避免无用字库残留。

字库由静态界面文字和公开 GB2312 字符集合生成，分为界面核心、常用汉字和扩展汉字。脚本不读取工作簿、学生姓名或身份证。首屏预加载标题与正文的两个核心字库，其他字库依实际字符和字重按需载入。字体从本站加载，采用 swap 策略，不等待字库才开放导入与导航；加载后重新计算图表标签和选中控件位置。字体失败时保留可见内容与操作，不合成虚假的粗体或斜体。

图表 SVG 下载内嵌实际使用且已加载的字体子集，保留字号、字重、数字排版、字距与颜色；PNG 同步保留。下载失败沿用原有错误反馈。

运行 PYTHONPATH=.audit-output/font-tools python tools/build-reading-fonts.py 可重新生成子集。需要 fontTools、brotli，以及 .audit-output/font-sources/ 中的 SourceHanSerifSC-SemiBold、SourceHanSansSC-Regular、SourceHanSansSC-Medium、IBMPlexSans[wdth,wght] 源文件（脚本内文件名）和相应上游许可证。生成后的 woff2 和样式直接发布，网站无额外构建步骤；原字库和临时材料不提交。

npm run test:typography 使用匿名材料检查真实字体、字重与字号层级、补充字形、四档宽度、六个板块、字体晚到和失败、导入与搜索、图表标签重排，以及 SVG 离线字形与 PNG 下载。其他相关回归包括分数线标签、入口与抽屉、卡片密度和 Dock 横移。浏览器检查使用 Chromium，不表示 Safari、Firefox 或真实手机已验收。

本轮本地实测：44 项单元检查、43 个模块静态审核、4 组字体检查、3 组分数线检查（32 种宽度与条件）、5 组入口检查、4 组控件检查、4 组卡片密度检查及 8 组整页横移检查均通过。上述结果是本轮 Chromium 自动检查，最终视觉感受由使用者判断。
