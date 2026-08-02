(function(){
  'use strict';
  const $=(s,r=document)=>r.querySelector(s);
  const $$=(s,r=document)=>[...r.querySelectorAll(s)];

  // ── Auth helpers ────────────────────────────────────────────
  function getToken(){return sessionStorage.getItem('nexusAccessToken')}
  function getUser(){try{return JSON.parse(sessionStorage.getItem('nexusUser')||'{}')}catch{return {}}}
  function authHeaders(){return {authorization:`Bearer ${getToken()}`,'content-type':'application/json'}}

  // ── Local shift state (persisted across page refreshes) ─────
  const STORAGE='nexusDriverAppV2';
  function loadState(){try{return JSON.parse(localStorage.getItem(STORAGE)||'{}')}catch{return {}}}
  function saveState(s){localStorage.setItem(STORAGE,JSON.stringify(s))}
  let state={onDuty:false,onBreak:false,inspectionComplete:false,shiftStartedAt:null,breakStartedAt:null,totalBreakMs:0,vehicleId:null,completedTrips:0,miles:0,workflowIndex:0,activeTripRef:null,...loadState()};

  // ── Trip workflow steps ──────────────────────────────────────
  const WORKFLOW=['En Route to Pickup','Arrived at Pickup','Patient On Board','Departed','Arrived at Destination','Patient Delivered','Trip Complete'];
  const WORKFLOW_STATUSES=['EN_ROUTE','ARRIVED_PICKUP','PATIENT_ON_BOARD','DEPARTED','ARRIVED_DESTINATION','DELIVERED','COMPLETED'];

  // ── Live data ────────────────────────────────────────────────
  let liveTrips=[];
  let liveVehicle=null;
  let gpsWatchId=null;
  let gpsActive=false;

  // ── Time of day greeting ─────────────────────────────────────
  function tod(){const h=new Date().getHours();return h<12?'morning':h<17?'afternoon':'evening'}
  function fmtTime(iso){if(!iso)return '';const d=new Date(iso);return d.toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})}
  function fmtDuration(ms){const h=Math.floor(ms/3600000),m=Math.floor((ms%3600000)/60000);return `${h}:${String(m).padStart(2,'0')}`}
  function elapsed(){if(!state.onDuty||!state.shiftStartedAt)return 0;const breakMs=state.totalBreakMs+(state.onBreak&&state.breakStartedAt?Date.now()-state.breakStartedAt:0);return Math.max(0,Date.now()-state.shiftStartedAt-breakMs)}
  function notify(msg){const el=$('#driverNotice');if(el)el.textContent=msg}

  // ══════════════════════════════════════════════════════════════
  // AUTH FLOW
  // ══════════════════════════════════════════════════════════════
  async function checkAuth(){
    const token=getToken();
    if(!token){showLogin();return false}
    try{
      const r=await fetch('/api/auth/me',{headers:{authorization:`Bearer ${token}`},cache:'no-store'});
      if(!r.ok){sessionStorage.clear();showLogin();return false}
      const j=await r.json();
      if(j.user?.role!=='DRIVER'&&j.user?.role!=='ADMIN'&&j.user?.role!=='DISPATCHER'){
        showLoginError('This app is for drivers only. Sign in with a driver account.');
        sessionStorage.clear();showLogin();return false;
      }
      sessionStorage.setItem('nexusUser',JSON.stringify(j.user));
      return true;
    }catch{showLogin();return false}
  }

  function showLogin(){$('#loginScreen')?.classList.remove('hidden')}
  function hideLogin(){$('#loginScreen')?.classList.add('hidden')}
  function showLoginError(msg){const el=$('#loginError');if(el){el.textContent=msg;el.style.display='block'}}

  $('#loginForm')?.addEventListener('submit',async(e)=>{
    e.preventDefault();
    const btn=$('#loginBtn');
    const email=$('#loginEmail')?.value.trim();
    const password=$('#loginPassword')?.value;
    if(!email||!password)return;
    btn.disabled=true;btn.textContent='Signing in…';
    try{
      const r=await fetch('/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email,password})});
      const j=await r.json();
      if(!r.ok)throw new Error(j.error||'Sign-in failed');
      if(j.user?.role!=='DRIVER'&&j.user?.role!=='ADMIN'&&j.user?.role!=='DISPATCHER'){
        throw new Error('This app is for drivers only.');
      }
      sessionStorage.setItem('nexusAccessToken',j.token);
      sessionStorage.setItem('nexusUser',JSON.stringify(j.user));
      hideLogin();
      await initApp();
    }catch(err){
      showLoginError(err.message||'Sign-in failed. Check your credentials.');
    }finally{btn.disabled=false;btn.textContent='Sign in'}
  });

  $('#signOutBtn')?.addEventListener('click',()=>{
    if(!confirm('Sign out and end your session?'))return;
    if(state.onDuty)endShift(true);
    sessionStorage.clear();
    state={onDuty:false,onBreak:false,inspectionComplete:false,shiftStartedAt:null,breakStartedAt:null,totalBreakMs:0,vehicleId:null,completedTrips:0,miles:0,workflowIndex:0,activeTripRef:null};
    saveState(state);
    showLogin();
  });

  // ══════════════════════════════════════════════════════════════
  // DATA LOADING
  // ══════════════════════════════════════════════════════════════
  async function loadTrips(){
    try{
      const r=await fetch('/api/bookings',{headers:authHeaders(),cache:'no-store'});
      if(!r.ok)return;
      const j=await r.json();
      liveTrips=(j.bookings||j||[]).map(b=>({
        ref:b.reference||b.id,
        time:b.trip_time?.slice(0,5)||'—',
        date:b.trip_date||'—',
        pickup:b.pickup||'Pickup pending',
        destination:b.destination||'Destination pending',
        patient:b.name||'Patient',
        service:b.service||'—',
        status:b.status||'SCHEDULED',
        notes:b.notes||'',
        distance:b.distance_miles?`${Number(b.distance_miles).toFixed(1)} mi`:'—'
      }));
      renderTripList();
      renderActiveTrip();
    }catch(e){console.error('[DRIVER-APP] loadTrips:',e)}
  }

  async function loadVehicle(){
    if(!state.vehicleId)return;
    try{
      const r=await fetch('/api/fleet/live',{headers:authHeaders(),cache:'no-store'});
      if(!r.ok)return;
      const j=await r.json();
      liveVehicle=(j.vehicles||[]).find(v=>v.unit===state.vehicleId)||null;
      if(liveVehicle)$('#vehicleNumber').textContent=liveVehicle.unit;
    }catch{}
  }

  // ══════════════════════════════════════════════════════════════
  // GPS TRACKING
  // ══════════════════════════════════════════════════════════════
  function startGPS(){
    if(!navigator.geolocation||gpsWatchId!=null)return;
    gpsWatchId=navigator.geolocation.watchPosition(async(pos)=>{
      gpsActive=true;
      updateGPSBadge(true);
      if(!state.onDuty||!state.vehicleId)return;
      try{
        await fetch('/api/gps',{method:'POST',headers:authHeaders(),body:JSON.stringify({
          vehicleUnit:state.vehicleId,
          latitude:pos.coords.latitude,
          longitude:pos.coords.longitude,
          heading:pos.coords.heading||null,
          speedMph:pos.coords.speed?pos.coords.speed*2.237:null,
          accuracyM:pos.coords.accuracy||null,
          bookingReference:state.activeTripRef||null
        })});
      }catch{}
    },{enableHighAccuracy:true,maximumAge:15000,timeout:20000});
  }

  function stopGPS(){
    if(gpsWatchId!=null){navigator.geolocation.clearWatch(gpsWatchId);gpsWatchId=null}
    gpsActive=false;updateGPSBadge(false);
  }

  function updateGPSBadge(active){
    const b=$('#gpsBadge');
    if(!b)return;
    b.className='gpsBadge'+(active?' active':'');
    b.innerHTML=`<span class="dot"></span>${active?'GPS Live':'GPS Off'}`;
  }

  // ══════════════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════════════
  function render(){
    const user=getUser();
    $('#timeOfDay').textContent=tod();
    $('#driverName').textContent=user.display_name?.split(' ')[0]||'Driver';
    $('#driverFullName').textContent=user.display_name||'Driver';
    $('#driverId').textContent=user.email||'';
    $('#shiftSubtitle').textContent=state.onDuty
      ?`On duty · Shift started ${fmtTime(new Date(state.shiftStartedAt))}`
      :`Sign in to begin your shift.`;
    const pill=$('#driverStatus');
    if(pill){pill.className='driverStatusPill'+(state.onDuty?(state.onBreak?' break':''):('' +' off'));
    pill.innerHTML=`<span class="driverStatusDot"></span>${state.onBreak?'ON BREAK':state.onDuty?'ON DUTY':'OFF DUTY'}`}
    $('#hoursWorked').textContent=fmtDuration(elapsed());
    $('#tripCount').textContent=liveTrips.length;
    $('#completedCount').textContent=state.completedTrips;
    $('#vehicleNumber').textContent=state.vehicleId||'—';
    const shiftBtn=$('#shiftButton');
    if(shiftBtn){shiftBtn.disabled=false;shiftBtn.textContent=state.onDuty?'END SHIFT':'START SHIFT';shiftBtn.className='driverPrimary'+(state.onDuty?' red':' green')}
    const breakBtn=$('#breakButton');
    if(breakBtn){breakBtn.disabled=!state.onDuty;breakBtn.textContent=state.onBreak?'END BREAK':'START BREAK'}
    const inspBtn=$('#inspectionButton');
    if(inspBtn){inspBtn.disabled=false;inspBtn.textContent=state.inspectionComplete?'✓ INSPECTION':'INSPECTION'}
    renderWorkflow();
    renderActiveTrip();
  }

  function renderTripList(){
    const el=$('#tripList');
    if(!el)return;
    if(!liveTrips.length){el.innerHTML='<p style="color:var(--driver-muted)">No trips assigned today.</p>';return}
    const statusColor={SCHEDULED:'',ASSIGNED:'',EN_ROUTE:'',PATIENT_ON_BOARD:'',COMPLETED:'complete',DELIVERED:'complete',CANCELLED:'complete'};
    el.innerHTML=liveTrips.map(t=>`
      <article class="tripCard" data-ref="${t.ref}">
        <div class="tripTime">${t.time}<small>${t.date}</small></div>
        <div class="tripInfo">
          <strong>${t.pickup}</strong>
          <span>${t.patient} · ${t.service}</span>
          <span>${t.destination}</span>
        </div>
        <span class="tripStatus ${statusColor[t.status]||''}">${t.status}</span>
      </article>`).join('');
    $$('.tripCard').forEach(card=>{
      card.addEventListener('click',()=>{
        const ref=card.dataset.ref;
        if(state.activeTripRef!==ref){state.activeTripRef=ref;state.workflowIndex=0;saveState(state)}
        renderActiveTrip();renderWorkflow();
        window.scrollTo({top:0,behavior:'smooth'});
      });
    });
  }

  function renderActiveTrip(){
    const trip=liveTrips.find(t=>t.ref===state.activeTripRef)||liveTrips.find(t=>!['COMPLETED','DELIVERED','CANCELLED'].includes(t.status))||null;
    const panel=$('#activeTripPanel');
    const badge=$('#activeTripBadge');
    const advance=$('#advanceWorkflow');
    const nav=$('#navigateButton');
    if(!trip||!panel){if(panel)panel.innerHTML='<p style="color:var(--driver-muted)">No active trip. Dispatch will assign your next trip.</p>';if(badge)badge.textContent='No trip';if(advance)advance.disabled=true;if(nav)nav.disabled=true;return}
    if(badge)badge.textContent=trip.status;
    panel.innerHTML=`
      <div class="nextTripMeta">
        <span class="driverChip">${trip.time}</span>
        <span class="driverChip ${trip.service?.includes('als')||trip.service?.includes('bls')?'high':''}">${trip.service}</span>
        <span class="driverChip">${trip.distance}</span>
      </div>
      <div class="nextTripRoute">
        <strong>Pickup</strong><span>${trip.pickup}</span>
        <div class="routeArrow">↓</div>
        <strong>Destination</strong><span>${trip.destination}</span>
      </div>
      <p style="margin:8px 0 0;font-size:14px"><strong>Patient:</strong> ${trip.patient}</p>
      ${trip.notes?`<p style="margin:4px 0 0;font-size:13px;color:var(--driver-muted)">${trip.notes}</p>`:''}`;
    const done=['COMPLETED','DELIVERED','CANCELLED'].includes(trip.status);
    if(advance){advance.disabled=!state.onDuty||!state.inspectionComplete||done||state.workflowIndex>=WORKFLOW.length;advance.textContent=done?'TRIP COMPLETE':state.workflowIndex<WORKFLOW.length?WORKFLOW[state.workflowIndex].toUpperCase():'COMPLETE'}
    if(nav){nav.disabled=done;nav.onclick=()=>{window.open(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(state.workflowIndex===0?trip.pickup:trip.destination)}`,'_blank','noopener')}}
    if(state.activeTripRef!==trip.ref){state.activeTripRef=trip.ref;saveState(state)}
  }

  function renderWorkflow(){
    const el=$('#workflow');
    if(!el)return;
    if(!state.activeTripRef||!state.onDuty){el.innerHTML='<p style="color:var(--driver-muted);font-size:13px">Start shift and select a trip to begin workflow.</p>';return}
    el.innerHTML=WORKFLOW.map((label,i)=>`
      <div class="workflowStep ${i<state.workflowIndex?'done':i===state.workflowIndex?'current':''}">
        <span class="stepIndex">${i<state.workflowIndex?'✓':i+1}</span>
        <strong>${label}</strong>
        <span>${i<state.workflowIndex?'Done':i===state.workflowIndex?'Next':''}</span>
      </div>`).join('');
  }

  // ══════════════════════════════════════════════════════════════
  // SHIFT ACTIONS
  // ══════════════════════════════════════════════════════════════
  $('#shiftButton')?.addEventListener('click',()=>{
    if(!state.onDuty){
      // Pick vehicle first if none assigned
      if(!state.vehicleId){
        const unit=prompt('Enter your assigned vehicle unit (e.g. SE-254-01):');
        if(!unit?.trim())return;
        state.vehicleId=unit.trim().toUpperCase();
      }
      state.onDuty=true;state.shiftStartedAt=Date.now();state.totalBreakMs=0;state.inspectionComplete=false;
      saveState(state);startGPS();
      notify('Shift started. Complete the vehicle inspection before your first trip.');
      $('#inspectionDialog')?.showModal();
    }else{
      if(state.onBreak){state.totalBreakMs+=Date.now()-state.breakStartedAt;state.onBreak=false}
      const end$=$(endShiftDialogSetup);
      $('#endShiftDialog')?.showModal();
    }
    render();
  });

  function endShiftDialogSetup(){
    $('#endShiftHours').textContent=fmtDuration(elapsed());
    $('#endShiftTrips').textContent=state.completedTrips;
    $('#endShiftMiles').textContent=state.miles.toFixed(1);
    $('#endShiftVehicle').textContent=state.vehicleId||'—';
  }

  // Fix — call setup before showing dialog
  $('#shiftButton')?.removeEventListener('click',null);
  $('#shiftButton')?.addEventListener('click',()=>{
    if(!state.onDuty){
      if(!state.vehicleId){
        const unit=prompt('Enter your assigned vehicle unit (e.g. SE-254-01):');
        if(!unit?.trim())return;
        state.vehicleId=unit.trim().toUpperCase();
      }
      state.onDuty=true;state.shiftStartedAt=Date.now();state.totalBreakMs=0;state.inspectionComplete=false;
      saveState(state);startGPS();
      notify('Shift started. Complete the vehicle inspection before your first trip.');
      render();
      $('#inspectionDialog')?.showModal();
    }else{
      if(state.onBreak){state.totalBreakMs+=Date.now()-state.breakStartedAt;state.onBreak=false}
      endShiftDialogSetup();
      $('#endShiftDialog')?.showModal();
    }
  });

  $('#breakButton')?.addEventListener('click',()=>{
    if(!state.onDuty)return;
    if(!state.onBreak){state.onBreak=true;state.breakStartedAt=Date.now();notify('Break started. Dispatch can see you are unavailable.')}
    else{state.totalBreakMs+=Date.now()-state.breakStartedAt;state.breakStartedAt=null;state.onBreak=false;notify('Break ended. You are available for assignments.')}
    saveState(state);render();
  });

  $('#inspectionButton')?.addEventListener('click',()=>$('#inspectionDialog')?.showModal());

  $('#inspectionForm')?.addEventListener('submit',e=>{
    e.preventDefault();
    const checks=$$('input[type=checkbox]',e.currentTarget).filter(c=>c.required);
    if(checks.some(c=>!c.checked)){alert('Check every required item before submitting.');return}
    state.inspectionComplete=true;saveState(state);
    notify('Vehicle inspection passed and logged with Fleet and Dispatch.');
    $('#inspectionDialog')?.close();
    render();
  });

  $('#confirmEndShift')?.addEventListener('click',()=>{
    state={onDuty:false,onBreak:false,inspectionComplete:false,shiftStartedAt:null,breakStartedAt:null,totalBreakMs:0,vehicleId:state.vehicleId,completedTrips:0,miles:0,workflowIndex:0,activeTripRef:null};
    saveState(state);stopGPS();
    $('#endShiftDialog')?.close();
    notify('Shift ended. See you next time.');
    render();
  });

  // ══════════════════════════════════════════════════════════════
  // TRIP WORKFLOW ADVANCE
  // ══════════════════════════════════════════════════════════════
  $('#advanceWorkflow')?.addEventListener('click',async()=>{
    if(!state.activeTripRef||state.workflowIndex>=WORKFLOW.length)return;
    const step=WORKFLOW[state.workflowIndex];
    const apiStatus=WORKFLOW_STATUSES[state.workflowIndex];
    const btn=$('#advanceWorkflow');
    btn.disabled=true;btn.textContent='Updating…';
    try{
      const r=await fetch(`/api/bookings/${encodeURIComponent(state.activeTripRef)}/update`,{
        method:'POST',headers:authHeaders(),
        body:JSON.stringify({status:apiStatus,vehicleUnit:state.vehicleId||undefined})
      });
      if(!r.ok){const j=await r.json().catch(()=>({}));throw new Error(j.error||`Update failed (${r.status})`)}
      state.workflowIndex++;
      if(state.workflowIndex>=WORKFLOW.length){
        const trip=liveTrips.find(t=>t.ref===state.activeTripRef);
        if(trip){trip.status='COMPLETED';state.completedTrips++;state.miles+=parseFloat(trip.distance)||0}
        state.activeTripRef=null;state.workflowIndex=0;
        notify('Trip completed and logged. Ready for your next assignment.');
      }else{
        notify(`Status updated: ${step}. Dispatch has been notified.`);
      }
      saveState(state);
      await loadTrips();
      render();
    }catch(err){
      notify(`Error: ${err.message}`);
      btn.disabled=false;btn.textContent=WORKFLOW[state.workflowIndex]?.toUpperCase()||'ADVANCE';
    }
  });

  // ══════════════════════════════════════════════════════════════
  // QUICK ACTIONS
  // ══════════════════════════════════════════════════════════════
  function callDispatch(){window.location.href='tel:+18887604990'}
  function openMessage(){notify('Secure dispatch messaging opened. New assignments will appear here.')}
  $('#callDispatch')?.addEventListener('click',callDispatch);
  $('#callDispatch2')?.addEventListener('click',callDispatch);
  $('#messageButton')?.addEventListener('click',openMessage);
  $('#messageButton2')?.addEventListener('click',openMessage);
  $('#refreshTrips')?.addEventListener('click',()=>{notify('Refreshing trips…');loadTrips()});
  $('#fleetButton')?.addEventListener('click',()=>notify(`Vehicle ${state.vehicleId||'—'}: GPS ${gpsActive?'active':'off'}, inspection ${state.inspectionComplete?'complete':'required'}.`));

  $('#incidentButton')?.addEventListener('click',()=>$('#incidentDialog')?.showModal());
  $('#incidentForm')?.addEventListener('submit',e=>{
    e.preventDefault();
    const data=Object.fromEntries(new FormData(e.currentTarget));
    const incidents=JSON.parse(localStorage.getItem('nexusIncidents')||'[]');
    incidents.unshift({id:`INC-${Date.now()}`,driver:getUser().display_name,vehicleId:state.vehicleId,...data,createdAt:new Date().toISOString(),status:'Open'});
    localStorage.setItem('nexusIncidents',JSON.stringify(incidents));
    e.currentTarget.reset();$('#incidentDialog')?.close();
    notify('Incident submitted to Dispatch, Fleet, and QA.');
  });

  // Close dialogs
  $$('.driverClose').forEach(b=>b.addEventListener('click',()=>b.closest('dialog')?.close()));

  // ══════════════════════════════════════════════════════════════
  // INIT
  // ══════════════════════════════════════════════════════════════
  async function initApp(){
    const authed=await checkAuth();
    if(!authed)return;
    hideLogin();
    render();
    await Promise.all([loadTrips(),loadVehicle()]);
    render();
    startGPS();
    // Refresh trips every 90 seconds
    setInterval(()=>{if(state.onDuty)loadTrips()},90000);
    // Refresh clock every 30 seconds
    setInterval(()=>render(),30000);
  }

  initApp();
})();
