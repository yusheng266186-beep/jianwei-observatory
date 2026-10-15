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
  const managed=current.hasAttribute('data-managed')&&next.hasAttribute('data-managed');
  const surfaceOwned=current.dataset.surfaceMotion==='managed'&&current.dataset.surfacePhase!=='closed';
  const keepOpen=current.tagName==='DETAILS'&&!next.hasAttribute('data-controlled'),wasOpen=current.open;
  for(const attr of [...current.attributes])if(!next.hasAttribute(attr.name)&&!(managed&&(attr.name==='style'||attr.name.startsWith('data-pdf')||attr.name==='data-current-page'))&&!(surfaceOwned&&(attr.name==='style'||attr.name==='inert'||attr.name.startsWith('data-surface-'))))current.removeAttribute(attr.name);
  for(const attr of next.attributes)if(current.getAttribute(attr.name)!==attr.value)current.setAttribute(attr.name,attr.value);
  if(keepOpen)current.open=wasOpen;
  if(current.matches('input,textarea')) {
    if(current.value!==next.value)current.value=next.value;
    if(current.matches('input'))current.checked=next.checked;
    return;
  }
  // A PDF renderer owns this island; outer form updates must retain its canvases.
  if(current.hasAttribute('data-managed')&&next.hasAttribute('data-managed'))return;
  // A retiring teacher picker keeps its populated calendar until fadeout.
  // Calendar ownership lasts through fadeout. A populated exercise menu must
  // still receive changed subject options before a quick reopen.
  if(current.dataset.surfacePhase==='leaving'&&(current.matches('.plan-picker-panel:popover-open')||current.matches('.exercise-choice-panel:popover-open')&&!next.childElementCount))return;
  reconcile(current,next);
}
function reconcile(parent,next) {
  const previous=[...parent.childNodes],buckets=new Map(),used=new Set();let cursor=parent.firstChild;
  const bucketKey=node=>(identity(node)||'plain')+':'+node.nodeType+':'+(node.namespaceURI||'')+':'+(node.tagName||'');
  for(const node of previous){const key=bucketKey(node);if(!buckets.has(key))buckets.set(key,{nodes:[],index:0});buckets.get(key).nodes.push(node);}
  for(const desired of [...next.childNodes]) {
    // Consume each sibling once, including unkeyed cells in wide tables.
    // Per-type queues retain the previous matching semantics without repeated
    // scans of every earlier sibling (quadratic for large tables).
    const bucket=buckets.get(bucketKey(desired));let node=null;
    if(bucket)for(let i=bucket.index;i<bucket.nodes.length;i++){const candidate=bucket.nodes[i];if(!used.has(candidate)&&compatible(candidate,desired)){node=candidate;bucket.index=i+1;break;}}
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
