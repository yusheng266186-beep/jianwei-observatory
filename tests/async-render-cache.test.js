import test from 'node:test';
import assert from 'node:assert/strict';
import {createAsyncRenderCache} from '../app/engine/async-render-cache.js';
test('同一公式的并发预览与导出共用在途排版，完成后继续复用',async()=>{
 const cache=createAsyncRenderCache();let count=0,finish;
 const build=()=>{count++;return new Promise(r=>finish=r);},tasks=Array.from({length:30},()=>cache.get('formula',build));
 await Promise.resolve();assert.equal(count,1);assert(tasks.every(task=>task===tasks[0]));finish('svg');assert.deepEqual(await Promise.all(tasks),Array(30).fill('svg'));assert.equal(await cache.get('formula',()=>{throw Error('duplicate');}),'svg');
});
test('公式失败不污染缓存，重试及修改后的内容能独立生成',async()=>{
 const cache=createAsyncRenderCache();await assert.rejects(cache.get('broken',()=>{throw Error('font retry');}),/font retry/);
 assert.equal(await cache.get('broken',()=>'<svg/>'),'<svg/>');assert.equal(await cache.get('changed',()=>'<svg>new</svg>'),'<svg>new</svg>');
});
test('完成缓存按最近使用与总内容量淘汰，不积累长草稿',async()=>{
 const cache=createAsyncRenderCache({entries:2,maxWeight:20});await cache.get('a',()=>'one');await cache.get('b',()=>'two');await cache.get('a',()=>{throw Error('retain recent');});await cache.get('c',()=>'three');let rebuild=0;assert.equal(await cache.get('b',()=>{rebuild++;return 'rebuilt';}),'rebuilt');assert.equal(rebuild,1);
 let large=0;await cache.get('large',()=>{large++;return 'x'.repeat(30);});await cache.get('large',()=>{large++;return 'x'.repeat(30);});assert.equal(large,2);
});
