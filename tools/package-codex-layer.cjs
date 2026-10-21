'use strict';
// Packages pinned official binaries only. Downloads, credentials and deployment
// are deliberately outside this reproducible packaging command.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{execFileSync}=require('node:child_process');
const release=require('../backend/codex-runtime-release.json');
const value=name=>{const i=process.argv.indexOf(name);return i<0?null:process.argv[i+1];};
const source=value('--package-dir'),output=value('--out');
if(!source||!output)throw Error('Usage: node tools/package-codex-layer.cjs --package-dir /path/to/package --out /path/to/layer.zip');
const vendor=path.join(path.resolve(source),'vendor',release.target),meta=JSON.parse(fs.readFileSync(path.join(vendor,'codex-package.json')));
if(meta.version!==release.version||meta.target!==release.target)throw Error('CODEX_PACKAGE_MISMATCH');
let unpackedBytes=0;const files=[];
for(const [file,expected]of Object.entries(release.files)){
 const source=path.join(vendor,file),data=fs.readFileSync(source),sha256=crypto.createHash('sha256').update(data).digest('hex');
 if(sha256!==expected)throw Error('CODEX_BINARY_CHECKSUM_MISMATCH');unpackedBytes+=data.length;files.push({source,target:'jianwei-codex/'+file,sha256,bytes:data.length});
}
if(unpackedBytes>450*1024*1024)throw Error('CODEX_LAYER_TOO_LARGE');
fs.mkdirSync(path.dirname(path.resolve(output)),{recursive:true});
execFileSync(value('--python')||'python3',['-c',[
 'import json,sys,zipfile',
 'items=json.loads(sys.argv[2])',
 'with zipfile.ZipFile(sys.argv[1],"w",zipfile.ZIP_DEFLATED,compresslevel=9) as z:',
 ' for item in items:',
 '  i=zipfile.ZipInfo(item["target"]);i.create_system=3;i.external_attr=0o755<<16;i.compress_type=zipfile.ZIP_DEFLATED',
 '  with open(item["source"],"rb") as f:z.writestr(i,f.read(),compresslevel=9)',
 ' z.writestr("jianwei-codex/RELEASE.json",sys.argv[3])'
].join('\n'),path.resolve(output),JSON.stringify(files),JSON.stringify(release)]);
const report={version:release.version,target:release.target,unpackedBytes,zipBytes:fs.statSync(output).size,sha256:crypto.createHash('sha256').update(fs.readFileSync(output)).digest('hex'),files:files.map(({source,...file})=>file)};
fs.writeFileSync(output+'.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
