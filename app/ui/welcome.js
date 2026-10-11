import {button} from './html.js?v=empty-20261011d';

export function welcomeView() {
  return {html:'<section class="welcome-workspace" id="drop-zone" aria-labelledby="welcome-title"><div class="welcome-card"><span class="welcome-emblem" aria-hidden="true"><svg viewBox="0 0 48 48" fill="none"><path d="M15 8h13l8 8v22a3 3 0 0 1-3 3H15a3 3 0 0 1-3-3V11a3 3 0 0 1 3-3Z"/><path d="M28 8v8h8M18 26h12M24 20v12"/></svg></span><span class="overline">空白工作区</span><h1 id="welcome-title">导入材料，开启研究。</h1><p>导入后，再呈现班级、学生、成绩与试题分析。</p><div class="welcome-actions">'+button('选择成绩工作簿','import',{},'accent')+button('下载录入模板','template',{},'outline')+'</div><span class="welcome-formats">支持 Excel、CSV 和 JSON 备份，也可以把文件拖到这里。</span><footer>材料在当前浏览器处理与保存。</footer></div></section>',report:null};
}
