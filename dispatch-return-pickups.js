(function(){
 const panel=document.getElementById('returnPickupQueue'),rows=document.getElementById('returnPickupQueueRows'),status=document.getElementById('returnPickupQueueStatus');
 if(!panel||!rows||!status)return;
 let loading=false,acknowledging=false;
 const token=()=>sessionStorage.getItem('nexusAccessToken');
 const headers=t=>({authorization:'Bearer '+t});
 async function refresh(){
  const t=token();if(loading||acknowledging)return;
  if(!t){panel.hidden=true;rows.replaceChildren();return;}
  loading=true;
  try{
   const res=await fetch('/api/dispatch/return-pickups',{headers:headers(t),cache:'no-store'});
   if(token()!==t)return;
   if(res.status===401||res.status===403){panel.hidden=true;rows.replaceChildren();return;}
   if(!res.ok)throw Error('Return pickup queue unavailable');
   const data=await res.json();if(token()!==t)return;
   panel.hidden=false;rows.replaceChildren();
   const requests=Array.isArray(data.requests)?data.requests:[];
   status.textContent=requests.length?requests.length+' awaiting acknowledgment':'No pending pickup requests.';
   for(const request of requests){
    const row=document.createElement('div');row.style.cssText='display:flex;gap:12px;align-items:center;flex-wrap:wrap;padding:12px 0;border-top:1px solid #dbe5ec';
    const label=document.createElement('div');label.style.flex='1';label.textContent=request.reference+' · '+new Date(request.requestedAt).toLocaleString('en-US',{timeZone:'America/New_York'})+' ET';row.append(label);
    const button=document.createElement('button');button.type='button';button.className='button secondary';button.textContent='Acknowledge request';
    button.addEventListener('click',async()=>{
     if(acknowledging||token()!==t||!confirm('Acknowledge receipt of this return pickup request? This does not assign a vehicle.'))return;
     acknowledging=true;button.disabled=true;
     try{
      const response=await fetch('/api/dispatch/return-pickups/'+encodeURIComponent(request.reference),{method:'PATCH',headers:headers(t),cache:'no-store'});
      const result=await response.json();if(!response.ok||!result.request)throw Error(result.error||'Unable to acknowledge request');
      if(token()===t){row.remove();status.textContent='Request acknowledged. Arrange the return ride through Trip Management.';}
     }catch(e){status.textContent=e.message;}
     finally{acknowledging=false;button.disabled=false;}
    });row.append(button);rows.append(row);
   }
  }catch(e){if(token()===t){panel.hidden=false;rows.replaceChildren();status.textContent=e.message;}}
  finally{loading=false;}
 }
 document.getElementById('refreshReturnPickups').addEventListener('click',refresh);
 refresh();setInterval(refresh,15000);
})();
