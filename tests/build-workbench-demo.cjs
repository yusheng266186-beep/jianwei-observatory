// Regenerate the read-only CUA fixture from the real workbench page.
// The fixture keeps raw source modules so layout can be inspected before release.
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),source=path.join(root,'model-workbench.html'),target=path.join(root,'tests/fixtures/model-workbench-demo.html');
const links=['assets/model-workbench.css','styles/fields.css','styles/wheels.css','styles/refinement.css','styles/reading-fonts.css','styles/visual-language.css']
 .map(file=>'<link rel="stylesheet" href="../../'+file+'">').join('\n');
let html=fs.readFileSync(source,'utf8');
html=html.replace(/\s*<link rel="stylesheet"[^>]*>/g,'').replace('</head>',links+'\n</head>');
html=html.replace(/<script type="module"[^>]*><\/script>/,'<script src="./model-workbench-demo-mock.js"></script>\n<script type="module" src="../../assets/model-workbench.js"></script>');
html=html.replaceAll('href="./assets/','href="../../assets/').replaceAll('src="./assets/','src="../../assets/').replaceAll('src="assets/','src="../../assets/');
html=html.replace('<title>模型工作台 · 荣县一中</title>','<title>模型工作台 · 只读演示</title>');
fs.writeFileSync(target,html);
console.log(target);
