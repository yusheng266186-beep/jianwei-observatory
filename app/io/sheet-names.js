// Excel names are at most 31 UTF-16 units, exclude reserved characters and
// must be unique ignoring case. Truncation keeps Unicode characters intact.
const truncate=(text,limit)=>{let result='';for(const char of text){if(result.length+char.length>limit)break;result+=char;}return result;};
export function worksheetNames(labels) {
  const used=new Set();
  return labels.map(label=>{
    const base=String(label).replace(/[\x00-\x1f\x7f\[\]:*?/\\]/g,' ').trim().replace(/^'+|'+$/g,'').trim()||'工作表';
    let name=truncate(base,31),copy=1;
    while(used.has(name.toLowerCase())){const suffix=' ('+(++copy)+')';name=truncate(base,31-suffix.length)+suffix;}
    used.add(name.toLowerCase());return name;
  });
}
