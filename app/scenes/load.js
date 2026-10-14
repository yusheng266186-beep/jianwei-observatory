// Explicit imports allow release builds to share and cache content-hashed
// modules. A failed request can be retried; no rejected promise is retained.
const scenes={board:()=>import('./board.js?v=runtime-v45'),class:()=>import('./class.js?v=runtime-v45'),papers:()=>import('./papers.js?v=runtime-v45'),people:()=>import('./people.js?v=runtime-v45'),follow:()=>import('./follow.js?v=runtime-v45'),library:()=>import('./library.js?v=runtime-v45')};
const loaded=new Map();
export function loadScene(scene){if(!loaded.has(scene)){const task=scenes[scene]();loaded.set(scene,task);task.catch(()=>{if(loaded.get(scene)===task)loaded.delete(scene);});}return loaded.get(scene);}
