import {exerciseCatalog} from '../data/exercise-catalog.js';
import {knowledgeCatalog,knowledgeTopic,knowledgeScopeGroup} from '../data/subject-knowledge.js';
// Optional teacher choices; these never infer a textbook edition or replace
// the knowledge labels supplied by the imported exam materials.
const modules={
 '语文':['现代文阅读','古代诗文阅读','语言文字运用','写作'],
 '数学':['集合与常用逻辑用语','函数与导数','三角函数与解三角形','数列','平面向量与立体几何','解析几何','概率与统计'],
 '英语':['词汇与语法','阅读理解','七选五与完形填空','语法填空','应用文写作','读后续写'],
 '物理':['力与运动','能量与动量','电场与电路','磁场与电磁感应','振动与波','光学与近代物理','实验与数据分析'],
 '化学':['物质结构与元素周期律','化学反应原理','溶液与离子反应','电化学','有机化学','化学实验与探究'],
 '生物':['分子与细胞','遗传与进化','稳态与调节','生物与环境','生物技术与工程'],
 '日语':['词汇与汉字','助词与语法','阅读理解','翻译与表达','写作'],
 '历史':['中国古代史','中国近现代史','世界史','史料阅读与历史解释'],
 '政治':['中国特色社会主义','经济与社会','政治与法治','哲学与文化','当代国际政治与经济','法律与生活','逻辑与思维'],
 '地理':['自然地理','人文地理','区域地理','资源、环境与可持续发展','地理图表与数据分析']
};
const goals={
 '语文':['文本信息筛选','阅读鉴赏与证据分析','答题表达与分点组织','写作构思与论证'],
 '数学':['概念辨析与基础巩固','常规方法与计算训练','条件、定义域与边界辨析','多步推理与变式迁移'],
 '英语':['词汇语法与语境运用','阅读定位与推断','篇章结构与逻辑衔接','写作表达与连贯性'],
 '物理':['物理情境与模型建立','规律选择与定量计算','受力分析与图像理解','实验设计与误差分析'],
 '化学':['概念辨析与原理应用','方程式与守恒计算','实验设计与现象解释','信息提取与推理论证'],
 '生物':['概念辨析与联系','遗传规律与概率计算','实验变量与对照设计','图表信息与证据推理']
};
export function exercisePresets(subject){return {modules:exerciseCatalog(subject).groups.map(g=>g.name),goals:goals[subject]||['基础概念巩固','材料阅读与信息提取','分析推理与规范表达','综合应用与迁移']};}
export const exerciseScopeGroup=(subject,name)=>subject==='数学'?({'平面向量与立体几何':'向量与几何','平面向量':'向量与几何','空间向量与立体几何':'向量与几何','平面解析几何':'解析几何','计数原理与概率统计':'概率与统计'}[name]||name):knowledgeScopeGroup(subject,name);

const scopeTerms={
 数学:[['集合与常用逻辑用语',/集合|交集|并集|补集|命题|逻辑/],['函数与导数',/函数|导数|单调|极值|最值|零点/],['三角函数与解三角形',/三角|正弦|余弦|解三角形/],['数列',/数列|等差|等比|递推/],['平面向量与立体几何',/向量|立体|空间|平面|翻折|球|圆柱/],['解析几何',/椭圆|双曲线|抛物线|圆锥曲线|弦长|离心率/],['概率与统计',/概率|统计|分布|随机|回归/]],
 物理:[['力与运动',/力|运动|速度|加速度|平抛|圆周/],['能量与动量',/能量|功|动量|碰撞/],['电场与电路',/电场|电路|电阻|电容|电势|欧姆/],['磁场与电磁感应',/磁场|电磁|感应|洛伦兹/],['振动与波',/振动|波|简谐/]],
 化学:[['物质结构与元素周期律',/结构|周期|化学键|晶体/],['化学反应原理',/平衡|速率|热化学|反应热/],['溶液与离子反应',/溶液|离子|水解|电离|沉淀/],['电化学',/电化学|电池|电解/],['有机化学',/有机|烃|醇|酚|醛|羧酸|酯/],['化学实验与探究',/实验|滴定|装置|制备|除杂/]],
 生物:[['分子与细胞',/细胞|酶|呼吸|光合|蛋白质|膜|分裂/],['遗传与进化',/遗传|基因|染色体|进化|DNA|RNA/],['稳态与调节',/稳态|调节|神经|激素|免疫/],['生物与环境',/生态|种群|群落|环境/],['生物技术与工程',/工程|克隆|发酵|生物技术/]]
};
// This only suggests labels already present in the teacher's materials.
// A suggested grouping never becomes a new score-derived knowledge label.
export function exerciseScopeModules(subject,curriculum=''){
 const prefix='高中'+subject+'已学内容：';if(!curriculum.startsWith(prefix))return [];
 const choices=[...new Set([...(modules[subject]||[]),...exercisePresets(subject).modules,...knowledgeCatalog(subject).modules.flatMap(m=>[m.name,m.scopeGroup,...m.branches.map(b=>b.scopeGroup)].filter(Boolean))])],selected=curriculum.slice(prefix.length).split('、').map(s=>s.trim()).filter(Boolean);
 return selected.length&&selected.every(m=>choices.includes(m))?[...new Set(selected.map(m=>exerciseScopeGroup(subject,m)))]:[];
}
// Add the selected knowledge groups to a recognised module list. Existing
// modules stay in place; a free-text or special scope is never replaced.
export function exerciseScopeWithGroups(subject,curriculum,groups=[]){
 const existing=exerciseScopeModules(subject,curriculum);if(!existing.length)return curriculum;
 return '高中'+subject+'已学内容：'+[...new Set([...existing,...groups.filter(Boolean)])].join('、');
}
export function exerciseScopeMatches(subject,curriculum,knowledge){
 const selected=exerciseScopeModules(subject,curriculum);if(!selected.length)return [];
 return knowledge.filter(label=>{const topic=knowledgeTopic(subject,label);if(topic)return selected.includes(topic.scopeGroup||exerciseScopeGroup(subject,topic.path[0]));return selected.some(module=>{const pattern=scopeTerms[subject]?.find(([m])=>m===module||module==='向量与几何'&&m==='平面向量与立体几何')?.[1],group=exerciseCatalog(subject).groups.find(g=>g.name===module),terms=[module,...(group?.topics||[])];return pattern?pattern.test(label):terms.some(t=>label.includes(t)||t.includes(label));});});
}
