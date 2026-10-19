export const imageProviderTitle=p=>(p?.label||p?.id||'未设置').replace(/\s*·\s*(?:Image\s*[\d.]+|生图)\s*$/i,'');

// Use the same public catalog names in the current pipeline and its history.
export function selectionLabel(state,selection){
 const s=selection||{},p=[...(state.providers||[]),...(state.image?.providers||[])].find(p=>p.id===s.provider);
 const m=p?.models?.find(m=>m.id===s.model);
 return {provider:p?.model?imageProviderTitle(p):p?.label||s.provider||'未设置',model:m?.name||p?.name||s.model||'未设置',effort:s.effort?(m?.efforts?.[s.effort]||s.effort):'图像生成'};
}

export function visibleImageProviders(image,draft){
 // The retired chat route remains available if configured or in use.
 return (image?.providers||[]).filter(p=>p.id!=='cheetah-image'||p.configured||p.id===image.selection?.provider||p.id===draft?.provider);
}
