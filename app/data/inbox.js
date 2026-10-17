import {openSurface,closeSurface} from '../ui/surface-motion.js?v=runtime-v45';
import {mergeDatasets,FLAT_FIELDS} from './parser.js?v=runtime-v45';
import {esc,button,badge} from '../ui/html.js?v=runtime-v45';
import {importerURL} from './importer-entry.js';
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
      if(target.dataset.inbox==='commit') {
        if(this.committing||this.busy||!this.incoming)return;
        this.committing=true;for(const button of this.content.querySelectorAll('[data-inbox]'))button.disabled=true;
        this.progress(this.incoming.sourceName||'本次教学材料','正在建立分析索引并保存到本机',98);
        try{await this.commit(this.incoming,target.dataset.mode);await closeSurface(this.dialog);this.incoming=null;}catch(error){this.error(error.message);}
        finally{this.committing=false;}
      }
    });
    this.dialog.addEventListener('submit',event=>{
      const form=event.target;if(!form.matches('[data-mapping]'))return;event.preventDefault();
      if(!this.pending||this.committing||this.cancelled)return;
      const data=new FormData(form),mapping=Object.fromEntries(FLAT_FIELDS.map(([key])=>[key,data.get(key)===''||data.get(key)===null?null:Number(data.get(key))]));
      if(mapping.name===null||mapping.classNo===null){this.notify('请对应姓名和班级两列');return;}
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
  shell(body){if(!this.dialog.open)openSurface(this.dialog);this.content.innerHTML='<div class="inbox-top"><span class="overline">材料入口 / 本机读取</span><button class="button icon-only" data-inbox="close" aria-label="关闭导入">×</button></div>'+body;}
  progress(name,message,percent){this.shell('<h2>正在展开教学材料</h2><p>'+esc(name)+'</p><div class="import-meter" role="progressbar" aria-label="本机材料处理" aria-valuemin="0" aria-valuemax="100" aria-valuenow="'+percent+'" aria-valuetext="'+esc(message)+'"><i style="width:'+percent+'%"></i></div><p>'+esc(message)+'</p>');}
  error(message){this.shell('<h2>材料尚未加入工作区</h2><p>'+esc(message)+'</p><button class="button outline" data-inbox="close">回到工作区</button>');}
  mapping(meta,pending) {
    this.pending=pending;
    const fields=FLAT_FIELDS.map(([key,label],index)=>{
      const selected=meta.mapping[key]??'';
      const columns=[['','不使用此列'],...meta.headers.map((header,i)=>[i,(i+1)+' · '+(header||'未命名列')])];
      return '<details class="mapping-field" '+(['name','classNo'].includes(key)?'open':'')+'><summary>'+esc(label)+'<span>'+esc(columns.find(([id])=>String(id)===String(selected))?.[1]||'不使用此列')+'</span></summary><div class="mapping-columns">'+columns.map(([id,text])=>'<label><input type="radio" name="'+key+'" value="'+id+'" data-map-label="'+esc(text)+'" '+(String(id)===String(selected)?'checked':'')+'><span>'+esc(text)+'</span></label>').join('')+'</div></details>';
    }).join('');
    this.shell('<h2>每一列，对应什么？</h2><p>点选姓名与班级列，其余字段按需展开。没有的成绩列保持空白。</p><form data-mapping>'+fields+'<button class="button accent" type="submit">按这些列继续读取</button></form>');
  }
  async file(file,epoch) {
    if(epoch!==this.epoch)throw new Error('已取消导入');
    return new Promise((resolve,reject)=>{
      const worker=this.warmWorker||new Worker(importerURL),timer=setTimeout(()=>finish(new Error('文件读取超时，请分开导入材料后重试。')),180000);this.warmWorker=null;
      let finished=false;
      const finish=(error,result)=>{if(finished)return;finished=true;clearTimeout(timer);worker.onmessage=null;worker.onerror=null;if(error)worker.terminate();else this.warmWorker=worker;if(this.pending?.worker===worker)this.pending=null;error?reject(error):resolve(result);};
      this.pending={file,worker,reject:error=>finish(error)};
      worker.onerror=()=>finish(new Error('读取组件启动失败，请重新选择文件。'));
      worker.onmessage=({data:message})=>{
        if(epoch!==this.epoch){finish(new Error('已取消导入'));return;}
        if(message.type==='progress')this.progress(file.name,message.message,message.percent);
        if(message.type==='mapping')this.mapping(message,{file,worker,reject:error=>finish(error)});
        if(message.type==='ready')finish(null,message.dataset);
        if(message.type==='error')finish(new Error(message.message));
      };
      worker.postMessage({file,name:file.name});
    });
  }
  async read(files) {
    if(this.busy||this.committing){this.notify('当前材料仍在处理');return;}
    files=files.filter(file=>/\.(xlsx|xls|csv|json)$/i.test(file.name));if(!files.length)return;
    this.prepare();
    const epoch=++this.epoch;this.busy=true;this.cancelled=false;this.incoming=null;
    try {
      for(const file of files) {
        this.progress(file.name,'打开工作簿',3);const incoming=await this.file(file,epoch);
        if(epoch!==this.epoch)return;
        this.incoming=this.incoming?mergeDatasets(this.incoming,incoming):incoming;
      }
      if(epoch!==this.epoch)return;
      const d=this.incoming,current=this.current(),first=!current.scores.length&&!current.answers.length&&!current.lines.length&&!Object.keys(current.banks).length,replace=current.anonymous&&!d.anonymous;
      const detail=first?'加入工作区后，开始查看这份材料的成绩与分析。':replace?'当前材料使用匿名姓名，导入真实成绩将建立真实工作区。':'合并优先匹配学生识别码，结合姓名、考次、班级与学科补充，空白保留旧值，实际0更新；小题按题号对应。需要清除旧数据时请选择替换，可在资料仓撤回。';
      const actions=first?'<button class="button accent" data-inbox="commit" data-mode="replace">加入工作区</button>':'<button class="button '+(replace?'outline':'accent')+'" data-inbox="commit" data-mode="merge">合并材料 / 补充考次</button><button class="button '+(replace?'accent':'outline')+'" data-inbox="commit" data-mode="replace">替换为这份材料</button>';
      this.shell('<h2>材料已经展开</h2><p>'+files.map(f=>esc(f.name)).join('<br>')+'</p><div class="import-summary"><div><strong>'+d.students.length+'</strong><span>学生档案</span></div><div><strong>'+d.exams.length+'</strong><span>考试</span></div><div><strong>'+d.scores.length+'</strong><span>成绩记录</span></div><div><strong>'+d.answers.length+'</strong><span>小题学科记录</span></div></div><p>'+detail+'</p><div class="import-decisions">'+actions+'</div>');
    } catch(error) {if(epoch===this.epoch)this.error(error.message);}
    finally {if(epoch===this.epoch){this.warmWorker?.terminate();this.warmWorker=null;this.busy=false;this.input.value='';}}
  }
}
