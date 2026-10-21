'use strict';
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),target='assets/downloads/jianwei-auth-helper-macos.zip';
const crc32=buffer=>{let crc=0xffffffff;for(const byte of buffer){crc^=byte;for(let bit=0;bit<8;bit++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return (crc^0xffffffff)>>>0;};
function archive(base=root){
 const blocks=[],central=[];let offset=0;
 for(const [source,name,mode]of [['openai-auth-assistant.cjs','openai-auth-assistant.cjs',0o100644],['openai-auth-assistant.command','启动授权助手.command',0o100755]]){
  const bytes=fs.readFileSync(path.join(base,'tools',source)),compressed=bytes,filename=Buffer.from('jianwei-auth-assistant/'+name),crc=crc32(bytes),date=(46<<9)|(10<<5)|21;
  const local=Buffer.alloc(30);local.writeUInt32LE(0x04034b50);local.writeUInt16LE(20,4);local.writeUInt16LE(0x800,6);local.writeUInt16LE(0,8);local.writeUInt16LE(date,12);local.writeUInt32LE(crc,14);local.writeUInt32LE(compressed.length,18);local.writeUInt32LE(bytes.length,22);local.writeUInt16LE(filename.length,26);blocks.push(local,filename,compressed);
  const item=Buffer.alloc(46);item.writeUInt32LE(0x02014b50);item.writeUInt16LE(0x314,4);item.writeUInt16LE(20,6);item.writeUInt16LE(0x800,8);item.writeUInt16LE(0,10);item.writeUInt16LE(date,14);item.writeUInt32LE(crc,16);item.writeUInt32LE(compressed.length,20);item.writeUInt32LE(bytes.length,24);item.writeUInt16LE(filename.length,28);item.writeUInt32LE((mode<<16)>>>0,38);item.writeUInt32LE(offset,42);central.push(item,filename);offset+=local.length+filename.length+compressed.length;
 }
 const directory=Buffer.concat(central),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(2,8);end.writeUInt16LE(2,10);end.writeUInt32LE(directory.length,12);end.writeUInt32LE(offset,16);return Buffer.concat([...blocks,directory,end]);
}
function write(bytes,base=root){const file=path.join(base,target);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,bytes);return file;}
if(require.main===module){const bytes=archive();if(process.argv.includes('--check')){if(!fs.existsSync(path.join(root,target))||!fs.readFileSync(path.join(root,target)).equals(bytes))throw Error('AUTH_ASSISTANT_ARCHIVE_DIFFERS');}else write(bytes);console.log('Authorization assistant archive verified.');}
module.exports={archive,write,target};
