'use strict';
// Prompt examples are encoded once, exactly as the model must return them.
// This is authoring guidance, never a repair pass over generated documents.
const samples={
 '语文':{
  stem:'阅读下面的材料，完成题目。\n\n材料（自拟）：城市旧书摊的经营者会把不同年代的书分开摆放，也常为读者讲述一本书的来历。\n\n请结合材料，概括作者对旧书摊价值的两种理解。',
  answer:'①旧书摊保存了可触摸的阅读记忆；②旧书摊提供了人与人交流的场所。',
  analysis:'第①点对应材料中按年代摆放和讲述来历的内容；第②点对应经营者与读者交流的内容。\n分点作答，先概括再说明材料依据。'
 },
 '数学':{
  stem:"已知 $f(x)=x^2$，求 $f'(x)$。",
  answer:"$f'(x)=2x$。",
  analysis:"由幂函数求导法则得 $f'(x)=2x$。\n若结果为根式，则写为 $e=\\sqrt{3}$，中文标点放在公式之外。"
 },
 '英语':{
  stem:'Read the passage and choose the best answer.\n\n(Original fictional context) Last spring, our class visited a small community garden. The gardener showed us how kitchen waste becomes soil, and we planted seedlings in boxes made from old wood.\n\nWhat did the writer learn from the visit?',
  choices:['To grow vegetables in winter.','To give used materials a new purpose.','To sell old boxes to the garden.','To study kitchen waste at school.'],
  answer:'B',
  analysis:'The passage supports the idea that used materials can be given a new purpose; the other options are not supported by the text.'
 },
 '日语':{
  stem:'次の文の（　）に適切な言葉を入れなさい。\n\n私は毎朝、コーヒー（　）飲みます。',
  answer:'を',
  analysis:'「コーヒー」は動作の対象なので、格助詞「を」を使う。\n前後の語との関係を確認する。'
 },
 '物理':{
  stem:'一物体以 $v_0=2.0\\,\\mathrm{m/s}$ 的初速度沿水平面滑行，加速度大小为 $a=0.5\\,\\mathrm{m/s^2}$，方向与初速度相同。求它在前 $4.0\\,\\mathrm{s}$ 内的位移。',
  answer:'$12.0\\,\\mathrm{m}$。',
  analysis:'取初速度方向为正方向，由 $x=v_0t+\\frac{1}{2}at^2$ 得 $x=12.0\\,\\mathrm{m}$。\n结果注明单位；有效数字应与题目给定精度一致。'
 },
 '化学':{
  stem:'已知同温下，两份同体积盐酸分别与表面积相同的足量锌片反应，溶液中含有 $\\ce{H+}$，数据如下。\n\n| 样品 | 氢离子浓度（mol/L） |\n| --- | --- |\n| 甲 | 0.10 |\n| 乙 | 0.20 |\n\n说明两者初始反应速率不同的依据。',
  answer:'相同条件下，$\\ce{H+}$ 浓度较大的乙溶液反应初始速率较大。',
  analysis:'相关反应为 $\\ce{Zn + 2H+ -> Zn^2+ + H2}$。\n分步说明反应条件。'
 },
 '生物':{
  stem:'（原创模拟数据）某常染色体单基因遗传病由一对等位基因控制，完全外显，无新突变，各次生育独立。\n\n| 家庭 | 父亲表现型 | 母亲表现型 | 子代表现型 |\n| --- | --- | --- | --- |\n| 甲 | 正常 | 正常 | 患病 |\n\n若甲家庭再生一个孩子，患病概率是多少？',
  answer:'$\\frac{1}{4}$。',
  analysis:'父母正常而子代患病，说明致病基因为隐性。\n设父母均为杂合子，则子代患病概率为 $\\frac{1}{4}$。'
 },
 '历史':{
  stem:'材料（自拟）：某地方档案记载，当地工匠行会在清代中期开始统一度量衡器，并规定学徒须随师学习三年。\n\n根据材料并结合所学，说明该行会规范对当地手工业的作用。',
  answer:'①有利于统一生产标准，减少交易纠纷；②有利于技艺传承，稳定工匠队伍。',
  analysis:'材料中统一度量衡器可直接说明生产与交易规范；学徒期限说明技艺传承。\n每点先写结论，再对应材料信息。'
 },
 '政治':{
  stem:'某地推动公共数据开放（自拟情境）→企业获得更多信息→开发新的便民服务。\n\n运用《经济与社会》知识，说明这一传导过程如何促进经济发展。',
  answer:'公共数据开放降低了企业获取信息的成本，企业据此开发新服务，满足消费需求，进而带动产业发展。',
  analysis:'按“条件—机制—结果”组织：数据开放是条件，成本下降和需求满足是机制，产业发展是结果。\n材料信息与教材原理逐项对应。'
 },
 '地理':{
  stem:'（原创示意数据）\n\n| 月份 | 气温（℃） | 降水（mm） |\n| --- | --- | --- |\n| 1 | 3.2 | 42 |\n| 7 | 27.5 | 168 |\n\n仅根据表中信息，比较两个月的气温与降水情况。',
  answer:'7月气温高于1月，7月降水量多于1月。',
  analysis:'气温比较为27.5℃与3.2℃，降水比较为168mm与42mm。不能仅由两个月的数据确定全年气候类型或成因。\n数据为示意值，结论限于表中所给信息。'
 }
};
const encoding='JSON只编码一次：输出是一层JSON对象，不是包含JSON的字符串；每个文本字段只进行一次JSON字符串编码。JSON源码中的每个LaTeX命令反斜杠必须恰好写为两个反斜杠，解码后才是一个；不能在同一字段混用单个、两个或四个反斜杠，也不能用反斜杠直接连接ce、begin、text等命令。重点核查triangle、text、times、right、frac、beta等命令，不能被JSON解码成制表、回车、换页或退格字符；长解析中重复出现的化学式也须使用相同的一次编码。段落在JSON源码中用换行转义，解码后是真正换行，不能残留字面反斜杠n。所有公式及环境完整放入成对的$...$或$$...$$内，包括题干、选项、答案、解析、评分点和表格单元格。';
const tables='数据表统一用Markdown竖线表：表头下一行必须有分隔行，每行列数相同，表前后各有空行，表格本身不能包在公式环境内；不要用LaTeX的array、tabular、hline画数据表。矩阵或数学推导确需array时才使用，并将整个环境包在$$...$$中；禁止裸露的begin/end/hline排版命令。';
const prose='正文使用普通段落，不使用Markdown加粗星号、井号标题或HTML标记；小标题可用纯文本独占一行。自拟材料不得附上未经核对的真实作者、书名或摘编出处来制造来源。学生稿只保留题干、选项和干净留白：选择题不加作答横线；数理化等填空采用自然设问，不追加横线，只有英语、日语语篇填空及语文默写必需的编号空位可以保留；主观题按实际书写量留白，不印行号、作答标签或整行装饰线。';
function subjectNotes(subject){
 const notes=[];
 if(subject==='语文')notes.push('语文与语言阅读题需要明确定位作答对象：本格式不提供波浪线或文字下划线，不写“画横线”“画波浪线”“加点部分”等依赖未输出样式的指代。翻译、改写、赏析时在设问后逐字列出完整目标句，或使用材料中的明确编号引用；多处待修改文字逐项编号，不能让学生自行猜测范围。');
 if(['英语','日语'].includes(subject))notes.push('语篇填空的每一空在原文中写为___1___、___2___这类清晰编号空位，不得只在两个词之间放裸数字；空位数、答案编号和评分点逐项一致。写作参考范文按题干规定字数完成；英语要求80词左右时应在约70–90词，不得输出超长范文再声称符合要求。');
 if(subject==='政治')notes.push('思想政治的逻辑传导链使用普通字符→，不用LaTeX命令rightarrow；不要为普通箭头、序号和百分号引入数学转义。');
 if(subject==='化学')notes.push('化学逐字段核对每一个ce命令的JSON转义；普通化学式、离子、物态和反应式均可用公式内的mhchem，不把ce命令当成JSON转义。工艺流程可用普通中文和Unicode箭头描述；复杂装置图按本次Schema允许的图示字段委托（独立绘图环节用figureRequest，其余用diagram），不能以长串LaTeX箭头或未包裹的array表格代替。');
 return notes;
}
function documentFormatGuide(subject,{includeExample=true}={}){
 const sample=samples[subject]||samples['数学'];
 return [encoding,tables,prose,...subjectNotes(subject)].join('\n')
  +(includeExample?'\n完整字段编码示例（仅说明格式，不是本次试题）：'+JSON.stringify(sample):'')
  +'。提交前逐字段核对反斜杠、换行、公式分隔符和表格列数，直接输出可解析、可预览的最终稿，不添加生成后修复的说明。';
}
module.exports={documentFormatGuide};
