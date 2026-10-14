import {button} from './html.js?v=runtime-v38';

export function welcomeView() {
  const template=document.getElementById('empty-workspace-template');
  return {html:template?.innerHTML||'<section class="startup"><h1>导入材料，开启研究。</h1><p>导入后，再呈现班级、学生、成绩与试题分析。</p>'+button('选择成绩工作簿','import',{},'accent')+'</section>',report:null};
}
