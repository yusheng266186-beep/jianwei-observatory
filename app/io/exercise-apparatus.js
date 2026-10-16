// A small set of explicit laboratory instruments. Tubes terminate at ports,
// never at the centre of a generic vessel. Dimensions are SVG viewBox units.
export function apparatusPorts(n){const side=n.equipment==='three-neck-flask'?25:n.equipment==='beaker'?20:8,top=n.equipment==='three-neck-flask'?-43:n.equipment==='beaker'?-47:-57;return {inlet:{x:n.x-(n.inlet==='funnel'?0:side),y:n.y-78},outlet:{x:n.x+side,y:n.y-78},side,top};}
const paths={
 'gas-bottle':'M -14 -55 H 14 V -36 Q 34 -33 34 -22 V 53 Q 34 60 27 60 H -27 Q -34 60 -34 53 V -22 Q -34 -33 -14 -36 Z',
 'round-flask':'M -12 -55 H 12 V -11 C 54 5 51 60 0 62 C -51 60 -54 5 -12 -11 Z',
 'conical-flask':'M -12 -55 H 12 V -26 L 39 52 Q 41 60 33 60 H -33 Q -41 60 -39 52 L -12 -26 Z',
 'three-neck-flask':'M -32 4 Q -45 28 -31 50 Q 0 77 31 50 Q 45 28 32 4 V -39 H 18 V -5 Q 12 -11 7 -12 V -55 H -7 V -12 Q -12 -11 -18 -5 V -39 H -32 Z',
 beaker:'M -35 -45 H 32 V 54 Q 32 60 26 60 H -26 Q -32 60 -32 54 V -40'
};
export function apparatusSVG(n,index,namespace){
 const p=apparatusPorts(n),liquidY=60-n.liquidLevel*.9,clip=namespace+'-liquid-'+index,path=paths[n.equipment];
 // Close the open beaker only for its liquid clipping region.
 const clipPath=n.equipment==='beaker'?'M -32 -45 H 32 V 60 H -32 Z':path;
 let content=`<defs><clipPath id="${clip}"><path d="${clipPath}"/></clipPath></defs>`;
 if(n.liquidLevel)content+=`<g clip-path="url(#${clip})"><rect x="-48" y="${liquidY}" width="96" height="90" fill="#eef0f2" stroke="none"/><path d="M -48 ${liquidY} H 48" stroke-width=".8"/></g>`;
 content+=`<path d="${path}" fill="none" stroke-width="1.6"/>`;
 if(n.equipment!=='beaker'){
  if(n.equipment==='three-neck-flask')content+='<rect x="-8" y="-59" width="16" height="7" fill="#ddd"/><rect x="-33" y="-43" width="16" height="7" fill="#ddd"/><rect x="17" y="-43" width="16" height="7" fill="#ddd"/>';
  else content+='<rect x="-14" y="-59" width="28" height="7" fill="#ddd"/>';
 }
 for(const [key,direction] of [['inlet',-1],['outlet',1]]){
  if(n[key]==='none')continue;
  if(n[key]==='funnel'){content+=`<path d="M -2 -78 V ${liquidY-28} L -23 ${liquidY} H 23 L 2 ${liquidY-28} V -78" fill="white" stroke-width="1.6" data-accessory="inverted-funnel"/>`;continue;}
  const end=n[key]==='long'?Math.min(50,liquidY+12):(n.equipment==='three-neck-flask'?-18:-22);
  content+=`<path d="M ${direction*p.side} -78 V ${end}" stroke-width="2"/>`;
 }
 if(n.additionFunnel)content+='<g data-accessory="separating-funnel"><path d="M -11 -130 H -5 V -118 C 12 -109 6 -91 -6 -78 V -71 H -10 V -78 C -22 -91 -28 -109 -11 -118 Z" fill="white" stroke-width="1.6"/><path d="M -14 -72 H -2 M -8 -70 V -17" stroke-width="1.8"/></g>';
 return `<g transform="translate(${n.x},${n.y})" data-equipment="${n.equipment}">${content}</g>`;
}
