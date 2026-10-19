import test from 'node:test';import assert from 'node:assert/strict';
import config from '../tools/training-image-config.cjs';
test('部署配置保留全部生图服务的独立凭据，不把猎豹原生接口误用为ByteCat密钥',()=>{
 const all=config.imageServiceConfig(['bytecat-image','cheetah-image2-native','cheetah-image25','cheetah-image']);
 assert.deepEqual(all.map(s=>s.credentialRef),['IMAGE_API_KEY','CHEETAH_IMAGE2_API_KEY','CHEETAH_IMAGE25_API_KEY','CHEETAH_IMAGE_API_KEY']);
 assert.deepEqual(all.map(s=>s.file),['image.key','cheetah-image2.key','cheetah-image25-canvas.key','cheetah-image.key']);
 for(const invalid of [[],null,['bytecat-image','bytecat-image'],['../image.key'],['https://attacker.test'],['__proto__']])assert.throws(()=>config.imageServiceConfig(invalid),/IMAGE_SERVICE_CONFIGURATION_INVALID/);
});
