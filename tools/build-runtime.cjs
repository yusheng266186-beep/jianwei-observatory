// Compile and validate completely before replacing release entries.
const {build}=require("./build-runtime-core.cjs");
build().then(result=>console.log(JSON.stringify(result))).catch(error=>{console.error(error.message);process.exitCode=1;});
