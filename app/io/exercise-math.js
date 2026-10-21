import {createAsyncRenderCache} from '../engine/async-render-cache.js';
import {printFontMetrics,alignExerciseLine} from '../engine/exercise-layout.js';
import {exerciseRichBlocks,exerciseTableWidths} from '../engine/exercise-rich-blocks.js';
import {esc} from '../ui/html.js';
import {reportFontManifest,cachedFontFile} from './report-fonts.js';
let loading;const cache=createAsyncRenderCache({entries:160,maxWeight:1500000,weight:value=>value.svg.length}),htmlCache=createAsyncRenderCache({entries:180,maxWeight:1200000});
export function prepareExerciseMathSVG(svg){
 // MathJax's table rules target mjx-container in its stylesheet. Our standalone
 // SVGs are also used outside that container and in PDF/Word, so inline them.
 for(const element of svg.querySelectorAll('line[data-line],rect[data-frame]')){element.setAttribute('fill','none');element.setAttribute('stroke','#111111');element.setAttribute('stroke-width','70');if(element.classList.contains('mjx-dashed'))element.setAttribute('stroke-dasharray','140');if(element.classList.contains('mjx-dotted')){element.setAttribute('stroke-dasharray','0 140');element.setAttribute('stroke-linecap','round');}}
 for(const element of svg.querySelectorAll('[stroke="currentColor"]'))element.setAttribute('stroke','#111111');
 return svg;
}
export function warmExerciseMath(){
 if(!loading){const task=new Promise((resolve,reject)=>{window.MathJax={loader:{paths:{mathjax:new URL('../../vendor/mathjax-3.2.2/',import.meta.url).href.replace(/\/$/,'')},load:['[tex]/mhchem']},tex:{packages:{'[+]':['mhchem']}},startup:{typeset:false},svg:{fontCache:'none'},options:{enableMenu:false}};const script=document.createElement('script');script.src=new URL('../../vendor/mathjax-3.2.2/tex-svg.js',import.meta.url).href;let settled=false;const timer=setTimeout(()=>finish(new Error('公式组件加载超时，请重试')),20000);function finish(error){if(settled)return;settled=true;clearTimeout(timer);if(error){script.remove();reject(error);}else resolve();}script.onload=()=>{if(settled)return;const startup=window.MathJax?.startup?.promise;if(!startup||typeof startup.then!=='function'){finish(new Error('公式组件未能初始化，请重试'));return;}startup.then(()=>finish(),()=>finish(new Error('公式组件未能初始化，请重试')));};script.onerror=()=>finish(new Error('公式组件未能加载，请重试'));document.head.append(script);});loading=task;task.catch(()=>{if(loading===task)loading=null;});}return loading;
}
export function mathParts(value){const parts=[],regex=/\$\$([\s\S]*?)\$\$|\$([^$\n]+)\$/g;let at=0,match;while((match=regex.exec(String(value)))){if(match.index>at)parts.push({text:String(value).slice(at,match.index)});parts.push({latex:match[1]??match[2]});at=regex.lastIndex;}if(at<String(value).length)parts.push({text:String(value).slice(at)});return parts;}
export function mathSVG(latex){
 if(latex.length>2500||/\\(?:href|html|includegraphics|url|require|def|newcommand)\b/.test(latex))return Promise.reject(new Error('公式中包含不支持的内容，请编辑后重试'));
 return cache.get(latex,async()=>{await warmExerciseMath();const node=await window.MathJax.tex2svgPromise(latex,{display:false});if(node.querySelector('[data-mjx-error]'))throw new Error('公式未能正确排版，请编辑后重试');const svg=node.querySelector('svg');if(!svg)throw new Error('公式未能正确排版');const box=svg.getAttribute('viewBox').split(/\s+/).map(Number),width=box[2]/1000*12,height=box[3]/1000*12;svg.setAttribute('xmlns','http://www.w3.org/2000/svg');svg.setAttribute('width',String(width));svg.setAttribute('height',String(height));svg.querySelectorAll('[fill="currentColor"]').forEach(e=>e.setAttribute('fill','#111111'));prepareExerciseMathSVG(svg);return {svg:svg.outerHTML,width,height,ascent:-box[1]/1000*12,descent:(box[1]+box[3])/1000*12};});
}
async function inlineExerciseHTML(value){const parts=[];for(const part of mathParts(value)){if(part.latex){const m=await mathSVG(part.latex);parts.push('<span class="exercise-formula" role="img" aria-label="'+esc('公式：'+part.latex)+'">'+m.svg+'</span>');}else parts.push(esc(part.text).replace(/\n/g,'<br>'));}return parts.join('');}
export function richExerciseHTML(value){return htmlCache.get(String(value),async()=>{const blocks=[];for(const block of exerciseRichBlocks(value)){if(block.kind==='text'){blocks.push(await inlineExerciseHTML(block.text));continue;}const header=await Promise.all(block.header.map(async text=>'<th scope="col">'+await inlineExerciseHTML(text)+'</th>')),rows=await Promise.all(block.rows.map(async row=>'<tr>'+(await Promise.all(row.map(async(text,i)=>'<td style="text-align:'+block.alignments[i]+'">'+await inlineExerciseHTML(text)+'</td>'))).join('')+'</tr>'));blocks.push('<div class="exercise-data-table'+(block.header.length>=5?' is-wide':'')+'" tabindex="0" role="region" aria-label="题目数据表，可横向滚动"><table><thead><tr>'+header.join('')+'</tr></thead><tbody>'+rows.join('')+'</tbody></table></div>');}return blocks.join('<br>');});}

let measureTask;
async function printMeasure(){if(!measureTask){const task=(async()=>{const manifest=await reportFontManifest(),core=manifest.parts.find(p=>p.id==='core'),bytes=await(await cachedFontFile(core.files.regular)).arrayBuffer(),metrics=await printFontMetrics(bytes),font=new FontFace('ExercisePrintCore',bytes);await font.load();document.fonts.add(font);const ctx=document.createElement('canvas').getContext('2d');ctx.font='11px ExercisePrintCore';return {measure:text=>ctx.measureText(text).width,...metrics};})();measureTask=task;task.catch(()=>{if(measureTask===task)measureTask=null;});}return measureTask;}
export async function exerciseLineWidth(value){
 if(String(value).includes('\n'))return Infinity;
 const {measure}=await printMeasure();let width=0;for(const part of mathParts(value))width+=part.latex?(await mathSVG(part.latex)).width+2:Math.ceil(measure(part.text)*1.015)+1;return width;
}
export async function exerciseParagraph(value,{limit=490,fontSize=11}={}){
 const blocks=exerciseRichBlocks(value);
 if(!blocks.some(b=>b.kind==='table'))return exerciseTextParagraph(value,{limit,fontSize});
 const stack=[];for(const block of blocks){
  if(block.kind==='text'){if(block.text.trim())stack.push(await exerciseTextParagraph(block.text,{limit,fontSize}));continue;}
  const widths=exerciseTableWidths(block.header.length,limit-block.header.length*10-(block.header.length+1)*.5),body=[];
  for(const [r,row] of [block.header,...block.rows].entries())body.push(await Promise.all(row.map(async(text,i)=>({stack:[await exerciseTableParagraph(text,{limit:widths[i],fontSize:r===0?9.4:10.5})],bold:r===0,alignment:block.alignments[i],fillColor:r===0?'#f1f3f4':null,margin:[0,2,0,2]}))));
  stack.push({table:{headerRows:1,keepWithHeaderRows:1,widths,body,dontBreakRows:true},layout:'exerciseDataTable',margin:[0,8,0,9]});
 }return {stack};
}
// Data cells need compact leading; retain the full math line metrics so tall
// fractions and scientific formulae cannot overlap neighbouring rows.
async function exerciseTableParagraph(text,options){const block=await exerciseTextParagraph(text,options);return block.text?{...block,lineHeight:1.2}:block;}
async function exerciseTextParagraph(value,{limit=490,fontSize=11}={}){
 const parts=mathParts(String(value));if(parts.every(part=>!part.latex))return {text:String(value),fontSize,lineHeight:1.45,margin:[0,1,0,3]};
 const base=await printMeasure(),ratio=fontSize/11,metrics={ascent:base.ascent*ratio,descent:base.descent*ratio},measure=text=>base.measure(text)*ratio,stack=[];let line=[],used=0,sourceLines=[],sourceHeight=0;
 const flush=()=>{if(!line.length)return;sourceLines.push(alignExerciseLine(line));sourceHeight+=Math.max(...line.map(f=>f.ascent))+Math.max(...line.map(f=>f.descent))+5;line=[];used=0;};
 // Keep the wrapped rows of a short source paragraph together, so a reaction
 // cannot leave only its units at the top of the next page. Long prose can split.
 const endSourceLine=()=>{flush();if(sourceLines.length>1&&sourceHeight<=240)stack.push({table:{widths:['*'],body:[[{stack:sourceLines}]],dontBreakRows:true},layout:'exerciseKeepTogether'});else stack.push(...sourceLines);sourceLines=[];sourceHeight=0;};
 const textWidth=text=>Math.ceil(measure(text)*1.015)+1;
 const addText=text=>{if(!text)return;const width=textWidth(text);line.push({node:{text,fontSize,lineHeight:1,noWrap:true},width,ascent:metrics.ascent,descent:metrics.descent});used+=width;};
 for(const part of parts){if(part.latex){const math=await mathSVG(part.latex),scale=Math.min(ratio,(limit-2)/math.width),width=math.width*scale+2,height=math.height*scale;if(used+width>limit)flush();line.push({node:{svg:math.svg,svgTextFonts:true,width:math.width*scale,height},width,ascent:math.ascent*scale,descent:math.descent*scale});used+=width;}else{let text='';for(const char of part.text){if(char==='\n'){addText(text);text='';endSourceLine();continue;}if(used+textWidth(text+char)>limit&&!/^[，。．；：、！？,.;:!?)）\]】”’]$/.test(char)){addText(text);text='';flush();}text+=char;}addText(text);}}
 endSourceLine();return {stack};
}
