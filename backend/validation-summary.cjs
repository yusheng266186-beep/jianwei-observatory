'use strict';
// Return only fixed teaching-facing messages. Never expose raw JSON, credentials,
// upstream diagnostics or model text through a parsing error.
function validationSummary(message=''){
 const match=/^第(\d{1,2})题(?:的(题干|答案|解析|选项|评分点))?未按约定输出公式或正文格式。$/.exec(message);
 if(match)return '第'+match[1]+'题'+(match[2]?'的'+match[2]:'')+'存在公式格式问题：排版指令须放在公式标记内。请重新生成。';
 const field=/^第(\d{1,2})题的(题干|答案|解析)为空或超过\d+字符。$/.exec(message);
 if(field)return '第'+field[1]+'题的'+field[2]+'未完整返回或篇幅超限，请重新生成。';
 const question=/^第(\d{1,2})题/.exec(message),number=question?'第'+question[1]+'题':'';
 if(message.includes('选项或答案不符合题型'))return number+'的选项数量或答案标记不符合题型，请重新生成。';
 if(message.includes('题目数量'))return '模型返回的题数与所选题量不一致，或缺少训练目标。请重新生成。';
 if(message.includes('用时'))return '题目预计用时与所选训练时长不匹配，请重新生成。';
 if(message.includes('梯度')||message.includes('迁移题'))return '题目难度梯度与所选训练强度不匹配，请重新生成。';
 if(message.includes('重复题目'))return '模型返回了重复题目，请重新生成。';
 if(message.includes('训练点')||message.includes('题型'))return (number||'题组')+'未符合所选训练点或题型，请重新生成。';
 return '模型返回的题目结构或格式不完整，请重新生成。';
}
module.exports={validationSummary};
