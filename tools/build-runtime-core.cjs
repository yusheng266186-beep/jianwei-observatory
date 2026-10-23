const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process'),{pathToFileURL}=require('node:url');
const esbuild=require(process.env.ESBUILD_LIB||'esbuild');
const {plan,compatibilityFiles}=require('./runtime-assets.cjs');
const {indexHTML,standaloneHTML}=require('./build-html.cjs');
const {groups:styleGroups}=require('./style-groups.cjs');
const hash=value=>crypto.createHash('sha256').update(value).digest('hex').slice(0,12);
async function build(root=path.resolve(__dirname,'..')){
 const out=path.join(root,'app/runtime'),staged=new Map(),overrides=new Map(),read=file=>fs.readFileSync(path.join(root,file),'utf8');
 const baseline=ref=>{try{return JSON.parse(cp.execFileSync('git',['show',ref+':app/runtime/manifest.json'],{cwd:root,stdio:['ignore','pipe','ignore'],encoding:'utf8'}));}catch{return null;}};
 const head=baseline('HEAD'),production=baseline('refs/remotes/origin/main');
 const registry=JSON.parse(read('tools/runtime-releases.json'));
 const plugin={name:'source-urls',setup(job){
  job.onResolve({filter:/\?v=runtime-v\d+$/},args=>({path:path.resolve(args.resolveDir,args.path.replace(/\?v=runtime-v\d+$/,''))}));
  job.onLoad({filter:/\.js$/},async args=>{
   if(!args.path.startsWith(path.join(root,'app')+path.sep))return;
   const source=overrides.get(args.path)??fs.readFileSync(args.path,'utf8'),relative=path.relative(out,args.path).split(path.sep).join('/');
   return {contents:source.replaceAll('import.meta.url',`new URL(${JSON.stringify(relative)},import.meta.url).href`),loader:'js',resolveDir:path.dirname(args.path)};
  });
 }};
 const options={absWorkingDir:root,outdir:out,entryNames:'[name]-[hash]',chunkNames:'shared-[hash]',bundle:true,splitting:true,format:'esm',platform:'browser',target:['chrome110','safari16.4'],minify:true,charset:'utf8',legalComments:'none',metafile:true,write:false,plugins:[plugin]};
 const outputs={};
 const compile=async settings=>{const result=await esbuild.build({...options,...settings});Object.assign(outputs,result.metafile.outputs);for(const file of result.outputFiles)staged.set(path.relative(root,file.path).split(path.sep).join('/'),Buffer.from(file.contents));return result;};
 const entry=(result,source)=>{const found=Object.entries(result.metafile.outputs).find(([,value])=>value.entryPoint===source);if(!found)throw new Error('Missing compiled entry: '+source);return found[0];};
 const worker=await compile({entryPoints:{prepare:'app/data/prepare-worker.js'}}),workerName=entry(worker,'app/data/prepare-worker.js');
 const importer=await compile({splitting:false,format:'iife',entryPoints:{importer:'app/data/importer-worker.js'}}),importerName=entry(importer,'app/data/importer-worker.js');
 for(const [file,name,constant] of [['prepare-entry.js',workerName,'prepareURL'],['importer-entry.js',importerName,'importerURL']]){
  const source=`export const ${constant}=new URL(${JSON.stringify('../../'+name)},import.meta.url);\n`,target='app/data/'+file;overrides.set(path.join(root,target),source);staged.set(target,Buffer.from(source));
 }
 await compile({splitting:false,entryPoints:{storage:'app/data/storage.js'}});
 await compile({entryPoints:{main:'app/main.js'}});
 await compile({splitting:false,entryPoints:{'figure-library':'assets/figure-library.js','model-workbench':'assets/model-workbench.js'}});
 const entries=Object.fromEntries(Object.entries(outputs).filter(([,value])=>value.entryPoint).map(([file,value])=>[value.entryPoint,path.relative(path.join(root,'app'),path.join(root,file)).split(path.sep).join('/')]));
 const workspaceStyles=[];
 for(const group of styleGroups){
  const css=await esbuild.build({absWorkingDir:root,stdin:{contents:group.sheets.map(file=>'@import '+JSON.stringify('./'+file)+';').join('\n'),loader:'css',resolveDir:root},bundle:true,write:false,minify:true,charset:'utf8',outfile:'styles.bundle.css',plugins:[{name:'css-assets',setup(job){job.onResolve({filter:/\.(woff2|png|svg)(\?|$)/},args=>({path:'../'+path.relative(root,path.resolve(args.resolveDir,args.path)).split(path.sep).join('/'),external:true}));}}]});
  const text=css.outputFiles[0].text,file='assets/runtime-'+group.name+'-'+hash(text)+'.css';staged.set(file,Buffer.from(text));workspaceStyles.push({file,feature:group.feature});
 }
 const cssName=workspaceStyles[0].file,landingCSS=read('styles/landing.css')+'\n'+read('styles/motion.css'),landingName='assets/landing-'+hash(landingCSS)+'.css';staged.set(landingName,Buffer.from(landingCSS));
 const preload=new Set();function dependencies(file){for(const item of outputs[file]?.imports||[]){if(item.external||item.kind!=='import-statement'||preload.has(item.path))continue;preload.add(item.path);dependencies(item.path);}}dependencies('app/'+entries['app/main.js']);
 const preloadAttribute=JSON.stringify([...preload].map(file=>'../'+file)).replaceAll('"','&quot;');
 const launch=`<script src="./app/launch.js?v=runtime-v54" data-runtime="./${entries['app/main.js']}" data-storage="./${entries['app/data/storage.js']}" data-prepare="./${entries['app/data/prepare-worker.js']}" data-importer="../${importerName}" data-preload="${preloadAttribute}" defer></script>`;
 const {dockIcon}=await import(pathToFileURL(path.join(root,'app/ui/icons.js')).href);
 const routes=[['board','年级总览'],['class','班级研究'],['papers','试卷研究'],['people','学生研究'],['follow','教学跟进'],['library','资料与报告']];
 const dock='<span class="dock-indicator" aria-hidden="true"></span>'+routes.map(([id,label])=>'<button data-cmd="nav" data-scene="'+id+'"><span class="dock-symbol">'+dockIcon(id)+'</span><span>'+label+'</span><i></i></button>').join('');
 staged.set('index.html',Buffer.from(indexHTML(read('index.html'),{launch,landingCSS:landingCSS.trim().replaceAll("url('../assets/","url('./assets/"),runtimeCSS:cssName,workspaceStyles,dock})));
 const styleSources={'figure-library.html':['assets/model-workbench.css','assets/figure-library.css','styles/fields.css','styles/refinement.css','styles/reading-fonts.css','styles/visual-language.css','styles/motion.css'],'model-workbench.html':['assets/model-workbench.css','styles/fields.css','styles/wheels.css','styles/refinement.css','styles/reading-fonts.css','styles/visual-language.css','styles/motion.css']},styles=new Set();
 for(const [file,source] of [['figure-library.html','assets/figure-library.js'],['model-workbench.html','assets/model-workbench.js']]){
  const links=styleSources[file].map(style=>{const content=fs.readFileSync(path.join(root,style)),name=style.replace(/\.css$/,'-'+hash(content)+'.css');staged.set(name,content);styles.add(name);return '<link rel="stylesheet" href="./'+name+'">';}).join('');
  staged.set(file,Buffer.from(standaloneHTML(read(file),{entry:entries[source],links})));
 }
 const manifest={main:entries['app/main.js'],storage:entries['app/data/storage.js'],prepare:entries['app/data/prepare-worker.js'],importer:importerName,preload:[...preload],css:cssName,landing:landingName,workspaceStyles,styles:[...new Set([...styles,...workspaceStyles.map(s=>s.file)])].sort(),standalone:{figures:entries['assets/figure-library.js'],models:entries['assets/model-workbench.js']},files:Object.keys(outputs)};
 // Persist a bounded fallback graph so a missed release receipt cannot delete
 // the preceding entry. Identical builds preserve the same graph (including CI).
 const fallback=compatibilityFiles(manifest,head,production,registry);if(fallback.length)manifest.compatibility=fallback;
 const retention=plan(root,manifest,registry,{staged});
 staged.set('app/runtime/manifest.json',Buffer.from(JSON.stringify(manifest,null,2)+'\n'));
 // No entry/manifest or existing resource changes until all compilation,
 // HTML replacement and the complete retained dependency graph have passed.
 for(const [file,content] of [...staged].sort(([a],[b])=>Number(a.endsWith('.html')||a.endsWith('manifest.json'))-Number(b.endsWith('.html')||b.endsWith('manifest.json')))){
  const target=path.join(root,file);fs.mkdirSync(path.dirname(target),{recursive:true});const temporary=target+'.build-tmp';fs.writeFileSync(temporary,content);fs.renameSync(temporary,target);
 }
 for(const file of retention.remove)fs.unlinkSync(path.join(root,file));
 return {entries,css:cssName,bytes:Object.values(outputs).reduce((sum,value)=>sum+value.bytes,0),retainedAssets:retention.keep.length,removedAssets:retention.remove.length,removedBytes:retention.bytes};
}
module.exports={build};
