'use strict';
// Shared author/reviewer checklist. Teacher text stays in request data; these
// rules explain how to apply it without turning it into system instructions.
function teacherBriefGuide({review=false}={}){
 return [
  '【落实教师选择】',
  '以request中的教学范围curriculum、训练重点focus、已选知识点targets、题型questionTypes、难度difficulty、题数count、时长minutes及补充要求requirements为本次教学任务，逐项落实，不用历史失分记录或示例替换教师的选择。逐题安排中的id、type、target保持原样；target标签正确还不够，题干实际考查、所需方法和答案必须真正对应该训练点。',
  '具体题型按实际任务区分：阅读理解、完形、语法填空和完整写作不能只凭共用的选择/填空/写作字段混用；实验题须有可独立作答的条件与数据，材料题须有完整材料及明确子问。完整题组在同一questions项内写清各空或各小问，count计questions项数，不把各空数冒充题数。',
  '知识范围限制必需知识与方法，不限制情境来源。可用原创材料、信息给予和迁移应用；基础运算及已学前置知识可作辅助，不把它们另立为未选训练专题。难度落实在条件、材料、推理层数及计算负担，不只修改level标签；训练时长用于合理控制阅读与作答量，不删减教师已选任务来凑时长。',
  '分值随学科和具体任务设置：区分独立小题、每空、每小问与材料题组总分，逐问说明；maxScore、题干标分、answer与points一致，保留正常小数分。客观题列对错及必要的部分得分规则；主观题按有效步骤或要点配分，合计满分；作文可用评分维度或互斥分档，不能把不同档分数相加。不要求学生写出未设问内容才能得满分。',
  review
   ?'复核时将教师要求与原题逐项对照，指出具体哪项未落实及题文依据。明确换考点、超出所选范围、缺所选题型、明显违背教师设定或分值矛盾属于实质问题；合理专项配分、等价表达和轻微估时差异不制造失败。能按原条件修正的直接声明并定点修正，不能安全修正的给出具体原因，不能借修改标签掩盖内容不符。'
   :'输出前核对题量与覆盖、教学范围、实际难度、子任务和计分，再按Schema直接交付最终稿。教师要求出现实质冲突时不能悄悄忽略、改题型或扩大范围；保持课程边界和所选题型，用可核对的题文与答案完整落实可兼容的教学要求，不在学生稿中夹带执行计划或自我验收声明。'
 ].join('\n');
}
module.exports={teacherBriefGuide};
