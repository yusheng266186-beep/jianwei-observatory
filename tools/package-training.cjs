const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
fs.copyFileSync(path.join(root,'app/engine/exercise-contract.js'),path.join(root,'backend/exercise-contract.mjs'));
console.log('Shared anonymous-training contract synchronized.');
