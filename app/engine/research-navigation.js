const scenes=new Set(['board','class','papers','people','follow','library']);
const field='jianweiResearch';
export function researchPath(scene,values={}) {
 if(!scenes.has(scene))return '#board';
 if(scene==='class')return '#class/'+(values.no||'')+'/'+values.tab;
 if(scene==='papers'&&values.key)return '#papers/'+encodeURIComponent(values.key);
 if(scene==='people'&&values.sid)return '#people/'+encodeURIComponent(values.sid)+(values.exam?'/'+encodeURIComponent(values.exam):'');
 return '#'+scene;
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
