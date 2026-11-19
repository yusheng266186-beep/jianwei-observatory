'use strict';

const {mathjax}=require('mathjax-full/js/mathjax.js');
const {TeX}=require('mathjax-full/js/input/tex.js');
const {AllPackages}=require('mathjax-full/js/input/tex/AllPackages.js');
const {liteAdaptor}=require('mathjax-full/js/adaptors/liteAdaptor.js');
const {RegisterHTMLHandler}=require('mathjax-full/js/handlers/html.js');
const {STATE}=require('mathjax-full/js/core/MathItem.js');

RegisterHTMLHandler(liteAdaptor());
// The source compiler needs no fonts, SVG output, browser or network loader.
// Proof trees need an output jax for layout and are outside this preflight.
const packages=AllPackages.filter(name=>!['noerrors','bussproofs'].includes(name));
const tex=new TeX({packages,formatError:(_jax,error)=>{throw error;}});
const document=mathjax.document('',{InputJax:tex});

module.exports=function texError(latex){
 try{
  tex.reset();
  document.convert(latex,{display:false,end:STATE.COMPILED});
  return null;
 }catch(error){
  if(typeof error.id!=='string')throw error;
  if(error.id==='UnknownEnv'&&/\\begin\{prooftree\}/.test(latex))return null;
  return error.id;
 }
};
