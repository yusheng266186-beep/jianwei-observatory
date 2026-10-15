import {esc} from './html.js';

export function exerciseWheel(field,label,values,value,unit){
 return '<div class="exercise-number-picker" data-render-key="number-'+field+'"><span id="exercise-'+field+'-label">'+esc(label)+'</span><div class="exercise-wheel-shell"><div class="exercise-wheel" id="exercise-'+field+'-wheel" data-exercise-wheel="'+field+'" data-wheel-value="'+value+'" role="listbox" aria-labelledby="exercise-'+field+'-label" aria-activedescendant="exercise-'+field+'-value-'+value+'" tabindex="0">'+values.map(n=>'<div class="exercise-wheel-option" id="exercise-'+field+'-value-'+n+'" role="option" aria-selected="'+(n===value)+'" data-wheel-option="'+n+'">'+n+'<small>'+esc(unit)+'</small></div>').join('')+'</div><i class="exercise-wheel-selection" aria-hidden="true"></i></div></div>';
}

export function installExerciseWheels(root,onChange){
 let drag=null;
 const options=host=>[...host.querySelectorAll('[data-wheel-option]')];
 const stride=host=>host.querySelector('[data-wheel-option]')?.getBoundingClientRect().height||44;
 function select(host){const rows=options(host),index=Math.max(0,Math.min(rows.length-1,Math.round(host.scrollTop/stride(host)))),row=rows[index];if(!row)return;const value=Number(row.dataset.wheelOption);if(host.dataset.wheelValue!==String(value)){host.dataset.wheelValue=String(value);host.setAttribute('aria-activedescendant',row.id);for(const r of rows)r.setAttribute('aria-selected',String(r===row));onChange(host.dataset.exerciseWheel,value);}}
 function move(host,index,smooth=true){const rows=options(host);index=Math.max(0,Math.min(rows.length-1,index));host.scrollTo({top:index*stride(host),behavior:smooth&&!matchMedia('(prefers-reduced-motion: reduce)').matches?'smooth':'instant'});}
 root.addEventListener('scroll',event=>{const host=event.target;if(host.matches?.('[data-exercise-wheel]'))select(host);},{capture:true,passive:true});
 root.addEventListener('keydown',event=>{const host=event.target.closest('[data-exercise-wheel]');if(!host)return;const index=Math.round(host.scrollTop/stride(host)),next={ArrowDown:index+1,ArrowUp:index-1,PageDown:index+5,PageUp:index-5,Home:0,End:options(host).length-1}[event.key];if(next===undefined)return;event.preventDefault();move(host,next,false);select(host);});
 root.addEventListener('pointerdown',event=>{const host=event.target.closest('[data-exercise-wheel]');if(!host||event.pointerType!=='mouse'||event.button!==0)return;host.focus({preventScroll:true});drag={host,id:event.pointerId,y:event.clientY,top:host.scrollTop,moved:false};host.setPointerCapture(event.pointerId);host.classList.add('is-dragging');event.preventDefault();});
 root.addEventListener('pointermove',event=>{if(!drag||event.pointerId!==drag.id)return;const distance=drag.y-event.clientY;if(Math.abs(distance)>3)drag.moved=true;drag.host.scrollTop=drag.top+distance;select(drag.host);});
 const finish=event=>{if(!drag||event.pointerId!==drag.id)return;const {host,moved}=drag;drag=null;host.classList.remove('is-dragging');if(host.hasPointerCapture(event.pointerId))host.releasePointerCapture(event.pointerId);const row=document.elementFromPoint(event.clientX,event.clientY)?.closest('[data-wheel-option]');move(host,!moved&&row&&host.contains(row)?options(host).indexOf(row):Math.round(host.scrollTop/stride(host)));};
 root.addEventListener('pointerup',finish);root.addEventListener('pointercancel',finish);
 return {read(){const values={};for(const host of root.querySelectorAll('[data-exercise-wheel]')){select(host);values[host.dataset.exerciseWheel]=Number(host.dataset.wheelValue);}return values;},sync(){for(const host of root.querySelectorAll('[data-exercise-wheel]')){if(drag?.host===host)continue;const index=options(host).findIndex(row=>row.dataset.wheelOption===host.dataset.wheelValue);if(index>=0&&(!host.dataset.wheelReady||Math.round(host.scrollTop/stride(host))!==index)){move(host,index,false);}host.dataset.wheelReady='true';}}};
}
