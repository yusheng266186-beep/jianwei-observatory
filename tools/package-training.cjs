const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
fs.writeFileSync(path.join(root,'backend/exercise-contract.mjs'),fs.readFileSync(path.join(root,'app/engine/exercise-contract.js'),'utf8').replace("'./exercise-diagrams.js'","'./exercise-diagrams.mjs'"));
fs.copyFileSync(path.join(root,'app/engine/exercise-diagrams.js'),path.join(root,'backend/exercise-diagrams.mjs'));
console.log('Shared anonymous-training contract synchronized.');
