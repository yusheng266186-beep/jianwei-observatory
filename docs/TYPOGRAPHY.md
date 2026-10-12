# 字体与阅读层级

2026-10-12，网站固定入口继续使用 https://yusheng266186-beep.github.io/jianwei-observatory/ 。分数线改进已经发布，本轮继续落实全站字体变化。

中文标题、章节、学科、学生姓名采用自托管的中文宋体；正文、说明、阅读口径与图表中文采用文楷。成绩、人数和指标使用独立数字字体；按钮、输入框、导航和密集表格保留清晰的界面字体。层级通过字体、字号、字重与行距体现，颜色继续沿用校徽蓝白色系。主要配置在 `styles/typography.css`。

新增字体基于 Noto Serif CJK SC 和 LXGW WenKai 1.522，按 SIL Open Font License 1.1 分发。子集改名为 Rongxian Reading Serif / Copy，原版权与许可保留于字体元数据和 `assets/fonts/reading-LICENSE.txt`。已有的标题备用字体与数字字体继续保留。

字库由静态界面文字和公开 GB2312 字符集合生成，分为界面核心、常用汉字和扩展汉字；生成脚本不读取姓名、身份证或工作簿。首屏预加载两个核心字体，补充字库根据实际字符按需载入；字库都在本站，不调用第三方在线字体接口。正文采用 swap 策略，字体慢到或失败时保留文字与操作入口，后续字体加载完成会重新计算图表文字和选中控件位置。

图表 SVG 下载内嵌当前实际使用且已加载的字体子集，保留字号、字重、数字排版、字距与颜色；PNG 同步保留样式。异步字体读取错误和PNG生成失败会进入原有错误反馈，避免静默丢失下载。

`tools/build-reading-fonts.py` 可重新生成字体与unicode范围，使用系统的 Noto Serif CJK Regular TTC（SC字形）以及 `.audit-output/font-sources/wenkai-regular.ttf`，需要 fontTools、brotli 和两个上游许可文件。生成后的woff2和样式直接发布，网站没有额外构建步骤；原字库和临时下载不提交。

专项 `npm run test:typography` 覆盖实际字形所用字体（通过Chromium平台字体信息核对）、GB2312补充字形、四档宽度、六个板块、字体晚到、字体失败、导入与搜索、图表标签重新排布，以及带字体的SVG离线打开和PNG下载。均使用匿名材料；浏览器检查使用Chromium，不代表Firefox、Safari或真实移动设备已经测试。
