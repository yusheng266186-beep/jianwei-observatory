export const laboratory={kind:'apparatus',caption:'实验气路示意图',description:'A至D从左到右连接，图中标出液位与导管末端。',nodes:[
 {id:'a',x:20,y:50,label:'A',shape:'vessel',equipment:'round-flask',liquidLevel:35,inlet:'none',outlet:'short',additionFunnel:true},
 {id:'b',x:40,y:50,label:'B',shape:'vessel',equipment:'gas-bottle',liquidLevel:0,inlet:'short',outlet:'short'},
 {id:'c',x:60,y:50,label:'C',shape:'vessel',equipment:'three-neck-flask',liquidLevel:45,inlet:'long',outlet:'short'},
 {id:'d',x:80,y:50,label:'D',shape:'vessel',equipment:'beaker',liquidLevel:45,inlet:'funnel',outlet:'none'}
],edges:[{from:'a',to:'b',label:'',type:'tube'},{from:'b',to:'c',label:'',type:'tube'},{from:'c',to:'d',label:'',type:'tube'}]};
export const changePlot={kind:'plot',caption:'物质的量测量数据及连线（连线仅示意变化趋势）',description:'横轴为时间，纵轴为物质的量；实线为CO2，虚线为CH3OH。',xLabel:'时间 / min',yLabel:'物质的量 / mol',xRange:[0,10],yRange:[0,1.2],series:[{label:'CO2',points:[[0,1],[2,.7],[5,.5],[10,.5]]},{label:'CH3OH',points:[[0,0],[2,.3],[5,.5],[10,.5]]}]};
export const solidFigures=[['cuboid',[3,2,2],['A','B','C','D','A1','B1','C1','D1']],['right-triangular-prism',[3,2,2],['A','B','C','D','E','F']],['rectangular-pyramid',[3,3,3],['A','B','C','D','S']]].map(([id,dimensions,labels])=>({kind:'geometry',caption:'立体模型示意图，非按比例',description:'顶点与可见棱为实线，遮挡棱为虚线。',model:{id,dimensions,labels}}));
export const physicsFigures=[{kind:'forces',caption:'斜面与物块示意图',description:'一个物块放在直角斜面上。',model:{id:'inclined-plane',dimensions:[4,2],labels:['物块','固定斜面']}},{kind:'apparatus',caption:'单个定滑轮示意图',description:'一根绳跨过单个定滑轮，两端连接物块。',model:{id:'fixed-pulley',dimensions:[],labels:['A','B']}}];
