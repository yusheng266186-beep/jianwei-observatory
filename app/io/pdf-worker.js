import {pdfDefinition} from './print-document.js?v=runtime-v31';
let engineReady;
async function engine(){
 if(!engineReady){const attempt=(async()=>{
  try{await import('../../vendor/pdfmake.min.js');}catch{throw new Error('PDF组件加载失败，请重试');}
  const pdfMake=self.pdfMake;if(!pdfMake)throw new Error('PDF后台组件初始化失败');
  const entries=await Promise.all(['regular','medium'].map(async weight=>{
   const response=await fetch(new URL('../../assets/report-fonts/report-'+weight+'.otf',import.meta.url),{signal:AbortSignal.timeout(60000)});if(!response.ok)throw new Error('打印中文字体加载失败，请重试');
   const bytes=new Uint8Array(await response.arrayBuffer());let binary='';for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));return ['report-'+weight+'.otf',btoa(binary)];
  }));
  pdfMake.addVirtualFileSystem(Object.fromEntries(entries));pdfMake.fonts={Report:{normal:'report-regular.otf',bold:'report-medium.otf',italics:'report-regular.otf',bolditalics:'report-medium.otf'}};return pdfMake;
 })();engineReady=attempt;attempt.catch(()=>{if(engineReady===attempt)engineReady=null;});}return engineReady;
}
self.onmessage=async({data:{id,report}})=>{
 try{
  const pdfMake=await engine(),blob=await new Promise((resolve,reject)=>{
   const doc=pdfMake.createPdf(pdfDefinition(report)),stream=doc.getStream({}),chunks=[];
   stream.on('error',reject);stream.on('data',chunk=>chunks.push(chunk));stream.on('end',()=>resolve(new Blob(chunks,{type:'application/pdf'})));stream.end();
  });self.postMessage({id,blob});
 }catch(error){self.postMessage({id,error:error.message||'PDF后台排版失败，请重试'});}
};
