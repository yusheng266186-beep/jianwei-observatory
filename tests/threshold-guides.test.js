import test from 'node:test';
import assert from 'node:assert/strict';
import {spread,positionSpreadLabels} from '../app/ui/plots.js';
const counts=svg=>[...svg.matchAll(/class="plot-value"[^>]*>(\d+)<\/text>/g)].map(m=>Number(m[1]));
test('分布图保留真实零分并排除缺总分，达线包括恰好达到分数线',()=>{
 const svg=spread('known-zero',[0,0,421.4,421.5,497.25,520,null,NaN],[{label:'本科',value:421.5},{label:'特控',value:497.25}]);
 assert.equal(counts(svg).reduce((s,n)=>s+n,0),6);assert.match(svg,/本科 421.5/);assert.match(svg,/特控 497.25/);assert.match(svg,/达线 3 人/);assert.match(svg,/达线 2 人/);
});
test('较多分段也保留人数标签，空总分不产生分数线图像',()=>{
 const svg=spread('wide',[0,0,600]);assert.equal(counts(svg).length,25);assert.equal(counts(svg).reduce((s,n)=>s+n,0),3);assert.match(spread('empty',[null,NaN],[{label:'本科',value:422}]),/暂无总分/);
});
test('接近的标签按真实分数顺序排开，标签框始终处于画布内',()=>{
 const placed=positionSpreadLabels([{x:571,width:310},{x:752,width:310}]);assert.equal(placed.length,2);assert.ok(placed[0].left+placed[0].width+16<=placed[1].left);for(const p of placed){assert.ok(p.left>=40);assert.ok(p.left+p.width<=760);assert.equal(p.lane,0);}
});
test('标签总宽不足时分行，超宽标签框不挤出画布',()=>{
 const placed=positionSpreadLabels([{x:40,width:900},{x:50,width:310},{x:60,width:310},{x:70,width:310}]);assert.equal(placed[0].width,720);assert.equal(placed[0].left,40);assert.equal(placed[1].lane,1);assert.equal(placed[3].lane,2);for(const p of placed){assert.ok(p.left>=40);assert.ok(p.left+p.width<=760);}
});
