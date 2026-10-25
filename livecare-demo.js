(()=>{'use strict';const $=id=>document.getElementById(id);
 $('start').addEventListener('click',async()=>{
  const token=sessionStorage.getItem('nexusAccessToken');
  if(!token){$('notice').textContent='Sign in with an Admin or Dispatch account in this tab first.';$('login').hidden=false;return;}
  $('start').disabled=true;$('notice').textContent='Starting the simulated journey…';$('result').hidden=true;
  try{const response=await fetch('/api/livecare/demo',{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:'{}'});const data=await response.json();if(!response.ok)throw Error(data.error||'The demo could not be started.');
   const url=new URL('/patient.html',location.origin);url.searchParams.set('reference',data.booking.reference);
   $('reference').textContent=`Demo reference: ${data.booking.reference}`;$('linked').textContent=data.patientAccountLinked?'Linked to Fletcher’s existing patient account.':'Patient and caregiver access is available through the verified tracking link below.';
   $('tracking').value=url.href;$('verification').value=data.phone;$('open').href=url.href;$('result').hidden=false;$('notice').textContent='Demo started. Open patient tracking to watch the vehicle approach.';$('result').scrollIntoView({behavior:'smooth'});
  }catch(error){$('notice').textContent=error.message;}finally{$('start').disabled=false;}
 });
 $('copy').addEventListener('click',async()=>{try{await navigator.clipboard.writeText($('tracking').value);$('notice').textContent='Demo tracking link copied. Give the viewer the demo phone number too.';}catch{$('tracking').select();$('notice').textContent='Select and copy the tracking link above.';}});
})();
