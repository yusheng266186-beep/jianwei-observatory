// Compile and validate completely before replacing release entries.
const {build}=require("./build-runtime-core.cjs");
require('./build-textbook-catalog.cjs').build();
const assistant=require('./package-auth-assistant.cjs');
const assistantArchive=assistant.archive();
build().then(result=>{assistant.write(assistantArchive);console.log(JSON.stringify({...result,authAssistantBytes:assistantArchive.length}));}).catch(error=>{console.error(error.message);process.exitCode=1;});
