import {pdfDefinition} from './print-document.js?v=runtime-v33';
import {reportFontManifest,cachedFontFile,prepareReportFonts} from './report-fonts.js?v=runtime-v33';
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
 await Promise.all(parts.map(part=>{
  if(!loaded.has(part.id)){
   const task=Promise.all(Object.entries(part.files).map(async([weight,name])=>{
    const bytes=new Uint8Array(await(await cachedFontFile(name)).arrayBuffer());let binary='';
    for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));
    return [name,btoa(binary)];
   })).then(entries=>{Object.assign(fontFiles,Object.fromEntries(entries));engine.fonts['Report-'+part.id]={normal:part.files.regular,bold:part.files.medium,italics:part.files.regular,bolditalics:part.files.medium};});
   loaded.set(part.id,task);task.catch(()=>loaded.delete(part.id));
  }
  return loaded.get(part.id);
 }));
 engine.addVirtualFileSystem(fontFiles);
}
self.onmessage=async({data:{id,report}})=>{
 try{
  const [pdfMake,manifest]=await Promise.all([engine(),reportFontManifest()]);
  const prepared=prepareReportFonts(pdfDefinition(report),manifest);await fonts(pdfMake,prepared.parts);
  const blob=await new Promise((resolve,reject)=>{
   const doc=pdfMake.createPdf(prepared.definition),stream=doc.getStream({}),chunks=[];
   stream.on('error',reject);stream.on('data',chunk=>chunks.push(chunk));stream.on('end',()=>resolve(new Blob(chunks,{type:'application/pdf'})));stream.end();
  });self.postMessage({id,blob});
 }catch(error){self.postMessage({id,error:error?.message||String(error)||'PDF后台排版失败，请重试'});}
};
