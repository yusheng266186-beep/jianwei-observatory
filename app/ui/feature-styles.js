// Feature links are created by the build in cascade order. Never append a late
// sheet: doing so would override shared glass, field and motion refinements.
const pending=new WeakMap();
export function loadStyleLink(link,{timeout=20000}={}){
 if(link.sheet)return Promise.resolve();
 if(pending.has(link))return pending.get(link);
 const task=new Promise((resolve,reject)=>{
  let timer;
  const done=error=>{clearTimeout(timer);link.removeEventListener('load',loaded);link.removeEventListener('error',failed);if(error){link.removeAttribute('href');reject(error);}else resolve();};
  const loaded=()=>done(),failed=()=>done(new Error('页面样式暂时无法载入，请重试。'));
  link.addEventListener('load',loaded,{once:true});link.addEventListener('error',failed,{once:true});
  timer=setTimeout(()=>done(new Error('页面样式加载超时，请重试。')),timeout);
  link.href=link.dataset.href||link.getAttribute('href');
 });
 pending.set(link,task);task.catch(()=>{if(pending.get(link)===task)pending.delete(link);});return task;
}
export function ensureFeatureStyles(feature,{document:doc=globalThis.document,...options}={}){
 return Promise.all([...doc.querySelectorAll('[data-feature-styles]')].filter(link=>link.dataset.featureStyles===feature).map(link=>loadStyleLink(link,options)));
}
export function sceneStyleFeatures(scene,values={}){
 // Follow's entry and the library's collection navigation share exercise UI.
 return scene==='papers'?['papers']:scene==='follow'?['exercises']:scene==='library'?['exercises',...(values.tab==='reports'?['reports']:[])]:[];
}
export const ensureSceneStyles=(scene,values)=>Promise.all(sceneStyleFeatures(scene,values).map(feature=>ensureFeatureStyles(feature)));
