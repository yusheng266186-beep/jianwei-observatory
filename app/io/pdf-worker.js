import {pdfDefinition} from './print-document.js?v=runtime-v45';
import {reportFontManifest,cachedFontFile,prepareReportFonts} from './report-fonts.js?v=runtime-v45';
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
self.onmessage=async({data:{id,report,warm,definition}})=>{
 try{
  const [pdfMake,manifest]=await Promise.all([engine(),reportFontManifest()]);
  if(warm){await fonts(pdfMake,manifest.parts.filter(part=>part.id==='core'));return;}
  if(definition?.exercisePrint){const footer=definition.exerciseFooter;delete definition.exercisePrint;delete definition.exerciseFooter;definition.footer=(page,total)=>({stack:[...(footer?[{text:footer,fontSize:9,alignment:'left',margin:[44,0,0,3]}]:[]),{text:'第 '+page+' 页 / 共 '+total+' 页',alignment:'center',fontSize:9}],margin:[0,9,0,0],color:'#555555'});}
  const prepared=prepareReportFonts(definition||pdfDefinition(report),manifest);await fonts(pdfMake,prepared.parts);
  const blob=await new Promise((resolve,reject)=>{
   const doc=pdfMake.createPdf(prepared.definition),stream=doc.getStream({}),chunks=[];
   stream.on('error',reject);stream.on('data',chunk=>chunks.push(chunk));stream.on('end',()=>resolve(new Blob(chunks,{type:'application/pdf'})));stream.end();
  });self.postMessage({id,blob});
 }catch(error){if(!warm)self.postMessage({id,error:error?.message||String(error)||'PDF后台排版失败，请重试'});}
};
