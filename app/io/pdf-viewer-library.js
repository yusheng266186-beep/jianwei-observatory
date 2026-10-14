let library,attempts=0;
const workerURL=new URL('../../vendor/pdfjs/pdf.worker.min.mjs?v=pdfjs-4.10.38',import.meta.url).href;
let warming;
export function pdfLibrary(){
 if(!library){const suffix='?v=pdfjs-4.10.38'+(attempts++?'&retry='+attempts:''),attempt=import(new URL('../../vendor/pdfjs/pdf.min.mjs'+suffix,import.meta.url).href).then(module=>{module.GlobalWorkerOptions.workerSrc=workerURL;return module;});library=attempt;attempt.catch(()=>{if(library===attempt)library=null;});}return library;
}
// Fetch the immutable reader worker into the browser cache before a document
// needs it; this does not allocate a reader worker or retain its byte buffer.
export function warmPDFViewer(){
 if(!warming){const task=Promise.all([pdfLibrary(),fetch(workerURL,{cache:'force-cache',signal:AbortSignal.timeout(60000)}).then(response=>{if(!response.ok)throw new Error('PDF阅读组件暂时未能载入');return response.arrayBuffer();})]).then(()=>undefined);warming=task;task.catch(()=>{if(warming===task)warming=null;});}
 return warming;
}
