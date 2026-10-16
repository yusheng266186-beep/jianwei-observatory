// Small canonical 3D teaching models. Atom positions describe geometry rather
// than a claimed quantum-chemical conformation or a geometry optimisation.
export const molecularCompounds=['methane','ethane','ethanol','ethylene','benzene'];
export function molecularModel(compound){
 const atoms=[],bonds=[],add=(element,p)=>{atoms.push({element,p});return atoms.length-1;},bond=(a,b,order=1)=>bonds.push({a,b,order});
 const tetra=(carbon,sign,phases)=>{for(const phase of phases){const theta=phase*Math.PI/180,c=atoms[carbon].p,h=add('H',[c[0]+sign*1.09/3,c[1]+1.09*Math.sqrt(8/9)*Math.cos(theta),c[2]+1.09*Math.sqrt(8/9)*Math.sin(theta)]);bond(carbon,h);}};
 if(compound==='methane'){const c=add('C',[0,0,0]);for(const p of [[1,1,1],[1,-1,-1],[-1,1,-1],[-1,-1,1]])bond(c,add('H',p.map(v=>v*1.09/Math.sqrt(3))));}
 else if(compound==='ethane'||compound==='ethanol'){const a=add('C',[-.77,0,0]),b=add('C',[.77,0,0]);bond(a,b);tetra(a,-1,[60,180,300]);if(compound==='ethane')tetra(b,1,[0,120,240]);else{tetra(b,1,[120,240]);const o=add('O',[.77+1.43/3,1.43*Math.sqrt(8/9),0]);bond(b,o);const angle=(-Math.acos(-1/3)+108.5*Math.PI/180);bond(o,add('H',[atoms[o].p[0]+.96*Math.cos(angle),atoms[o].p[1]+.96*Math.sin(angle),0]));}}
 else if(compound==='ethylene'){const a=add('C',[-.67,0,0]),b=add('C',[.67,0,0]);bond(a,b,2);for(const [c,sign] of [[a,-1],[b,1]])for(const y of [-1,1])bond(c,add('H',[atoms[c].p[0]+sign*.545,y*1.09*Math.sqrt(3)/2,0]));}
 else if(compound==='benzene'){for(let i=0;i<6;i++){const a=i*Math.PI/3;add('C',[1.4*Math.cos(a),1.4*Math.sin(a),0]);}for(let i=0;i<6;i++){const a=i*Math.PI/3;bond(i,(i+1)%6,i%2?1:2);bond(i,add('H',[2.49*Math.cos(a),2.49*Math.sin(a),0]));}}
 else throw new Error('不支持的球棍分子。');
 return {atoms,bonds};
}
