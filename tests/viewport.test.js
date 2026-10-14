import test from 'node:test';
import assert from 'node:assert/strict';
import {viewportMetrics} from '../app/ui/viewport.js';
test('软键盘与浏览器平移后的窗口边界采用可见区域',()=>{
 assert.deepEqual(viewportMetrics(844,{height:380,offsetTop:24}),{height:380,top:24,bottom:440});
 assert.deepEqual(viewportMetrics(844,{height:380,offsetTop:800}),{height:380,top:464,bottom:0});
 assert.deepEqual(viewportMetrics(844,{height:900,offsetTop:0}),{height:844,top:0,bottom:0});
});
test('无可见视口 API 和隐藏窗口的零高度仍保留完整布局',()=>{
 assert.deepEqual(viewportMetrics(844),{height:844,top:0,bottom:0});
 assert.deepEqual(viewportMetrics(844,{height:0}),{height:844,top:0,bottom:0});
});
