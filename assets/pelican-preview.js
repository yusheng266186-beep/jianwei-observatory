// Trusted viewer bridge. Model HTML only runs in a second opaque-origin frame.
// Kept separate so the workbench retains its strict no-inline-script policy.
(()=>{
 const id=location.hash.slice(1),hostOrigin=new URL(location.href).origin,frame=document.getElementById('document');
 const policy="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src 'none'; frame-src 'none'; child-src 'none'; worker-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; webrtc 'block'";
 const guard="(()=>{const blocked=['RTCPeerConnection','webkitRTCPeerConnection','mozRTCPeerConnection','RTCDataChannel','WebTransport'];for(const name of blocked)try{Object.defineProperty(globalThis,name,{value:undefined,writable:false,configurable:false})}catch{}for(const name of ['alert','confirm','prompt','print','open'])try{Object.defineProperty(globalThis,name,{value:()=>undefined,writable:false,configurable:false})}catch{}})();";
 addEventListener('message',event=>{
  if(event.source!==parent||event.origin!==hostOrigin||event.data?.type!=='jianwei-pelican-render'||event.data.id!==id||typeof event.data.html!=='string')return;
  const fit=/^\s*<svg\b/i.test(event.data.html)?'<style>html,body{width:100%;height:100%;margin:0;overflow:hidden}body>svg{display:block;width:100%;height:100%;object-fit:contain}</style>':'';
  frame.srcdoc='<!doctype html><meta http-equiv="Content-Security-Policy" content="'+policy+'"><meta name="referrer" content="no-referrer"><script>'+guard+'</script>'+fit+event.data.html;
 });
 parent.postMessage({type:'jianwei-pelican-viewer-ready',id},'*');
})();
