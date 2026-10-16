// Public, anonymous fixtures shared by the gallery and regression checks.
const figure=(caption,spec)=>({kind:'science',caption,description:caption+'；结构示意，比例不作为题目条件。',spec});
const circuit={family:'circuit',nodes:[{id:'a',x:110,y:80},{id:'b',x:270,y:80},{id:'c',x:530,y:80},{id:'d',x:110,y:205},{id:'e',x:270,y:205},{id:'f',x:530,y:205},{id:'g',x:270,y:300},{id:'h',x:530,y:300}],branches:[{from:'a',to:'b',component:'battery',label:'E'},{from:'b',to:'c',component:'switch-closed',label:'S'},{from:'a',to:'d',component:'wire',label:''},{from:'d',to:'e',component:'ammeter',label:''},{from:'e',to:'f',component:'resistor',label:'R'},{from:'c',to:'f',component:'wire',label:''},{from:'e',to:'g',component:'wire',label:''},{from:'g',to:'h',component:'voltmeter',label:''},{from:'h',to:'f',component:'wire',label:''}]};
const ethanol={family:'molecule',atoms:[{id:'a',element:'C',hydrogens:3,x:160,y:195},{id:'b',element:'C',hydrogens:2,x:305,y:135},{id:'c',element:'O',hydrogens:1,x:450,y:195}],bonds:[{from:'a',to:'b',order:1},{from:'b',to:'c',order:1}]};
const benzene={family:'molecule',atoms:Array.from({length:6},(_,i)=>({id:'a'+i,element:'C',hydrogens:1,x:320+110*Math.cos(i*Math.PI/3),y:175+110*Math.sin(i*Math.PI/3)})),bonds:Array.from({length:6},(_,i)=>({from:'a'+i,to:'a'+((i+1)%6),order:i%2?1:2}))};
const cells=cellType=>({family:'cell',cellType,parts:(cellType==='plant'?['wall','membrane','cytoplasm','nucleus','vacuole','chloroplast','mitochondrion','er','golgi','ribosome']:['membrane','cytoplasm','nucleus','mitochondrion','er','golgi','ribosome']).map((id,i)=>({id,label:'甲乙丙丁戊己庚辛壬癸'[i]}))});
const chart=(kind,caption)=>({kind,caption,description:caption+'，数据仅用于图示样式核对。',xLabel:'时间 / min',yLabel:'测量值 / a.u.',xRange:[0,4],yRange:[0,10],series:[{label:'对照组',points:[[1,3],[2,5],[3,7]]},{label:'实验组',points:[[1,4],[2,7],[3,9]]}]});
export const scienceFigureSamples=[
 {subject:'物理',note:'已知带沿右上方运行；箭头只表示带的方向。',diagram:figure('倾斜传送带与物块',{family:'mechanics',model:'conveyor',blockPosition:'center',angle:18,direction:'right',labels:['传送带','物块']})},
 {subject:'物理',note:'水平支承、弹簧与物块；不自动标注受力结论。',diagram:figure('水平弹簧与物块',{family:'mechanics',model:'spring-block',angle:0,direction:'none',labels:['固定壁','弹簧','物块']})},
 {subject:'物理',note:'电流表串联，电压表并联，连接点明确。',diagram:figure('测量电阻的基本电路',circuit)},
 {subject:'化学',note:'显式显示碳、氧及其氢数，校验价键。',diagram:figure('乙醇的结构示意',ethanol)},
 {subject:'化学',note:'六元环与交替单双键；当前表达不包含立体化学。',diagram:figure('苯的结构示意',benzene)},
 ...[['methane','甲烷'],['ethane','乙烷'],['ethanol','乙醇'],['ethylene','乙烯'],['benzene','苯']].map(([compound,name])=>({subject:'化学',note:'固定空间坐标的球棍示意，C/H/O字母区分原子；不用于测量键长。',diagram:figure(name+'球棍模型',{family:'molecular-model',compound})})),
 ...[['simple-cubic','简单立方晶胞',['X']],['body-centered-cubic','体心立方晶胞',['X']],['face-centered-cubic','面心立方晶胞',['X']],['cscl','CsCl型晶胞',['Cl−','Cs+']],['rock-salt','NaCl型晶胞',['Cl−','Na+']]].map(([lattice,caption,labels])=>({subject:'化学',note:'粒子中心按晶胞分数坐标绘制，球大小为示意。',diagram:figure(caption,{family:'crystal',lattice,labels})})),
 {subject:'生物',note:'典型植物细胞示意；按题目选择细胞器，识别题可用字母标注。',diagram:figure('植物细胞结构示意',cells('plant'))},
 {subject:'生物',note:'不包含细胞壁、叶绿体或大型中央液泡。',diagram:figure('动物细胞结构示意',cells('animal'))},
 {subject:'生物',note:'两阶段物质和能量联系，不代替详细电子传递或碳循环图。',diagram:figure('光合作用两阶段联系',{family:'photosynthesis',labels:['类囊体薄膜','叶绿体基质','光反应','碳反应','光','H₂O','O₂','CO₂','有机物','ATP、NADPH','ADP、Pi、NADP⁺']})},
 {subject:'生物',note:'反平行双链，已知碱基检查互补；问号保留为未知。',diagram:figure('DNA双链片段',{family:'dna',top:'ATGCCGTA',bottom:'TACGGCAT',orientation:'5to3',labels:['链Ⅰ','链Ⅱ'],showPairs:true})},
 {subject:'图表',note:'同一横坐标的多组数据分开绘制，避免覆盖。',diagram:chart('bars','分组柱状图')},
 {subject:'图表',note:'独立测量点，不自动连线或假定拟合关系。',diagram:chart('scatter','分组散点图')}
];
