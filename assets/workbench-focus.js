// Provider/model/effort lists are rebuilt after a selection. Move keyboard
// focus to the equivalent control in the new DOM instead of dropping to <body>.
export function focusMatching(container,attribute,value){
 if(!container||typeof container.querySelectorAll!=='function')return false;
 for(const node of container.querySelectorAll('['+attribute+']')){
  if(node.getAttribute(attribute)!==String(value))continue;
  if(node.disabled)continue;
  if(typeof node.focus!=='function')continue;
  node.focus({preventScroll:true});
  return true;
 }
 return false;
}
