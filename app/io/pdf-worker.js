import {pdfDefinition} from './print-document.js?v=runtime-v41';
import {reportFontManifest,cachedFontFile,prepareReportFonts} from './report-fonts.js?v=runtime-v41';
let engineReady;
async function engine(){
 if(!engineReady){const attempt=(async()=>{
  try{await import('../../vendor/pdfmake.min.js');}catch{throw new Error('PDF组件加载失败，请重试');}
  const pdfMake=self.pdfMake;if(!pdfMake)throw new Error('PDF后台组件初始化失败');
  pdfMake.fonts={};return pdfMake;
 })();engineReady=attempt;attempt.catch(()=>{if(engineReady===attempt)engineReady=null;});}return engineReady;
}
const loaded=new Map(),fontFiles={};
async function fonts(engine,parts){
 await Promise.all(parts.flatMap(part=>{
  engine.fonts['Report-'+part.id]={normal:part.files.regular,bold:part.files.medium,italics:part.files.regular,bolditalics:part.files.medium};
  return (part.weights||Object.keys(part.files)).map(weight=>{
   const name=part.files[weight];if(!loaded.has(name)){
   const task=(async()=>{
    const bytes=new Uint8Array(await(await cachedFontFile(name)).arrayBuffer());let binary='';
    for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));
    fontFiles[name]=btoa(binary);
   })();
   loaded.set(name,task);task.catch(()=>loaded.delete(name));
   }
   return loaded.get(name);
  });
 }));
 engine.addVirtualFileSystem(fontFiles);
}
self.onmessage=async({data:{id,report,warm}})=>{
 try{
  const [pdfMake,manifest]=await Promise.all([engine(),reportFontManifest()]);
  if(warm){await fonts(pdfMake,manifest.parts.filter(part=>part.id==='core'));return;}
  const prepared=prepareReportFonts(pdfDefinition(report),manifest);await fonts(pdfMake,prepared.parts);
  const blob=await new Promise((resolve,reject)=>{
   const doc=pdfMake.createPdf(prepared.definition),stream=doc.getStream({}),chunks=[];
   stream.on('error',reject);stream.on('data',chunk=>chunks.push(chunk));stream.on('end',()=>resolve(new Blob(chunks,{type:'application/pdf'})));stream.end();
  });self.postMessage({id,blob});
 }catch(error){if(!warm)self.postMessage({id,error:error?.message||String(error)||'PDF后台排版失败，请重试'});}
};
