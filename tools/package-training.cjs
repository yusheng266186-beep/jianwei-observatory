const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const check=process.argv.includes('--check');
function emit(file,contents){const bytes=Buffer.from(contents);if(check){if(!fs.existsSync(file)||!fs.readFileSync(file).equals(bytes))throw new Error('Shared contract differs: '+path.relative(root,file));}else fs.writeFileSync(file,bytes);}
function copy(source,target){emit(target,fs.readFileSync(source));}

emit(path.join(root,'backend/exercise-contract.mjs'),fs.readFileSync(path.join(root,'app/engine/exercise-contract.js'),'utf8').replace("'./exercise-diagrams.js'","'./exercise-diagrams.mjs'").replace("'./exercise-figure-layout.js'","'./exercise-figure-layout.mjs'"));
emit(path.join(root,'backend/exercise-diagrams.mjs'),fs.readFileSync(path.join(root,'app/engine/exercise-diagrams.js'),'utf8').replace("'./exercise-models.js'","'./exercise-models.mjs'").replace("'./exercise-scene.js'","'./exercise-scene.mjs'").replace("'./exercise-science.js'","'./exercise-science.mjs'"));
copy(path.join(root,'app/engine/exercise-models.js'),path.join(root,'backend/exercise-models.mjs'));
emit(path.join(root,'backend/exercise-science.mjs'),fs.readFileSync(path.join(root,'app/engine/exercise-science.js'),'utf8').replace("'./exercise-molecular-model.js'","'./exercise-molecular-model.mjs'").replace("'./exercise-geography.js'","'./exercise-geography.mjs'").replace("'./exercise-advanced-figures.js'","'./exercise-advanced-figures.mjs'"));
copy(path.join(root,'app/engine/exercise-molecular-model.js'),path.join(root,'backend/exercise-molecular-model.mjs'));
copy(path.join(root,'app/engine/exercise-scene.js'),path.join(root,'backend/exercise-scene.mjs'));
copy(path.join(root,'app/engine/exercise-figure-layout.js'),path.join(root,'backend/exercise-figure-layout.mjs'));
copy(path.join(root,'app/engine/exercise-geography.js'),path.join(root,'backend/exercise-geography.mjs'));
copy(path.join(root,'app/engine/content-stamp.js'),path.join(root,'backend/content-stamp.mjs'));
emit(path.join(root,'backend/exercise-quality.mjs'),fs.readFileSync(path.join(root,'app/engine/exercise-quality.js'),'utf8').replace("'./content-stamp.js'","'./content-stamp.mjs'"));

copy(path.join(root,'app/engine/exercise-advanced-figures.js'),path.join(root,'backend/exercise-advanced-figures.mjs'));
console.log(check?'Shared training contract matches.':'Shared anonymous-training contract synchronized.');
