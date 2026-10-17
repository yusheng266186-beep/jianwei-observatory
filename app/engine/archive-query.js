export const archiveText=value=>String(value??'').normalize('NFKC').toLocaleLowerCase('zh-CN');
export function archiveTokens(value){return archiveText(value).split(/[\s,;]+/).filter(Boolean);}
export function archiveMatches(tokens,fields){const text=fields.map(archiveText).join('\n');return tokens.every(token=>text.includes(token));}
export const archiveSceneLabels={board:'年级总览',class:'班级研究',papers:'试卷研究',people:'学生研究',follow:'教学跟进',library:'资料与报告'};
export function queryEvidenceNotes(notes,state={}){
 const tokens=archiveTokens(state.notebookQuery),source=state.notebookSource||'all',judgment=state.notebookJudgment||'all';
 const matches=notes.filter(note=>(source==='all'||(note.study?.scene||'other')===source)&&(judgment==='all'||(judgment==='written'?Boolean(note.note?.trim()):!note.note?.trim()))&&archiveMatches(tokens,[note.title,note.outputSelection?.title,note.subtitle,note.studyTitle,note.note,archiveSceneLabels[note.study?.scene]||'其他来源']));
 const limit=Math.max(24,Math.floor(Number(state.notebookLimit)||24)),sources=[...new Set(notes.map(note=>note.study?.scene||'other'))];
 return {matches,shown:matches.slice(0,limit),limit,total:notes.length,sources,written:notes.filter(note=>note.note?.trim()).length};
}
