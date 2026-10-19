'use strict';
const schema='学科结构图库使用diagram={kind:"science",caption,description,spec:{family,...}}，不混入model、nodes、edges或scene。spec只能包含对应family所列字段，每个字段都要提供。只提供题干明确给定的结构和标签；待考名称用甲乙或空字符串，不能把所求答案写进图注、description或标签。尺寸和位置均为示意，不能把比例当成未给出的条件。';
const selection='已有图库能够准确表达时必须使用图库；复杂结构不在覆盖范围内时应明确给出精确矢量委托，不冒用相似模板，不为适配图库改写题目。';
const mechanics='物理spec.family:"mechanics"，字段model、angle、direction、labels；conveyor还必须给blockPosition。model:"horizontal-block"为水平面上单个物块，angle:0、direction:"none"、labels:[水平面标签,物块标签]；"spring-block"为左固定壁—水平弹簧—物块，angle:0、direction:"none"、labels:[固定壁标签,弹簧标签,物块标签]；"conveyor"为单条传送带上一个物块，angle为已知示意倾角0–35度（右侧较高，未指定倾斜则0），direction为题干已给定的传送方向left/right/none，labels:[传送带标签,物块标签]。blockPosition为题干给定的初始位置left/center/right，左端放置必须写left，右端放置写right，未指定位置写center。direction只画带的运行方向，不画物块运动或受力答案。不自动假设弹簧原长、接触面粗糙、传送速度或质量。';
const circuit='物理电路spec={family:"circuit",nodes:[{id,x,y}],branches:[{from,to,component,label}]}。坐标为640×380画布像素，x在55–585、y在45–305。所有支路必须水平或竖直；元件支路长度至少76，导线至少24。component仅wire/resistor/battery/lamp/switch-open/switch-closed/ammeter/voltmeter/capacitor/diode。battery从from到to方向为长正极板在前、短负极板在后，diode从from到to为正向。导线拐角和分支用显式节点；交点必须拆分各支路并共用节点，自动画连接圆点，不允许未注明的交叉、重叠或断开部分。并联支路分别绕行不同坐标，不把两元件画在重叠的同一条线。元件标签短且与邻近支路留出空间；电流表串联、电压表并联是否符合设问须依据已知条件核对，若题目专门考查错误接法则保留给定错误，不擅自纠正。';
const molecule='化学常见中性有机分子spec={family:"molecule",atoms:[{id,element,hydrogens,x,y}],bonds:[{from,to,order}]}，element只可C/N/O/H/F/Cl/Br/I，hydrogens为该原子上明确的隐式氢数0–4，order为1/2/3。每个原子的化学键级和加hydrogens必须分别满足C4、N3、O2、H及卤素1；显式H原子的hydrogens为0。原子坐标x55–585、y45–305，任意两原子至少58像素，键不能交叉或穿过其他原子。绘图会完整显示每个原子及其氢数，不采用省略碳原子的键线式。苯环可用六个C和交替单双键表达，不能用六条单键冒充苯。该图库不支持带电、自由基、配位键、楔线立体化学或复杂稠环，不能用中性模板伪造。';
const molecular='球棍模型不能用平面十字键冒充空间构型。甲烷、乙烷、乙醇、乙烯、苯使用spec={family:"molecular-model",compound:"methane"/"ethane"/"ethanol"/"ethylene"/"benzene"}，只给这两个字段。原子、成键、饱和碳的四面体取向或烯烃与苯环的平面取向由标准坐标绘制，含C/H/O字母图例，图注注明几何示意；不作为精确键长测量图，不支持手性楔线或其他化合物，不能套用近似分子。';
const crystal='化学晶胞spec={family:"crystal",lattice,labels}。lattice为simple-cubic（8顶角）、body-centered-cubic（8顶角加体心）、face-centered-cubic（8顶角加6面心）、cscl（第一种粒子8顶角、第二种体心）、rock-salt（第一种8顶角加6面心，第二种12棱心加体心）。前三种labels只有一个粒子名称，后二种labels为按上述顺序两个互不相同的粒子名称。粒子位置和投影由程序确定，不由模型手绘；不自动标出配位数、每胞粒子数等答案。CsCl中的不同粒子不能被称为同种原子的体心立方；不能用这些立方模板替代金刚石、石墨、六方或任意分子晶胞。';
const cell='生物细胞spec={family:"cell",cellType:"plant"或"animal",parts:[{id,label}]}。id只可wall/membrane/cytoplasm/nucleus/vacuole/chloroplast/mitochondrion/er/golgi/ribosome，每种至多一个；植物图表示典型含大液泡的细胞，是否绘制叶绿体等须依据题干给定细胞类型，不给所有植物细胞默认加叶绿体。动物图不使用wall/chloroplast/vacuole（大型中央液泡），不支持原核细胞、细胞分裂相位或真实显微结构。只绘parts明确选择的细胞器，label可写甲乙以留待学生识别，标注引线自动布局。';
const photosynthesis='光合作用过程spec={family:"photosynthesis",labels:[类囊体薄膜位置标签,叶绿体基质位置标签,光反应位置标签,碳反应位置标签,光照输入标签,水输入标签,氧气输出标签,二氧化碳输入标签,有机物输出标签,光反应至碳反应的ATP和NADPH标签,反向返回的ADP和Pi及NADP+标签]}，11项都提供，未知位置用甲乙或空字符串。固定布局仅概括光反应与碳反应之间的物质能量联系，不是电子传递Z图或详细C3/C5循环，不冒用为其他过程。';
const dna='DNA片段spec={family:"dna",top,bottom,orientation:"5to3"或"3to5",labels:[上链标签,下链标签],showPairs:true或false}。top/bottom均按图中从左到右列4–24个ATCG碱基且等长，bottom不是再反向写的字符串；A-T、C-G互补，双链方向自动反平行。未知碱基用?，不能擅自填出所求互补碱基或在氢键数量上透露答案；有未知时相应氢键不画。showPairs仅在需要展示氢键时为true。DNA图不是RNA转录、剪接或基因位置图，不可混入U。';
const specs={
 '物理':mechanics+'\n'+circuit,
 '化学':molecule+'\n'+molecular+'\n'+crystal,
 '生物':cell+'\n'+photosynthesis+'\n'+dna+'\n'+molecule+'\n'+molecular
};
function scienceSpecs(subject){return specs[subject]||'';}
function scienceFigureGuide(subject){return specs[subject]?schema+'\n'+specs[subject]:'';}
function scienceGuide(subject){return specs[subject]?schema+selection+'\n'+specs[subject]:'';}
module.exports={scienceSpecs,scienceFigureGuide,scienceGuide};
