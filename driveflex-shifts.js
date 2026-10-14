(function(){
 'use strict';
 const host=document.getElementById('driveflexShiftPanel');
 if(!host)return;
 const token=()=>sessionStorage.getItem('nexusAccessToken')||localStorage.getItem('nexusAccessToken');
 const state={schedule:null};
 const status=host.querySelector('[data-df-status]');
 const detail=host.querySelector('[data-df-details]');
 const refresh=host.querySelector('[data-df-refresh]');
 async function load(){
   if(!token()){status.textContent='Sign in to see your current approved schedule.';return;}
   refresh.disabled=true;status.textContent='Checking approved schedule…';
   try{
     const response=await fetch('/api/driver/schedule',{headers:{Authorization:'Bearer '+token()},cache:'no-store'});
     if(!response.ok)throw new Error('Schedule could not be loaded.');
     const data=await response.json();
     if(typeof data.available!=='boolean')throw new Error('Invalid scheduling response.');
     state.schedule=data;
     status.textContent=data.available?'Your current shift is approved.':'You do not have an active approved shift right now.';
     const shifts=data.shift||{};
     detail.textContent=data.available?('Shift window: '+(shifts.startTime||'—')+' – '+(shifts.endTime||'—')):'Contact dispatch to confirm an additional shift.';
   }catch(e){status.textContent='Unable to verify your schedule. Existing shift controls remain authoritative.';detail.textContent='';}
   finally{refresh.disabled=false;}
 }
 refresh.addEventListener('click',load);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)load();});
 load();
})();
