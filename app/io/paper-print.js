import {pdfLibrary} from './pdf-viewer-library.js?v=runtime-v42';
// The native print dialog receives the same PDF pages, with their existing
// margins and page numbers. Reuse one raster surface and release it after print.
export async function printPDF(blob){
 const module=await pdfLibrary(),task=module.getDocument({data:await blob.arrayBuffer(),isEvalSupported:false}),doc=await task.promise,area=document.getElementById('print-area'),style=document.createElement('style'),canvas=document.createElement('canvas');
 let ended=false;const cleanup=()=>{if(ended)return;ended=true;window.removeEventListener('afterprint',cleanup);clearTimeout(timer);area.replaceChildren();style.remove();canvas.width=canvas.height=1;},timer=setTimeout(cleanup,180000);
 try{
  const first=(await doc.getPage(1)).getViewport({scale:1}),landscape=first.width>first.height,width=landscape?297:210,height=landscape?210:297;
  style.textContent='@media print{@page{size:A4 '+(landscape?'landscape':'portrait')+';margin:0!important}html,body{margin:0!important;padding:0!important}#print-area{margin:0!important;padding:0!important}#print-area .printed-pdf-page{display:block;width:'+width+'mm!important;height:'+height+'mm!important;margin:0!important;padding:0!important;break-after:page;page-break-after:always;object-fit:fill}#print-area .printed-pdf-page:last-child{break-after:auto;page-break-after:auto}}';document.head.append(style);area.replaceChildren();
  for(let n=1;n<=doc.numPages;n++){
   const page=await doc.getPage(n),viewport=page.getViewport({scale:2});canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);await page.render({canvasContext:canvas.getContext('2d',{alpha:false}),viewport}).promise;
   const image=new Image();image.className='printed-pdf-page';image.alt='第 '+n+' / '+doc.numPages+' 页';image.src=canvas.toDataURL('image/png');await image.decode();area.append(image);
  }
  canvas.width=canvas.height=1;await doc.destroy();window.addEventListener('afterprint',cleanup,{once:true});window.print();
 }catch(error){cleanup();await task.destroy();throw error;}
}
