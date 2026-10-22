'use strict';
// Match Cockpit's complete-document extraction; retain the authored HTML/JS.
// This module never executes output. Rendering belongs to the isolated viewer.
function extractDocument(source){
 const document=text=>{
  const opening=/<html(?=[\s>])/i.exec(text);
  if(opening){const end=text.toLowerCase().lastIndexOf('</html>');if(end<=opening.index)return null;const before=text.slice(0,opening.index),doctype=before.toLowerCase().lastIndexOf('<!doctype html');return {html:text.slice(doctype<0?opening.index:doctype,end+7),kind:'html'};}
  const svg=/<svg(?=[\s>])/i.exec(text),end=text.toLowerCase().lastIndexOf('</svg>');return svg&&end>svg.index?{html:text.slice(svg.index,end+6),kind:'svg'}:null;
 };
 let fence=false,eligible=false,lines=[];
 for(const line of String(source).split(/\r?\n/)){
  const trimmed=line.trim();if(trimmed.startsWith('```')){
   if(fence){if(eligible){const value=document(lines.join('\n').trim());if(value)return value;}fence=false;lines=[];}
   else{fence=true;eligible=['','html','svg','xml'].includes(trimmed.replace(/^`+/,'').trim().toLowerCase());}
  }else if(fence)lines.push(line);
 }
 return fence?null:document(String(source).trim());
}
module.exports={extractDocument};
