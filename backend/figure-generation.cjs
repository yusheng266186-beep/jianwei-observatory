'use strict';
const {request}=require('./tencent.cjs'),{routes,modelProfile}=require('./model-control.cjs'),vision=require('./model-vision.cjs');
const {parseModelJSON}=require('./model-json.cjs');
async function structuredOnce(prompt,{generation,key,env=process.env,transport=request,onProgress,signal}={}){
 const route=routes[generation.provider],g={...generation,protocol:generation.protocol||route?.protocol,base:generation.base||route?.url,credentialRef:generation.credentialRef||route?.key};key=key||env[g.credentialRef];
 if(!route||g.protocol!=='codex'&&!key)throw new Error('MODEL_NOT_CONFIGURED');
 if(g.protocol==='kimi')return require('./kimi.cjs').completeKimi(prompt,{key,kind:g.provider.slice(5),model:g.model,effort:g.reasoningEffort||'max',transport,onProgress,signal});
 if(g.protocol!=='gemini')return require('./model-completion.cjs').completeRemote(prompt,g,{key,transport,onProgress,signal});
 return require('./model-completion.cjs').completeGemini(prompt,g,{key,transport,onProgress,signal});
}
// Retry only an explicit transient upstream rejection, never a broken stream
// whose generation may already have been billed. The durable parent keeps text.
async function structured(prompt,options={}){
 prompt={...prompt,system:prompt.system+'\n输出JSON Schema（required字段必须全部给出；无文字标签用空字符串）：'+JSON.stringify(prompt.schema)+'\n只输出JSON，首字符为{，末字符为}，绝不输出代码围栏。'};
 for(let attempt=0;;attempt++){try{return await structuredOnce(prompt,options);}catch(error){
  if(attempt||options.signal?.aborted||![502,503,529].includes(error.diagnostic?.status))throw error;
  await new Promise((resolve,reject)=>{const abort=()=>{clearTimeout(timer);reject(new Error('JOB_CANCELLED'));},timer=setTimeout(()=>{options.signal?.removeEventListener('abort',abort);resolve();},1500);options.signal?.addEventListener('abort',abort,{once:true});});
 }}
}
const questionData=(q,input)=>({subject:input.subject,curriculum:input.curriculum,type:q.type,stem:q.stem,choices:q.choices,answer:q.answer,analysis:q.analysis,points:q.points,maxScore:q.maxScore,target:q.target,figureRequest:q.figureRequest?{...q.figureRequest,placement:q.figureLayout||q.figureRequest.placement}:undefined});
async function planFigure(q,input,options={}){
 const diagrams=await import('./exercise-diagrams.mjs'),schema={type:'object',additionalProperties:false,required:['diagram'],properties:{diagram:diagrams.exerciseDiagramSchema}};
 const system=require('./figure-prompt-guidance.cjs').figurePlanPrompt(input.subject);
 const completion=await (options.complete||structured)({system,input:{...questionData(q,input),visuals:input.visuals,feedback:options.feedback||null,...(options.previousDiagram?{previousDiagram:options.previousDiagram}:{}),...(options.previousReview?{previousReview:options.previousReview}:{})},schema},options);
 const diagram=await parseFigurePlan(completion.output,q,input);
 return {...completion,diagram,output:undefined};
}
async function parseFigurePlan(output,q,input){
 const diagrams=await import('./exercise-diagrams.mjs');
 try{
  if(input.visuals==='none')throw Error('本次不配图，不能生成图示。');
  const result=parseModelJSON(output),diagram=structuredClone(result?.diagram||result);
  if(!diagram||typeof diagram!=='object'||Array.isArray(diagram))throw Error('图示输出结构无效。');
  // Empty display metadata is optional; no scientific coordinates or labels
  // are inferred. Unknown diagram fields still go through the safe renderer.
  if(diagram.caption===undefined)diagram.caption='';
  if(diagram.description===undefined)diagram.description='';
  for(const edge of diagram.edges||[])if(edge.label===undefined)edge.label='';
  for(const edge of diagram.model?.links||[])if(edge.hidden===undefined)edge.hidden=false;
  diagrams.validateExerciseDiagram(diagram);
  if(diagram.kind==='illustration'&&(!['auto','hybrid'].includes(input.visuals)||q.figureRequest?.precision==='exact'))throw Error('本题需要精确矢量图，不允许改用生图。');
  // A custom projected drawing can express spatial relationships correctly;
  // correctness is reviewed from the full question, not guessed from its kind.
  diagrams.validateGeneratedExerciseFigures({questions:[{...q,diagram}]},input);
  return diagram;
 }catch(cause){throw Object.assign(new Error('FIGURE_PLAN_INVALID'),{cause,output});}
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
 const parse=completion=>{
  try{
   const result=parseModelJSON(completion.output);
   if(!result||typeof result.approved!=='boolean')throw Error('图题核对缺少明确的approved判定。');
   const issues=result.issues===undefined?[]:result.issues,contentIssues=result.contentIssues===undefined?[]:result.contentIssues,layoutNotes=result.layoutNotes===undefined?[]:result.layoutNotes;
   for(const [name,items]of Object.entries({issues,contentIssues,layoutNotes}))if(!Array.isArray(items)||items.length>24||items.some(s=>typeof s!=='string'||!s.trim()||s.length>1600))throw Error(name+'须为简短意见数组。');
   const approved=result.approved||!issues.length&&layoutNotes.length>0&&!contentIssues.length;
   if(!approved&&!issues.length)throw Error('未通过的图示须说明具体原因。');
   // Trust an explicit approval. Non-blocking observations remain visible,
   // rather than rejecting a correct figure for an optional display detail.
   return {...completion,approved,issues:approved?[]:issues,contentIssues,layoutNotes:[...layoutNotes,...(approved?issues:[])],output:undefined};
  }catch(cause){throw Object.assign(new Error('FIGURE_REVIEW_INVALID'),{cause,output:completion.output});}
 };
 const run=async withPixels=>{
  const reviewSystem=require('./figure-prompt-guidance.cjs').figureReviewPrompt(input.subject,{pixels:withPixels,illustration:raster});
  const completion=await (options.complete||structured)({...(withPixels?{image:diagram.image}:{}),system:reviewSystem,input:{...questionData(q,input),diagram:copy,feedback:options.feedback||null,...(options.previousDiagram?{previousDiagram:options.previousDiagram}:{}),...(options.previousReview?{previousReview:options.previousReview}:{})},schema},options);
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
