'use strict';

// Only the displayable text of top-level assistant frames leaves the CLI.
// Final result framing and validation stay in the account bridge.
function createWorkbuddyDeltas(onDelta){
 let thought='',draft='';
 function append(field,value){
  if(typeof value!=='string'||!value)return;
  if(field==='reasoning_content')thought+=value;
  else draft+=value;
  onDelta({[field]:value});
 }
 function finishBlock(field,seen,parts){
  if(seen&&parts.length===1&&seen.endsWith(parts[0]))return;
  const full=parts.join('');
  // A streamed block may be followed by its completed assistant snapshot.
  if(full.startsWith(seen))append(field,full.slice(seen.length));
 }
 return frame=>{
  if(frame?.parent_tool_use_id)return;
  if(frame?.type==='stream_event'){
   const event=frame.event;
   if(event?.type==='message_start'){
    if(draft)onDelta({preview_reset:true});
    thought='';draft='';
   }else if(event?.type==='content_block_start'){
    const part=event.content_block;
    if(part?.type==='thinking')append('reasoning_content',part.thinking);
    if(part?.type==='text')append('preview_content',part.text);
   }else if(event?.type==='content_block_delta'){
    const delta=event.delta;
    if(delta?.type==='thinking_delta')append('reasoning_content',delta.thinking);
    if(delta?.type==='text_delta')append('preview_content',delta.text);
   }
   return;
  }
  if(frame?.type!=='assistant'||frame.message?.role!=='assistant'||!Array.isArray(frame.message.content))return;
  const thinking=[],text=[];
  for(const part of frame.message.content){
   if(part?.type==='thinking'&&typeof part.thinking==='string')thinking.push(part.thinking);
   if(part?.type==='text'&&typeof part.text==='string')text.push(part.text);
  }
  finishBlock('reasoning_content',thought,thinking);
  finishBlock('preview_content',draft,text);
 };
}

module.exports={createWorkbuddyDeltas};
