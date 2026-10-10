import {mergeDatasets,FLAT_FIELDS} from './parser.js';
import {esc,button,badge} from '../ui/html.js';
export class Inbox {
  constructor(commit,notify,current) {
    this.commit=commit;this.notify=notify;this.current=current;
    this.dialog=document.getElementById('inbox');this.content=document.getElementById('inbox-content');this.input=document.getElementById('files');
    this.input.addEventListener('change',()=>{if(this.input.files.length)this.read([...this.input.files]);});
    this.dialog.addEventListener('cancel',event=>{event.preventDefault();this.cancel();});
    this.dialog.addEventListener('click',async event=>{
      const target=event.target.closest('[data-inbox]');if(!target)return;
      if(target.dataset.inbox==='close'){this.cancel();return;}
      if(target.dataset.inbox==='commit') {
        target.disabled=true;
        try{await this.commit(this.incoming,target.dataset.mode);this.dialog.close();this.incoming=null;}catch(error){this.error(error.message);}
      }
    });
    this.dialog.addEventListener('submit',event=>{
      const form=event.target;if(!form.matches('[data-mapping]'))return;event.preventDefault();
      const data=new FormData(form),mapping=Object.fromEntries(FLAT_FIELDS.map(([key])=>[key,data.get(key)===''||data.get(key)===null?null:Number(data.get(key))]));
      if(mapping.name===null||mapping.classNo===null){this.notify('请对应姓名和班级两列');return;}
      this.progress(this.pending.file.name,'根据列对应读取材料',15);
      this.pending.worker.postMessage({buffer:this.pending.buffer,name:this.pending.file.name,mapping});
    });
    this.dialog.addEventListener('change',event=>{
      if(!event.target.matches('[data-map-label]'))return;
      event.target.closest('details').querySelector('summary span').textContent=event.target.dataset.mapLabel;
    });
    document.addEventListener('dragover',event=>{const zone=event.target.closest('#drop-zone');if(zone){event.preventDefault();zone.classList.add('dragover');}});
    document.addEventListener('dragleave',event=>event.target.closest('#drop-zone')?.classList.remove('dragover'));
    document.addEventListener('drop',event=>{if(event.target.closest('#drop-zone')){event.preventDefault();event.target.closest('#drop-zone').classList.remove('dragover');this.read([...event.dataTransfer.files]);}});
  }
  choose(){if(this.busy){this.dialog.showModal();return;}this.input.click();}
  cancel(){this.cancelled=true;this.pending?.worker.terminate();this.pending?.reject(new Error('已取消导入'));this.pending=null;this.dialog.close();this.input.value='';}
  shell(body){if(!this.dialog.open)this.dialog.showModal();this.content.innerHTML='<div class="inbox-top"><span class="overline">材料入口 / 本机读取</span><button class="button icon-only" data-inbox="close" aria-label="关闭导入">×</button></div>'+body;}
  progress(name,message,percent){this.shell('<h2>正在展开教学材料</h2><p>'+esc(name)+'</p><div class="import-meter"><i style="width:'+percent+'%"></i></div><p>'+esc(message)+'</p>');}
  error(message){this.shell('<h2>材料尚未加入工作区</h2><p>'+esc(message)+'</p><button class="button outline" data-inbox="close">回到工作区</button>');}
  mapping(meta,pending) {
    this.pending=pending;
    const fields=FLAT_FIELDS.map(([key,label],index)=>{
      const selected=meta.mapping[key]??'';
      const columns=[['','不使用此列'],...meta.headers.map((header,i)=>[i,(i+1)+' · '+(header||'未命名列')])];
      return '<details class="mapping-field" '+(index<2?'open':'')+'><summary>'+esc(label)+'<span>'+esc(columns.find(([id])=>String(id)===String(selected))?.[1]||'不使用此列')+'</span></summary><div class="mapping-columns">'+columns.map(([id,text])=>'<label><input type="radio" name="'+key+'" value="'+id+'" data-map-label="'+esc(text)+'" '+(String(id)===String(selected)?'checked':'')+'><span>'+esc(text)+'</span></label>').join('')+'</div></details>';
    }).join('');
    this.shell('<h2>每一列，对应什么？</h2><p>点选姓名与班级列，其余字段按需展开。没有的成绩列保持空白。</p><form data-mapping>'+fields+'<button class="button accent" type="submit">按这些列继续读取</button></form>');
  }
  async file(file) {
    const buffer=await file.arrayBuffer();
    return new Promise((resolve,reject)=>{
      const worker=new Worker(new URL('./worker.js',import.meta.url)),timer=setTimeout(()=>finish(new Error('文件读取超时，请分开导入材料后重试。')),180000);
      let finished=false;
      const finish=(error,result)=>{if(finished)return;finished=true;clearTimeout(timer);worker.terminate();this.pending=null;error?reject(error):resolve(result);};
      this.pending={file,buffer,worker,reject:error=>finish(error)};
      worker.onerror=()=>finish(new Error('读取组件启动失败，请重新选择文件。'));
      worker.onmessage=({data:message})=>{
        if(message.type==='progress')this.progress(file.name,message.message,message.percent);
        if(message.type==='mapping')this.mapping(message,{file,buffer,worker,reject:error=>finish(error)});
        if(message.type==='ready')finish(null,message.dataset);
        if(message.type==='error')finish(new Error(message.message));
      };
      worker.postMessage({buffer,name:file.name});
    });
  }
  async read(files) {
    if(this.busy){this.notify('当前材料仍在读取');return;}
    files=files.filter(file=>/\.(xlsx|xls|csv|json)$/i.test(file.name));if(!files.length)return;
    this.busy=true;this.cancelled=false;this.incoming=null;
    try {
      for(const file of files) {
        this.progress(file.name,'打开工作簿',3);const incoming=await this.file(file);
        this.incoming=this.incoming?mergeDatasets(this.incoming,incoming):incoming;
      }
      if(this.cancelled)return;
      const d=this.incoming,replace=this.current().anonymous&&!d.anonymous;
      this.shell('<h2>材料已经展开</h2><p>'+files.map(f=>esc(f.name)).join('<br>')+'</p><div class="import-summary"><div><strong>'+d.students.length+'</strong><span>学生档案</span></div><div><strong>'+d.exams.length+'</strong><span>考试</span></div><div><strong>'+d.scores.length+'</strong><span>成绩记录</span></div><div><strong>'+d.answers.length+'</strong><span>小题学科记录</span></div></div><p>'+ (replace?'当前是匿名样本，导入真实成绩将建立真实工作区。':'合并会按姓名、考次、班级与学科补充记录；替换会建立新工作区，可在资料仓撤回。')+'</p><div class="import-decisions"><button class="button '+(replace?'outline':'accent')+'" data-inbox="commit" data-mode="merge">合并材料 / 补充考次</button><button class="button '+(replace?'accent':'outline')+'" data-inbox="commit" data-mode="replace">替换为这份材料</button></div>');
    } catch(error) {if(!this.cancelled)this.error(error.message);}
    finally {this.busy=false;this.input.value='';}
  }
}
