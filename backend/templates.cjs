'use strict';
const version='subject-templates-20261015.4';
const templates={
 '语文':{focus:'阅读信息筛选、语言运用与表达',rule:'现代文用完整原创材料，避免伪造作者出处。阅读同材料题组材料保持完全一致。答案分层列点，区分概括、分析和评价。写作明确文体、任务和字数，不用一句作文题代替整份训练。',diagrams:['flow','bars']},
 '数学':{focus:'概念理解、计算与推理',rule:'先列定义域、参数范围和边界；答案独立代回验证。涉及图像时给出准确坐标、刻度和足够采样点；坐标点必须由表达式逐点计算。几何图标清点、线和条件，非按比例图注明示意图，不能凭图猜数据。所有公式用 LaTeX。',diagrams:['plot','geometry']},
 '英语':{focus:'词汇语法、阅读与写作',rule:'完整提供英文语境，阅读与完形不依赖外部文章；单选确保唯一答案，干扰项有依据。题干与参考答案语言自然、难度符合教材。开放表达列可接受变体和评分维度。',diagrams:['flow','bars']},
 '日语':{focus:'日语语法、阅读和表达',rule:'完整提供日文语境，核对助词、授受、敬语、时态和词形。选择题无歧义，翻译列可接受表达，不把不同语言语法机械套用。',diagrams:['flow','bars']},
 '物理':{focus:'物理模型、实验与定量推理',rule:'说明研究对象、参考系、理想条件、方向、单位和必要常量。图示优先受力图、运动图像、电路或装置模型。受力箭头从作用对象出发；运动图像点和斜率须与答案一致；电路连接与元件必须物理成立。核对量纲和极限情况。',diagrams:['plot','forces','circuit','apparatus']},
 '化学':{focus:'反应、守恒与实验设计',checklist:'核对反应守恒、实验气路、杂质影响和测量条件，图示不提前透露所求答案。',rule:'核对元素、原子数、电荷守恒与反应条件，区分离子方程式和化学方程式。公式可用 LaTeX mhchem 的\\ce。装置图须说明气密性、流向、试剂位置和安全条件；不能仅靠示意图隐含关键步骤。涉及气体吸收或质量测定，逐一列出除杂、洗气、干燥、吸收和尾气处理引入的副反应与新增气体，核对空白、外界空气和装置质量变化。饱和NaHCO3吸收HCl会额外生成CO2，不能把洗气后的CO2总质量直接全部归因于原样品的CaCO3；须有明确有效校正或重新设计实验。若考查导管进出口、气流方向或连接顺序，不得在学生图中标出待求的答案；必要结构与端口用题干明确给出。相对原子质量Ar为无量纲数，不能写成带g/mol单位的摩尔质量M；没有题干依据和有效校正时，不随意补充替代除杂试剂或定量方案。只用通用容器节点时应称为装置流程示意，不能让学生凭未绘出的长短管判断。',diagrams:['apparatus','flow','plot']},
 '生物':{focus:'概念、遗传与实验探究',rule:'概念符合高中教材，遗传题交代亲代、显隐性及基因位置假设；实验列自变量、因变量、对照和可支持结论。流程图和统计图优先SVG，复杂组织结构才考虑插图。图示不暗示未经题干给出的结论。',diagrams:['flow','bars','plot','illustration']},
 '历史':{focus:'史料辨析、时序与历史解释',rule:'史实和时序准确，自拟史料注明自拟，不捏造文献引文。开放题结合材料与所学列证据和论证；避免依赖外部图片或未提供的史料。',diagrams:['flow','bars']},
 '政治':{focus:'概念辨析与材料论证',rule:'教材概念明确，情境完整，按观点、材料、推理给分；不编造政策文件、法律条文或实时事件。避免只给结论而无材料对应。',diagrams:['flow','bars']},
 '地理':{focus:'区域、过程与综合分析',rule:'明确位置、尺度、时间和坐标，关键数据用文字或数据图完整提供；区分现象与机制，因果链完整。普通统计图和过程示意图用SVG，复杂自然景观才考虑插图。',diagrams:['plot','bars','flow','illustration']}
};
const strategies={targeted:{label:'薄弱点专项',rule:'围绕证据中确认的知识点先概念后应用。每道题指出明确可训练目标，避免用同一道题简单改数字凑题量。'},variation:{label:'同类变式',rule:'保留核心方法，改变情境、设问与已知条件，覆盖不同表征；至少两种不同设问。答案分别验证，不把数字换皮当迁移。'},retest:{label:'复核小测',rule:'形成能独立计分的复核小测，题干不泄露解法，覆盖确认的知识点，答案评分点便于逐题记录和后续复核。'}};
function templateFor(subject,id='targeted'){if(!templates[subject]||!strategies[id])throw new Error('TEMPLATE_INVALID');return {version,subject,id,...templates[subject],strategy:strategies[id]};}
function summary(){return {version,subjects:Object.entries(templates).map(([subject,t])=>({subject,focus:t.focus,diagrams:t.diagrams,checklist:t.checklist||t.rule})),strategies:Object.entries(strategies).map(([id,v])=>({id,...v}))};}
module.exports={templateFor,summary,version};
