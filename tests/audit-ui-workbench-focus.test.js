import test from 'node:test';import assert from 'node:assert/strict';
import {focusMatching} from '../assets/workbench-focus.js';
const node=(attrs,{disabled=false}={})=>({...Object.fromEntries(Object.entries(attrs).map(([key,value])=>[key,value])),disabled,focused:false,getAttribute(name){return this[name];},focus(options){if(this.disabled)return;this.focused=true;this.options=options;}});
const container=nodes=>({querySelectorAll(selector){const attribute=selector.slice(1,-1);return nodes.filter(item=>Object.hasOwn(item,attribute));}});
test('重建服务/模型/档位列表后焦点回到同类选中项，不使用原生select或额外样式',()=>{
 const providers=[node({'data-provider':'a'}),node({'data-provider':'b'})];
 assert.equal(focusMatching(container(providers),'data-provider','b'),true);
 assert.deepEqual(providers.map(item=>item.focused),[false,true]);
 assert.deepEqual(providers[1].options,{preventScroll:true});
 const models=[node({'data-model':'first'}),node({'data-model':'second'},{disabled:true}),node({'data-model':'third'})];
 assert.equal(focusMatching(container(models),'data-model','second'),false,'a disabled replacement is not a valid focus target');
 assert.equal(focusMatching(container(models),'data-model','third'),true);
 assert.deepEqual(models.map(item=>item.focused),[false,false,true]);
});
test('无匹配项或容器缺失时安全返回，不把焦点丢给body',()=>{
 assert.equal(focusMatching(container([]),'data-effort','deep'),false);
 assert.equal(focusMatching(null,'data-effort','deep'),false);
 assert.equal(focusMatching({},'data-effort','deep'),false);
});
