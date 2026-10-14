(function(){
 'use strict';
 const host=document.getElementById('driveflexShiftPanel');
 if(!host)return;
 const token=()=>sessionStorage.getItem('nexusAccessToken')||localStorage.getItem('nexusAccessToken');
 const state={schedule:null};
 const status=host.querySelector('[data-df-status]');
 const detail=host.querySelector('[data-df-details]');
 const refresh=host.querySelector('[data-df-refresh]');
 const openList=host.querySelector('[data-df-open-shifts]');
 const safeDate=value=>{const d=new Date(value);return Number.isFinite(d.valueOf())?d.toLocaleString():String(value||'—');};
 async function loadOpen(){
  if(!openList||!token())return;
  openList.textContent='Loading available shifts…';
  try{
   const res=await fetch('/api/driveflex/shifts',{headers:{Authorization:'Bearer '+token()},cache:'no-store'});
   if(!res.ok)throw new Error('Shifts unavailable');
   const body=await res.json();openList.replaceChildren();
   if(!Array.isArray(body.shifts)||!body.shifts.length){openList.textContent='No open shifts posted.';return;}
   body.shifts.forEach(item=>{
    const row=document.createElement('div');row.style.cssText='border:1px solid var(--line);border-radius:12px;padding:12px;margin:10px 0';
    const info=document.createElement('p');info.textContent=[item.service_level,item.operating_area,safeDate(item.start_at)+' – '+safeDate(item.end_at)].join(' · ');
    const action=document.createElement('button');action.type='button';action.className='btn ghost sm';action.textContent='Request shift';
    action.addEventListener('click',async()=>{action.disabled=true;action.textContent='Submitting…';try{const response=await fetch('/api/driveflex/shifts/'+encodeURIComponent(item.id)+'/request',{method:'POST',headers:{Authorization:'Bearer '+token(),'content-type':'application/json'},body:'{}'});const data=await response.json();if(!response.ok)throw Error(data.error||'Could not request shift');action.textContent='Request submitted';status.textContent='Request sent for dispatch review. This does not activate a shift.';}catch(err){action.disabled=false;action.textContent='Request shift';status.textContent=err.message||'Request failed';}});
    row.append(info,action);openList.append(row);
   });
  }catch(e){openList.textContent='Open shifts could not be loaded. Try again later.';}
 }

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
 refresh.addEventListener('click',()=>{load();loadOpen();});
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)load();});
 load();loadOpen();
})();
