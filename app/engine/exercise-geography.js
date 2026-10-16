// Geography figures use supplied numeric data, never inferred map features.
const exact=(s,keys)=>s&&typeof s==='object'&&!Array.isArray(s)&&Object.keys(s).length===keys.length&&keys.every(k=>Object.hasOwn(s,k));
const text=(s,n)=>typeof s==='string'&&s.length<=n&&!/[<>$\\\u0000-\u001f]/u.test(s);
const fail=message=>{throw Error(message);};
export function validateGeographyFigure(s){
 if(s.family==='terrain'){
  if(!exact({spots:[],...s},['family','elevations','cellSizeKm','interval','section','labels','view','spots'])||!Array.isArray(s.elevations)||s.elevations.length<2||s.elevations.length>21||!Array.isArray(s.elevations[0]))fail('地形图须提供规则高程网格、格距、等高距和剖面设置。');
  const cols=s.elevations[0].length;if(cols<2||cols>21||s.elevations.some(row=>!Array.isArray(row)||row.length!==cols||row.some(h=>!Number.isFinite(h)||h < -12000||h>12000)))fail('高程网格须为2–21行列的矩形，海拔单位为m。');
  if(!Number.isFinite(s.cellSizeKm)||s.cellSizeKm<=0||s.cellSizeKm>1000||!Number.isFinite(s.interval)||s.interval<=0)fail('地形格距km与等高距m必须为正数。');
  const values=s.elevations.flat(),min=Math.min(...values),max=Math.max(...values);if(max===min||Math.ceil(max/s.interval)-Math.floor(min/s.interval)>42)fail('高程场须有起伏，等高距须使等高线清楚可辨。');
  if(!['map','profile','combined'].includes(s.view)||!Array.isArray(s.section)||![0,2].includes(s.section.length)||!Array.isArray(s.labels)||s.labels.length!==s.section.length||s.labels.some(x=>!text(x,3)||!x)||s.labels.length===2&&s.labels[0]===s.labels[1])fail('地形图须指定map、profile或combined，剖面两端使用不同短标签。');
  const {width,height}=terrainExtent(s);if(s.section.some(p=>!Array.isArray(p)||p.length!==2||!p.every(Number.isFinite)||p[0]<0||p[0]>width||p[1]<0||p[1]>height)||s.section.length===2&&Math.hypot(s.section[0][0]-s.section[1][0],s.section[0][1]-s.section[1][1])<1e-7||s.view!=='map'&&s.section.length!==2)fail('剖面线两端须位于高程网格内且不重合。');
  const spots=s.spots===undefined?[]:s.spots;if(!Array.isArray(spots)||spots.length>8||spots.some(p=>!exact(p,['x','y','label','showElevation'])||!Number.isFinite(p.x)||!Number.isFinite(p.y)||p.x<0||p.x>width||p.y<0||p.y>height||!text(p.label,3)||typeof p.showElevation!=='boolean'||!p.label&&!p.showElevation)||new Set(spots.map(p=>p.x+','+p.y)).size!==spots.length)fail('高程点须提供不重复的网格内坐标、短标签和是否展示已知海拔，不手填另一套高度。');
  if(!terrainContours(s).length&&s.view!=='profile')fail('给定等高距下没有可见等高线，请明确合适的等高距。');
 }else if(s.family==='climate'){
  if(!exact(s,['family','temperature','precipitation','temperatureRange','precipitationMax','station'])||!text(s.station,12)||!Array.isArray(s.temperature)||s.temperature.length!==12||s.temperature.some(x=>!Number.isFinite(x)||x < -90||x>65)||!Array.isArray(s.precipitation)||s.precipitation.length!==12||s.precipitation.some(x=>!Number.isFinite(x)||x<0||x>5000))fail('气候图须完整提供1–12月气温°C与非负降水量mm，不自动补齐月份。');
  if(!Array.isArray(s.temperatureRange)||s.temperatureRange.length!==2||!s.temperatureRange.every(Number.isFinite)||s.temperatureRange[0] < -100||s.temperatureRange[1]>100||s.temperatureRange[1]-s.temperatureRange[0]<1e-6||s.temperature.some(t=>t<s.temperatureRange[0]||t>s.temperatureRange[1])||!Number.isFinite(s.precipitationMax)||s.precipitationMax<1e-6||s.precipitationMax>10000||s.precipitationMax<Math.max(...s.precipitation))fail('气候图的独立气温轴与降水轴必须覆盖全部给定数据。');
 }else fail('地理图示类别无效。');
 return s;
}
export const terrainExtent=s=>({width:(s.elevations[0].length-1)*s.cellSizeKm,height:(s.elevations.length-1)*s.cellSizeKm});
// Rows run south to north. Each square is split SW→NE; contour extraction and
// section sampling use this same piecewise-linear surface, without smoothing.
export function terrainElevation(s,x,y){
 const {width,height}=terrainExtent(s);if(!Number.isFinite(x)||!Number.isFinite(y)||x<0||x>width||y<0||y>height)throw Error('高程查询坐标超出网格。');
 const n=s.cellSizeKm,c=Math.min(s.elevations[0].length-2,Math.floor(x/n)),r=Math.min(s.elevations.length-2,Math.floor(y/n)),u=x/n-c,v=y/n-r,h=s.elevations;
 return v<=u?(1-u)*h[r][c]+(u-v)*h[r][c+1]+v*h[r+1][c+1]:(1-v)*h[r][c]+u*h[r+1][c+1]+(v-u)*h[r+1][c];
}
const key=p=>p.map(x=>x.toFixed(8)).join(','),edgeKey=(a,b)=>[key(a),key(b)].sort().join('/');
export function terrainContours(s){
 const h=s.elevations,flat=h.flat(),min=Math.min(...flat),max=Math.max(...flat),n=s.cellSizeKm,out=[];
 for(let k=Math.floor(min/s.interval)+1;k*s.interval<max-1e-8;k++){
  const level=k*s.interval,edges=new Map();
  const add=(a,b,plateau=false)=>{if(key(a)===key(b))return;const id=edgeKey(a,b),old=edges.get(id);if(old){old.plateau+=Number(plateau);old.ordinary||=!plateau;}else edges.set(id,{a,b,plateau:Number(plateau),ordinary:!plateau});};
  for(let r=0;r<h.length-1;r++)for(let c=0;c<h[0].length-1;c++){
   const a=[c*n,r*n,h[r][c]],b=[(c+1)*n,r*n,h[r][c+1]],d=[c*n,(r+1)*n,h[r+1][c]],e=[(c+1)*n,(r+1)*n,h[r+1][c+1]];
   for(const tri of [[a,b,e],[a,e,d]]){
    if(tri.every(p=>Math.abs(p[2]-level)<1e-8)){for(let i=0;i<3;i++)add(tri[i].slice(0,2),tri[(i+1)%3].slice(0,2),true);continue;}
    const points=new Map();for(let i=0;i<3;i++){const p=tri[i],q=tri[(i+1)%3],dp=p[2]-level,dq=q[2]-level;if(Math.abs(dp)<1e-8)points.set(key(p.slice(0,2)),p.slice(0,2));if(dp*dq<0){const t=-dp/(dq-dp),v=[p[0]+t*(q[0]-p[0]),p[1]+t*(q[1]-p[1])];points.set(key(v),v);}}
    if(points.size===2)add(...points.values());
   }
  }
  const segments=[...edges.values()].filter(e=>e.ordinary||e.plateau===1),adj=new Map(),used=new Set();segments.forEach((e,i)=>{for(const p of [e.a,e.b]){const k=key(p);if(!adj.has(k))adj.set(k,[]);adj.get(k).push(i);}});
  const walk=(start,index)=>{let p=start,i=index;const line=[p];while(!used.has(i)){used.add(i);const e=segments[i];p=key(p)===key(e.a)?e.b:e.a;line.push(p);const next=adj.get(key(p));if(next.length!==2)break;i=next.find(j=>!used.has(j));if(i===undefined)break;}return line;};
  for(const [p,ids] of adj)if(ids.length!==2)for(const i of ids)if(!used.has(i)){const e=segments[i];out.push({level,points:walk(key(e.a)===p?e.a:e.b,i)});}
  for(let i=0;i<segments.length;i++)if(!used.has(i))out.push({level,points:walk(segments[i].a,i)});
 }
 return out;
}
export function terrainProfile(s){
 if(s.section.length!==2)return [];const [a,b]=s.section,dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy),ts=new Set([0,1]),n=s.cellSizeKm;
 const split=(a,d,lo,hi)=>{if(Math.abs(d)<1e-12)return;for(let k=lo;k<=hi;k++){const t=(k*n-a)/d;if(t>1e-10&&t<1-1e-10)ts.add(Number(t.toFixed(12)));}};
 split(a[0],dx,0,s.elevations[0].length-1);split(a[1],dy,0,s.elevations.length-1);split(a[0]-a[1],dx-dy,1-s.elevations.length,s.elevations[0].length-1);
 const {width,height}=terrainExtent(s);return [...ts].sort((x,y)=>x-y).map(t=>({distance:t*length,elevation:terrainElevation(s,Math.min(width,Math.max(0,a[0]+dx*t)),Math.min(height,Math.max(0,a[1]+dy*t)))}));
}
const number={type:'number'},numbers={type:'array',items:number};
export const geographySchemaProperties={elevations:{type:'array',items:numbers},cellSizeKm:number,interval:number,section:{type:'array',items:numbers},view:{type:'string',enum:['map','profile','combined']},spots:{type:'array',items:{type:'object',additionalProperties:false,required:['x','y','label','showElevation'],properties:{x:number,y:number,label:{type:'string'},showElevation:{type:'boolean'}}}},temperature:numbers,precipitation:numbers,temperatureRange:numbers,precipitationMax:number,station:{type:'string'}};
