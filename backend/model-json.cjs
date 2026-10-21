'use strict';
// Accept a complete JSON code fence without rewriting any document values.
// Do not extract arbitrary fragments, execute code, or guess broken escaping.
function parseModelJSON(source){
 if(typeof source!=='string')throw new SyntaxError('模型输出不是JSON文本。');
 const text=source.trim(),fence=text.match(/^```(?:json)?\s*\n([\s\S]*?)\n```$/i);
 return JSON.parse(fence?fence[1]:text);
}
module.exports={parseModelJSON};
