export const exerciseModels={
 cuboid:{kind:'geometry',dimensions:3,labels:8},
 'right-triangular-prism':{kind:'geometry',dimensions:3,labels:6},
 'rectangular-pyramid':{kind:'geometry',dimensions:3,labels:5},
 'inclined-plane':{kind:'forces',dimensions:2,labels:2},
 'fixed-pulley':{kind:'apparatus',dimensions:0,labels:2}
};
export function validateExerciseModel(d){
 const m=d.model,spec=exerciseModels[m?.id];
 if(!spec||d.kind!==spec.kind||!m||Object.keys(m).some(k=>!['id','dimensions','labels'].includes(k))||!Array.isArray(m.dimensions)||m.dimensions.length!==spec.dimensions||m.dimensions.some(v=>!Number.isFinite(v)||v<.001||v>1000)||!Array.isArray(m.labels)||m.labels.length!==spec.labels||m.labels.some(s=>typeof s!=='string'||s.length>8||/[<>$\\]/.test(s)))throw new Error('标准模型的类型、尺寸或标签不完整。');
 if(m.dimensions.length&&Math.max(...m.dimensions)/Math.min(...m.dimensions)>6)throw new Error('模型尺寸比例过大，无法清楚标注。');
 if(m.id==='inclined-plane'&&(m.dimensions[1]/m.dimensions[0]<.2||m.dimensions[1]/m.dimensions[0]>1.4))throw new Error('斜面模型的高宽比例无效。');
 if(['nodes','edges','series','xRange','yRange','image','scene'].some(k=>Object.hasOwn(d,k)))throw new Error('标准模型不能混入另一套图形数据。');
 return m;
}
// Orthographic view from (+x,+y,+z). An edge is visible if at least one of
// its adjacent outward faces faces the camera. No model-authored coordinates.
export function solidModelGeometry(model){
 const [a,b,h]=model.dimensions;let vertices,faces;
 if(model.id==='cuboid'){
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
 return {vertices,points:view.points,edges:[...edges.values()]};
}
export const exerciseModelSchema={type:'object',additionalProperties:false,required:['id','dimensions','labels'],properties:{id:{type:'string',enum:Object.keys(exerciseModels)},dimensions:{type:'array',items:{type:'number',minimum:.001,maximum:1000}},labels:{type:'array',items:{type:'string',maxLength:8}}}};
