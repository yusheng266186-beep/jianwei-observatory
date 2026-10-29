const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
function build({check=false}={}){
 const root=path.resolve(__dirname,'..'),source=JSON.parse(fs.readFileSync(path.join(root,'data/teaching/subject-knowledge.json'))),books=JSON.parse(fs.readFileSync(path.join(root,'data/teaching/textbook-directory.json'))),expected=['语文','英语','日语','物理','化学','生物','历史','政治','地理'],runtime={},totals={};
 assert.deepEqual(Object.keys(source.subjects).sort(),expected.sort());
 for(const [subject,catalog]of Object.entries(source.subjects)){
  const ids=new Set(),values=new Set();let branches=0,groups=0;
  const modules=catalog.modules.map(module=>({...module,branches:module.branches.map(branch=>({...branch,groups:branch.groups.map(group=>{
   for(const node of [module,branch,group]){assert(node.name&&/^kp-[a-f\d]{12}$/.test(node.id));}assert(!ids.has(group.id));ids.add(group.id);
   let topics=group.topics;
   if(group.ref){const book=books[subject].books.find(b=>b.id===group.ref.book),chapter=book?.chapters.find(c=>c.id===group.ref.chapter),section=chapter?.sections.find(s=>s.name===group.ref.section);assert(section,subject+' missing textbook reference');topics=section.topics.map(t=>t.startsWith(section.name+'：')?t.slice(section.name.length+1):t);}
   assert(topics?.length);groups++;
   for(const label of topics){const value='知识点 / '+[module.name,group.name,label].join(' / ');assert(typeof label==='string'&&label.trim()&&value.length<=200,subject+' label too long');assert(!/[\x00-\x1f<>]/.test(label));assert(!values.has(value),subject+' duplicate '+value);values.add(value);}
   return {id:group.id,name:group.name,topics};
  })}))}));
  for(const module of modules){assert(module.branches.length);branches+=module.branches.length;for(const branch of module.branches)assert(branch.groups.length);}
  runtime[subject]={title:catalog.title,scope:catalog.scope,modules};totals[subject]={modules:modules.length,branches,groups,points:values.size};
 }
 const text='// Generated from subject-knowledge.json and verified textbook-directory.json.\nexport const subjectKnowledge='+JSON.stringify(runtime)+';\n',file=path.join(root,'app/data/subject-knowledge-data.js');
 if(check)assert.equal(fs.readFileSync(file,'utf8'),text,'Subject knowledge catalog needs rebuilding');else fs.writeFileSync(file,text);
 return totals;
}
module.exports={build};if(require.main===module)console.log(JSON.stringify(build({check:process.argv.includes('--check')})));
