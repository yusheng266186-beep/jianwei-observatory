import {preference,remember} from './workspace.js?v=runtime-v42';

// A synchronous draft survives refresh before an IndexedDB write can finish.
export class NoteJournal {
  constructor() {
    const saved=preference('noteDrafts',{});
    this.drafts=Object.assign(Object.create(null),saved&&typeof saved==='object'&&!Array.isArray(saved)?saved:{});
    this.persistedIds=new Set();
  }
  restore(notebook) {
    this.persistedIds=new Set(notebook.map(note=>note.id));
    for(const [id,draft] of Object.entries(this.drafts)) {
      if(!draft||typeof draft.note!=='string')continue;
      const note=notebook.find(note=>note.id===id);
      if(note)note.note=draft.note;
      else if(draft.report?.id===id)notebook.unshift({...structuredClone(draft.report),note:draft.note});
    }
    return notebook;
  }
  record(note) {
    const draft={note:note.note||''};
    if(!this.persistedIds.has(note.id))draft.report=this.drafts[note.id]?.report||structuredClone(note);
    this.drafts[note.id]=draft;return remember('noteDrafts',this.drafts);
  }
  persisted(notebook) {
    for(const note of notebook){this.persistedIds.add(note.id);if(this.drafts[note.id]?.note===(note.note||''))delete this.drafts[note.id];}
    remember('noteDrafts',this.drafts);
  }
  reset(notebook) {this.drafts=Object.create(null);this.persistedIds=new Set(notebook.map(note=>note.id));remember('noteDrafts',this.drafts);}
  remove(id) {delete this.drafts[id];remember('noteDrafts',this.drafts);}
}
