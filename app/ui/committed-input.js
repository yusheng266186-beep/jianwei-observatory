// A composition session is one edit. Do not redraw lists or replace an input
// while an IME is still choosing characters; browsers differ on the final input.
export function installCommittedInput(root,handle,{signal,matches='input,textarea',onCompositionStart=()=>{}}={}){
 const composing=new WeakSet(),settled=new WeakMap();
 const accepts=target=>target?.matches?.(matches);
 const commit=event=>{const target=event.target;if(!accepts(target)||event.isComposing||composing.has(target))return;const duplicate=settled.has(target)&&settled.get(target)===target.value;settled.delete(target);if(!duplicate)handle(event);};
 root.addEventListener('compositionstart',event=>{if(accepts(event.target)){settled.delete(event.target);composing.add(event.target);onCompositionStart(event);}}, {signal});
 root.addEventListener('compositionend',event=>{if(accepts(event.target)){composing.delete(event.target);handle(event);settled.set(event.target,event.target.value);}}, {signal});
 root.addEventListener('input',commit,{signal});
}
