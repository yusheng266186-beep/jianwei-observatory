// Reproducible release assets; source modules remain readable and testable.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const esbuild=require(process.env.ESBUILD_LIB||'esbuild');
const root=path.resolve(__dirname,'..'),out=path.join(root,'app/runtime');
const sourceURLs={name:'source-urls',setup(build){
 build.onResolve({filter:/\?v=runtime-v\d+$/},args=>({path:path.resolve(args.resolveDir,args.path.replace(/\?v=runtime-v\d+$/,''))}));
 build.onLoad({filter:/\.js$/},async args=>{
  if(!args.path.startsWith(path.join(root,'app')+path.sep))return;
  let s=fs.readFileSync(args.path,'utf8');
  // Relative asset/worker URLs must keep the source module's directory even
  // though the executable code lives in app/runtime/.
  const relative=path.relative(out,args.path).split(path.sep).join('/');
  s=s.replaceAll('import.meta.url',`new URL(${JSON.stringify(relative)},import.meta.url).href`);
  return {contents:s,loader:'js',resolveDir:path.dirname(args.path)};
 });
}};
(async()=>{
 fs.mkdirSync(out,{recursive:true});
 const options={absWorkingDir:root,outdir:out,entryNames:'[name]-[hash]',chunkNames:'shared-[hash]',bundle:true,splitting:true,format:'esm',platform:'browser',target:['chrome110','safari16.4'],minify:true,charset:'utf8',legalComments:'none',metafile:true,plugins:[sourceURLs]};
 const worker=await esbuild.build({...options,entryPoints:{prepare:'app/data/prepare-worker.js'}});
 const workerName=Object.keys(worker.metafile.outputs)[0];
 fs.writeFileSync(path.join(root,'app/data/prepare-entry.js'),`export const prepareURL=new URL(${JSON.stringify('../../'+workerName)},import.meta.url);\n`);
 const storage=await esbuild.build({...options,splitting:false,entryPoints:{storage:'app/data/storage.js'}});
 const result=await esbuild.build({...options,entryPoints:{main:'app/main.js'}});
 Object.assign(result.metafile.outputs,storage.metafile.outputs);
 Object.assign(result.metafile.outputs,worker.metafile.outputs);
 const entries=Object.fromEntries(Object.entries(result.metafile.outputs).filter(([,v])=>v.entryPoint&&['app/main.js','app/data/storage.js','app/data/prepare-worker.js'].includes(v.entryPoint)).map(([k,v])=>[v.entryPoint,path.relative(path.join(root,'app'),path.join(root,k)).split(path.sep).join('/')]));
 let html=fs.readFileSync(path.join(root,'index.html'),'utf8');
 const sheets=['styles.css',...['journey','glass','reading-fonts','typography','questions','material','reports','controls','question-glass','report-reading','paper-material','runtime','exercises'].map(n=>'styles/'+n+'.css')];
 const css=await esbuild.build({absWorkingDir:root,stdin:{contents:sheets.map(s=>`@import ${JSON.stringify('./'+s)};`).join('\n'),loader:'css',resolveDir:root},bundle:true,write:false,minify:true,charset:'utf8',outfile:'styles.bundle.css',plugins:[{name:'css-assets',setup(build){build.onResolve({filter:/\.(woff2|png|svg)(\?|$)/},args=>({path:'../'+path.relative(root,path.resolve(args.resolveDir,args.path)).split(path.sep).join('/'),external:true}));}}]});
 // CSS imports use source-relative URLs. esbuild's external URL path is
 // preserved, so rewrite asset roots before combining the styles.
 let cssText=css.outputFiles[0].text;
 const cssName='assets/runtime-'+crypto.createHash('sha256').update(cssText).digest('hex').slice(0,12)+'.css';
 fs.writeFileSync(path.join(root,cssName),cssText);
 html=html.replace(/  <link rel="stylesheet"[^\n]+\n/g,'');
 html=html.replace(/<script src="\.\/app\/launch.js[^>]*><\/script>/,`<link rel="stylesheet" href="./${cssName}">\n  <script src="./app/launch.js?v=runtime-v48" data-runtime="./${entries['app/main.js']}" data-storage="./${entries['app/data/storage.js']}" data-prepare="./${entries['app/data/prepare-worker.js']}" defer></script>`);
 const {dockIcon}=await import(path.join(root,'app/ui/icons.js'));
 const routes=[['board','年级总览'],['class','班级研究'],['papers','试卷研究'],['people','学生研究'],['follow','教学跟进'],['library','资料与报告']];
 html=html.replace(/(<nav class="navigation-dock"[^>]*>)[\s\S]*?(<\/nav>)/,(_,start,end)=>start+'<span class="dock-indicator" aria-hidden="true"></span>'+routes.map(([id,label])=>'<button data-cmd="nav" data-scene="'+id+'"><span class="dock-symbol">'+dockIcon(id)+'</span><span>'+label+'</span><i></i></button>').join('')+end);
 fs.writeFileSync(path.join(root,'index.html'),html);
 fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify({main:entries['app/main.js'],storage:entries['app/data/storage.js'],prepare:entries['app/data/prepare-worker.js'],css:cssName,files:Object.keys(result.metafile.outputs)},null,2)+'\n');
 console.log(JSON.stringify({entries,css:cssName,bytes:Object.values(result.metafile.outputs).reduce((n,v)=>n+v.bytes,0)}));
})().catch(e=>{console.error(e);process.exitCode=1});
