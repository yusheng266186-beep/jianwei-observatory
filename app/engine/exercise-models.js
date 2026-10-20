export const exerciseModels={
 'spatial-frame':{kind:'geometry',dimensions:0,labels:null},
 cuboid:{kind:'geometry',dimensions:3,labels:8},
 'right-triangular-prism':{kind:'geometry',dimensions:3,labels:6},
 'rectangular-pyramid':{kind:'geometry',dimensions:3,labels:5},
 'inclined-plane':{kind:'forces',dimensions:2,labels:2},
 'fixed-pulley':{kind:'apparatus',dimensions:0,labels:2}
};
export function validateExerciseModel(d){
 const m=d.model,spec=exerciseModels[m?.id],spatial=m?.id==='spatial-frame';
 if(!spec||d.kind!==spec.kind||!m||Object.keys(m).some(k=>!['id','dimensions','labels',...(spatial?['vertices','links']:[])].includes(k))||!Array.isArray(m.dimensions)||m.dimensions.length!==spec.dimensions||m.dimensions.some(v=>!Number.isFinite(v)||v<.001||v>1000)||!Array.isArray(m.labels)||(spatial?(m.labels.length<4||m.labels.length>12):m.labels.length!==spec.labels)||m.labels.some(s=>typeof s!=='string'||s.length>8||/[<>$\\]/.test(s)))throw new Error('标准模型的类型、尺寸或标签不完整。');
 if(spatial)validateSpatialFrame(m);
 if(m.dimensions.length&&Math.max(...m.dimensions)/Math.min(...m.dimensions)>6)throw new Error('模型尺寸比例过大，无法清楚标注。');
 if(m.id==='inclined-plane'&&(m.dimensions[1]/m.dimensions[0]<.2||m.dimensions[1]/m.dimensions[0]>1.4))throw new Error('斜面模型的高宽比例无效。');
 if(['nodes','edges','series','xRange','yRange','image','scene'].some(k=>Object.hasOwn(d,k)))throw new Error('标准模型不能混入另一套图形数据。');
 return m;
}
// General spatial frames keep coordinates in 3D until projection. A planar
// drawing cannot pass as a folded or rotated solid by changing its caption.
function validateSpatialFrame(m){
 const fail=()=>{throw Error('空间线框须给出4–12个非共面三维顶点、对应标签和不重复的有效棱。');};
 if(!Array.isArray(m.vertices)||m.vertices.length!==m.labels.length||m.vertices.some(v=>!Array.isArray(v)||v.length!==3||v.some(n=>!Number.isFinite(n)||Math.abs(n)>1000))||new Set(m.labels).size!==m.labels.length||m.labels.some(x=>!x))fail();
 const ps=m.vertices,span=Math.max(...[0,1,2].map(i=>Math.max(...ps.map(p=>p[i]))-Math.min(...ps.map(p=>p[i]))));if(span<.001)fail();
 let volume=0;for(let a=1;a<ps.length;a++)for(let b=a+1;b<ps.length;b++)for(let c=b+1;c<ps.length;c++){
  const [u,v,w]=[ps[a],ps[b],ps[c]].map(p=>p.map((n,i)=>n-ps[0][i]));volume=Math.max(volume,Math.abs(u[0]*(v[1]*w[2]-v[2]*w[1])-u[1]*(v[0]*w[2]-v[2]*w[0])+u[2]*(v[0]*w[1]-v[1]*w[0])));
 }if(volume/span**3<.0001)fail();
 if(!Array.isArray(m.links)||m.links.length<4||m.links.length>30)fail();const seen=new Set(),used=new Set();
 for(const e of m.links){if(!e||Object.keys(e).length!==3||!['from','to','hidden'].every(k=>Object.hasOwn(e,k))||!Number.isInteger(e.from)||!Number.isInteger(e.to)||e.from===e.to||e.from<0||e.to<0||e.from>=ps.length||e.to>=ps.length||typeof e.hidden!=='boolean')fail();const key=[e.from,e.to].sort((a,b)=>a-b).join('-');if(seen.has(key)||Math.hypot(...ps[e.from].map((n,i)=>n-ps[e.to][i]))<span*.001)fail();seen.add(key);used.add(e.from);used.add(e.to);}if(used.size!==ps.length)fail();
 const connected=new Set([0]);for(let n=0;n<ps.length;n++)for(const e of m.links){if(connected.has(e.from))connected.add(e.to);if(connected.has(e.to))connected.add(e.from);}if(connected.size!==ps.length)fail();
}
// Orthographic view from (+x,+y,+z). An edge is visible if at least one of
// its adjacent outward faces faces the camera. No model-authored coordinates.
export function solidModelGeometry(model){
 const [a,b,h]=model.dimensions;let vertices,faces;
 if(model.id==='spatial-frame'){validateSpatialFrame(model);vertices=model.vertices;faces=[];}else if(model.id==='cuboid'){
  vertices=[[0,0,0],[a,0,0],[a,0,b],[0,0,b],[0,h,0],[a,h,0],[a,h,b],[0,h,b]];
  faces=[[0,3,2,1],[4,5,6,7],[0,1,5,4],[1,2,6,5],[2,3,7,6],[3,0,4,7]];
 }else if(model.id==='right-triangular-prism'){
  vertices=[[0,0,0],[a,0,0],[0,h,0],[0,0,b],[a,0,b],[0,h,b]];
  faces=[[0,2,1],[3,4,5],[0,1,4,3],[1,2,5,4],[2,0,3,5]];
 }else if(model.id==='rectangular-pyramid'){
  vertices=[[0,0,0],[a,0,0],[a,0,b],[0,0,b],[a/2,h,b/2]];
  faces=[[0,3,2,1],[0,1,4],[1,2,4],[2,3,4],[3,0,4]];
 }else throw new Error('模型不是立体几何。');
 const centre=vertices[0].map((_,i)=>vertices.reduce((s,p)=>s+p[i],0)/vertices.length),edges=new Map();
 const views=[[36,25],[30,35],[55,28],[65,38],[24,18],[60,18]].map(([az,el])=>{
  const a=az*Math.PI/180,e=el*Math.PI/180,camera=[Math.sin(a)*Math.cos(e),Math.sin(e),Math.cos(a)*Math.cos(e)],raw=vertices.map(([x,y,z])=>[Math.cos(a)*x-Math.sin(a)*z,Math.sin(e)*(Math.sin(a)*x+Math.cos(a)*z)-Math.cos(e)*y]),xs=raw.map(p=>p[0]),ys=raw.map(p=>p[1]),left=Math.min(...xs),top=Math.min(...ys),width=Math.max(...xs)-left,height=Math.max(...ys)-top,scale=Math.min(390/width,230/height),points=raw.map(([x,y])=>[320+(x-left-width/2)*scale,184+(y-top-height/2)*scale]);
  let separation=Infinity;for(const [i,p] of points.entries())for(const q of points.slice(i+1))separation=Math.min(separation,Math.hypot(p[0]-q[0],p[1]-q[1]));return {points,camera,separation};
 });
 const view=views[0].separation>=34?views[0]:views.reduce((a,b)=>a.separation>b.separation?a:b);
 for(const face of faces){
  const [p,q,r]=face.map(i=>vertices[i]),u=q.map((v,i)=>v-p[i]),v=r.map((v,i)=>v-p[i]),normal=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],mid=p.map((_,i)=>face.reduce((s,j)=>s+vertices[j][i],0)/face.length);
  if(normal.reduce((s,n,i)=>s+n*(mid[i]-centre[i]),0)<0)for(let i=0;i<3;i++)normal[i]*=-1;
  const visible=normal.reduce((s,n,i)=>s+n*view.camera[i],0)>1e-9;
  for(let i=0;i<face.length;i++){const pair=[face[i],face[(i+1)%face.length]].sort((a,b)=>a-b),key=pair.join('-'),old=edges.get(key);edges.set(key,{vertices:pair,visible:visible||old?.visible||false});}
 }
 return {vertices,points:view.points,edges:model.id==='spatial-frame'?model.links.map(e=>({vertices:[e.from,e.to],visible:!e.hidden})):[...edges.values()]};
}
export const exerciseModelSchema={type:'object',additionalProperties:false,required:['id','dimensions','labels'],properties:{vertices:{type:'array',minItems:4,maxItems:12,items:{type:'array',minItems:3,maxItems:3,items:{type:'number',minimum:-1000,maximum:1000}}},links:{type:'array',minItems:4,maxItems:30,items:{type:'object',additionalProperties:false,required:['from','to','hidden'],properties:{from:{type:'integer',minimum:0,maximum:11},to:{type:'integer',minimum:0,maximum:11},hidden:{type:'boolean'}}}},id:{type:'string',enum:Object.keys(exerciseModels)},dimensions:{type:'array',items:{type:'number',minimum:.001,maximum:1000}},labels:{type:'array',items:{type:'string',maxLength:8}}}};
