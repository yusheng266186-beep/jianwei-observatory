// A one-second ticker is only useful while a visible exercise-center card has
// a live task. Stop it when the center is hidden/unmounted or nothing is pending.
export function createCenterTicker({tick,needed,visible=()=>true,mounted=()=>true,interval=1000,setTimeoutFn=setTimeout,clearTimeoutFn=clearTimeout}={}){
 let timer=null;
 const ready=()=>Boolean(needed()&&visible()&&mounted());
 function run(){
  timer=null;
  if(!ready())return;
  tick();
  if(ready())arm();
 }
 function arm(){if(timer===null&&ready())timer=setTimeoutFn(run,interval);}
 function stop(){if(timer!==null)clearTimeoutFn(timer);timer=null;}
 function sync(){if(!ready()){stop();return false;}arm();return true;}
 return {sync,stop,run,get running(){return timer!==null;}};
}
