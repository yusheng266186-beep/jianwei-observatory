'use strict';
// Bitmap services stay separate from text/SVG model catalogs and credentials.
const routes={
 'bytecat-image':{label:'ByteCat · 生图',base:'https://www.bytecatcode.org/v1',protocol:'chat-image',credentialRef:'IMAGE_API_KEY'},
 'cheetah-image':{label:'猎豹词元工厂 · 生图',base:'https://www.wefucke.top/v1',protocol:'chat-image',credentialRef:'CHEETAH_IMAGE_API_KEY'}
};
const defaultSelection={provider:'bytecat-image',model:'gpt-image-2'};
function configured(provider,env=process.env){let declared=[];try{declared=JSON.parse(env.TRAINING_CONFIGURED_IMAGE_PROVIDERS||'[]');}catch{}return !!env[routes[provider]?.credentialRef]||declared.includes(provider);}
function snapshot(selection=defaultSelection,env=process.env,{requireConfigured=false}={}){
 if(!selection||Object.keys(selection).some(k=>!['provider','model'].includes(k))||!routes[selection.provider]||selection.model!=='gpt-image-2')throw Object.assign(Error('MODEL_SELECTION_INVALID'),{status:400});
 if(requireConfigured&&!configured(selection.provider,env))throw Object.assign(Error('MODEL_NOT_CONFIGURED'),{status:400});
 return {...selection,...routes[selection.provider]};
}
function catalog(env=process.env){return Object.entries(routes).map(([id,r])=>({id,label:r.label,model:'gpt-image-2',name:'GPT Image 2',configured:configured(id,env)}));}
function connectionMatches(g){const r=routes[g?.provider];return !!r&&g.model==='gpt-image-2'&&g.base===r.base&&g.protocol===r.protocol&&g.credentialRef===r.credentialRef;}
module.exports={routes,defaultSelection,configured,snapshot,catalog,connectionMatches};
