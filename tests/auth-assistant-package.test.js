import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';
import pack from '../tools/package-auth-assistant.cjs';
test('授权助手下载包包含当前源码和可执行启动器，不依赖已安装的第三方npm包',()=>{
 const bytes=pack.archive();assert(bytes.equals(pack.archive()));let offset=0;const files=new Map();
 while(bytes.readUInt32LE(offset)===0x04034b50){const size=bytes.readUInt32LE(offset+18),nameSize=bytes.readUInt16LE(offset+26),extra=bytes.readUInt16LE(offset+28),name=bytes.subarray(offset+30,offset+30+nameSize).toString(),start=offset+30+nameSize+extra;files.set(name,bytes.subarray(start,start+size));offset=start+size;}
 assert.equal(files.size,2);assert.equal(bytes.readUInt32LE(offset),0x02014b50);assert(files.get('jianwei-auth-assistant/openai-auth-assistant.cjs').equals(fs.readFileSync(new URL('../tools/openai-auth-assistant.cjs',import.meta.url))));assert(files.get('jianwei-auth-assistant/启动授权助手.command').equals(fs.readFileSync(new URL('../tools/openai-auth-assistant.command',import.meta.url))));
 assert.equal(bytes.readUInt32LE(bytes.length-22),0x06054b50);assert.equal(bytes.readUInt16LE(bytes.length-14),2);
});
