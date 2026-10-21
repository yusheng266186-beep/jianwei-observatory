'use strict';
const {request}=require('./tencent.cjs'),{routes,modelProfile}=require('./model-control.cjs'),vision=require('./model-vision.cjs');
async function structuredOnce(prompt,{generation,key,env=process.env,transport=request,onProgress,signal}={}){
 const route=routes[generation.provider],g={...generation,protocol:generation.protocol||route?.protocol,base:generation.base||route?.url,credentialRef:generation.credentialRef||route?.key};key=key||env[g.credentialRef];
 if(!route||!key)throw new Error('MODEL_NOT_CONFIGURED');
 if(g.protocol==='kimi')return require('./kimi.cjs').completeKimi(prompt,{key,kind:g.provider.slice(5),model:g.model,effort:g.reasoningEffort||'max',transport,onProgress,signal});
 if(g.protocol!=='gemini')return require('./model-completion.cjs').completeRemote(prompt,g,{key,transport,onProgress,signal});
 return require('./model-completion.cjs').completeGemini(prompt,g,{key,transport,onProgress,signal});
}
// Retry only an explicit transient upstream rejection, never a broken stream
// whose generation may already have been billed. The durable parent keeps text.
async function structured(prompt,options={}){
 prompt={...prompt,system:prompt.system+'\n输出JSON Schema（required字段必须全部给出；无文字标签用空字符串，不省略字段）：'+JSON.stringify(prompt.schema)+'\n只输出JSON，首字符为{，末字符为}，绝不输出代码围栏。'};
 for(let attempt=0;;attempt++){try{return await structuredOnce(prompt,options);}catch(error){
  if(attempt||options.signal?.aborted||![502,503,529].includes(error.diagnostic?.status))throw error;
  await new Promise((resolve,reject)=>{const abort=()=>{clearTimeout(timer);reject(new Error('JOB_CANCELLED'));},timer=setTimeout(()=>{options.signal?.removeEventListener('abort',abort);resolve();},1500);options.signal?.addEventListener('abort',abort,{once:true});});
 }}
}
const questionData=(q,input)=>({subject:input.subject,curriculum:input.curriculum,type:q.type,stem:q.stem,choices:q.choices,answer:q.answer,analysis:q.analysis,points:q.points,maxScore:q.maxScore,target:q.target,figureRequest:q.figureRequest?{...q.figureRequest,placement:q.figureLayout||q.figureRequest.placement}:undefined});
async function planFigure(q,input,options={}){
 const diagrams=await import('./exercise-diagrams.mjs'),schema={type:'object',additionalProperties:false,required:['diagram'],properties:{diagram:diagrams.exerciseDiagramSchema}};
 const system=require('./figure-prompt-guidance.cjs').figurePlanPrompt(input.subject);
 const completion=await (options.complete||structured)({system,input:{...questionData(q,input),visuals:input.visuals,feedback:options.feedback||null,...(options.previousDiagram?{previousDiagram:options.previousDiagram}:{})},schema},options);
 const diagram=await parseFigurePlan(completion.output,q,input);
 return {...completion,diagram,output:undefined};
}
async function parseFigurePlan(output,q,input){
 const diagrams=await import('./exercise-diagrams.mjs');
 try{if(input.visuals==='none')throw Error('本次不配图，不能生成图示。');const result=JSON.parse(output);if(!result||Object.keys(result).length!==1||!result.diagram)throw Error('图示输出结构无效。');diagrams.validateExerciseDiagram(result.diagram);const spatialFold=input.subject==='数学'&&/翻折|折起/.test(q.stem)&&/平面|空间/.test(q.stem)&&/空间|翻折后|折后|不同.{0,3}平面/.test(q.figureRequest?.requirements||'');if(spatialFold&&!['spatial-frame','cuboid','right-triangular-prism','rectangular-pyramid'].includes(result.diagram.model?.id))throw Error('翻折后的空间图必须使用真实非共面三维模型，不能用二维drawing或节点坐标冒充。');if(result.diagram.kind==='illustration'&&(!['auto','hybrid'].includes(input.visuals)||q.figureRequest?.precision==='exact'))throw Error('本题需要精确矢量图，不允许改用生图。');diagrams.validateGeneratedExerciseFigures({questions:[{...q,diagram:result.diagram}]},input);return result.diagram;}catch(cause){throw Object.assign(new Error('FIGURE_PLAN_INVALID'),{cause,output});}
}
async function reviewFigure(q,input,diagram,options={}){
 const schema={type:'object',additionalProperties:false,required:['approved','issues'],properties:{approved:{type:'boolean'},issues:{type:'array',maxItems:12,items:{type:'string',maxLength:400}},contentIssues:{type:'array',maxItems:8,items:{type:'string',maxLength:400}},layoutNotes:{type:'array',maxItems:8,items:{type:'string',maxLength:400}}}};
 // Resolve the frozen route when an older job only stored provider/model.
 // Vision capability is explicit (known model or profile flag), never just
 // adapter family, and an explicit 400/415/422 image rejection may fall back
 // to a clearly labelled brief review.
 const generation=options.generation||{};
 const capability={...generation,protocol:generation.protocol||routes[generation.provider]?.protocol,adapterProfile:generation.adapterProfile||modelProfile(generation.provider,generation.model)};
 const raster=diagram.kind==='illustration',pixels=!!(raster&&diagram.image&&vision.supportsImage(capability));
 if(pixels)(await import('./exercise-diagrams.mjs')).validateExerciseDiagram(diagram);
 const copy=structuredClone(diagram);if(copy.image)delete copy.image;
 const parse=completion=>{let result;try{result=JSON.parse(completion.output);if(!result||Object.keys(result).some(k=>!['approved','issues','contentIssues','layoutNotes'].includes(k))||typeof result.approved!=='boolean'||!Array.isArray(result.issues)||result.issues.length>12||result.issues.some(s=>typeof s!=='string'||s.length>400)||result.approved&&result.issues.length||!result.approved&&!result.issues.length||result.contentIssues!==undefined&&(!Array.isArray(result.contentIssues)||result.contentIssues.length>8||result.contentIssues.some(s=>typeof s!=='string'||!s||s.length>400))||result.layoutNotes!==undefined&&(!Array.isArray(result.layoutNotes)||result.layoutNotes.length>8||result.layoutNotes.some(s=>typeof s!=='string'||!s||s.length>400)))throw Error('图题核对结果不完整。');}catch(cause){throw Object.assign(new Error('FIGURE_REVIEW_INVALID'),{cause,output:completion.output});}return {...completion,...result,layoutNotes:result.layoutNotes||[],contentIssues:result.contentIssues||[],output:undefined};};
 const run=async withPixels=>{
  const reviewSystem=require('./figure-prompt-guidance.cjs').figureReviewPrompt(input.subject,{pixels:withPixels,illustration:raster});
  const completion=await (options.complete||structured)({...(withPixels?{image:diagram.image}:{}),system:reviewSystem,input:{...questionData(q,input),diagram:copy,feedback:options.feedback||null,...(options.previousDiagram?{previousDiagram:options.previousDiagram}:{})},schema},options);
  return {...parse(completion),reviewScope:withPixels?'pixels':(raster?'brief':'vector-source')};
 };
 if(!pixels)return run(false);
 try{return await run(true);}
 catch(error){
  const downgrade=vision.imageRejection(error);if(!downgrade)throw error;
  try{return {...await run(false),reviewScope:'brief',visionDowngrade:downgrade};}
  catch(briefError){briefError.visionDowngrade=downgrade;throw briefError;}
 }
}
module.exports={structured,planFigure,parseFigurePlan,reviewFigure};
