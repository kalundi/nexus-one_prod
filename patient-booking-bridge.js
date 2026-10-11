(function(){
 if(new URLSearchParams(location.search).get('patientApp')!=='1'||window.parent===window)return;
 const send=data=>window.parent.postMessage(data,location.origin);
 document.addEventListener('click',event=>{
  const link=event.target.closest('a[href]');if(!link)return;
  const href=link.getAttribute('href');
  if(href.startsWith('/patient.html')){event.preventDefault();send({type:'nexus:patient-view',view:'profile'});}
  else if(href==='/'||href.startsWith('/livecare')){event.preventDefault();send({type:'nexus:patient-view',view:'home'});}
 },true);
 ['click','keydown','touchstart','scroll'].forEach(type=>document.addEventListener(type,()=>send({type:'nexus:patient-activity'}),{passive:true}));
})();
