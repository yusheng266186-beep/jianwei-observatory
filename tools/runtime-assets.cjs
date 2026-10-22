const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const manifestPath='app/runtime/manifest.json',registryPath='tools/runtime-releases.json';
function coreAssetFiles(manifest){return [...new Set([...(manifest.files||[]),manifest.css,manifest.landing,...(manifest.styles||[])].filter(Boolean))].sort();}
function assetFiles(manifest){return [...new Set([...coreAssetFiles(manifest),...(manifest.compatibility||[])])].sort();}
function compatibilityFiles(current,head,production,registry){
 const core=coreAssetFiles(current),same=head&&JSON.stringify(core)===JSON.stringify(coreAssetFiles(head)),protectedFiles=new Set(selectedReleases(registry).flatMap(release=>release.files));
 const candidates=same?head.compatibility||[]:[...(head?coreAssetFiles(head):[]),...(production?coreAssetFiles(production):[])];
 return [...new Set(candidates)].filter(file=>!core.includes(file)&&!protectedFiles.has(file)).sort();
}
function selectedReleases(registry,now=Date.now()){
 const releases=[...(registry.releases||[])].sort((a,b)=>Date.parse(b.publishedAt)-Date.parse(a.publishedAt));
 return releases.filter((r,i)=>i<3||now-Date.parse(r.publishedAt)<7*86400000);
}
function safeAsset(file){return /^(?:app\/runtime\/[\w-]+\.js|assets\/(?:runtime(?:-[a-z]+)*|landing|model-workbench|figure-library)-[a-f\d]{12}\.css|styles\/(?:fields|wheels|refinement|reading-fonts|visual-language)-[a-f\d]{12}\.css)$/.test(file);}
function plan(root,manifest,registry,{now=Date.now(),staged=new Map()}={}){
 const keep=new Set(assetFiles(manifest));for(const release of selectedReleases(registry,now))for(const f of release.files)keep.add(f);
 for(const file of keep){if(!safeAsset(file))throw Error('Unexpected retained asset: '+file);if(!staged.has(file)&&!fs.existsSync(path.join(root,file)))throw Error('Retained dependency missing: '+file);}
 // Validate the complete retained JS graph before removing even one old file.
 for(const file of keep){if(!file.endsWith('.js'))continue;const source=staged.has(file)?staged.get(file).toString():fs.readFileSync(path.join(root,file),'utf8');for(const match of source.matchAll(/(?:\bfrom\s*|\bimport\s*(?:\(\s*)?)["'](\.\/[\w-]+\.js)["']/g)){
  const target=path.posix.normalize(path.posix.join(path.posix.dirname(file),match[1]));if(!keep.has(target))throw Error('Unlisted retained import: '+file+' -> '+target);
 }}
 const remove=[];for(const dir of ['app/runtime','assets','styles'])for(const name of fs.readdirSync(path.join(root,dir))){const file=dir+'/'+name;if(safeAsset(file)&&!keep.has(file))remove.push(file);}
 return {keep:[...keep].sort(),remove:remove.sort(),bytes:remove.reduce((n,f)=>n+fs.statSync(path.join(root,f)).size,0)};
}
function maintain(root,{apply=false,now=Date.now()}={}){
 const manifest=JSON.parse(fs.readFileSync(path.join(root,manifestPath))),registry=JSON.parse(fs.readFileSync(path.join(root,registryPath))),result=plan(root,manifest,registry,{now});
 if(apply)for(const f of result.remove)fs.unlinkSync(path.join(root,f));return {...result,applied:apply};
}
function record(root,receipt){
 if(!receipt.verified||!receipt.mergedTreeIdentical||receipt.productionMain!==receipt.mergeCommit||!/^[a-f\d]{40}$/.test(receipt.mergeCommit))throw Error('A verified production release receipt is required');
 const git=(...args)=>cp.execFileSync('git',args,{cwd:root,encoding:'utf8'}).trim(),commit=receipt.mergeCommit;
 if(git('rev-parse',commit+'^{tree}')!==receipt.sourceTree)throw Error('Receipt tree differs from published commit');
 const manifest=JSON.parse(git('show',commit+':'+manifestPath)),publishedAt=git('show','-s','--format=%cI',commit),file=path.join(root,registryPath),registry=fs.existsSync(file)?JSON.parse(fs.readFileSync(file)): {version:1,releases:[]};
 if(registry.releases.some(r=>r.commit===commit))return false;
 registry.releases=selectedReleases({releases:[{commit,publishedAt,files:assetFiles(manifest)},...registry.releases]});fs.writeFileSync(file,JSON.stringify(registry,null,2)+'\n');return true;
}
module.exports={coreAssetFiles,assetFiles,compatibilityFiles,selectedReleases,safeAsset,plan,maintain,record};
if(require.main===module){try{const root=path.resolve(__dirname,'..'),args=process.argv.slice(2);if(args[0]==='record'){const file=args[args.indexOf('--receipt')+1];if(!args.includes('--receipt')||!file)throw Error('Use record --receipt <verified production receipt>');console.log({recorded:record(root,JSON.parse(fs.readFileSync(file)))});}else{const result=maintain(root,{apply:args.includes('--apply')});console.log(JSON.stringify({retained:result.keep.length,retired:result.remove.length,bytes:result.bytes,applied:result.applied,files:result.remove},null,2));}}catch(e){console.error(e.message);process.exitCode=1;}}
