import test from 'node:test';import assert from 'node:assert/strict';
import {validateGeographyFigure,terrainContours,terrainProfile,terrainElevation} from '../app/engine/exercise-geography.js';
import {exerciseDiagramSVG} from '../app/io/exercise-diagram.js';
import {scienceFigureSamples} from '../app/engine/exercise-figure-samples.js';
const sample=family=>structuredClone(scienceFigureSamples.find(s=>s.diagram.spec?.family===family).diagram.spec);
const near=(a,b)=>assert(Math.abs(a-b)<1e-6,`${a} != ${b}`);
test('地形的南北行序、实际格距与仿射坡面高程独立核算一致',()=>{
 const s={...sample('terrain'),elevations:[[0,200,400],[100,300,500],[200,400,600]],cellSizeKm:2,section:[[.3,.8],[3.7,3.5]]};validateGeographyFigure(s);
 for(const [x,y] of [[0,0],[4,4],[.3,.8],[2.7,1.4],[1,3.5]])near(terrainElevation(s,x,y),100*x+50*y);
 for(const c of terrainContours(s))for(const [x,y] of c.points)near(100*x+50*y,c.level);
 const p=terrainProfile(s),len=Math.hypot(3.4,2.7);for(const v of p)near(v.elevation,100*(.3+3.4*v.distance/len)+50*(.8+2.7*v.distance/len));near(p.at(-1).distance,len);
});
test('剖面保留格线和三角形边界的真实折点，不把网格样点连线冒充剖面',()=>{
 const s={...sample('terrain'),elevations:[[0,0,0],[0,400,0]],cellSizeKm:1,section:[[0,.5],[2,.5]]};
 assert.deepEqual(terrainProfile(s).map(p=>[p.distance,p.elevation]),[[0,0],[.5,200],[1,200],[1.5,0],[2,0]]);
 const reverse=terrainProfile({...s,section:[...s.section].reverse()});for(const [i,p] of reverse.entries())near(p.elevation,terrainProfile(s).at(-1-i).elevation);
});
test('等高线每段中点均位于同一高程面，重复网格边不叠绘，闭合山地不缺口',()=>{
 for(const s of [sample('terrain'),{...sample('terrain'),elevations:[[0,200,100,400],[100,200,200,300],[0,200,200,0],[400,100,300,100]],spots:[],section:[],labels:[],view:'map'}]){
  validateGeographyFigure(s);const seen=new Set();for(const c of terrainContours(s))for(let i=1;i<c.points.length;i++){const a=c.points[i-1],b=c.points[i];near(terrainElevation(s,(a[0]+b[0])/2,(a[1]+b[1])/2),c.level);const key=[a.join(','),b.join(',')].sort().join('/')+'/'+c.level;assert(!seen.has(key));seen.add(key);}
 }
 const closed=terrainContours(sample('terrain')).filter(c=>c.level>=300);assert(closed.length>0);for(const c of closed)assert.deepEqual(c.points[0],c.points.at(-1));
});
test('地形拒绝缺失/非矩形网格、越界剖面、退化位置、无效等高距，不擅自补数据',()=>{
 const bad=[s=>s.elevations[0].pop(),s=>s.elevations[0][0]=null,s=>s.cellSizeKm=0,s=>s.interval=0,s=>s.interval=10000,s=>s.section[0]=[-1,2],s=>s.section[1]=s.section[0],s=>s.section=[],s=>s.labels=['A','A'],s=>s.section[0]=null];for(const edit of bad){const s=sample('terrain');edit(s);assert.throws(()=>validateGeographyFigure(s));}
 assert.throws(()=>terrainElevation(sample('terrain'),5,2),/超出/);
});
test('气候图完整显示12月，两轴数值分别按°C和mm映射，零降水没有虚假柱高',()=>{
 const s=sample('climate');s.precipitation[0]=0;const svg=exerciseDiagramSVG({kind:'science',caption:'气候',description:'示意数据',spec:s});assert(svg.includes('气温 / °C'));assert(svg.includes('降水量 / mm'));assert.equal((svg.match(/data-climate-value=/g)||[]).length,24);assert(svg.includes('>150</text>'));assert(svg.includes('>27</text>'));assert.equal((svg.match(/data-precipitation-month=/g)||[]).length,12);assert(/height="0" data-precipitation-month="1"/.test(svg));const path=svg.match(/data-temperature-series="true" d="([^"]+)"/)[1];assert(path.startsWith('M100 271.5 '));assert(svg.includes('y="118.75" width="22" height="176.25" data-precipitation-month="7"'));assert(!/undefined|NaN|Infinity/.test(svg));
});
test('气候拒绝缺月份、负降水、量程截断和混入字段，保留提供的原始数据',()=>{
 for(const edit of [s=>s.temperature.pop(),s=>s.precipitation[3]=-1,s=>s.temperatureRange=[10,30],s=>s.precipitationMax=40,s=>s.temperature[2]=null,s=>s.station='<b>',s=>s.inventedData=true]){const s=sample('climate');edit(s);assert.throws(()=>validateGeographyFigure(s));}
 const s=sample('climate'),old=structuredClone(s);assert.deepEqual(validateGeographyFigure(s),old);assert.deepEqual(s,old);
});

test('极小地理格距的比例尺和距离不会四舍五入成0公里',()=>{const s=sample('terrain');s.cellSizeKm=.0001;s.section=[];s.labels=[];s.spots=[];s.view='map';validateGeographyFigure(s);const svg=exerciseDiagramSVG({kind:'science',caption:'局部',description:'小范围示意',spec:s});assert(svg.includes('0.0002 km'));assert(!svg.includes('>0 km<'));});
test('真实出题与绘图两个阶段都约束地理完整数据，文字阶段不要求绘图参数输出',async()=>{const {default:generator}=await import('../backend/generator.cjs');const request={subject:'地理',grade:'高三',curriculum:'等高线与气候',focus:'图表判读',count:3,minutes:20,difficulty:'基础巩固',evidence:[],visuals:'vector'};const p=await generator.buildExercisePrompt(request,{separateFigures:true});assert.match(p.system,/12个气温/);assert.match(p.system,/行由南到北/);assert.match(p.system,/不能另外编造平滑曲线/);assert.match(p.system,/不绘图、不输出diagram/);assert(!p.system.includes('当前基础plot/bars/scatter每图只有一个纵轴'));});

test('已知点高程由同一网格计算，未知点高度不显示，不允许另填峰高或重复点',()=>{const s=sample('terrain'),d={kind:'science',caption:'地形',description:'示意',spec:s};validateGeographyFigure(s);assert(exerciseDiagramSVG(d).includes('P 700 m'));s.spots[0].showElevation=false;assert(!exerciseDiagramSVG(d).includes('P 700 m'));s.spots[0].height=999;assert.throws(()=>validateGeographyFigure(s),/高程点/);delete s.spots[0].height;s.spots.push({...s.spots[0]});assert.throws(()=>validateGeographyFigure(s),/高程点/);});

test('地图纸面保留清晰图幅并避免吞掉首页，作答空间分配保留原有总高度',async()=>{const {exercisePrintFigureParts,exerciseAnswerSpaceParts,exerciseAnswerSpaceHeight}=await import('../app/engine/exercise-print.js');const q={id:1,type:'简答',stem:'地形图。\n计算相对高差。',choices:[],diagram:{kind:'science',caption:'地形',description:'示意',spec:{...sample('terrain'),view:'map'}},figureLayout:{after:'地形图。',width:'wide',aspect:'wide'}};assert.equal(exercisePrintFigureParts(q).height,260);const parts=exerciseAnswerSpaceParts(q,'地理');assert.equal(parts.minimum+parts.trailing,exerciseAnswerSpaceHeight(q,'地理'));assert(parts.minimum>=60);assert(parts.trailing>0);delete q.diagram;assert.equal(exerciseAnswerSpaceParts(q,'地理').trailing,0);});
