import {solidModelGeometry} from '../engine/exercise-models.js';
const esc=s=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const text=(x,y,label)=>`<text x="${x}" y="${y}" text-anchor="middle">${esc(label).replace(/^([A-Za-z])_?(\d+)$/,(_,letter,n)=>letter+'<tspan baseline-shift="sub" font-size="9">'+n+'</tspan>')}</text>`;
export function exerciseModelSVG(model){
 if(['cuboid','right-triangular-prism','rectangular-pyramid','spatial-frame'].includes(model.id)){
  const {points,edges,motionArcs=[]}=solidModelGeometry(model);let parts='';
  for(const e of edges.sort((a,b)=>Number(a.visible)-Number(b.visible))){const [p,q]=e.vertices.map(i=>points[i]);parts+=`<path d="M ${p[0]} ${p[1]} L ${q[0]} ${q[1]}"${e.visible?'':' stroke-dasharray="6 4"'} stroke-width="1.6"/>`;}
  for(const arc of motionArcs){const ps=arc.points,b=ps.at(-1),a=ps.at(-2),length=Math.hypot(b[0]-a[0],b[1]-a[1]);if(length<1e-8)continue;const ux=(b[0]-a[0])/length,uy=(b[1]-a[1])/length;parts+=`<path data-motion-arc="true" d="${ps.map((p,i)=>(i?'L ':'M ')+p[0]+' '+p[1]).join(' ')}" stroke-width="1.4"/><path data-motion-arrow="true" d="M ${b[0]-9*ux+4*uy} ${b[1]-9*uy-4*ux} L ${b[0]} ${b[1]} L ${b[0]-9*ux-4*uy} ${b[1]-9*uy+4*ux}" stroke-width="1.4"/>`;}
  const centre=points[0].map((_,i)=>points.reduce((n,p)=>n+p[i],0)/points.length);
  for(const [i,p] of points.entries()){const dx=p[0]-centre[0],dy=p[1]-centre[1],len=Math.hypot(dx,dy)||1;parts+=text(p[0]+dx/len*18,p[1]+dy/len*18+4,model.labels[i]);}
  return parts;
 }
 if(model.id==='inclined-plane'){
  const [length,height]=model.dimensions,scale=Math.min(400/length,190/height),w=length*scale,h=height*scale,x=320-w/2,y=290,angle=-Math.atan2(h,w)*180/Math.PI,mx=x+w*.56,my=y-h*.56;
  // The block sits on the surface; no force arrows or motion are inferred.
  return `<path d="M ${x} ${y} H ${x+w} V ${y-h} Z" stroke-width="1.6"/><g transform="translate(${mx},${my}) rotate(${angle})"><rect x="-31" y="-38" width="62" height="38" fill="white" stroke-width="1.6"/></g>`+text(mx-8,my-53,model.labels[0])+text(x+w/2,y+27,model.labels[1]);
 }
 // Single fixed pulley: one continuous rope with two free hanging ends.
 return '<path d="M 260 42 H 380 M 320 42 V 85" stroke-width="2"/><circle cx="320" cy="120" r="35" fill="white" stroke-width="1.6"/><circle cx="320" cy="120" r="3" fill="#151a1f"/><path d="M 285 250 V 120 A 35 35 0 0 1 355 120 V 270" stroke-width="2"/><rect x="265" y="250" width="40" height="45" fill="white"/><rect x="335" y="270" width="40" height="45" fill="white"/>'+text(240,278,model.labels[0])+text(400,298,model.labels[1]);
}

export function exerciseModelFrame(model){
 let left,right,top,bottom;
 if(['cuboid','right-triangular-prism','rectangular-pyramid','spatial-frame'].includes(model.id)){const geometry=solidModelGeometry(model),points=[...geometry.points,...(geometry.motionArcs||[]).flatMap(arc=>arc.points)],pad=Math.max(30,...model.labels.map(s=>[...s].reduce((n,c)=>n+(/[^\x00-\xff]/.test(c)?13:6.5),0)/2+23));left=Math.min(...points.map(p=>p[0]))-pad;right=Math.max(...points.map(p=>p[0]))+pad;top=Math.min(...points.map(p=>p[1]))-32;bottom=Math.max(...points.map(p=>p[1]))+32;}
 else if(model.id==='inclined-plane'){const [length,height]=model.dimensions,scale=Math.min(400/length,190/height),w=length*scale,h=height*scale,x=320-w/2,y=290,my=y-h*.56;left=x-40;right=x+w+40;top=Math.min(y-h,my-80)-10;bottom=y+50;}
 else{left=205;right=435;top=22;bottom=338;}
 left=Math.max(0,Math.floor(left));top=Math.max(0,Math.floor(top));right=Math.min(640,Math.ceil(right));bottom=Math.min(380,Math.ceil(bottom));return {x:left,y:top,width:right-left,height:bottom-top};
}
