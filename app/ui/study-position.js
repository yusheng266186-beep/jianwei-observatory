const key=node=>node.id?'id:'+node.id:node.dataset.renderKey?'render:'+node.dataset.renderKey:null;
const offset=value=>Number.isFinite(value)?Math.max(0,value):0;
export function tableReadingPositions(root){return [...root.querySelectorAll('.table-frame')].map(frame=>{const node=frame.querySelector('.table-scroll');return {key:frame.dataset.tableKey,left:node?.scrollLeft||0,top:node?.scrollTop||0};});}
export function restoreTableReadingPositions(root,positions=[]){
 const frames=new Map([...root.querySelectorAll('.table-frame')].map(frame=>[frame.dataset.tableKey,frame]));
 for(const saved of positions){const node=frames.get(saved.key)?.querySelector('.table-scroll');if(node){node.scrollLeft=offset(saved.left);node.scrollTop=offset(saved.top);}}
}
export function disclosurePositions(root){return [...root.querySelectorAll('details')].map((node,index)=>({key:key(node),index,open:node.open}));}
export function restoreDisclosurePositions(root,positions=[]){
 const nodes=[...root.querySelectorAll('details')],keys=new Map(nodes.map(node=>[key(node),node]).filter(([k])=>k));
 for(const saved of positions){const node=saved.key?keys.get(saved.key):nodes[saved.index];if(node)node.open=Boolean(saved.open);}
}
