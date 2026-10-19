import test from 'node:test';
import assert from 'node:assert/strict';
import {selectionLabel,visibleImageProviders,imageProviderTitle} from '../assets/workbench-presentation.js';

test('pipeline and history show the actual image model rather than Image 2',()=>{
 const state={providers:[{id:'text',label:'出题服务',models:[{id:'sol',name:'Sol 6.1',efforts:{deep:'max'}}]}],image:{providers:[{id:'image25',label:'猎豹',model:'gpt-image-2.5',name:'GPT Image 2.5'}]}};
 assert.deepEqual(selectionLabel(state,{provider:'image25',model:'gpt-image-2.5'}),{provider:'猎豹',model:'GPT Image 2.5',effort:'图像生成'});
 assert.equal(selectionLabel(state,{provider:'text',model:'sol',effort:'deep'}).effort,'max');
 assert.equal(selectionLabel(state,{provider:'retired',model:'old'}).model,'old');
 assert.equal(imageProviderTitle({label:'猎豹词元工厂 · Image 2.5'}),'猎豹词元工厂');
 assert.equal(imageProviderTitle({label:'ByteCat · 生图'}),'ByteCat');
});

test('retired image route is hidden only when neither configured nor selected',()=>{
 const legacy={id:'cheetah-image',configured:false},native={id:'native',configured:true};
 const image={providers:[legacy,native],selection:{provider:'native'}};
 assert.deepEqual(visibleImageProviders(image,null),[native]);
 assert.deepEqual(visibleImageProviders(image,{provider:legacy.id}),[legacy,native]);
 assert.deepEqual(visibleImageProviders({...image,selection:{provider:legacy.id}},null),[legacy,native]);
 assert.equal(visibleImageProviders({...image,providers:[{...legacy,configured:true},native]},null).length,2);
});
