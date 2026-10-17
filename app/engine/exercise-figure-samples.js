// Public, anonymous fixtures shared by the gallery and regression checks.
const figure=(caption,spec)=>({kind:'science',caption,description:caption+(['terrain','climate'].includes(spec.family)?'；教学示意数据，坐标与比例尺按所给数值绘制。':'；结构示意，比例不作为题目条件。'),spec});
const circuit={family:'circuit',nodes:[{id:'a',x:110,y:80},{id:'b',x:270,y:80},{id:'c',x:530,y:80},{id:'d',x:110,y:205},{id:'e',x:270,y:205},{id:'f',x:530,y:205},{id:'g',x:270,y:300},{id:'h',x:530,y:300}],branches:[{from:'a',to:'b',component:'battery',label:'E'},{from:'b',to:'c',component:'switch-closed',label:'S'},{from:'a',to:'d',component:'wire',label:''},{from:'d',to:'e',component:'ammeter',label:''},{from:'e',to:'f',component:'resistor',label:'R'},{from:'c',to:'f',component:'wire',label:''},{from:'e',to:'g',component:'wire',label:''},{from:'g',to:'h',component:'voltmeter',label:''},{from:'h',to:'f',component:'wire',label:''}]};
const ethanol={family:'molecule',atoms:[{id:'a',element:'C',hydrogens:3,x:160,y:195},{id:'b',element:'C',hydrogens:2,x:305,y:135},{id:'c',element:'O',hydrogens:1,x:450,y:195}],bonds:[{from:'a',to:'b',order:1},{from:'b',to:'c',order:1}]};
const benzene={family:'molecule',atoms:Array.from({length:6},(_,i)=>({id:'a'+i,element:'C',hydrogens:1,x:320+110*Math.cos(i*Math.PI/3),y:175+110*Math.sin(i*Math.PI/3)})),bonds:Array.from({length:6},(_,i)=>({from:'a'+i,to:'a'+((i+1)%6),order:i%2?1:2}))};
const cells=cellType=>({family:'cell',cellType,parts:(cellType==='plant'?['wall','membrane','cytoplasm','nucleus','vacuole','chloroplast','mitochondrion','er','golgi','ribosome']:['membrane','cytoplasm','nucleus','mitochondrion','er','golgi','ribosome']).map((id,i)=>({id,label:'甲乙丙丁戊己庚辛壬癸'[i]}))});
const chart=(kind,caption)=>({kind,caption,description:caption+'，数据仅用于图示样式核对。',xLabel:'时间 / min',yLabel:'测量值 / a.u.',xRange:[0,4],yRange:[0,10],series:[{label:'对照组',points:[[1,3],[2,5],[3,7]]},{label:'实验组',points:[[1,4],[2,7],[3,9]]}]});
const terrain={family:'terrain',elevations:Array.from({length:9},(_,r)=>Array.from({length:9},(_,c)=>Math.round(100+600*Math.max(0,1-((c/2-2)**2+(r/2-2)**2)/4)))),cellSizeKm:.5,interval:100,section:[[0,2],[4,2]],labels:['A','B'],view:'combined',spots:[{x:2,y:2,label:'P',showElevation:true}]};
const climate={family:'climate',station:'甲地（示意数据）',temperature:[-6,-2,5,13,19,24,27,25,19,11,3,-4],precipitation:[5,8,15,30,55,95,150,130,65,30,15,6],temperatureRange:[-10,30],precipitationMax:200};
export const scienceFigureSamples=[
 ...[['ellipse','椭圆',5,3,0],['hyperbola','双曲线',3,2,0],['parabola','抛物线',0,0,2]].map(([curve,name,a,b,p])=>({subject:'数学',note:'由标准方程参数绘制，横纵单位等长；未要求时不显示焦点或辅助结论。',diagram:figure(name+'标准曲线',{family:'conic',curve,orientation:'horizontal',a,b,p,range:[-7,7,-5,5],showFoci:false,labels:['x','y']})})),
 {subject:'物理',note:'只画已知场方向，不自动叠加洛伦兹力、速度或待求轨迹。',diagram:figure('垂直纸面向里的匀强磁场',{family:'uniform-field',fieldType:'magnetic',direction:'into',label:'B',particle:{shown:true,x:.35,y:.55,label:'P'}})},
 {subject:'物理',note:'仅显示给定入射光线，待求折射光线保持空缺。',diagram:figure('两介质界面与入射光',{family:'optics',model:'refraction',incidentAngle:45,reflectedAngle:null,refractedAngle:null,n1:1,n2:1.5,labels:['介质Ⅰ','介质Ⅱ']})},
 {subject:'生物',note:'结构只表示给定婚配、亲子与表型，不预填遗传方式和基因型。',diagram:figure('两代家族系谱',{family:'pedigree',members:[{id:'a',generation:1,position:3,sex:'male',affected:false,label:'Ⅰ-1'},{id:'b',generation:1,position:4,sex:'female',affected:false,label:'Ⅰ-2'},{id:'c',generation:2,position:2,sex:'male',affected:true,label:'Ⅱ-1'},{id:'d',generation:2,position:5,sex:'female',affected:false,label:'Ⅱ-2'}],unions:[{id:'u1',left:'a',right:'b',children:['c','d']}]})},
 {subject:'地理',note:'架空洋盆示意，流向、冷暖均来自显式条件；不冒充真实海岸底图。',diagram:figure('中低纬洋盆环流示意',{family:'ocean-currents',latitudes:[10,40],currents:[{edge:'west',direction:'north',nature:'warm',label:'甲'},{edge:'north',direction:'east',nature:'warm',label:'乙'},{edge:'east',direction:'south',nature:'cold',label:'丙'},{edge:'south',direction:'west',nature:'warm',label:'丁'}]})},
 ...[['fold','褶皱地层',0],['normal-fault','断层剖面',25]].map(([structure,name,offset])=>({subject:'地理',note:'相同岩层连续对应，断层面与两侧错动共用几何关系；图形为非比例示意。',diagram:figure(name+'示意',{family:'strata',structure,layers:['甲','乙','丙','丁'],offset})})),
 {subject:'化学',note:'发生、洗气、末端吸收组合；接口、液位和长短导管逐一指定，未包含加热与冷凝结构。',diagram:{kind:'apparatus',caption:'气体发生与吸收装置组合',description:'按题目已知条件连接的三段装置，非比例示意。',nodes:[{id:'A',x:20,y:50,label:'A',shape:'vessel',equipment:'conical-flask',liquidLevel:40,inlet:'none',outlet:'short',additionFunnel:true},{id:'B',x:50,y:50,label:'B',shape:'vessel',equipment:'gas-bottle',liquidLevel:45,inlet:'long',outlet:'short'},{id:'C',x:80,y:50,label:'C',shape:'vessel',equipment:'beaker',liquidLevel:45,inlet:'funnel',outlet:'none'}],edges:[{from:'A',to:'B',label:'',type:'tube'},{from:'B',to:'C',label:'',type:'tube'}]}},

 {subject:'地理',note:'等高线与A—B剖面共用规则高程网格；北向、比例尺与等高距明确。',diagram:figure('等高线与对应地形剖面',terrain)},
 {subject:'地理',note:'仅提供等高线；待绘制剖面的题目不会提前附上剖面答案。',diagram:figure('山地等高线示意',{...terrain,view:'map'})},
 {subject:'地理',note:'横向距离与高程来自同一网格，不另外手画曲线。',diagram:figure('A—B地形剖面',{...terrain,view:'profile'})},
 {subject:'地理',note:'12个月份完整；气温左轴°C，降水右轴mm，黑白打印仍可辨识。',diagram:figure('月均气温与月降水量',climate)},
 {subject:'地理',note:'全年温度均为正时也不强制零度起点；降水轴始终从0开始。',diagram:figure('另一组月度气候示意',{...climate,station:'乙地（示意数据）',temperature:[25,25,23,20,17,14,13,14,17,20,22,24],precipitation:[8,10,20,45,80,110,120,90,55,30,15,7],temperatureRange:[10,30],precipitationMax:150})},
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
