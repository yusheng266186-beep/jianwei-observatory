import {preference,remember} from './workspace.js?v=runtime-v45';

// Text typed into a judgment is journaled immediately. A full report body is
// written only when the unsaved draft is first created, and later flushed with
// the debounced notebook save. This keeps every keystroke recoverable without
// serializing a large journal report on every input event.
const TEXT_KEY='noteDraftText';
const object = value => value && typeof value==='object'&&!Array.isArray(value)?value:{};
export class NoteJournal {
  constructor() {
    this.drafts=object(preference('noteDrafts',{}));
    this.textDrafts=object(preference(TEXT_KEY,{}));
    this.persistedIds=new Set();
  }
  restore(notebook) {
    this.persistedIds=new Set(notebook.map(note=>note.id));
    for(const id of new Set([...Object.keys(this.drafts),...Object.keys(this.textDrafts)])) {
      const draft=this.drafts[id],text=this.textDrafts[id],note=notebook.find(note=>note.id===id);
      if(typeof text==='string') {
        if(note)note.note=text;
        else if(draft?.report?.id===id)notebook.unshift({...structuredClone(draft.report),note:text});
      } else if(draft&&typeof draft.note==='string') {if(note)note.note=draft.note;else if(draft.report?.id===id)notebook.unshift({...structuredClone(draft.report),note:draft.note});}
    }
    return notebook;
  }
  record(note,{full=false}={}) {
    const previous=this.drafts[note.id],persisted=this.persistedIds.has(note.id);
    const draft={note:note.note||''};
    if(!persisted&&previous?.report)draft.report=previous.report;
    else if(!persisted)draft.report=structuredClone(note);
    const stored=object(preference('noteDrafts',{}));
    this.drafts={...stored,[note.id]:draft};
    const text={...object(preference(TEXT_KEY,{})),[note.id]:draft.note};
    this.textDrafts=text;
    const firstBody=!persisted&&!previous?.report;
    const bodySaved=!(full||firstBody)||remember('noteDrafts',this.drafts);
    return remember(TEXT_KEY,text)&&bodySaved;
  }
  flush(){return remember('noteDrafts',this.drafts);}
  persisted(notebook) {
    const stored=object(preference('noteDrafts',{})),text=object(preference(TEXT_KEY,{}));
    this.persistedIds=new Set(notebook.map(note=>note.id));
    for(const note of notebook) {
      const value=note.note||'';
      if(stored[note.id]&&(stored[note.id].note||'')===value)delete stored[note.id];
      if(text[note.id]===value)delete text[note.id];
    }
    this.drafts=stored;this.textDrafts=text;
    remember('noteDrafts',stored);remember(TEXT_KEY,text);
  }
  remap(remaps=[]) {
    const stored=object(preference('noteDrafts',{})),text=object(preference(TEXT_KEY,{}));
    for(const [from,to] of remaps) {
      if(!to||from===to)continue;
      const own=this.drafts[from]?.note;
      if(stored[from]&&!stored[to]&&stored[from].note===own){stored[to]=structuredClone(stored[from]);if(stored[to].report)stored[to].report.id=to;delete stored[from];}
      if(typeof text[from]==='string'&&text[from]===own&&text[to]===undefined){text[to]=text[from];delete text[from];}
    }
    this.drafts=stored;this.textDrafts=text;
    remember('noteDrafts',stored);remember(TEXT_KEY,text);
  }
  reset(notebook) {
    this.drafts=Object.create(null);this.textDrafts=Object.create(null);
    this.persistedIds=new Set(notebook.map(note=>note.id));
    remember('noteDrafts',this.drafts);remember(TEXT_KEY,this.textDrafts);
  }
  remove(id) {
    const stored=object(preference('noteDrafts',{})),text=object(preference(TEXT_KEY,{}));
    delete stored[id];delete text[id];this.drafts=stored;this.textDrafts=text;
    remember('noteDrafts',stored);remember(TEXT_KEY,text);
  }
}
