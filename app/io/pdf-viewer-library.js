let library,attempts=0;
export function pdfLibrary(){
 if(!library){const suffix='?v=pdfjs-4.10.38'+(attempts++?'&retry='+attempts:''),attempt=import('../../vendor/pdfjs/pdf.min.mjs'+suffix).then(module=>{module.GlobalWorkerOptions.workerSrc=new URL('../../vendor/pdfjs/pdf.worker.min.mjs?v=pdfjs-4.10.38',import.meta.url).href;return module;});library=attempt;attempt.catch(()=>{if(library===attempt)library=null;});}return library;
}
