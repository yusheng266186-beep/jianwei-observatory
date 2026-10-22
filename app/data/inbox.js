import {access,update} from './storage.js';
import {importTemplates,matchImportTemplate,saveImportTemplate,validImportMapping,mergeImportTemplates} from './import-templates.js';
import {openSurface,closeSurface} from '../ui/surface-motion.js?v=runtime-v45';
import {mergeDatasets,FLAT_FIELDS} from './parser.js?v=runtime-v45';
import {esc,button,badge} from '../ui/html.js?v=runtime-v45';
import {importerURL} from './importer-entry.js';
import {importDecisionsComplete,resolveImportConflicts} from './import-conflicts.js';
import {importConflictsHTML} from '../ui/import-conflicts.js';
export class Inbox {
  constructor(commit,notify,current,prepare=()=>{},warmWorker=null) {
    this.warmWorker=warmWorker;
    this.prepare=prepare;
    this.commit=commit;this.notify=notify;this.current=current;this.epoch=0;this.committing=false;
    this.dialog=document.getElementById('inbox');this.content=document.getElementById('inbox-content');this.input=document.getElementById('files');
    this.input.addEventListener('change',()=>{if(this.input.files.length)this.read([...this.input.files]);});
    this.dialog.addEventListener('cancel',event=>{event.preventDefault();this.cancel();});
    this.dialog.addEventListener('click',async event=>{
      const target=event.target.closest('[data-inbox]');if(!target)return;
      if(target.dataset.inbox==='close'){this.cancel();return;}
      if(target.dataset.inbox==='forget-mapping'&&this.mappingMeta){const meta=this.mappingMeta,pending=this.pending;try{await update('importColumnTemplates',rows=>importTemplates(rows).filter(r=>r.id!==JSON.stringify(meta.headers)));if(this.pending===pending){await this.mapping(meta,pending);this.notify('已移除这份表头的列对应，下次将重新识别');}}catch{this.notify('列对应尚未移除，请重试');}return;}
      if(target.dataset.inbox==='resolve'&&this.incoming){const index=target.dataset.index;if(index==='all')this.choices=this.incoming.importConflicts.map(()=>target.dataset.value);else this.choices[Number(index)]=target.dataset.value;this.preview();return;}
      if(target.dataset.inbox==='commit') {
        if(this.committing||this.busy||!this.incoming)return;
        if(!importDecisionsComplete(this.incoming,this.choices||[])){this.notify('请先确认重复记录，再加入工作区。');return;}
        const incoming=resolveImportConflicts(this.incoming,this.choices||[]);
        this.committing=true;
        this.progress(this.incoming.sourceName||'本次教学材料','正在建立分析索引并保存到本机',98);
        for(const button of this.content.querySelectorAll('[data-inbox]'))button.disabled=true;
        try{await this.commit(incoming,target.dataset.mode);await closeSurface(this.dialog);this.incoming=null;}catch(error){this.error(error.message);}
        finally{this.committing=false;}
      }
    });
    this.dialog.addEventListener('submit',event=>{
      const form=event.target;if(!form.matches('[data-mapping]'))return;event.preventDefault();
      if(!this.pending||this.committing||this.cancelled)return;
      const data=new FormData(form),mapping=Object.fromEntries(FLAT_FIELDS.map(([key])=>[key,data.get(key)===''||data.get(key)===null?null:Number(data.get(key))]));
      if(!validImportMapping(this.mappingMeta?.headers||[],mapping)){this.notify('请为姓名与班级选择不同的有效列');return;}
      this.mappingToSave=form.querySelector('[data-save-mapping]')?.checked?{headers:this.mappingMeta.headers,mapping,name:this.pending.file.name}:null;
      this.progress(this.pending.file.name,'根据列对应读取材料',15);
      this.pending.worker.postMessage({mapping});
    });
    this.dialog.addEventListener('change',event=>{
      if(!event.target.matches('[data-map-label]'))return;
      event.target.closest('details').querySelector('summary span').textContent=event.target.dataset.mapLabel;
    });
    document.addEventListener('dragover',event=>{const zone=event.target.closest('#drop-zone');if(zone){event.preventDefault();zone.classList.add('dragover');}});
    document.addEventListener('dragleave',event=>event.target.closest('#drop-zone')?.classList.remove('dragover'));
    document.addEventListener('drop',event=>{if(event.target.closest('#drop-zone')){event.preventDefault();event.target.closest('#drop-zone').classList.remove('dragover');this.read([...event.dataTransfer.files]);}});
  }
  choose(){if(this.busy||this.committing){if(!this.dialog.open)openSurface(this.dialog);return;}this.input.click();}
  cancel(){if(this.committing){this.notify('材料正在加入，完成后即可关闭');return;}this.cancelled=true;this.epoch++;this.pending?.worker.terminate();this.pending?.reject(new Error('已取消导入'));this.pending=null;this.busy=false;this.incoming=null;closeSurface(this.dialog);this.input.value='';}
  shell(body){openSurface(this.dialog);this.content.innerHTML='<div class="inbox-top"><span class="overline">材料入口 / 本机读取</span><button class="button icon-only" data-inbox="close" aria-label="关闭导入">×</button></div>'+body;}
  progress(name,message,percent){this.shell('<h2>正在展开教学材料</h2><p>'+esc(name)+'</p><div class="import-meter" role="progressbar" aria-label="本机材料处理" aria-valuemin="0" aria-valuemax="100" aria-valuenow="'+percent+'" aria-valuetext="'+esc(message)+'"><i style="width:'+percent+'%"></i></div><p>'+esc(message)+'</p>');}
  preview(){const slot=this.content.querySelector('[data-import-review]');if(slot){slot.innerHTML=importConflictsHTML(this.incoming,this.choices||[]);for(const button of this.content.querySelectorAll('[data-inbox="commit"]'))button.disabled=!importDecisionsComplete(this.incoming,this.choices||[]);}}
  error(message){this.shell('<h2>材料尚未加入工作区</h2><p>'+esc(message)+'</p><button class="button outline" data-inbox="close">回到工作区</button>');}
  async mapping(meta,pending) {
    this.pending=pending;this.mappingMeta=meta;this.mappingToSave=null;
    let saved=null;try{saved=matchImportTemplate(await access('importColumnTemplates'),meta.headers);}catch{}
    if(this.pending!==pending||this.cancelled)return;
    const mapping=saved?.mapping||meta.mapping;
    const fields=FLAT_FIELDS.map(([key,label],index)=>{
      const selected=mapping[key]??'';
      const columns=[['','不使用此列'],...meta.headers.map((header,i)=>[i,(i+1)+' · '+(header||'未命名列')])];
      return '<details class="mapping-field" '+(['name','classNo'].includes(key)?'open':'')+'><summary>'+esc(label)+'<span>'+esc(columns.find(([id])=>String(id)===String(selected))?.[1]||'不使用此列')+'</span></summary><div class="mapping-columns">'+columns.map(([id,text])=>'<label><input type="radio" name="'+key+'" value="'+id+'" data-map-label="'+esc(text)+'" '+(String(id)===String(selected)?'checked':'')+'><span>'+esc(text)+'</span></label>').join('')+'</div></details>';
    }).join('');
    const ranking=FLAT_FIELDS.filter(([key])=>['cityRank','schoolRank','classRank'].includes(key)&&mapping[key]!=null).map(([key,label])=>label+'：'+meta.headers[mapping[key]]);
    this.shell('<h2>每一列，对应什么？</h2><p>点选姓名与班级列，其余字段按需展开。没有的成绩列保持空白。</p>'+(ranking.length?'<p class="report-help">已对应 '+esc(ranking.join('；'))+'。同一范围优先赋分排名，其次通用排名，再次原分排名；可在下方调整。</p>':'')+(saved?'<div class="mapping-template-note"><span>已套用 <b>'+esc(saved.name)+'</b> 的列对应，请核对后继续。</span><button type="button" class="button quiet" data-inbox="forget-mapping">移除已存对应</button></div>':'')+'<form data-mapping>'+fields+'<label class="mapping-save"><input type="checkbox" data-save-mapping checked><span>记住这次列对应<small>下次遇到相同表头时套用，仍可在这里调整。</small></span></label><button class="button accent" type="submit">按这些列继续读取</button></form>');
  }
  async file(file,epoch) {
    if(epoch!==this.epoch)throw new Error('已取消导入');
    this.mappingMeta=null;this.mappingToSave=null;
    return new Promise((resolve,reject)=>{
      const worker=this.warmWorker||new Worker(importerURL),timer=setTimeout(()=>finish(new Error('文件读取超时，请分开导入材料后重试。')),180000);this.warmWorker=null;
      let finished=false;
      const finish=(error,result)=>{if(finished)return;finished=true;clearTimeout(timer);worker.onmessage=null;worker.onerror=null;if(error)worker.terminate();else this.warmWorker=worker;if(this.pending?.worker===worker)this.pending=null;error?reject(error):resolve(result);};
      this.pending={file,worker,reject:error=>finish(error)};
      worker.onerror=()=>finish(new Error('读取组件启动失败，请重新选择文件。'));
      worker.onmessage=async({data:message})=>{
        if(epoch!==this.epoch){finish(new Error('已取消导入'));return;}
        if(message.type==='progress')this.progress(file.name,message.message,message.percent);
        if(message.type==='mapping')await this.mapping(message,{file,worker,reject:error=>finish(error)});
        if(message.type==='ready'){const saved=this.mappingToSave;this.mappingToSave=null;if(saved){try{await update('importColumnTemplates',rows=>saveImportTemplate(rows,saved));}catch{this.notify('成绩已读取，列对应模板未能保存，本次可继续导入');}}finish(null,message.dataset);}
        if(message.type==='error')finish(new Error(message.message));
      };
      worker.postMessage({file,name:file.name});
    });
  }
  async read(files) {
    if(this.busy||this.committing){this.notify('当前材料仍在处理');return;}
    const supplied=[...files],skipped=supplied.filter(file=>! /\.(xlsx|xls|csv|json)$/i.test(file.name));files=supplied.filter(file=>/\.(xlsx|xls|csv|json)$/i.test(file.name));
    if(!files.length){if(supplied.length)this.notify('暂不支持这类文件，请选择 Excel（.xlsx、.xls）、CSV 或 JSON 备份。');if(this.input)this.input.value='';return;}
    const skippedText=skipped.length?'已跳过 '+skipped.length+' 个不支持的文件：'+skipped.slice(0,3).map(f=>f.name).join('、')+(skipped.length>3?' 等':'')+'。支持 .xlsx、.xls、.csv、.json。':'';
    if(skippedText)this.notify(skippedText);
    this.prepare();
    const epoch=++this.epoch;this.busy=true;this.cancelled=false;this.incoming=null;this.choices=[];
    try {
      let importedTemplates=null;
      for(const file of files) {
        this.progress(file.name,'打开工作簿',3);const incoming=await this.file(file,epoch);
        if(epoch!==this.epoch)return;
        if(Array.isArray(incoming.importColumnTemplates))importedTemplates=mergeImportTemplates(importedTemplates,incoming.importColumnTemplates);
        this.incoming=this.incoming?mergeDatasets(this.incoming,incoming):incoming;
      }
      if(epoch!==this.epoch)return;
      if(importedTemplates)this.incoming.importColumnTemplates=importedTemplates;
      const d=this.incoming,current=this.current(),first=!current.scores.length&&!current.answers.length&&!current.lines.length&&!Object.keys(current.banks).length,replace=current.anonymous&&!d.anonymous;
      const detail=first?'加入工作区后，开始查看这份材料的成绩与分析。':replace?'当前材料使用匿名姓名，导入真实成绩将建立真实工作区。':'合并优先匹配学生识别码，结合姓名、考次、班级与学科补充，空白保留旧值，实际0更新；小题按题号对应。需要清除旧数据时请选择替换，可在资料仓撤回。';
      const actions=first?'<button class="button accent" data-inbox="commit" data-mode="replace">加入工作区</button>':'<button class="button '+(replace?'outline':'accent')+'" data-inbox="commit" data-mode="merge">合并材料 / 补充考次</button><button class="button '+(replace?'accent':'outline')+'" data-inbox="commit" data-mode="replace">替换为这份材料</button>';
      const excluded=d.importReport?.school?.excludedRows||0;
      this.shell('<h2>材料已经展开</h2><p>'+files.map(f=>esc(f.name)).join('<br>')+'</p>'+(skippedText?'<p role="status">'+esc(skippedText)+'</p>':'')+'<div class="import-summary"><div><strong>'+d.students.length+'</strong><span>学生档案</span></div><div><strong>'+d.exams.length+'</strong><span>考试</span></div><div><strong>'+d.scores.length+'</strong><span>成绩记录</span></div><div><strong>'+d.answers.length+'</strong><span>小题学科记录</span></div></div>'+(excluded?'<p>本次仅导入本校材料，已排除 '+excluded+' 条其他学校记录。</p>':'')+'<div data-import-review></div><p>'+detail+'</p><div class="import-decisions">'+actions+'</div>');this.preview();
    } catch(error) {if(epoch===this.epoch)this.error(error.message);}
    finally {if(epoch===this.epoch){this.warmWorker?.terminate();this.warmWorker=null;this.busy=false;this.input.value='';}}
  }
}
