const fs=require('node:fs'),path=require('node:path');
const {maintain}=require('./runtime-assets.cjs');
const root=path.resolve(__dirname,'..'),manifest=JSON.parse(fs.readFileSync(path.join(root,'app/runtime/manifest.json')));
const requireFile=file=>{if(!fs.existsSync(path.join(root,file)))throw Error('Release dependency missing: '+file);};
maintain(root);
for(const file of [manifest.css,manifest.landing,...manifest.styles]){
 const source=fs.readFileSync(path.join(root,file),'utf8');
 for(const match of source.matchAll(/url\(\s*["']?([^"')\s]+)["']?\s*\)/g)){
  if(/^(?:data:|https?:|#)/.test(match[1]))continue;
  const target=path.posix.normalize(path.posix.join(path.posix.dirname(file),match[1].split(/[?#]/)[0]));requireFile(target);
 }
}
for(const [file,entry] of [['figure-library.html',manifest.standalone.figures],['model-workbench.html',manifest.standalone.models]]){
 const html=fs.readFileSync(path.join(root,file),'utf8');
 if(!html.includes('./app/'+entry))throw Error('Standalone entry differs: '+file);
 for(const match of html.matchAll(/<link[^>]*\bhref=["']\.\/([^"']+)["']/g))requireFile(match[1].split('?')[0]);
}
for(const file of ['app/launch.js','app/io/pdf-worker.js','vendor/pdfjs/pdf.min.mjs','vendor/pdfjs/pdf.worker.min.mjs','vendor/pdfmake.min.js','vendor/mathjax-3.2.2/tex-svg.js','assets/fonts/reading-manifest.json','assets/report-fonts/manifest.json'])requireFile(file);
console.log('Release entries, retained graph, standalone styles, fonts and PDF workers verified.');
