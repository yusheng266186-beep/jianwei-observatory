// Narrow screens show report settings as an overlay above the paper. Keep the
// covered preview out of the tab order and move focus between the entry point
// and the panel; desktop keeps both columns readable side by side.
export const reportOverlayMode=(state,width)=>{
 if(!state?.settingsOpen||state.reading)return 'closed';
 return Number(width)<=1000?'overlay':'side';
};
export function createReportOverlayController({setInert,isOpen,isPanelFocused,focusPanel,focusTrigger}){
 let mode='closed',restore=false;
 function sync(next,{restoreFocus=true}={}){
  const previous=mode;mode=next;
  if(next==='overlay'){
   setInert(true);
   if(previous!=='overlay'){
    if(isOpen()&&!isPanelFocused()){focusPanel();restore=true;}
    else restore=false;
   }
   return;
  }
  setInert(false);
  if(previous==='overlay'&&next==='closed'&&restoreFocus&&restore&&isOpen())focusTrigger();
  restore=false;
 }
 function reset(){mode='closed';restore=false;setInert(false);}
 return {sync,reset,get mode(){return mode;}};
}
