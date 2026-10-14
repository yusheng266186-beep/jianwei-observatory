import test from 'node:test';
import assert from 'node:assert/strict';
import {workspaceStorage} from '../app/data/storage.js';
test('Pages预览的页面和后台Worker使用同一隔离范围，正式站名称保持兼容',()=>{
 const production={scope:'',database:'hengji-evidence-workspace',prefix:'hengji:'};
 for(const path of ['/','/jianwei-observatory/','/jianwei-observatory/app/runtime/prepare.js','/jianwei-observatory-preview-other/'])assert.deepEqual(workspaceStorage(path),production);
 const preview=workspaceStorage('/jianwei-observatory-preview/');assert.equal(preview.scope,'gemini-preview');assert.notEqual(preview.database,production.database);assert.notEqual(preview.prefix,production.prefix);
 assert.deepEqual(workspaceStorage('/jianwei-observatory-preview/app/runtime/prepare.js'),preview);
 assert.deepEqual(workspaceStorage('/jianwei-observatory-preview'),preview);
});
