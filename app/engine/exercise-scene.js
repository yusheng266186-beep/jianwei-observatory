const allowed=['type','d','x','y','width','height','rx','ry','text','dashed'];
export function validateExerciseScene(scene){
 if(!Array.isArray(scene))throw new Error('scene必须直接为元素数组，例如[{type:"path",d:"M 100 100 L 200 100"}]，不能是含width、height、elements的对象。');
 if(!scene.length||scene.length>100)throw new Error('矢量绘图scene应包含1至100个元素。');
 for(const s of scene){
  if(!s||typeof s!=='object'||Object.keys(s).some(k=>!allowed.includes(k))||!['path','rect','ellipse','text'].includes(s.type)||s.dashed!==undefined&&typeof s.dashed!=='boolean')throw new Error('矢量图只能使用受控的线、矩形、椭圆与文字。');
  if(s.type==='path'){
   if(typeof s.d!=='string'||s.d.length>1200||/[^MLCQZ\d.\s,+-]/.test(s.d)||!s.d.trim().startsWith('M'))throw new Error('矢量路径无效。');
   const tokens=s.d.replace(/([MLCQZ])/g,' $1 ').trim().split(/[\s,]+/);if(tokens.some(t=>!/^[MLCQZ]$|^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(t)))throw new Error('矢量路径分隔无效。');let at=0;while(at<tokens.length){const cmd=tokens[at++],size={M:2,L:2,Q:4,C:6,Z:0}[cmd];if(size===undefined)throw new Error('矢量路径指令无效。');let count=0;while(at<tokens.length&&!/^[MLCQZ]$/.test(tokens[at])){const n=Number(tokens[at++]);if(!Number.isFinite(n)||n<0||n>(count%2?380:640))throw new Error('矢量路径超出画布。');count++;}if(size===0?count!==0:count<size||count%size!==0)throw new Error('矢量路径坐标不完整。');}
  }else{
   if(![s.x,s.y].every(Number.isFinite))throw new Error('矢量图坐标缺失。');
   if(s.type==='text'){const width=[...(s.text||'')].reduce((n,c)=>n+(/[^\x00-\xff]/.test(c)?13:6.5),0);if(typeof s.text!=='string'||!s.text||s.text.length>40||/[<>$\\]/.test(s.text)||s.x-width/2<2||s.x+width/2>638||s.y<18||s.y>366)throw new Error('矢量图文字或位置无效。');}
   else if(s.type==='rect'){if(![s.width,s.height].every(n=>Number.isFinite(n)&&n>0)||s.x<0||s.y<0||s.x+s.width>640||s.y+s.height>380)throw new Error('矩形超出画布。');}
   else if(![s.rx,s.ry].every(n=>Number.isFinite(n)&&n>0)||s.x-s.rx<0||s.x+s.rx>640||s.y-s.ry<0||s.y+s.ry>380)throw new Error('椭圆超出画布。');
  }
 }
 return scene;
}
export const exerciseSceneSchema={type:'array',maxItems:100,items:{type:'object',additionalProperties:false,required:['type'],properties:{type:{type:'string',enum:['path','rect','ellipse','text']},d:{type:'string',maxLength:1200},x:{type:'number'},y:{type:'number'},width:{type:'number'},height:{type:'number'},rx:{type:'number'},ry:{type:'number'},text:{type:'string',maxLength:40},dashed:{type:'boolean'}}}};
