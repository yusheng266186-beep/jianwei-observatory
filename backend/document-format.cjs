'use strict';
// Prompt examples are encoded once, exactly as the model must return them.
// This is authoring guidance, never a repair pass over generated documents.
function documentFormatGuide(subject){
 const sample=subject==='化学'?{
  stem:'已知酸溶液中含有 $\\ce{H+}$，数据如下。\n\n| 样品 | 浓度（mol/L） |\n| --- | --- |\n| 甲 | 0.10 |\n| 乙 | 0.20 |\n\n说明比较依据。',
  analysis:'相关反应为 $\\ce{H+ + OH- -> H2O}$。\n分步说明反应条件。'
 }:{stem:'已知 $f(x)=x^2$，求 $f\'(x)$。',analysis:'由求导法则得 $f\'(x)=2x$。\n分步说明依据。'};
 return '文档编码与数据表的最终检查：输出是一层JSON对象，不是包含JSON的字符串；每个文本字段只进行一次JSON字符串编码。JSON源码中的每个LaTeX命令反斜杠必须恰好写为两个反斜杠，解码后才是一个；不能在同一字段混用单个、两个或四个反斜杠，也不能用反斜杠直接连接ce、begin、text等命令。段落在JSON源码中用换行转义，解码后是真正换行，不能残留字面反斜杠n。所有公式及环境完整放入成对的$...$或$$...$$内，包括题干、选项、答案、解析、评分点和表格单元格。'
 +'重点核查triangle、text、times、right、frac、beta等命令：在JSON字符串中必须双写起始反斜杠，不能被JSON解码成制表、回车、换页或退格字符；长解析中重复出现的每一处化学式也必须使用相同的一次编码，不能只检查首个命令。'
 +'正文使用普通段落，不使用Markdown加粗星号、井号标题或HTML标记；小标题可用纯文本独占一行。自拟材料不得附上未经核对的真实作者、书名或摘编出处来制造来源。'
 +'实验数据、常量、比较结果等表格统一用Markdown竖线表：表头下一行必须有分隔行，每行列数相同，表前后各有空行，表格本身不能包在公式环境内；不要用LaTeX的array、tabular、hline画数据表。矩阵或数学推导确需array时才使用，并将整个环境包在$$...$$中。禁止裸露的begin/end/hline排版命令。'
 +'语文与语言阅读题需要明确定位作答对象：本格式不提供波浪线或文字下划线，不写“画横线”“画波浪线”“加点部分”等依赖未输出样式的指代。翻译、改写、赏析时在设问后逐字列出完整目标句，或使用材料中的明确编号引用；多处待修改文字逐项编号，不能让学生自行猜测范围。'
 +(['英语','日语'].includes(subject)?'语篇填空的每一空在原文中写为___1___、___2___这类清晰编号空位，不得只在两个词之间放裸数字。空位数、答案编号和评分点逐项一致。写作参考范文按题干规定字数完成；要求80词左右时应在约70–90词，不得输出超长范文再声称符合80词要求。':'')
 +(subject==='政治'?'思想政治的逻辑传导链使用普通字符→，不用LaTeX命令rightarrow；不要为普通箭头、序号和百分号引入数学转义。':'')
 +(subject==='化学'?'化学逐字段核对每一个ce命令的JSON转义；普通化学式、离子、物态和反应式均可用公式内的mhchem，不把ce命令当成JSON转义。工艺流程可用普通中文和Unicode箭头描述；复杂装置图按figureRequest委托，不能以长串LaTeX箭头或未包裹的array表格代替。':'')
 +'完整字段编码示例（仅说明格式，不是本次试题）：'+JSON.stringify(sample)+'。提交前逐字段核对反斜杠、换行、公式分隔符和表格列数，直接输出可解析、可预览的最终稿，不添加生成后修复的说明。';
}
module.exports={documentFormatGuide};
