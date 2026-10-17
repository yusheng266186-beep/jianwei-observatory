import {preference,remember} from '../data/storage.js';
const allowed=new Set(['board','class','people','papers','follow','library']);
// Local, bounded timings only: no URLs, search terms, student identifiers or content.
export function recordPageTiming(scene,ms,{cached=false,failed=false}={}){if(!allowed.has(scene)||!Number.isFinite(ms)||ms<0)return;const rows=readPageTimings();rows.push({scene,ms:Math.round(ms),cached:!!cached,failed:!!failed,at:Date.now()});remember('pageTimings',rows.slice(-60));}
export function readPageTimings(){const saved=preference('pageTimings',[]);return (Array.isArray(saved)?saved:[]).filter(r=>allowed.has(r?.scene)&&Number.isFinite(r.ms)&&Number.isFinite(r.at)).slice(-60);}
export function clearPageTimings(){remember('pageTimings',[]);}
export function summarizePageTimings(rows=readPageTimings()){const groups=new Map();for(const r of rows){const key=r.scene+'|'+r.cached;if(!groups.has(key))groups.set(key,{scene:r.scene,cached:r.cached,values:[],failed:0});const g=groups.get(key);g.values.push(r.ms);g.failed+=Number(r.failed);}return [...groups.values()].map(({values,...g})=>{values.sort((a,b)=>a-b);return {...g,samples:values.length,medianMs:values[Math.ceil(values.length/2)-1],p95Ms:values[Math.ceil(values.length*.95)-1]};});}
