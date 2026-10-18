import test from 'node:test';import assert from 'node:assert/strict';
import {NoteJournal} from '../app/data/notes.js';
function storage(){const data=new Map(),writes=[];globalThis.localStorage={getItem:key=>data.get(key)??null,setItem(key,value){writes.push({key,bytes:Buffer.byteLength(value)});data.set(key,value);}};return {data,writes};}
test('大报告连续输入只首次暂存完整文档，后续写小文字日志且可完整恢复',()=>{
 const {writes}=storage(),journal=new NoteJournal(),note={id:'n',note:'',sections:[{text:'匿名报告正文'.repeat(30000)}]};journal.restore([]);
 for(let i=0;i<20;i++){note.note='最后输入'+i;assert(journal.record(note));}
 assert.equal(writes.filter(w=>w.key.endsWith(':noteDrafts')).length,1);assert.equal(writes.filter(w=>w.key.endsWith(':noteDraftText')).length,20);assert(writes.filter(w=>w.key.endsWith(':noteDraftText')).every(w=>w.bytes<200));
 const restored=[];new NoteJournal().restore(restored);assert.equal(restored[0].note,'最后输入19');assert.deepEqual(restored[0].sections,note.sections);
});
test('确认保存仅清理相同文字，不清除保存期间的新输入；旧版完整草稿仍能恢复',()=>{
 const {data}=storage(),journal=new NoteJournal(),note={id:'n',note:'第一版',sections:[]};journal.restore([structuredClone(note)]);journal.record(note);const snapshot=structuredClone(note);note.note='保存过程中继续输入';journal.record(note);journal.persisted([snapshot]);const restored=[snapshot];new NoteJournal().restore(restored);assert.equal(restored[0].note,'保存过程中继续输入');
 data.clear();data.set('hengji:noteDrafts',JSON.stringify({old:{note:'旧版未保存',report:{id:'old',note:'原文',sections:[]}}}));const legacy=[];new NoteJournal().restore(legacy);assert.equal(legacy[0].note,'旧版未保存');
});
test('本机文字日志配额失败返回失败，当前文档和输入仍保留供重试或备份',()=>{
 storage();const journal=new NoteJournal(),note={id:'n',note:'不可丢的输入',sections:[]};journal.restore([note]);globalThis.localStorage.setItem=()=>{throw new DOMException('full','QuotaExceededError');};assert.equal(journal.record(note),false);assert.equal(note.note,'不可丢的输入');
});
