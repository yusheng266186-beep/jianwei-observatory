'use strict';
const {routes}=require('../backend/image-providers.cjs');
// Deployment credentials are selected from fixed files outside the repository.
const files={
 'bytecat-image':'image.key',
 'cheetah-image':'cheetah-image.key',
 'cheetah-image2-native':'cheetah-image2.key',
 'cheetah-image25':'cheetah-image25-canvas.key'
};
function imageServiceConfig(ids){
 if(!Array.isArray(ids)||!ids.length||new Set(ids).size!==ids.length||ids.some(id=>typeof id!=='string'||!Object.hasOwn(files,id)||!Object.hasOwn(routes,id)))throw Error('IMAGE_SERVICE_CONFIGURATION_INVALID');
 return ids.map(id=>({id,file:files[id],credentialRef:routes[id].credentialRef}));
}
module.exports={imageServiceConfig};
