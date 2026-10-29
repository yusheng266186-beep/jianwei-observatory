const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
function build({check=false}={}){
 const root=path.resolve(__dirname,'..'),source=JSON.parse(fs.readFileSync(path.join(root,'data/teaching/math-knowledge.json'))),ids=new Set(),values=new Set();let branches=0,groups=0,points=0;
 assert.equal(source.subject,'数学');assert.equal(source.modules.length,11);assert(source.sources.length>=2);
 for(const module of source.modules){
  for(const node of [module,...module.branches,...module.branches.flatMap(b=>b.groups)]){assert(/^math-[a-f\d]{12}$/.test(node.id));assert(!ids.has(node.id));ids.add(node.id);assert(node.name?.trim());}
  assert(module.branches.length);branches+=module.branches.length;
  for(const branch of module.branches){assert(branch.groups.length);groups+=branch.groups.length;for(const group of branch.groups){assert(group.topics.length);for(const label of group.topics){const value='知识点 / '+[module.name,group.name,label].join(' / ');assert(typeof label==='string'&&label.trim()===label&&label.length>1);assert(!/[\x00-\x1f<>]/.test(label));assert(value.length<=200);assert(!values.has(value),'Duplicate practice point: '+value);values.add(value);points++;}}}
 }
 const runtime={title:source.title,scope:source.scope,modules:source.modules},text='// Generated from data/teaching/math-knowledge.json. Edit the documented source.\nexport const mathKnowledge='+JSON.stringify(runtime)+';\n',file=path.join(root,'app/data/math-knowledge-data.js');
 if(check)assert.equal(fs.readFileSync(file,'utf8'),text,'Math knowledge catalog needs rebuilding');else fs.writeFileSync(file,text);
 return {modules:source.modules.length,branches,groups,points};
}
module.exports={build};if(require.main===module)console.log(JSON.stringify(build({check:process.argv.includes('--check')})));
