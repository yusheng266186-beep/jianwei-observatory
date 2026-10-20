'use strict';
// SCF limits each HTTP response. Large documents keep their complete media and
// generation trace in separately authenticated parts rather than losing content.
const RESPONSE_BUDGET=5800000;
const TRACE_CHARS=600000;
const bytes=value=>Buffer.byteLength(JSON.stringify(value));
const crypto=require('node:crypto');
const traceText=value=>JSON.stringify(value||{});
function traceDescriptor(progress){const text=traceText(progress);return bytes({progress})<=RESPONSE_BUDGET?true:{parts:Math.ceil(text.length/TRACE_CHARS),hash:crypto.createHash('sha256').update(text).digest('hex')};}
function tracePart(progress,index){const text=traceText(progress),hash=crypto.createHash('sha256').update(text).digest('hex');if(!Number.isInteger(index)||index<0||index>=Math.ceil(text.length/TRACE_CHARS))return null;return {text:text.slice(index*TRACE_CHARS,(index+1)*TRACE_CHARS),hash};}
function jobEnvelope(value){
 if(bytes(value)<=RESPONSE_BUDGET)return value;
 const result={...value},artifacts={};
 if(value.progress){result.progress=Object.fromEntries(['phase','sequence','heartbeatAt','receivedAt','timing','thinkingChars','responseChars','figureRevision','groupRevision','repairStage','repairRevision','contentStage','contentRevision','contentChars','figureStage','figureTotal','figureCompleted','total','completedQuestions','completedGroups','partIndex','partCount'].filter(key=>value.progress[key]!==undefined).map(key=>[key,value.progress[key]]));artifacts.trace=traceDescriptor(value.progress);}
 if(bytes(result)>RESPONSE_BUDGET&&value.sheet){
  artifacts.images=[];
  result.sheet={...value.sheet,questions:value.sheet.questions.map(question=>{
   if(!question.diagram?.image)return question;
   const {image,...diagram}=question.diagram;artifacts.images.push(question.id);return {...question,diagram};
  })};
 }
 result.artifacts=artifacts;
 if(bytes(result)>RESPONSE_BUDGET)throw new Error('RESPONSE_CAPACITY');
 return result;
}
module.exports={jobEnvelope,RESPONSE_BUDGET,traceDescriptor,tracePart};
