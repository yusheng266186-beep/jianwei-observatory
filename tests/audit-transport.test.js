import test from 'node:test';import assert from 'node:assert/strict';
import transport from '../backend/transport-envelope.cjs';
import {hydrateJobArtifacts} from '../app/ui/job-artifacts.js';
const {jobEnvelope,RESPONSE_BUDGET,tracePart}=transport;
test('大图与实时生成记录分件传输后逐字恢复，不截断正文或图像',async()=>{
 const source={id:'anonymous',status:'ready',progress:{phase:'ready',thinkingText:'思考摘要'.repeat(80000),outputText:'输出'.repeat(200000),draft:{questions:[]}},sheet:{questions:[{id:1,stem:'题干',diagram:{kind:'illustration',image:{mime:'image/png',data:'A'.repeat(3900000)}}}]}};
 const envelope=jobEnvelope(source);assert(Buffer.byteLength(JSON.stringify(envelope))<RESPONSE_BUDGET);assert(envelope.artifacts.trace);
 const restored=await hydrateJobArtifacts(envelope,async path=>path==='trace'?{progress:source.progress}:{image:source.sheet.questions[0].diagram.image});assert.deepEqual(restored,source);
});
test('超长图示日志也受单响应容量保护，分页哈希阻止混用不同轮次内容',async()=>{
 const source={id:'anonymous',progress:{phase:'ready',figureLog:[{outputText:'多学科图示说明'.repeat(400000)}]}};
 const envelope=jobEnvelope(source);assert(envelope.artifacts.trace.parts>1);assert(Buffer.byteLength(JSON.stringify(envelope))<RESPONSE_BUDGET);
 const restored=await hydrateJobArtifacts(envelope,async path=>{const part=tracePart(source.progress,Number(path.split('/')[1]));assert(Buffer.byteLength(JSON.stringify(part))<RESPONSE_BUDGET);return part;});assert.deepEqual(restored,source);
 await assert.rejects(hydrateJobArtifacts(envelope,async path=>tracePart({phase:'changed',figureLog:source.progress.figureLog},Number(path.split('/')[1]))),/记录已更新/);
});
