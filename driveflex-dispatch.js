(()=>{
'use strict';
const $=s=>document.querySelector(s),status=$('#message'),list=$('#requests'),form=$('#publish');
const token=()=>sessionStorage.getItem('nexusAccessToken')||localStorage.getItem('nexusAccessToken');
function say(msg){status.textContent=msg}
async function call(path,options={}){
 if(!token())throw Error('Please sign in using the Nexus admin portal.');
 const res=await fetch(path,{...options,headers:{authorization:'Bearer '+token(),...(options.body?{'content-type':'application/json'}:{})},cache:'no-store'});
 const data=await res.json().catch(()=>({}));
 if(!res.ok)throw Error(data.error||'Request failed ('+res.status+')');
 return data;
}
const when=d=>{const date=new Date(d);return Number.isFinite(date.valueOf())?date.toLocaleString():'Unknown'};
async function load(){
 list.textContent='Loading requests…';
 try{
  const data=await call('/api/driveflex/shifts/requests');
  list.replaceChildren();
  if(!data.requests?.length){list.textContent='No requests to review.';say('Review queue is up to date.');return}
  for(const r of data.requests){
   const wrap=document.createElement('div');wrap.className='row';
   const info=document.createElement('p');
   info.textContent=[r.service_level,when(r.start_at)+' – '+when(r.end_at),'Driver ID: '+r.driver_id,'Status: '+r.status].join(' • ');
   wrap.append(info);
   if(r.status==='REQUESTED'){
    const actions=document.createElement('div');actions.className='actions';
    for(const decision of ['APPROVED','REJECTED']){
     const button=document.createElement('button');button.type='button';button.textContent=decision==='APPROVED'?'Approve provisionally':'Reject';if(decision==='REJECTED')button.className='secondary';
     button.addEventListener('click',async()=>{
      if(!window.confirm('Record '+decision.toLowerCase()+' decision? This does not activate a driver shift.'))return;
      actions.querySelectorAll('button').forEach(b=>b.disabled=true);
      try{await call('/api/driveflex/shifts/requests/'+encodeURIComponent(r.id)+'/review',{method:'POST',body:JSON.stringify({decision})});say('Decision saved. Confirm roster and credentials separately.');await load()}catch(e){say(e.message);actions.querySelectorAll('button').forEach(b=>b.disabled=false)}
     });actions.append(button)
    }wrap.append(actions)
   }
   list.append(wrap)
  }
  say('Driver requests loaded.');
 }catch(e){list.textContent='Review queue unavailable.';say(e.message)}
}
form.addEventListener('submit',async e=>{
 e.preventDefault();const button=form.querySelector('button[type=submit]');button.disabled=true;
 try{
  const f=new FormData(form),startAt=new Date(f.get('startAt')),endAt=new Date(f.get('endAt'));
  if(!Number.isFinite(startAt.valueOf())||!Number.isFinite(endAt.valueOf()))throw Error('Choose valid start and end times.');
  await call('/api/driveflex/shifts',{method:'POST',body:JSON.stringify({startAt:startAt.toISOString(),endAt:endAt.toISOString(),serviceLevel:f.get('serviceLevel'),operatingArea:f.get('operatingArea'),vehicleUnit:f.get('vehicleUnit')})});
  form.reset();say('Open shift published for driver requests.');await load()
 }catch(err){say(err.message)}finally{button.disabled=false}
});
$('#refresh').addEventListener('click',load);
load();
})();