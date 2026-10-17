import {terrainContours,terrainProfile,terrainExtent,terrainElevation} from '../engine/exercise-geography.js';
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const fmt=x=>Number(x.toPrecision(7)).toString(),T=(x,y,s,extra='')=>`<text x="${fmt(x)}" y="${fmt(y)}" ${extra.includes("text-anchor=")?"":"text-anchor=\"middle\""} ${extra}>${esc(s)}</text>`,L=(x,y,x2,y2,extra='')=>`<line x1="${fmt(x)}" y1="${fmt(y)}" x2="${fmt(x2)}" y2="${fmt(y2)}" ${extra}/>`;
const rect=(x,y,w,h,extra='')=>`<rect x="${fmt(x)}" y="${fmt(y)}" width="${fmt(w)}" height="${fmt(h)}" ${extra}/>`;
const segmentDistance=(x,y,a,b)=>{const dx=b[0]-a[0],dy=b[1]-a[1],t=Math.max(0,Math.min(1,((x-a[0])*dx+(y-a[1])*dy)/(dx*dx+dy*dy)));return Math.hypot(x-a[0]-t*dx,y-a[1]-t*dy);};
const path=points=>points.map(([x,y],i)=>(i?'L':'M')+fmt(x)+' '+fmt(y)).join(' ');
function ticks(lo,hi,count=5){const raw=(hi-lo)/count,pow=10**Math.floor(Math.log10(raw)),factor=[1,2,2.5,5,10].find(n=>n*pow>=raw-1e-10),step=factor*pow,out=[];for(let k=Math.ceil(lo/step);k*step<=hi+step*1e-7;k++)out.push(k*step);return out;}
function map(s,combined){
 const {width,height}=terrainExtent(s),box=combined?{x:35,y:65,w:265,h:235}:{x:85,y:45,w:470,h:255},scale=Math.min(box.w/width,box.h/height),left=box.x+(box.w-width*scale)/2,top=box.y+(combined?(box.h-height*scale)/2:0),X=x=>left+x*scale,Y=y=>top+(height-y)*scale;let out=rect(left,top,width*scale,height*scale,'stroke="#777" stroke-width=".8"');
 const contours=terrainContours(s),placed=[],section=s.section.map(p=>[X(p[0]),Y(p[1])]),spots=(s.spots||[]).map(p=>({...p,sx:X(p.x),sy:Y(p.y)})),levels=[...new Set(contours.map(x=>x.level))],chosen=new Set(levels.filter((_,i)=>i%Math.max(1,Math.ceil(levels.length/9))===0));
 for(const {level,points} of contours)out+=`<path data-contour-level="${level}" d="${path(points.map(([x,y])=>[X(x),Y(y)]))}" stroke-width="1.2"/>`;
 for(const level of chosen){const line=contours.filter(c=>c.level===level).sort((a,b)=>b.points.length-a.points.length)[0];if(!line)continue;const points=line.points.map(([x,y])=>[X(x),Y(y)]);let length=0;for(let i=1;i<points.length;i++)length+=Math.hypot(points[i][0]-points[i-1][0],points[i][1]-points[i-1][1]);if(length<42)continue;
  for(const fraction of [.35,.65,.15,.85]){const [x,y]=points[Math.min(points.length-1,Math.floor((points.length-1)*fraction))],w=String(level).length*7+8;if(x-w/2<left+2||x+w/2>left+width*scale-2||y<top+12||y>top+height*scale-12||placed.some(p=>Math.abs(x-p.x)<(w+p.w)/2+7&&Math.abs(y-p.y)<20)||section.some(p=>Math.hypot(x-p[0],y-p[1])<30)||section.length===2&&segmentDistance(x,y,...section)<13||spots.some(p=>Math.hypot(x-p.sx,y-p.sy)<35))continue;placed.push({x,y,w});out+=rect(x-w/2,y-8,w,16,'fill="white" stroke="none"')+T(x,y+4,fmt(level),'font-size="12"');break;}
 }
 if(section.length){const [a,b]=section;out+=L(...a,...b,'stroke-dasharray="6 4" stroke-width="1.5"');for(let i=0;i<2;i++){const [x,y]=section[i],inset=y<top+20?19:-10;out+=`<circle cx="${fmt(x)}" cy="${fmt(y)}" r="3" fill="#111"/>`+rect(Math.max(left+2,Math.min(left+width*scale-26,x-12)),y+inset-13,24,18,'fill="white" stroke="none"')+T(Math.max(left+14,Math.min(left+width*scale-14,x)),y+inset,s.labels[i],'font-size="14"');}}
 for(const p of spots){const label=[p.label,p.showElevation?fmt(terrainElevation(s,p.x,p.y))+' m':''].filter(Boolean).join(' '),w=[...label].reduce((n,c)=>n+(/[^\x00-\xff]/.test(c)?13:7),8),lx=Math.max(left+w/2+2,Math.min(left+width*scale-w/2-2,p.sx)),ly=p.sy<top+22?p.sy+24:p.sy-12;out+=`<circle data-spot-height="${p.showElevation}" cx="${fmt(p.sx)}" cy="${fmt(p.sy)}" r="2.5" fill="#111"/>`+rect(lx-w/2,ly-12,w,16,'fill="white" stroke="none"')+T(lx,ly,label,'font-size="12"');}
 const nx=left+width*scale+18,ny=top+22;out+=T(nx,ny-8,'N')+L(nx,ny+30,nx,ny)+L(nx,ny,nx-4,ny+9)+L(nx,ny,nx+4,ny+9);
 const barKm=width/4,bx=left,by=top+height*scale+25;out+=L(bx,by,bx+barKm*scale,by)+L(bx,by-4,bx,by+4)+L(bx+barKm*scale,by-4,bx+barKm*scale,by+4)+T(bx+barKm*scale/2,by+18,fmt(barKm)+' km','font-size="12"');out+=T(left+width*scale*.68,by+5,'等高距 '+fmt(s.interval)+' m','font-size="12"')+T(left+width*scale/2,combined?35:24,'海拔 / m');return out;
}
function profile(s,combined){
 const p=terrainProfile(s),box=combined?{x:380,y:82,w:220,h:213}:{x:85,y:65,w:470,h:235},h=s.elevations.flat(),lo=Math.floor(Math.min(...h)/s.interval)*s.interval,hi=Math.ceil(Math.max(...h)/s.interval)*s.interval,length=p.at(-1).distance,X=x=>box.x+x/length*box.w,Y=y=>box.y+box.h-(y-lo)/(hi-lo)*box.h;let out=T(box.x+box.w/2,combined?35:24,s.labels.join('—')+'地形剖面')+T(box.x,box.y-15,'海拔 / m','font-size="12"');
 const values=[lo,...ticks(lo,hi,combined?4:5),hi].sort((a,b)=>a-b).filter((v,i,a)=>!i||Math.abs(Y(v)-Y(a[i-1]))>16);for(const v of values)out+=L(box.x,Y(v),box.x+box.w,Y(v),'stroke="#aaa" stroke-width=".5" stroke-dasharray="3 3"')+T(box.x-8,Y(v)+4,fmt(v),'text-anchor="end" font-size="12"');
 out+=L(box.x,box.y,box.x,box.y+box.h)+L(box.x,box.y+box.h,box.x+box.w,box.y+box.h)+`<path data-terrain-profile="true" d="${path(p.map(v=>[X(v.distance),Y(v.elevation)]))}" stroke-width="1.6"/>`;
 for(const v of [0,length/2,length])out+=L(X(v),box.y+box.h,X(v),box.y+box.h+4)+T(X(v),box.y+box.h+19,fmt(v),'font-size="12"');out+=T(box.x+box.w/2,box.y+box.h+42,'距离 / km');for(const [i,v] of [p[0],p.at(-1)].entries())out+=T(X(v.distance)+(i?-9:9),Math.max(box.y+14,Y(v.elevation)-10),s.labels[i]);return out;
}
export function terrainSVG(s){return (s.view!=='profile'?map(s,s.view==='combined'):'')+(s.view!=='map'?profile(s,s.view==='combined'):'');}
export function geographyFigureFrame(s){
 if(s.family==='climate')return {x:0,y:0,width:640,height:400};
 if(s.view==='map'){const {width,height}=terrainExtent(s),scale=Math.min(470/width,255/height),left=85+(470-width*scale)/2;return {x:Math.floor(left-30),y:0,width:Math.ceil(width*scale+75),height:Math.ceil(45+height*scale+70)};}
 return s.view==='profile'?{x:25,y:0,width:590,height:355}:{x:0,y:0,width:640,height:365};
}
export function climateSVG(s){
 const box={x:80,y:60,w:480,h:235},[min,max]=s.temperatureRange,X=i=>box.x+(i+.5)*box.w/12,Y=t=>box.y+box.h-(t-min)/(max-min)*box.h,P=p=>box.y+box.h-p/s.precipitationMax*box.h;let out=T(320,24,s.station)+T(80,44,'气温 / °C')+T(560,44,'降水量 / mm');
 for(const v of ticks(min,max))out+=L(box.x,Y(v),box.x+box.w,Y(v),'stroke="#aaa" stroke-width=".5" stroke-dasharray="3 3"')+T(box.x-12,Y(v)+4,fmt(v),'text-anchor="end" font-size="12"');
 for(const v of ticks(0,s.precipitationMax))out+=L(box.x+box.w,P(v),box.x+box.w+5,P(v))+T(box.x+box.w+12,P(v)+4,fmt(v),'text-anchor="start" font-size="12"');
 for(let i=0;i<12;i++){out+=rect(X(i)-11,P(s.precipitation[i]),22,box.y+box.h-P(s.precipitation[i]),`data-precipitation-month="${i+1}" fill="#d6d9dc" stroke-width=".8"`)+T(X(i),box.y+box.h+21,String(i+1),'font-size="13"');}
 if(min<0&&max>0)out+=L(box.x,Y(0),box.x+box.w,Y(0),'stroke="#555" stroke-width=".8" stroke-dasharray="7 4"');
 out+=L(box.x,box.y,box.x,box.y+box.h)+L(box.x+box.w,box.y,box.x+box.w,box.y+box.h)+L(box.x,box.y+box.h,box.x+box.w,box.y+box.h)+`<path data-temperature-series="true" d="${path(s.temperature.map((t,i)=>[X(i),Y(t)]))}" stroke-width="1.8"/>`;
 for(let i=0;i<12;i++)out+=`<circle cx="${fmt(X(i))}" cy="${fmt(Y(s.temperature[i]))}" r="3" fill="white" stroke-width="1.5"/>`;
 out+=T(590,316,'月')+L(80,332,560,332,'stroke-width=".5" stroke="#999"')+L(8,350,20,350)+`<circle cx="14" cy="350" r="2.5" fill="white"/>`+T(49,354,'气温°C','font-size="12"')+rect(8,369,12,10,'fill="#d6d9dc" stroke-width=".8"')+T(49,379,'降水mm','font-size="12"');
 // Numeric rows retain the supplied data, so exact totals and temperature
 // ranges never depend on estimating unlabelled bars between axis ticks.
 for(let i=0;i<12;i++)for(const [row,value] of [[0,s.temperature[i]],[1,s.precipitation[i]]]){const label=String(value),size=Math.min(13,34/(label.length*.58));out+=T(X(i),354+row*25,label,`data-climate-value="${row}-${i+1}" font-size="${size}"`);}return out;
}
