import {crystalSites,scienceTextWidth} from '../engine/exercise-science.js';
import {molecularModel} from '../engine/exercise-molecular-model.js';
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const L=(x1,y1,x2,y2,extra='')=>`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" ${extra}/>`;
const formula=s=>esc(s).replace(/\b(?:[A-Z][a-z]?\d*){2,}\b/g,m=>m.replace(/\d+/g,n=>'<tspan baseline-shift="sub" font-size="9">'+n+'</tspan>')).replace(/([A-Za-z])([+−])(?=$|[、，\s])/g,'$1<tspan baseline-shift="super" font-size="9">$2</tspan>');
const T=(x,y,s,extra='')=>`<text x="${x}" y="${y}" text-anchor="middle" ${extra}>${formula(s)}</text>`;
const R=(x,y,w,h,extra='')=>`<rect x="${x}" y="${y}" width="${w}" height="${h}" ${extra}/>`;
const E=(x,y,rx,ry,extra='')=>`<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" ${extra}/>`;
const path=(d,extra='')=>`<path d="${d}" ${extra}/>`;
const arrow=(x1,y1,x2,y2)=>{const d=Math.hypot(x2-x1,y2-y1),ux=(x2-x1)/d,uy=(y2-y1)/d;return L(x1,y1,x2,y2)+path(`M ${x2-8*ux+4*uy} ${y2-8*uy-4*ux} L ${x2} ${y2} L ${x2-8*ux-4*uy} ${y2-8*uy+4*ux}`);};
function mechanics(s){
 if(s.model==='horizontal-block')return L(110,260,540,260)+R(260,184,110,76,'fill="white"')+T(315,227,s.labels[1])+T(325,295,s.labels[0]);
 if(s.model==='spring-block'){
  let coil='M 154 220 L 176 220';for(let i=0;i<12;i++)coil+=` L ${184+i*9} ${i%2?230:210}`;coil+=' L 292 220 L 320 220';
  let wall=L(154,160,154,260);for(let y=165;y<260;y+=12)wall+=L(140,y+10,154,y);
  return L(140,260,545,260)+wall+path(coil)+R(320,184,105,76,'fill="white"')+T(372,227,s.labels[2])+T(230,191,s.labels[1])+T(147,143,s.labels[0]);
 }
 // Rotate the entire physical assembly, not individual pieces. Direction is
 // a supplied belt direction only; no force or block-motion answer is added.
 const blockX=({left:180,center:275,right:380})[s.blockPosition||'center'];
 let p=R(135,220,365,44,'rx="22" fill="white"')+E(157,242,15,15)+E(478,242,15,15)+L(157,227,478,227)+L(157,257,478,257)+R(blockX,158,86,62,'fill="white"')+T(blockX+43,195,s.labels[1]);
 if(s.direction!=='none')p+=s.direction==='right'?arrow(180,296,430,296):arrow(430,296,180,296);
 p+=T(320,330,s.labels[0]);
 return `<g data-model="${s.model}" transform="translate(320 220) rotate(${-s.angle}) translate(-320 -220)">${p}</g>`;
}
function circuit(s){
 const nodes=new Map(s.nodes.map(n=>[n.id,n])),degree=new Map(s.nodes.map(n=>[n.id,0]));let out='';
 for(const b of s.branches){const a=nodes.get(b.from),c=nodes.get(b.to),dx=c.x-a.x,dy=c.y-a.y,h=Math.hypot(dx,dy)/2,angle=Math.atan2(dy,dx)*180/Math.PI,x=(a.x+c.x)/2,y=(a.y+c.y)/2;degree.set(a.id,degree.get(a.id)+1);degree.set(c.id,degree.get(c.id)+1);
  if(b.component==='wire'){out+=L(a.x,a.y,c.x,c.y);if(b.label)out+=T(x+(dx?0:20),y-(dx?12:0),b.label);continue;}
  let shape='';const lead=25;
  if(b.component==='resistor')shape=R(-25,-9,50,18,'fill="white"');
  if(b.component==='battery')shape=L(-6,-21,-6,21)+L(6,-12,6,12)+L(-25,0,-6,0)+L(6,0,25,0);
  if(['lamp','ammeter','voltmeter'].includes(b.component)){shape=E(0,0,20,20,'fill="white"')+L(-25,0,-20,0)+L(20,0,25,0);shape+=b.component==='lamp'?L(-13,-13,13,13)+L(-13,13,13,-13):`<g transform="rotate(${-angle})">${T(0,6,b.component==='ammeter'?'A':'V','font-size="17"')}</g>`;}
  if(b.component==='capacitor')shape=L(-5,-20,-5,20)+L(5,-20,5,20)+L(-25,0,-5,0)+L(5,0,25,0);
  if(b.component==='diode')shape=path('M -15 -15 L 10 0 L -15 15 Z','fill="white"')+L(11,-17,11,17)+L(-25,0,-15,0)+L(11,0,25,0);
  if(b.component.startsWith('switch-'))shape=E(-22,0,2.5,2.5,'fill="white"')+E(22,0,2.5,2.5,'fill="white"')+L(-20,0,20,b.component==='switch-open'?-18:0);
  out+=`<g data-component="${b.component}" transform="translate(${x} ${y}) rotate(${angle})">${L(-h,0,-lead,0)+L(lead,0,h,0)+shape}</g>`;
  if(b.label&&!(['ammeter','voltmeter'].includes(b.component)&&b.label===(b.component==='ammeter'?'A':'V')))out+=T(x+(dx?0:35),y-(dx?31:0),b.label);
 }
 for(const n of nodes.values())if(degree.get(n.id)>2)out+=E(n.x,n.y,3,3,'fill="#151a1f"');
 return out;
}
function molecule(s){
 const atoms=new Map(s.atoms.map(a=>[a.id,a]));let out='';
 for(const b of s.bonds){const a=atoms.get(b.from),c=atoms.get(b.to),length=Math.hypot(a.x-c.x,a.y-c.y),ux=(c.x-a.x)/length,uy=(c.y-a.y)/length;
  for(let i=0;i<b.order;i++){const offset=(i-(b.order-1)/2)*6;out+=L(a.x+25*ux-uy*offset,a.y+25*uy+ux*offset,c.x-25*ux-uy*offset,c.y-25*uy+ux*offset);}
 }
 for(const a of s.atoms){const atom=esc(a.element)+(a.hydrogens?'H'+(a.hydrogens>1?`<tspan baseline-shift="sub" font-size="11">${a.hydrogens}</tspan>`:''):'');out+=`<g data-atom="${a.element}" data-hydrogens="${a.hydrogens}">${R(a.x-24,a.y-14,48,29,'fill="white" stroke="none"')}<text x="${a.x}" y="${a.y+6}" text-anchor="middle" font-size="19">${atom}</text></g>`;}
 return out;
}
function molecular(s){
 const model=molecularModel(s.compound);let best;
 for(const az of [-50,-25,20,45,65])for(const el of [-20,10,30,50]){const a=az*Math.PI/180,e=el*Math.PI/180,points=model.atoms.map(atom=>{const [x,y,z]=atom.p;return {x:Math.cos(a)*x-Math.sin(a)*z,y:Math.sin(e)*(Math.sin(a)*x+Math.cos(a)*z)-Math.cos(e)*y,depth:Math.sin(a)*Math.cos(e)*x+Math.sin(e)*y+Math.cos(a)*Math.cos(e)*z};}),minX=Math.min(...points.map(p=>p.x)),maxX=Math.max(...points.map(p=>p.x)),minY=Math.min(...points.map(p=>p.y)),maxY=Math.max(...points.map(p=>p.y)),scale=Math.min(420/(maxX-minX),225/(maxY-minY));let gap=Infinity;for(let i=0;i<points.length;i++)for(const p of points.slice(i+1))gap=Math.min(gap,Math.hypot(points[i].x-p.x,points[i].y-p.y)*scale);if(!best||gap>best.gap)best={gap,points:points.map(p=>({...p,x:320+(p.x-(minX+maxX)/2)*scale,y:175+(p.y-(minY+maxY)/2)*scale}))};}
 let out='';for(const bond of model.bonds){const a=best.points[bond.a],b=best.points[bond.b],len=Math.hypot(a.x-b.x,a.y-b.y),ux=(b.x-a.x)/len,uy=(b.y-a.y)/len;for(let i=0;i<bond.order;i++){const o=(i-(bond.order-1)/2)*5;out+=L(a.x-uy*o,a.y+ux*o,b.x-uy*o,b.y+ux*o,'stroke-width="2"');}}
 const radii={C:15,O:14,H:9},fills={C:'#dde1e5',O:'#aeb6be',H:'white'};
 for(const {atom,p} of model.atoms.map((atom,i)=>({atom,p:best.points[i]})).sort((a,b)=>a.p.depth-b.p.depth))out+=`<g data-molecular-atom="${atom.element}">${E(p.x,p.y,radii[atom.element],radii[atom.element],`fill="${fills[atom.element]}"`)}${T(p.x,p.y+4,atom.element,'font-size="12"')}</g>`;
 const elements=[...new Set(model.atoms.map(a=>a.element))].sort();for(const [i,element] of elements.entries()){const x=320+(i-(elements.length-1)/2)*95;out+=E(x-20,339,8,8,`fill="${fills[element]}"`)+T(x+8,344,element);}
 return out;
}
function crystal(s){
 const sites=crystalSites(s.lattice),vertices=sites.slice(0,8),all=sites.map(x=>x.position);let best;
 // Pick a camera using every atom site, not just the cube corners. Face/edge
 // centres must not coincide in projection and hide a different species.
 for(const az of [24,32,41,53,63])for(const el of [18,25,33]){const a=az*Math.PI/180,e=el*Math.PI/180,project=([x,y,z])=>({x:320+210*(Math.cos(a)*(x-.5)-Math.sin(a)*(z-.5)),y:172+210*(Math.sin(e)*(Math.sin(a)*(x-.5)+Math.cos(a)*(z-.5))-Math.cos(e)*(y-.5)),depth:Math.sin(a)*Math.cos(e)*x+Math.sin(e)*y+Math.cos(a)*Math.cos(e)*z}),points=all.map(project);let gap=Infinity;for(let i=0;i<points.length;i++)for(const p of points.slice(i+1))gap=Math.min(gap,Math.hypot(points[i].x-p.x,points[i].y-p.y));if(!best||gap>best.gap)best={gap,points,project};}
 let out='';for(let i=0;i<8;i++)for(let j=i+1;j<8;j++)if(vertices[i].position.filter((x,k)=>x!==vertices[j].position[k]).length===1){const a=best.points[i],b=best.points[j],v=vertices[i].position,w=vertices[j].position,hidden=[0,1,2].filter(k=>v[k]===w[k]).every(k=>v[k]===0);out+=L(a.x,a.y,b.x,b.y,hidden?'stroke-dasharray="5 4"':'');}
 for(const {site,p} of sites.map((site,i)=>({site,p:best.points[i]})).sort((a,b)=>a.p.depth-b.p.depth))out+=`<g data-site="${site.position.join(',')}" data-species="${site.species}">${E(p.x,p.y,9,9,`fill="${site.species?'#6c737a':'white'}"`)}</g>`;
 for(const [i,label] of s.labels.entries()){const x=s.labels.length===1?300:220+i*200;out+=E(x-30,338,9,9,`fill="${i?'#6c737a':'white'}"`)+T(x+10,343,label);}
 return out;
}
const cellAnchors={wall:[162,170],membrane:[172,192],cytoplasm:[450,218],nucleus:[260,151],vacuole:[365,187],chloroplast:[443,114],mitochondrion:[420,263],er:[230,219],golgi:[231,265],ribosome:[347,106]};
function cell(s){
 const plant=s.cellType==='plant',ids=new Set(s.parts.map(p=>p.id));let out=plant?R(162,63,316,241,'rx="30" fill="white"')+R(172,73,296,221,'rx="24" fill="white"'):path('M 178 124 C 208 55 328 44 411 76 C 488 100 500 221 445 276 C 381 326 216 311 177 249 C 151 208 150 164 178 124 Z','fill="white"');
 if(ids.has('vacuole'))out+=E(365,190,65,66,'fill="#f1f2f3"');
 if(ids.has('nucleus'))out+=E(260,151,34,29,'fill="white"')+E(264,151,9,9);
 if(ids.has('chloroplast')){out+=E(430,114,26,15);for(let x=415;x<=440;x+=12)for(let y=107;y<=119;y+=4)out+=L(x,y,x+8,y);}
 if(ids.has('mitochondrion'))out+=E(420,263,29,15)+path('M 399 260 L 405 255 L 412 270 L 420 256 L 430 270 L 440 261');
 if(ids.has('er'))for(let y=202;y<=230;y+=9)out+=path(`M 202 ${y} Q 226 ${y-8} 252 ${y}`);
 if(ids.has('golgi'))for(let i=0;i<4;i++)out+=path(`M ${207+i*3} ${252+i*7} Q 230 ${265+i*7} ${253-i*3} ${252+i*7}`);
 if(ids.has('ribosome'))for(const [x,y] of [[339,100],[351,110],[333,116],[360,96]])out+=E(x,y,2,2,'fill="#151a1f"');
 // Leader labels occupy independent, ordered lanes outside the cell. The
 // diagram includes only explicitly requested organelles and supplied labels.
 const left=s.parts.filter(p=>cellAnchors[p.id][0]<320).sort((a,b)=>cellAnchors[a.id][1]-cellAnchors[b.id][1]),right=s.parts.filter(p=>cellAnchors[p.id][0]>=320).sort((a,b)=>cellAnchors[a.id][1]-cellAnchors[b.id][1]);
 for(const [parts,side] of [[left,'left'],[right,'right']])for(const [i,p] of parts.entries()){if(!p.label)continue;const [x,y]=!plant&&p.id==='membrane'?[157,192]:cellAnchors[p.id],ly=65+i*55,edge=side==='left'?140:500,lx=side==='left'?76:565;out+=path(`M ${x} ${y} L ${edge} ${ly} L ${side==='left'?118:522} ${ly}`)+E(x,y,2,2,'fill="#151a1f"')+T(lx,ly+5,p.label);}
 return out;
}
function photosynthesis(s){
 const l=s.labels;let p=R(65,65,235,245,'rx="12" stroke-dasharray="5 4"')+R(340,65,235,245,'rx="12" stroke-dasharray="5 4"')+T(182,91,l[0])+T(457,91,l[1])+R(120,157,125,56,'rx="8" fill="white"')+R(395,157,125,56,'rx="8" fill="white"')+T(182,190,l[2])+T(457,190,l[3]);
 p+=arrow(182,117,182,155)+T(182,113,l[4])+arrow(85,185,118,185)+T(87,167,l[5])+arrow(150,215,150,270)+T(150,290,l[6])+arrow(545,185,522,185)+T(545,167,l[7])+arrow(455,215,455,270)+T(455,290,l[8]);
 p+=path('M 230 155 L 230 125 L 405 125 L 405 155')+arrow(405,143,405,155)+R(215,98,210,24,'fill="white" stroke="none"')+T(320,116,l[9])+path('M 405 215 L 405 244 L 230 244 L 230 215')+arrow(230,228,230,215)+R(200,248,240,24,'fill="white" stroke="none"')+T(320,264,l[10]);
 return p;
}
function dna(s){
 let out='',rows=Math.ceil(s.top.length/12);for(let row=0;row<rows;row++){const start=row*12,n=Math.min(12,s.top.length-start),step=40,left=320-(n-1)*step/2,y=rows===1?145:70+row*163,forward=s.orientation==='5to3';out+=L(left-20,y-18,left+(n-1)*step+20,y-18)+L(left-20,y+67,left+(n-1)*step+20,y+67)+T(left-43,y-13,forward?'5′':'3′')+T(left+(n-1)*step+43,y-13,forward?'3′':'5′')+T(left-43,y+72,forward?'3′':'5′')+T(left+(n-1)*step+43,y+72,forward?'5′':'3′');
  for(let i=0;i<n;i++){const x=left+i*step,a=s.top[start+i],b=s.bottom[start+i];out+=T(x,y+7,a,'font-size="18"')+T(x,y+56,b,'font-size="18"');if(s.showPairs&&a!=='?'&&b!=='?'){const count=['A','T'].includes(a)?2:3;for(let j=0;j<count;j++)out+=L(x-9,y+24+j*6,x+9,y+24+j*6,'stroke-dasharray="2 2"');}}
 }
 out+=T(320,rows===1?100:31,s.labels[0])+T(320,rows===1?265:370,s.labels[1]);return out;
}
export function scienceFigureSVG(s){return `<g data-science-family="${s.family}">${({mechanics,circuit,molecule,'molecular-model':molecular,crystal,cell,photosynthesis,dna}[s.family])(s)}</g>`;}
export function scienceFigureFrame(s){
 if(s.family==='molecular-model')return {x:80,y:30,width:480,height:335};
 if(s.family==='cell')return {x:20,y:40,width:600,height:285};
 if(s.family==='photosynthesis')return {x:40,y:45,width:560,height:285};
 if(s.family==='dna'&&s.top.length<=12){const width=Math.max(480,(s.top.length-1)*40+130);return {x:320-width/2,y:75,width,height:210};}
 if(s.family!=='mechanics')return {x:0,y:0,width:640,height:380};
 if(s.model==='horizontal-block')return {x:90,y:160,width:470,height:155};
 if(s.model==='spring-block')return {x:115,y:120,width:445,height:165};
 const blockX=({left:180,center:275,right:380})[s.blockPosition||'center'],points=[[135,220],[500,220],[135,264],[500,264],[blockX,158],[blockX+86,158],[blockX,220],[blockX+86,220]],half=scienceTextWidth(s.labels[0])/2;
 points.push([320-half,316],[320+half,334]);if(s.direction!=='none')points.push([173,289],[437,303]);const a=-s.angle*Math.PI/180,rotated=points.map(([x,y])=>[320+(x-320)*Math.cos(a)-(y-220)*Math.sin(a),220+(x-320)*Math.sin(a)+(y-220)*Math.cos(a)]),left=Math.floor(Math.min(...rotated.map(p=>p[0]))-16),top=Math.floor(Math.min(...rotated.map(p=>p[1]))-16),right=Math.ceil(Math.max(...rotated.map(p=>p[0]))+16),bottom=Math.ceil(Math.max(...rotated.map(p=>p[1]))+16);return {x:left,y:top,width:right-left,height:bottom-top};
}
