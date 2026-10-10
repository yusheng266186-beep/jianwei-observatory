const identity=node=>{
  if(node.nodeType!==1)return null;
  if(node.id)return 'id:'+node.id;
  if(node.dataset.motionKey)return 'motion:'+node.dataset.motionKey;
  if(node.dataset.renderKey)return 'render:'+node.dataset.renderKey;
  if(node.dataset.field)return 'field:'+node.dataset.field;
  if(node.dataset.cmd)return node.tagName+':'+Object.entries(node.dataset).filter(([k])=>k!=='motionKey').map(([k,v])=>k+'='+v).join('|');
  if(node.matches('input,textarea'))return node.tagName+':'+node.name+':'+(node.type==='radio'?node.value:'');
  return null;
};
const compatible=(a,b)=>a.nodeType===b.nodeType&&(a.nodeType!==1||(a.tagName===b.tagName&&a.namespaceURI===b.namespaceURI));
function synchronize(current,next) {
  if(current.nodeType===3||current.nodeType===8){if(current.nodeValue!==next.nodeValue)current.nodeValue=next.nodeValue;return;}
  const keepOpen=current.tagName==='DETAILS'&&!next.hasAttribute('data-controlled'),wasOpen=current.open;
  for(const attr of [...current.attributes])if(!next.hasAttribute(attr.name))current.removeAttribute(attr.name);
  for(const attr of next.attributes)if(current.getAttribute(attr.name)!==attr.value)current.setAttribute(attr.name,attr.value);
  if(keepOpen)current.open=wasOpen;
  if(current.matches('input,textarea')) {
    if(current.value!==next.value)current.value=next.value;
    if(current.matches('input'))current.checked=next.checked;
    return;
  }
  reconcile(current,next);
}
function reconcile(parent,next) {
  const previous=[...parent.childNodes],keyed=new Map(previous.map(n=>[identity(n),n]).filter(([k])=>k)),used=new Set();let cursor=parent.firstChild;
  for(const desired of [...next.childNodes]) {
    const key=identity(desired);let node=key?keyed.get(key):previous.find(n=>!used.has(n)&&!identity(n)&&compatible(n,desired));
    if(node&&!compatible(node,desired))node=null;
    if(!node)node=desired.cloneNode(true);else synchronize(node,desired);
    used.add(node);if(node!==cursor)parent.insertBefore(node,cursor);cursor=node.nextSibling;
  }
  for(const node of previous)if(!used.has(node)&&node.parentNode===parent)node.remove();
}
export function renderInto(element,html,{replace=false}={}) {
  const template=document.createElement('template');template.innerHTML=html;
  if(replace)element.replaceChildren(template.content);else reconcile(element,template.content);
}
