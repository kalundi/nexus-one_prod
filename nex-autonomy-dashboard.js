(()=>{
 'use strict';
 const el=id=>document.getElementById(id);
 const status=msg=>{el('autonomyStatus').textContent=msg;};
 function fill(id,values,formatter){
  const ul=el(id);ul.replaceChildren();
  for(const value of values.slice(0,15)){
   const li=document.createElement('li');li.textContent=formatter(value);ul.appendChild(li);
  }
  if(!values.length){const li=document.createElement('li');li.textContent='No events recorded yet.';ul.appendChild(li);}
 }
 async function refresh(){
  status('Checking the last recorded health runs…');
  try{
   const token=sessionStorage.getItem('nexusAccessToken')||'';
   const res=await fetch('/.netlify/functions/nex-autonomy-status',{headers:{authorization:'Bearer '+token},cache:'no-store'});
   const data=await res.json();
   if(!res.ok)throw Error(data.error||'Autonomy monitor unavailable');
   fill('autonomyRuns',data.runs||[],r=>new Date(r.at).toLocaleString()+' · '+r.status+' · '+r.checks.filter(x=>!x.ok).map(x=>x.id).join(', ')+(r.changedPages?' · '+r.changedPages+' changed pages':''));
   fill('autonomyChanges',data.changedPages||[],r=>r.path+' · '+new Date(r.discovered_at).toLocaleString()+' · review #'+r.review_id);
   fill('autonomySignals',data.pendingSignals||[],r=>r.signal_key+' · review #'+r.review_id);
   el('autonomyMedia').textContent='First-party media indexed: '+data.mediaIndex.items+' · Pending review queue: '+data.pendingReviews+'.';
   status('Latest run data loaded. Publishing and operational actions remain approval-controlled.');
  }catch(error){status(error.message);}
 }
 el('refreshAutonomy')?.addEventListener('click',refresh);
 refresh();
})();