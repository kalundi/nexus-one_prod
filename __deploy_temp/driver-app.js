(function(){
  'use strict';
  const $=(s,r=document)=>r.querySelector(s); const $$=(s,r=document)=>[...r.querySelectorAll(s)];
  const STORAGE='nexusDriverMobileV1';
  const defaultState={driver:'Anthony Fletcher',driverId:'D104',vehicleId:'204',onDuty:false,onBreak:false,inspectionComplete:false,shiftStartedAt:null,breakStartedAt:null,totalBreakMs:0,odometerStart:48250,odometerEnd:null,fuel:78,workflowIndex:0,activeTripId:null,completedTrips:0,miles:0,notice:'Ready to begin your shift.'};
  const sampleTrips=[
    {id:'NX-240718-01',time:'08:15',period:'AM',pickup:'Holy Cross Hospital',pickupAddress:'19801 Observation Dr, Germantown, MD',destination:'DaVita Dialysis Center',destinationAddress:'200 Medical Way, Lanham, MD',patient:'J. Smith',mobility:'Wheelchair',priority:'High',status:'Assigned',eta:'18 min',distance:'9.2 mi',notes:'Fall risk · Escort required'},
    {id:'NX-240718-02',time:'09:45',period:'AM',pickup:'DaVita Dialysis Center',pickupAddress:'200 Medical Way, Lanham, MD',destination:'Home',destinationAddress:'123 Main St, Bowie, MD',patient:'R. Johnson',mobility:'Ambulatory',priority:'Medium',status:'Scheduled',eta:'24 min',distance:'12.6 mi',notes:'Return trip'},
    {id:'NX-240718-03',time:'11:30',period:'AM',pickup:'Home Pickup',pickupAddress:'4527 Oak Ln, Bowie, MD',destination:'Suburban Hospital',destinationAddress:'8600 Old Georgetown Rd, Bethesda, MD',patient:'M. Williams',mobility:'Stretcher',priority:'High',status:'Scheduled',eta:'31 min',distance:'18.4 mi',notes:'Two-person assist'}
  ];
  const workflow=['Accepted','En Route','Arrived','Patient On Board','Departed','Arrived Destination','Patient Delivered','Trip Complete'];
  function load(){try{return {...defaultState,...JSON.parse(localStorage.getItem(STORAGE)||'{}')}}catch{return {...defaultState}}}
  let state=load();
  function save(){localStorage.setItem(STORAGE,JSON.stringify(state)); if(window.NexusOps){const shared=window.NexusOps.loadShift();window.NexusOps.saveShift({...shared,driver:state.driver,vehicleId:state.vehicleId,onDuty:state.onDuty,inspectionComplete:state.inspectionComplete,lastStatus:state.onBreak?'Break':state.onDuty?'Available':'Off duty'})}}
  function elapsed(){if(!state.onDuty||!state.shiftStartedAt)return 0;return Math.max(0,Date.now()-state.shiftStartedAt-state.totalBreakMs-(state.onBreak&&state.breakStartedAt?Date.now()-state.breakStartedAt:0))}
  function fmtDuration(ms){const h=Math.floor(ms/3600000),m=Math.floor((ms%3600000)/60000);return `${h}:${String(m).padStart(2,'0')}`}
  function currentTrip(){return sampleTrips.find(t=>t.id===state.activeTripId)||sampleTrips.find(t=>t.status!=='Completed')||sampleTrips[0]}
  function statusLabel(){return state.onBreak?'ON BREAK':state.onDuty?'AVAILABLE':'OFF DUTY'}
  function render(){
    const trip=currentTrip();
    $('#driverName').textContent=state.driver.split(' ')[0]; $('#driverFullName').textContent=state.driver; $('#driverId').textContent=state.driverId;
    const pill=$('#driverStatus');pill.className='driverStatusPill '+(!state.onDuty?'off':state.onBreak?'break':'');pill.innerHTML=`<span class="driverStatusDot"></span>${statusLabel()}`;
    $('#shiftButton').textContent=state.onDuty?'END SHIFT':'START SHIFT';$('#shiftButton').className='driverPrimary '+(state.onDuty?'red':'');
    $('#breakButton').textContent=state.onBreak?'END BREAK':'START BREAK';$('#breakButton').disabled=!state.onDuty; $('#inspectionButton').textContent=state.inspectionComplete?'INSPECTION COMPLETE':'COMPLETE INSPECTION';
    $('#vehicleNumber').textContent=`NEXUS ${state.vehicleId}`;$('#fuelLevel').textContent=`${state.fuel}%`;$('#hoursWorked').textContent=fmtDuration(elapsed());$('#tripCount').textContent=sampleTrips.length;$('#completedCount').textContent=state.completedTrips;$('#milesDriven').textContent=state.miles.toFixed(1);
    $('#nextTripTime').textContent=`${trip.time} ${trip.period}`;$('#nextTripTitle').textContent=trip.pickup;$('#nextTripPickup').textContent=trip.pickupAddress;$('#nextTripDestination').textContent=trip.destinationAddress;$('#nextTripPatient').textContent=trip.patient;$('#nextTripMobility').textContent=trip.mobility;$('#nextTripEta').textContent=trip.eta;$('#nextTripDistance').textContent=trip.distance;$('#nextTripNotes').textContent=trip.notes;
    $('#workflow').innerHTML=workflow.map((label,i)=>`<div class="workflowStep ${i<state.workflowIndex?'done':i===state.workflowIndex?'current':''}"><span class="stepIndex">${i<state.workflowIndex?'✓':i+1}</span><strong>${label}</strong><span>${i<state.workflowIndex?'Done':i===state.workflowIndex?'Next':''}</span></div>`).join('');
    $('#advanceWorkflow').textContent=state.workflowIndex>=workflow.length?'TRIP COMPLETE':workflow[Math.min(state.workflowIndex,workflow.length-1)].toUpperCase();$('#advanceWorkflow').disabled=!state.onDuty||!state.inspectionComplete||state.workflowIndex>=workflow.length;
    $('#tripList').innerHTML=sampleTrips.map(t=>`<article class="tripCard"><div class="tripTime">${t.time}<small>${t.period}</small></div><div class="tripInfo"><strong>${t.pickup}</strong><span>${t.patient} · ${t.mobility}</span><span>${t.pickupAddress}</span></div><span class="tripStatus ${t.status==='Completed'?'complete':''}">${t.status}</span></article>`).join('');
    $('#driverNotice').textContent=state.notice;
  }
  function notify(msg){state.notice=msg;save();render()}
  $('#shiftButton').addEventListener('click',()=>{if(!state.onDuty){state.onDuty=true;state.shiftStartedAt=Date.now();state.totalBreakMs=0;state.notice='Shift started. Complete the vehicle inspection before accepting your first trip.';save();render();$('#inspectionDialog').showModal()}else{if(state.onBreak){state.totalBreakMs+=Date.now()-state.breakStartedAt;state.onBreak=false}$('#endShiftHours').textContent=fmtDuration(elapsed());$('#endShiftTrips').textContent=state.completedTrips;$('#endShiftMiles').textContent=state.miles.toFixed(1);$('#endShiftDialog').showModal()}});
  $('#confirmEndShift').addEventListener('click',()=>{state={...defaultState,driver:state.driver,driverId:state.driverId,vehicleId:state.vehicleId,notice:'Shift completed and submitted to Dispatch.'};save();$('#endShiftDialog').close();render()});
  $('#breakButton').addEventListener('click',()=>{if(!state.onDuty)return;if(!state.onBreak){state.onBreak=true;state.breakStartedAt=Date.now();notify('Break started. Dispatch can see that you are unavailable.')}else{state.totalBreakMs+=Date.now()-state.breakStartedAt;state.breakStartedAt=null;state.onBreak=false;notify('Break ended. You are available for assignments.')}});
  $('#inspectionButton').addEventListener('click',()=>$('#inspectionDialog').showModal());
  $('#inspectionForm').addEventListener('submit',e=>{e.preventDefault();const checks=$$('input[type=checkbox]',e.currentTarget);if(checks.some(c=>!c.checked)){alert('Complete every required inspection item.');return}state.inspectionComplete=true;notify('Vehicle inspection passed and shared with Fleet and Dispatch.');$('#inspectionDialog').close()});
  $('#advanceWorkflow').addEventListener('click',()=>{if(state.workflowIndex<workflow.length){const just=workflow[state.workflowIndex];state.workflowIndex++;if(just==='Trip Complete'){const trip=currentTrip();trip.status='Completed';state.completedTrips++;state.miles+=parseFloat(trip.distance)||0;state.activeTripId=null;state.workflowIndex=0;state.notice='Trip completed. The next assignment is ready.'}else state.notice=`Status updated: ${just}. Dispatch has been notified.`;save();render()}});
  $('#navigateButton').addEventListener('click',()=>{const t=currentTrip();window.open(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(t.pickupAddress)}`,'_blank','noopener')});
  $('#callDispatch').addEventListener('click',()=>{window.location.href='tel:+18887604990'});
  $('#incidentButton').addEventListener('click',()=>$('#incidentDialog').showModal());
  $('#incidentForm').addEventListener('submit',e=>{e.preventDefault();const data=Object.fromEntries(new FormData(e.currentTarget));const incidents=JSON.parse(localStorage.getItem('nexusIncidents')||'[]');incidents.unshift({id:`INC-${Date.now()}`,driver:state.driver,vehicleId:state.vehicleId,...data,createdAt:new Date().toISOString(),status:'Open'});localStorage.setItem('nexusIncidents',JSON.stringify(incidents));e.currentTarget.reset();$('#incidentDialog').close();notify('Incident submitted to Dispatch, Fleet, and QA.')});
  $('#messageButton').addEventListener('click',()=>notify('Secure dispatch messaging opened. New assignments and messages will appear here.'));
  $('#fleetButton').addEventListener('click',()=>notify(`Vehicle ${state.vehicleId}: fuel ${state.fuel}%, inspection ${state.inspectionComplete?'complete':'required'}.`));
  $$('.driverClose').forEach(b=>b.addEventListener('click',()=>b.closest('dialog').close()));
  setInterval(()=>{if(state.onDuty)render()},30000);
  render();
})();
