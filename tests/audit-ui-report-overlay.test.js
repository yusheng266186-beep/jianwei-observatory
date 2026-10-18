import test from 'node:test';import assert from 'node:assert/strict';
import {reportOverlayMode,createReportOverlayController} from '../app/ui/report-overlay.js';
test('窄屏且设置打开时为覆盖层，桌面并列阅读，阅读模式不约束预览',()=>{
 assert.equal(reportOverlayMode({settingsOpen:false},800),'closed');
 assert.equal(reportOverlayMode({settingsOpen:true,reading:false},1000),'overlay');
 assert.equal(reportOverlayMode({settingsOpen:true,reading:false},1001),'side');
 assert.equal(reportOverlayMode({settingsOpen:true,reading:true},375),'closed');
});
test('覆盖层打开移入焦点、关闭回到入口，resize/重开不遗留inert',()=>{
 let inert=false,panelFocused=false,opened=true,focus=[];
 const controller=createReportOverlayController({
  setInert:value=>{inert=value;},
  isOpen:()=>opened,
  isPanelFocused:()=>panelFocused,
  focusPanel:()=>{panelFocused=true;focus.push('panel');},
  focusTrigger:()=>{focus.push('trigger');}
 });
 controller.sync('overlay');
 assert.equal(inert,true);assert.deepEqual(focus,['panel']);
 controller.sync('overlay');
 assert.deepEqual(focus,['panel'],'each redraw of the same overlay must not steal focus again');
 panelFocused=false;controller.sync('side');
 assert.equal(inert,false);assert.deepEqual(focus,['panel'],'desktop side-by-side keeps the current focus');
 controller.sync('overlay');
 assert.deepEqual(focus,['panel','panel'],'returning to the overlay moves focus back into the panel');
 controller.sync('closed');
 assert.equal(inert,false);assert.deepEqual(focus,['panel','panel','trigger']);
 controller.sync('closed');
 assert.deepEqual(focus,['panel','panel','trigger'],'closing twice must not repeat the focus move');
 controller.sync('overlay');panelFocused=true;controller.sync('closed',{restoreFocus:false});
 assert.equal(inert,false);assert.deepEqual(focus,['panel','panel','trigger'],'reading mode must not restore to the settings entry');
 opened=false;controller.sync('overlay');controller.reset();
 assert.equal(inert,false);
});
