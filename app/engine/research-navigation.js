const scenes=new Set(['board','class','papers','people','follow','library']);
const field='jianweiResearch';
// WebKit limits pushState + replaceState calls in short bursts. A history
// checkpoint must never prevent a teacher's next navigation from rendering.
export function replaceResearchHistory(history,url,state){
 try{if(JSON.stringify(history.state)===JSON.stringify(state))return false;history.replaceState(state,'',url);return true;}catch{return false;}
}
export function pushResearchHistory(history,location,hash){
 if(location.hash===hash)return 'same';
 try{history.pushState(null,'',hash);return 'pushed';}
 catch{try{location.hash=hash;return 'native';}catch{return 'unavailable';}}
}
export function researchPath(scene,values={}) {
 if(!scenes.has(scene))return '#board';
 if(scene==='class')return '#class/'+(values.no||'')+'/'+values.tab;
 if(scene==='papers'&&values.key)return '#papers/'+encodeURIComponent(values.key);
 if(scene==='people'&&values.sid)return '#people/'+encodeURIComponent(values.sid)+(values.exam?'/'+encodeURIComponent(values.exam):'');
 return '#'+scene;
}
// Input is saved before the debounced view has repainted. Capture those current
// conditions only when they still belong to the same displayed research URL.
export function researchStudySnapshot(painted,{scene,values,hash}={}) {
 if(!painted)return null;
 const study=structuredClone(painted);
 if(scene===study.scene&&values&&researchPath(scene,values)===hash&&researchPath(study.scene,study.values)===hash)study.values=structuredClone(values);
 return study;
}
export function researchHistoryState(previous,{scope,hash,study,trail=[]}) {
 const state=previous&&typeof previous==='object'&&!Array.isArray(previous)?{...previous}:{};
 state[field]=structuredClone({version:1,scope,hash,study,trail:trail.slice(-10)});return state;
}
export function researchHistoryStudy(state,{scope,hash}) {
 const saved=state?.[field],study=saved?.study;
 if(saved?.version!==1||saved.scope!==scope||saved.hash!==hash||!study||!scenes.has(study.scene)||!study.values||typeof study.values!=='object'||Array.isArray(study.values)||researchPath(study.scene,study.values)!==hash||!Array.isArray(saved.trail))return null;
 return structuredClone({study,trail:saved.trail.slice(-10)});
}
export function researchHistoryConditions(previous,{scope,hash,scene,values,painted,trail=[]}) {
 const saved=researchHistoryStudy(previous,{scope,hash}),source=saved?.study||painted;
 if(!source||source.scene!==scene||researchPath(source.scene,source.values)!==hash||researchPath(scene,values)!==hash)return null;
 const study=researchStudySnapshot(source,{scene,values,hash});
 return researchHistoryState(previous,{scope,hash,study,trail:saved?.trail||trail});
}
