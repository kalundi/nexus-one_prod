(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.NexusFacilityGuide=api;})(typeof window==='object'?window:globalThis,()=>{'use strict';
 const phases=['scheduled','approach','outbound','appointment','return-approach','return','complete'];
 const labels=['Scheduled','Driver to pickup','To appointment','At appointment','Return pickup','To FutureCare','Received'];
 function cueFor(dashboard,patient){
  if(!dashboard?.patients?.length)return {key:'empty',step:0,title:'Build the day’s transport plan',text:'Book or restore a demo trip to begin the journey.',workspace:'boardSection',selector:'#capacityNotice',pointer:'Trip schedule'};
  if(dashboard.patients.every(p=>p.phase==='complete'))return {key:'billing',step:6,title:'Everyone is back · daily invoice ready',text:'Return handoffs are complete. Review itemized transport charges and the simulated invoice delivery.',workspace:'billingSection',selector:'#billingContent',pointer:'Daily invoice'};
  patient=patient||dashboard.patients[0];
  const step=Math.max(0,phases.indexOf(patient.phase)),alert=dashboard.alerts?.find(a=>a.patientId===patient.id&&!a.acknowledged);
  if(alert)return {key:patient.id+':'+alert.id,step,title:patient.name+' · '+alert.title,text:'See the revised ETA and the update shared with the facility, destination and authorized monitoring contacts. All alerts are simulated.',workspace:'inboxSection',selector:'#messages',pointer:'Trip communications'};
  const messages=[
   ['Pickup is scheduled',`Facility pickup ${patient.pickupLabel}. The trip board confirms the patient, destination and return pickup.`,'boardSection','#patientRows','Scheduled pickup'],
   ['Driver is heading to pickup',`${patient.driver} is approaching FutureCare. Watch the vehicle and confirm the pickup address.`,'routePanel','#routeLiveStatus','Driver to pickup'],
   ['On the way to the appointment',`${patient.driver} is taking the patient to ${patient.destination.name}. Next update / ETA: ${patient.etaLabel}.`,'routePanel','#routeLiveStatus','Outbound vehicle'],
   ['Patient is at the appointment',`Return pickup is ${patient.returnLabel}. The facility and monitoring contacts can follow trip updates in Communications.`,'inboxSection','#messages','Appointment updates'],
   ['Return pickup is approaching',`${patient.driver} is heading to the appointment location for the ${patient.returnLabel} return pickup.`,'routePanel','#routeLiveStatus','Return pickup vehicle'],
   ['On the way back to FutureCare',`The patient is returning to the facility. Next update / ETA: ${patient.etaLabel}.`,'routePanel','#routeLiveStatus','Return vehicle'],
   ['Patient received at FutureCare','The return handoff is complete. Other scheduled patients continue on the trip board.','boardSection','#patientRows','Completed handoff']
  ][step];
  return {key:patient.id+':'+patient.phase,step,title:patient.name+' · '+messages[0],text:messages[1],workspace:messages[2],selector:messages[3],pointer:messages[4]};
 }
 function create({showTarget,isExpanded}){
  const $=id=>document.getElementById(id),toggle=$('guideToggle'),pointer=$('presentationPointer');
  let enabled=true,cue=null,target=null,frame=0,signature='';
  const steps=$('guideSteps');
  labels.forEach((label,index)=>{const item=document.createElement('li');item.textContent=label;item.dataset.step=String(index);steps.append(item);});
  function clear(){if(target)target.classList.remove('presentationTarget');target=null;pointer.hidden=true;}
  function visible(element){if(!element||!element.getClientRects().length)return false;const box=element.getBoundingClientRect();return box.bottom>80&&box.top<innerHeight-25&&box.right>0&&box.left<innerWidth;}
  function position(){
   frame=0;clear();
   if(!enabled||!cue||$('dashboard').hidden||isExpanded()||document.querySelector('dialog[open]'))return;
   const desired=document.querySelector(cue.selector),nav=document.querySelector('#facilityWorkspaceNav [data-workspace="'+cue.workspace+'"]');
   target=visible(desired)?desired:visible(nav)?nav:null;
   if(!target)return;target.classList.add('presentationTarget');
   const box=target.getBoundingClientRect();
   pointer.style.left=Math.max(10,Math.min(innerWidth-250,box.left))+'px';
   const below=box.top<145;pointer.dataset.side=below?'below':'above';pointer.textContent=(below?'↑ ':'↓ ')+cue.pointer;
   pointer.style.top=(below?Math.min(innerHeight-65,box.bottom+10):Math.max(85,box.top-49))+'px';pointer.hidden=false;
  }
  function queue(){if(!frame)frame=requestAnimationFrame(position);}
  toggle.addEventListener('click',()=>{enabled=!enabled;toggle.textContent=enabled?'Hide pointers':'Show pointers';toggle.setAttribute('aria-pressed',String(enabled));queue();});
  $('guideShowMe').addEventListener('click',()=>{if(!cue)return;showTarget(cue.workspace);requestAnimationFrame(()=>{const node=document.querySelector(cue.selector);node?.scrollIntoView({block:'center',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});queue();});});
  window.addEventListener('scroll',queue,{passive:true,capture:true});window.addEventListener('resize',queue);document.addEventListener('visibilitychange',queue);
  return {update(dashboard,patient){
   cue=cueFor(dashboard,patient);const key=dashboard.scenarioDate+':'+cue.key+':'+cue.text;
   $('guideClock').textContent=dashboard.time+(dashboard.paused?' · paused':' · live demo');
   if(key!==signature){signature=key;$('guideTitle').textContent=cue.title;$('guideText').textContent=cue.text;$('guideShowMe').textContent='Show '+(cue.workspace==='routePanel'?'route':cue.workspace==='inboxSection'?'communications':cue.workspace==='billingSection'?'billing':'trip board');
    [...steps.children].forEach((item,index)=>{item.dataset.state=index<cue.step?'complete':index===cue.step?'current':'upcoming';if(index===cue.step)item.setAttribute('aria-current','step');else item.removeAttribute('aria-current');});
   }queue();
  },stop(){cue=null;signature='';clear();}};
 }
 return {cueFor,create};
});
