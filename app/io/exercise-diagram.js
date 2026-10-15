import {richExerciseHTML} from './exercise-math.js';
import {validateExerciseDiagram} from '../engine/exercise-diagrams.js';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const line=(x1,y1,x2,y2,extra='')=>`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" ${extra}/>`;
export function diagramLabelLines(value){
 // Keep an element/formula token intact instead of splitting NaHCO3 mid-word.
 const tokens=String(value).match(/[A-Za-z][A-Za-z0-9^·⁻¹²³₀-₉]*|\s+|./gu)||[],lines=[];let line='',width=0;
 for(const token of tokens){const w=[...token].reduce((n,c)=>n+(/[^\x00-\xff]/.test(c)?13:6.5),0);if(line&&width+w>105){lines.push(line.trim());line='';width=0;}line+=token;width+=w;}if(line.trim())lines.push(line.trim());return lines;
}
const label=(x,y,value,extra='')=>`<text x="${x}" y="${y}" ${extra}>${esc(String(value??'').replace(/([A-Za-z])\^([23])/g,(_,letter,power)=>letter+(power==='2'?'²':'³'))).replace(/\b(?:[A-Z][a-z]?\d*){2,}\b/g,formula=>formula.replace(/\d+/g,n=>'<tspan baseline-shift="sub" font-size="9">'+n+'</tspan>'))}</text>`;
export function diagramTicks([min,max]){
 const stepBase=(max-min)/5,power=10**Math.floor(Math.log10(stepBase)),step=[1,2,5,10].map(n=>n*power).reduce((best,n)=>Math.abs(Math.log(n/stepBase))<Math.abs(Math.log(best/stepBase))?n:best,power),first=Math.ceil(min/step-1e-10),last=Math.floor(max/step+1e-10);
 return Array.from({length:Math.min(12,last-first+1)},(_,i)=>Number(((first+i)*step).toPrecision(10))).map(n=>Object.is(n,-0)?0:n);
}
export function exerciseDiagramSVG(value){
 const d=validateExerciseDiagram(value);if(d.kind==='illustration')return null;let parts='';
 if(['plot','bars'].includes(d.kind)){
  const X=x=>60+(x-d.xRange[0])/(d.xRange[1]-d.xRange[0])*510,Y=y=>290-(y-d.yRange[0])/(d.yRange[1]-d.yRange[0])*240;
  for(const x of diagramTicks(d.xRange))parts+=line(X(x),50,X(x),290,'stroke="#d3d7da" stroke-width=".6"')+label(X(x),310,x,'text-anchor="middle"');
  for(const y of diagramTicks(d.yRange))parts+=line(60,Y(y),570,Y(y),'stroke="#d3d7da" stroke-width=".6"')+label(49,Y(y)+4,y,'text-anchor="end"');
  const zeroX=X(Math.max(d.xRange[0],Math.min(d.xRange[1],0))),zeroY=Y(Math.max(d.yRange[0],Math.min(d.yRange[1],0)));parts+=line(60,zeroY,579,zeroY)+line(zeroX,290,zeroX,40)+label(580,332,d.xLabel,'text-anchor="end"')+label(60,25,d.yLabel);
  d.series.forEach((s,i)=>{const dash=i?'stroke-dasharray="'+(i===1?'7 4':'2 4')+'"':'';if(d.kind==='bars')for(const p of s.points){const y=Y(p[1]);parts+=`<rect x="${X(p[0])-10}" y="${Math.min(y,zeroY)}" width="20" height="${Math.max(1,Math.abs(zeroY-y))}" fill="#eef0f2"/>`;}else parts+=`<polyline points="${s.points.map(p=>X(p[0])+','+Y(p[1])).join(' ')}" fill="none" stroke-width="1.8" ${dash}/>`;parts+=label(90+i*155,355,s.label);});
 }else{
  const nodes=new Map(d.nodes.map(n=>[n.id,{...n,x:n.x*6.4,y:n.y*3.5}]));
  for(const e of d.edges){const a=nodes.get(e.from),b=nodes.get(e.to),dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy),angle=Math.atan2(dy,dx)*180/Math.PI,mx=(a.x+b.x)/2,my=(a.y+b.y)/2;
   if(['resistor','battery','lamp','switch'].includes(e.type)){const L=length/2;let shape=e.type==='resistor'?'<rect x="-17" y="-7" width="34" height="14" fill="white"/>':e.type==='battery'?line(-5,-13,-5,13)+line(5,-7,5,7):e.type==='lamp'?'<circle r="12" fill="white"/>'+line(-8,-8,8,8)+line(-8,8,8,-8):line(-15,0,12,-10);parts+=`<g transform="translate(${mx},${my}) rotate(${angle})">${line(-L,0,-20,0)+line(20,0,L,0)+shape}</g>`;
   }else{parts+=line(a.x,a.y,b.x,b.y,e.type==='dashed'?'stroke-dasharray="5 4"':'');if(e.type==='arrow'){const ux=dx/length,uy=dy/length;parts+=`<path d="M ${b.x-9*ux+4*uy} ${b.y-9*uy-4*ux} L ${b.x} ${b.y} L ${b.x-9*ux-4*uy} ${b.y-9*uy+4*ux}" fill="none"/>`;}}
   if(e.label)parts+=label(mx+(Math.abs(dy)>Math.abs(dx)?32:0),my-12,e.label,'text-anchor="middle" paint-order="stroke" stroke="white" stroke-width="4"');
  }
  for(const n of nodes.values()){
   const shape=n.shape==='block'?`<rect x="${n.x-60}" y="${n.y-23}" width="120" height="46" rx="3" fill="white"/>`:n.shape==='vessel'?`<path d="M ${n.x-25} ${n.y-25} V ${n.y+22} Q ${n.x} ${n.y+32} ${n.x+25} ${n.y+22} V ${n.y-25}" fill="none"/>`:n.shape==='circle'?`<circle cx="${n.x}" cy="${n.y}" r="22" fill="white"/>`:`<circle cx="${n.x}" cy="${n.y}" r="${n.shape==='junction'?3:2.5}" fill="#151a1f"/>`;
   parts+=shape;const lines=diagramLabelLines(n.label),base=n.y+(['block','circle'].includes(n.shape)?5:n.shape==='vessel'?50:-9);for(const [i,text] of lines.entries())parts+=label(Math.max(65,Math.min(575,n.x)),base+(i-(lines.length-1)/2)*15,text,'text-anchor="middle"');
  }
 }
 return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 380" width="640" height="380" role="img" aria-label="${esc(d.description)}"><title>${esc(d.caption)}</title><rect width="640" height="380" fill="white"/><g stroke="#151a1f" stroke-width="1.25" fill="none">${parts.replace(/<text /g,'<text fill="#151a1f" stroke="none" font-family="serif" font-size="13" ')}</g></svg>`;
}
export async function exerciseDiagramHTML(d){if(!d)return '';const image=d.kind==='illustration'?d.image?`<img alt="${esc(d.description)}" src="data:${d.image.mime};base64,${d.image.data}">`:`<p class="report-help">复杂插图尚未生成，可选择标准图示或文字情境。</p>`:exerciseDiagramSVG(d);return '<figure class="exercise-diagram">'+image+'<figcaption>'+await richExerciseHTML(d.caption)+'</figcaption></figure>';}
