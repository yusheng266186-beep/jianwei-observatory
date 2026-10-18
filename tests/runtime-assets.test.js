import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {createRequire} from 'node:module';
import {isRuntimeLoadError,runtimeFailureMessage} from '../app/ui/runtime-recovery.js';
import {execFileSync} from 'node:child_process';
const {plan,selectedReleases,maintain,record}=createRequire(import.meta.url)('../tools/runtime-assets.cjs');
const today=Date.parse('2026-10-18T00:00:00Z'),release=(n,days)=>({commit:String(n),publishedAt:new Date(today-days*86400000).toISOString(),files:[]});
test('保留最近3次成功发布及7天内全部已登记发布，不把未发布构建登记为历史',()=>{
 const list=[release(1,20),release(2,11),release(3,10),release(4,6),release(5,4),release(6,1)],before=structuredClone(list);
 assert.deepEqual(selectedReleases({releases:list},today).map(r=>r.commit),['6','5','4']);assert.deepEqual(selectedReleases({releases:list.slice(0,2)},today).map(r=>r.commit),['2','1']);assert.deepEqual(list,before);
 assert.equal(selectedReleases({releases:[release(1,1),release(2,2),release(3,3),release(4,4)]},today).length,4);
});
function fixture(){const root=fs.mkdtempSync(path.join(os.tmpdir(),'hengji-runtime-'));for(const d of ['app/runtime','assets','styles','tools'])fs.mkdirSync(path.join(root,d),{recursive:true});const put=(f,text='')=>fs.writeFileSync(path.join(root,f),text);return {root,put,close:()=>fs.rmSync(root,{recursive:true,force:true})};}
test('清理覆盖JS和哈希CSS，保留完整旧依赖、源码和手工资源；默认仅预览',()=>{
 const f=fixture();try{const main='app/runtime/main-CURRENT.js',old='app/runtime/main-OLD.js',chunk='app/runtime/shared-OLD.js',css='assets/runtime-aaaaaaaaaaaa.css',manifest={files:[main],css},registry={releases:[{...release(1,2),files:[old,chunk]}]};
 f.put(main);f.put(old,'import("./shared-OLD.js")');f.put(chunk);f.put(css);f.put('app/runtime/shared-DEAD.js');f.put('assets/runtime-bbbbbbbbbbbb.css');f.put('assets/model-workbench.css');f.put('styles/fields.css');f.put('app/runtime/manifest.json',JSON.stringify(manifest));f.put('tools/runtime-releases.json',JSON.stringify(registry));
 const result=maintain(f.root,{now:today});assert.deepEqual(result.remove,['app/runtime/shared-DEAD.js','assets/runtime-bbbbbbbbbbbb.css']);assert(fs.existsSync(path.join(f.root,result.remove[0])));maintain(f.root,{apply:true,now:today});assert(!fs.existsSync(path.join(f.root,result.remove[0])));assert(fs.existsSync(path.join(f.root,chunk)));assert(fs.existsSync(path.join(f.root,'assets/model-workbench.css')));
 }finally{f.close();}
});
test('保留清单损坏、依赖遗漏或路径越界时整次清理拒绝执行，避免旧页被半清理',()=>{
 const f=fixture();try{const main='app/runtime/main-CURRENT.js',dead='app/runtime/shared-DEAD.js';f.put(main,'import("./shared-MISSING.js")');f.put(dead);
 assert.throws(()=>plan(f.root,{files:[main]},{releases:[]}),/Unlisted retained import/);assert(fs.existsSync(path.join(f.root,dead)));assert.throws(()=>plan(f.root,{files:['../private.js']},{releases:[]}),/Unexpected retained/);assert.throws(()=>plan(f.root,{files:['app/runtime/main-NOTFOUND.js']},{releases:[]}),/missing/);
 }finally{f.close();}
});
test('过期组件失败提供明确刷新途径，不把普通认证或格式错误误报为页面升级',()=>{
 for(const message of ['Failed to fetch dynamically imported module: /app/runtime/shared-OLD.js','Importing a module script failed.','error loading dynamically imported module']){assert(isRuntimeLoadError(new TypeError(message)));assert.match(runtimeFailureMessage(new Error(message)),/刷新获取最新版本/);}
 assert(!isRuntimeLoadError(new Error('验证码无效')));assert.equal(runtimeFailureMessage(new Error('题目不完整')),'题目不完整');
});
test('发布登记核验成功回执和提交树，拒绝未发布构建且重复登记不改清单',()=>{
 const f=fixture();try{const git=(...args)=>execFileSync('git',args,{cwd:f.root,encoding:'utf8'}).trim();
 git('init','-q');git('config','user.name','Anonymous QA');git('config','user.email','qa@example.invalid');
 const main='app/runtime/main-PUBLISHED.js';f.put(main);f.put('app/runtime/manifest.json',JSON.stringify({files:[main]}));git('add','.');git('commit','-qm','Anonymous release fixture');
 const commit=git('rev-parse','HEAD'),tree=git('rev-parse','HEAD^{tree}'),receipt={verified:true,mergedTreeIdentical:true,productionMain:commit,mergeCommit:commit,sourceTree:tree};
 assert.throws(()=>record(f.root,{...receipt,verified:false}),/verified production/);assert.throws(()=>record(f.root,{...receipt,sourceTree:'0'.repeat(40)}),/tree differs/);
 assert.equal(record(f.root,receipt),true);const file=path.join(f.root,'tools/runtime-releases.json'),saved=fs.readFileSync(file,'utf8');assert.equal(record(f.root,receipt),false);assert.equal(fs.readFileSync(file,'utf8'),saved);assert.deepEqual(JSON.parse(saved).releases[0].files,[main]);
 }finally{f.close();}
});

test('裸import依赖也必须在保留图中，单次失败不清理旧资源',()=>{const f=fixture();try{f.put('app/runtime/main-CURRENT.js',`import './shared-MISSING.js';`);f.put('app/runtime/shared-DEAD.js');assert.throws(()=>plan(f.root,{files:['app/runtime/main-CURRENT.js']},{releases:[]}),/Unlisted retained import/);assert(fs.existsSync(path.join(f.root,'app/runtime/shared-DEAD.js')));}finally{f.close();}});
test('遗漏登记只保留上代主图，不累积全部祖先，重复构建及提交后构建稳定',()=>{const {compatibilityFiles}=createRequire(import.meta.url)('../tools/runtime-assets.cjs'),m=n=>({files:['app/runtime/main-'+n+'.js']}),old=m('OLD'),head={...m('HEAD'),compatibility:old.files},next=m('NEXT'),registry={releases:[]};const fallback=compatibilityFiles(next,head,null,registry);assert.deepEqual(fallback,head.files);assert.deepEqual(compatibilityFiles(next,head,null,registry),fallback);assert.deepEqual(compatibilityFiles(next,{...next,compatibility:fallback},null,registry),fallback);});
