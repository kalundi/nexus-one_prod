/* Nexus Driver App — v3
 * Full rebuild: login, FMCSA pre-trip inspection, trip manifest (1 month),
 * leg-by-leg mileage logging, trip workflow, shift management, GPS tracking.
 */
(function () {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  const SHIFT_KEY = 'nxDriverShift_v3';
  const MILES_KEY = 'nxDriverMiles_v3';
  const INSP_KEY  = 'nxDriverInsp_v3';
  const INSP_COLLAPSE_KEY = 'nxDriverInspCollapsed_v1';

  const tok = () => sessionStorage.getItem('nexusAccessToken');
  const usr = () => { try { return JSON.parse(sessionStorage.getItem('nexusUser') || '{}'); } catch { return {}; } };
  const ah  = () => ({ authorization: `Bearer ${tok()}`, 'content-type': 'application/json' });
  const ADDRESS_COORDS = {
    '110 irving street nw, washington, dc 20010': {lat:38.929298,lng:-77.013962},
    '2041 georgia avenue nw, washington, dc 20060': {lat:38.917715,lng:-77.021294},
    'washington hospital center': {lat:38.928954,lng:-77.013467},
    'sibley memorial hospital': {lat:38.934196,lng:-77.104302},
    'howard university hospital': {lat:38.916600,lng:-77.019900},
    'george washington university hospital': {lat:38.901536,lng:-77.050141},
    'medstar georgetown university hospital': {lat:38.912376,lng:-77.075053},
    'inova fairfax medical campus': {lat:38.856210,lng:-77.227829},
    'holy cross hospital': {lat:39.015769,lng:-77.013718},
    'suburban hospital': {lat:38.999154,lng:-77.105741},
    'children\'s national hospital': {lat:38.928336,lng:-77.014393},
  };

  function loadJ(k) { try { return JSON.parse(localStorage.getItem(k) || '{}'); } catch { return {}; } }
  function saveShift() { localStorage.setItem(SHIFT_KEY, JSON.stringify(shift)); }
  function saveMiles() { localStorage.setItem(MILES_KEY, JSON.stringify(miles)); }
  function saveInspCollapse(){ localStorage.setItem(INSP_COLLAPSE_KEY, JSON.stringify(inspCollapsed)); }
  function coordForAddress(address){
    const key=String(address||'').trim().toLowerCase();
    return ADDRESS_COORDS[key]||null;
  }

  let shift = { onDuty:false, onBreak:false, vehicleUnit:'', startedAt:null, breakMs:0, breakStart:null, completedTrips:0, inspectionDone:false, inspectedVehicleUnit:'', lastTripVehicleUnit:'', ...loadJ(SHIFT_KEY) };
  if(shift.vehicleUnit)shift.vehicleUnit=String(shift.vehicleUnit).toUpperCase();
  if(shift.inspectedVehicleUnit)shift.inspectedVehicleUnit=String(shift.inspectedVehicleUnit).toUpperCase();
  if(shift.lastTripVehicleUnit)shift.lastTripVehicleUnit=String(shift.lastTripVehicleUnit).toUpperCase();
  if(shift.inspectionDone&&!shift.inspectedVehicleUnit&&shift.vehicleUnit){
    shift.inspectedVehicleUnit=shift.vehicleUnit;
    saveShift();
  }
  let miles = { odoStart:null, odoEnd:null, legs:[], ...loadJ(MILES_KEY) };
  let trips = [];
  let activeRef = null;
  let manifestDays = 1;
  let analyticsDays = 7;
  let gpsId = null;
  let aiHelpOpen = false;
  let routeFocusOpen = false;
  let routeFocusDismissedRef = null;
  let routeFocusMapMode = 'leg';
  const ROUTE_AUTO_ARRIVAL_MI = 0.12;
  const ROUTE_AUTO_DEPART_MI = 0.18;
  let routeAuto = {
    enabled:false,
    tripRef:null,
    startOdo:null,
    milesSinceStart:0,
    lastPos:null,
    segmentStartMiles:0,
    segmentStartOdo:null,
    pickupCoord:null,
    destinationCoord:null,
    arrivedDestinationAt:null,
    updating:false,
  };

  function elapsed() {
    if (!shift.onDuty || !shift.startedAt) return 0;
    const p = shift.breakMs + (shift.onBreak && shift.breakStart ? Date.now() - shift.breakStart : 0);
    return Math.max(0, Date.now() - shift.startedAt - p);
  }
  function fmtH(ms) { const h=Math.floor(ms/3600000), m=Math.floor((ms%3600000)/60000); return `${h}:${String(m).padStart(2,'0')}`; }
  function fmtDate(s) { if(!s)return ''; return new Date(s+'T00:00:00').toLocaleDateString([],{month:'short',day:'numeric'}); }
  function tod() { const h=new Date().getHours(); return h<12?'morning':h<17?'afternoon':'evening'; }
  function totalMiles() { return miles.legs.reduce((s,l)=>s+(Number(l.miles)||0),0); }
  function normalizeBookingStatus(status) { return String(status || 'SCHEDULED').trim().toUpperCase().replaceAll('-', '_'); }
  function tripNeedsAcceptance(trip) { return ['ASSIGNED','SCHEDULED','REQUESTED','SUBMITTED','PENDING_DISPATCH_CONFIRMATION'].includes(normalizeBookingStatus(trip?.status)); }
  function isTerminalStatus(status) { return ['COMPLETED','DELIVERED','CANCELLED','NO_SHOW','MISSED'].includes(normalizeBookingStatus(status)); }
  function tripStartWindowHours(trip){ return Number(trip?.distanceMiles ?? trip?.distMi ?? 0) >= 30 ? 2 : 1; }
  function normalizeTripDate(value){
    if(value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0,10);
    const raw=String(value||'').trim();
    if(!raw) return '';
    const isoMatch=raw.match(/^(\d{4}-\d{2}-\d{2})/);
    if(isoMatch) return isoMatch[1];
    const parsed=new Date(raw);
    if(!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0,10);
    return raw;
  }
  function normalizeTripTime(value){
    const raw=String(value||'00:00').trim();
    const hhmm=raw.match(/^(\d{2}:\d{2})/);
    return hhmm ? hhmm[1] : raw;
  }
  function parseTripDateTime(trip){
    const tripDate=normalizeTripDate(trip?.date||'');
    const tripTime=normalizeTripTime(trip?.time||'00:00');
    const parsed=new Date(`${tripDate}T${tripTime.length===5?`${tripTime}:00`:tripTime}`);
    return {tripDate,tripTime,parsed};
  }
  function assignedVehicleUnit(trip){
    return String(trip?.vehicleUnit||trip?.vehicle||'').trim().toUpperCase();
  }
  function inspectionPolicyForTripStart(trip){
    const tripUnit=assignedVehicleUnit(trip)||String(shift.vehicleUnit||'').trim().toUpperCase();
    if(!tripUnit){
      return {allowed:false,tripUnit:'',message:'No vehicle is assigned to this trip yet. Dispatch must assign a vehicle before you can start.'};
    }
    const inspected=String(shift.inspectedVehicleUnit||'').trim().toUpperCase();
    if(!shift.inspectionDone||inspected!==tripUnit){
      const reason=!shift.inspectionDone
        ? `Inspection is required before starting trips for ${tripUnit}.`
        : `Vehicle changed from ${inspected||'N/A'} to ${tripUnit}.`;
      return {allowed:false,tripUnit,message:`${reason} Complete inspection for ${tripUnit} before starting this trip.`};
    }
    return {allowed:true,tripUnit,message:''};
  }
  function toRad(v){return (Number(v)||0)*Math.PI/180;}
  function milesBetween(a,b){
    if(!a||!b)return null;
    const lat1=Number(a.lat),lng1=Number(a.lng),lat2=Number(b.lat),lng2=Number(b.lng);
    if(![lat1,lng1,lat2,lng2].every(Number.isFinite))return null;
    const dLat=toRad(lat2-lat1),dLng=toRad(lng2-lng1);
    const q=Math.sin(dLat/2)**2+Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLng/2)**2;
    return 3958.7613*(2*Math.atan2(Math.sqrt(q),Math.sqrt(1-q)));
  }
  function tripStartPolicy(trip){
    const {parsed}=parseTripDateTime(trip);
    if(Number.isNaN(parsed.getTime())) return {allowed:true,windowHours:tripStartWindowHours(trip)};
    const windowHours=tripStartWindowHours(trip);
    const windowStart=new Date(parsed.getTime()-windowHours*3600000);
    const todayIso=new Date().toISOString().slice(0,10);
    const tripDate=String(trip?.date||'').trim();
    const allowed=todayIso===tripDate && Date.now()>=windowStart.getTime();
    const readable=windowStart.toLocaleString([], { month:'short', day:'numeric', hour:'numeric', minute:'2-digit' });
    return {
      allowed,
      windowHours,
      windowStart,
      message: allowed ? '' : `This trip cannot start yet. It unlocks ${windowHours} hour${windowHours===1?'':'s'} before pickup (${readable}). Enter an early pickup reason if the patient requested an earlier pickup.`
    };
  }
  function dashNotice(msg,type) { const el=$('#dashNotice');if(!el)return; el.className=`notice ${type||'info'}`;el.textContent=msg;el.hidden=false; setTimeout(()=>{el.hidden=true;},5000); }
  function tripDateKey(trip){ return String(trip?.date||'').trim(); }
  function dayLabel(key){ const d=new Date(`${key}T00:00:00`); return Number.isNaN(d.getTime()) ? '--' : d.toLocaleDateString([], { month:'numeric', day:'numeric' }); }
  function recentDayKeys(days){
    const out=[];
    for(let i=days-1;i>=0;i--){
      out.push(new Date(Date.now()-i*86400000).toISOString().slice(0,10));
    }
    return out;
  }
  function acceptedStatus(status){
    return ['ASSIGNED','EN_ROUTE','ARRIVED_PICKUP','PATIENT_ON_BOARD','DEPARTED','ARRIVED_DESTINATION','DELIVERED','COMPLETED','NO_SHOW','MISSED'].includes(normalizeBookingStatus(status));
  }
  function completedStatus(status){
    return ['COMPLETED','DELIVERED'].includes(normalizeBookingStatus(status));
  }
  function renderBars(targetId, values, labels, color){
    const el=$(targetId); if(!el) return;
    if(!values.length){ el.innerHTML=''; return; }
    const max=Math.max(1,...values);
    el.innerHTML=values.map((v,idx)=>{
      const h=Math.max(6,Math.round((Number(v)||0)/max*100));
      const label=(labels[idx]||'').slice(0,5);
      const title=`${labels[idx]||''}: ${Number(v||0).toFixed(1)}`;
      return `<div class="analyticsBar" data-label="${label}" title="${title}" style="height:${h}%;background:${color}"></div>`;
    }).join('');
  }
  function bindAnalyticsTabs(){
    const tabs=$$('#analyticsRangeTabs button');
    if(!tabs.length) return;
    tabs.forEach((btn)=>{
      btn.addEventListener('click',()=>{
        analyticsDays=Number(btn.dataset.days)||7;
        tabs.forEach((b)=>b.classList.remove('active'));
        btn.classList.add('active');
        renderDriverAnalytics();
      });
    });
  }
  function renderDriverAnalytics(){
    const wrap=$('#driverAnalyticsCard'); if(!wrap) return;
    const keys=recentDayKeys(analyticsDays);
    const idxByKey=new Map(keys.map((k,i)=>[k,i]));
    const accepted=new Array(keys.length).fill(0);
    const completed=new Array(keys.length).fill(0);
    const milesPerDay=new Array(keys.length).fill(0);
    const closed=new Array(keys.length).fill(0);
    const onTimeClosed=new Array(keys.length).fill(0);

    trips.forEach((t)=>{
      const k=tripDateKey(t);
      const i=idxByKey.get(k);
      if(i==null) return;
      const st=normalizeBookingStatus(t.status);
      if(acceptedStatus(st)||t.accepted) accepted[i]+=1;
      if(completedStatus(st)) completed[i]+=1;
      if(['COMPLETED','DELIVERED','NO_SHOW','MISSED'].includes(st)){
        closed[i]+=1;
        if(['COMPLETED','DELIVERED'].includes(st)) onTimeClosed[i]+=1;
      }
    });

    miles.legs.forEach((leg)=>{
      const k=String(leg?.time||'').slice(0,10);
      const i=idxByKey.get(k);
      if(i==null) return;
      milesPerDay[i]+=Number(leg?.miles)||0;
    });

    const onTimePct=closed.map((c,i)=>c?Math.round((onTimeClosed[i]/c)*100):0);
    const totalAccepted=accepted.reduce((s,v)=>s+v,0);
    const totalCompleted=completed.reduce((s,v)=>s+v,0);
    const totalMiles=milesPerDay.reduce((s,v)=>s+v,0);
    const closedTotal=closed.reduce((s,v)=>s+v,0);
    const onTimeTotal=onTimeClosed.reduce((s,v)=>s+v,0);
    const onTimeRate=closedTotal?Math.round((onTimeTotal/closedTotal)*100):0;

    if($('#acceptedTripsMetric'))$('#acceptedTripsMetric').textContent=String(totalAccepted);
    if($('#completedMetric'))$('#completedMetric').textContent=String(totalCompleted);
    if($('#milesMetric'))$('#milesMetric').textContent=totalMiles.toFixed(1);
    if($('#onTimeMetric'))$('#onTimeMetric').textContent=`${onTimeRate}%`;

    const labels=keys.map(dayLabel);
    renderBars('#acceptedTripsChart',accepted,labels,'#93c5fd');
    renderBars('#completedTripsChart',completed,labels,'#86efac');
    renderBars('#milesChart',milesPerDay,labels,'#fcd34d');
    renderBars('#onTimeChart',onTimePct,labels,'#c4b5fd');

    const peakAccepted=Math.max(...accepted,0);
    const peakMiles=Math.max(...milesPerDay,0);
    const peakAcceptedDay=peakAccepted?labels[accepted.indexOf(peakAccepted)]:'--';
    const peakMilesDay=peakMiles?labels[milesPerDay.indexOf(peakMiles)]:'--';
    const insight=$('#analyticsInsight');
    if(insight){
      insight.textContent = `In the last ${analyticsDays} days: peak accepted volume was ${peakAccepted} trip${peakAccepted===1?'':'s'} on ${peakAcceptedDay}; peak mileage was ${peakMiles.toFixed(1)} mi on ${peakMilesDay}; overall on-time completion rate is ${onTimeRate}%.`;
    }
  }

  // ── View routing ──────────────────────────────────────────────
  const VT = { dashView:'Dashboard', inspectionView:'Pre-Trip Inspection', manifestView:'Trip Manifest', tripView:'Trip Detail', endView:'Sign Out', changePasswordView:'Change Password' };
  const viewFocusState = {};
  function cardsInView(view){
    if(!view)return [];
    const cards=$$('.card',view).filter((c)=>!c.hidden);
    cards.forEach((card,idx)=>{if(!card.dataset.focusCardId)card.dataset.focusCardId=`${view.id}-${idx}`;});
    return cards;
  }
  function clearCardFocus(view){
    if(!view)return;
    view.classList.remove('focus-mode');
    $$('.card',view).forEach((card)=>card.classList.remove('card-focus-active'));
    const t=$('#focusToggleBtn');
    if(t)t.hidden=true;
  }
  function applyCardFocus(view, card){
    if(!view||!card)return;
    const cards=cardsInView(view);
    if(cards.length<=1){clearCardFocus(view);return;}
    view.classList.add('focus-mode');
    cards.forEach((c)=>c.classList.toggle('card-focus-active',c===card));
    viewFocusState[view.id]=card.dataset.focusCardId;
    const t=$('#focusToggleBtn');
    if(t){t.hidden=false;t.textContent='Show All Cards';}
  }
  function ensureCardFocus(view){
    if(!view)return;
    if(view.id==='dashView'&&routeFocusOpen){clearCardFocus(view);return;}
    const cards=cardsInView(view);
    if(cards.length<=1){clearCardFocus(view);return;}
    const wanted=viewFocusState[view.id];
    if(!wanted){
      clearCardFocus(view);
      const t=$('#focusToggleBtn');
      if(t){t.hidden=false;t.textContent='Focus Cards';}
      return;
    }
    const target=cards.find((c)=>c.dataset.focusCardId===wanted);
    if(!target){
      clearCardFocus(view);
      const t=$('#focusToggleBtn');
      if(t){t.hidden=false;t.textContent='Focus Cards';}
      return;
    }
    applyCardFocus(view,target);
  }
  function showView(id) {
    if(id!=='dashView')setRouteFocus(false);
    $$('.view').forEach(v=>v.classList.remove('active'));
    $$('.navBtn').forEach(b=>b.classList.toggle('active',b.dataset.view===id));
    const v=$('#'+id); if(v)v.classList.add('active');
    if($('#topViewTitle'))$('#topViewTitle').textContent=VT[id]||'';
    if(id==='manifestView')renderManifest();
    if(id==='inspectionView'){renderInspection();loadFleetForInspection();}
    if(id==='dashView'){renderDash();maybeAutoOpenRouteFocus();}
    if(id==='tripView'||id==='endView'||id==='changePasswordView'||id==='inspectionView'||id==='manifestView'||id==='dashView'){
      requestAnimationFrame(()=>ensureCardFocus(v));
    }
  }
  $$('.navBtn').forEach(b=>b.addEventListener('click',()=>showView(b.dataset.view)));
  $('#focusToggleBtn')?.addEventListener('click',()=>{
    const v=$('.view.active');
    if(!v)return;
    const cards=cardsInView(v);
    if(cards.length<=1){clearCardFocus(v);return;}
    if(v.classList.contains('focus-mode')){
      clearCardFocus(v);
      const t=$('#focusToggleBtn');
      if(t){t.hidden=false;t.textContent='Focus Cards';}
      return;
    }
    applyCardFocus(v,cards[0]);
  });
  document.addEventListener('click',(e)=>{
    const v=$('.view.active');
    if(!v)return;
    const card=e.target.closest('.card');
    if(!card||!v.contains(card))return;
    if(v.id==='dashView'&&card.id==='routeFocusCard')return;
    if(v.classList.contains('focus-mode')&&card.classList.contains('card-focus-active'))return;
    applyCardFocus(v,card);
  });

  // ── Auth ──────────────────────────────────────────────────────
  async function checkAuth() {
    if(!tok()){showLoginView();return false;}
    try {
      const r=await fetch('/api/auth/me',{headers:{authorization:`Bearer ${tok()}`},cache:'no-store'});
      if(!r.ok){clearSess();showLoginView();return false;}
      const j=await r.json();
      if(!['DRIVER','ADMIN','DISPATCHER'].includes(j.user?.role)){clearSess();showLoginErr('This app is for drivers only.');showLoginView();return false;}
      sessionStorage.setItem('nexusUser',JSON.stringify(j.user));
      return true;
    } catch{clearSess();showLoginView();return false;}
  }
  function clearSess(){sessionStorage.removeItem('nexusAccessToken');sessionStorage.removeItem('nexusUser');}
  function showLoginView(){const l=$('#loginView'),a=$('#appShell');if(l)l.hidden=false;if(a)a.hidden=true;}
  function hideLoginView(){const l=$('#loginView'),a=$('#appShell');if(l)l.hidden=true;if(a)a.hidden=false;}
  function showLoginErr(m){const el=$('#loginNotice');if(el){el.hidden=false;el.textContent=m;}}
  function bindPasswordToggles(){
    $$('.passwordToggle').forEach((btn)=>{
      btn.addEventListener('click',()=>{
        const target=document.getElementById(btn.dataset.target);
        if(!target)return;
        const show=target.type==='password';
        target.type=show?'text':'password';
        btn.textContent=show?'Hide':'Show';
        btn.setAttribute('aria-label', show?'Hide password':'Show password');
      });
    });
  }
  bindPasswordToggles();

  $('#loginForm')?.addEventListener('submit',async e=>{
    e.preventDefault();
    const btn=$('#loginBtn'),email=$('#loginEmail').value.trim(),pass=$('#loginPassword').value;
    btn.disabled=true;btn.textContent='Signing in…';
    try{
      const r=await fetch('/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email,password:pass})});
      const j=await r.json();
      if(!r.ok)throw new Error(j.error||'Sign-in failed');
      if(!['DRIVER','ADMIN','DISPATCHER'].includes(j.user?.role))throw new Error('This app is for drivers only.');
      sessionStorage.setItem('nexusAccessToken',j.token);
      sessionStorage.setItem('nexusUser',JSON.stringify(j.user));
      hideLoginView();
      if(j.user?.mustChangePassword){showChangePassword(true);return;}
      await initApp();
    }catch(err){showLoginErr(err.message);}
    finally{btn.disabled=false;btn.textContent='Sign In';}
  });

  // ── Forgot password ───────────────────────────────────────
  $('#showForgotBtn')?.addEventListener('click',()=>{
    const fp=$('#forgotPanel');if(fp)fp.style.display='block';
    const fe=$('#forgotEmail');if(fe)fe.value=$('#loginEmail')?.value||'';
  });
  $('#backToLoginBtn')?.addEventListener('click',()=>{const fp=$('#forgotPanel');if(fp)fp.style.display='none';});
  $('#forgotForm')?.addEventListener('submit',async e=>{
    e.preventDefault();
    const btn=$('#forgotBtn'),email=$('#forgotEmail').value.trim();
    btn.disabled=true;btn.textContent='Sending…';
    try{
      const r=await fetch('/api/auth/forgot-password',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email})});
      const j=await r.json();
      const n=$('#forgotNotice');n.hidden=false;n.className='notice ok';n.textContent=j.message||'Check your email for a reset link.';
      $('#forgotForm').reset();
    }catch{const n=$('#forgotNotice');n.hidden=false;n.className='notice err';n.textContent='Unable to send. Try again or call (888) 760-4990.';}
    finally{btn.disabled=false;btn.textContent='Send Reset Link';}
  });

  // ── Reset password via token (URL: ?action=reset&token=...) ──
  function checkResetToken(){
    const params=new URLSearchParams(window.location.search);
    if(params.get('action')==='reset'&&params.get('token')){
      const rp=$('#resetPanel');if(rp)rp.style.display='block';
      window.__resetToken=params.get('token');
    }
  }
  $('#resetForm')?.addEventListener('submit',async e=>{
    e.preventDefault();
    const np=$('#resetPassword').value,cp=$('#resetConfirm').value,n=$('#resetNotice');
    if(np!==cp){n.hidden=false;n.className='notice err';n.textContent='Passwords do not match.';return;}
    if(np.length<8){n.hidden=false;n.className='notice err';n.textContent='Password must be at least 8 characters.';return;}
    const btn=$('#resetBtn');btn.disabled=true;btn.textContent='Saving…';
    try{
      const r=await fetch('/api/auth/reset-password',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({token:window.__resetToken,newPassword:np})});
      const j=await r.json();if(!r.ok)throw new Error(j.error||'Reset failed');
      n.hidden=false;n.className='notice ok';n.textContent='Password updated! You can now sign in.';
      $('#resetForm').reset();const rp=$('#resetPanel');if(rp)rp.style.display='none';
      window.history.replaceState({},'',window.location.pathname);
    }catch(err){n.hidden=false;n.className='notice err';n.textContent=err.message;}
    finally{btn.disabled=false;btn.textContent='Save New Password';}
  });

  // ── Change password (in-app or first-time forced) ─────────
  function showChangePassword(forced=false){
    const banner=$('#changePasswordBanner'),curF=$('#currentPasswordField');
    if(banner)banner.hidden=!forced;
    if(curF)curF.hidden=forced;
    showView('changePasswordView');
  }
  $('#btnShowChangePassword')?.addEventListener('click',()=>showChangePassword(false));
  $('#btnCancelChangePassword')?.addEventListener('click',()=>{if(!usr().mustChangePassword)showView('endView');});
  $('#changePasswordForm')?.addEventListener('submit',async e=>{
    e.preventDefault();
    const np=$('#newPassword').value,cp=$('#confirmPassword').value,cur=$('#currentPassword').value,n=$('#changePasswordNotice');
    n.hidden=true;
    if(np!==cp){n.hidden=false;n.className='notice err';n.textContent='Passwords do not match.';return;}
    if(np.length<8){n.hidden=false;n.className='notice err';n.textContent='Password must be at least 8 characters.';return;}
    const btn=$('#btnSavePassword');btn.disabled=true;btn.textContent='Saving…';
    try{
      const body=usr().mustChangePassword?{newPassword:np}:{currentPassword:cur,newPassword:np};
      const r=await fetch('/api/auth/change-password',{method:'POST',headers:ah(),body:JSON.stringify(body)});
      const j=await r.json();if(!r.ok)throw new Error(j.error||'Password change failed');
      const u=usr();u.mustChangePassword=false;sessionStorage.setItem('nexusUser',JSON.stringify(u));
      n.hidden=false;n.className='notice ok';n.textContent='Password updated!';
      $('#changePasswordForm').reset();
      setTimeout(()=>{hideLoginView();initApp();},1200);
    }catch(err){n.hidden=false;n.className='notice err';n.textContent=err.message;}
    finally{btn.disabled=false;btn.textContent='Save New Password';}
  });

  // ── Shift ─────────────────────────────────────────────────────
  $('#btnStartShift')?.addEventListener('click',()=>{
    if(!shift.inspectionDone){showView('inspectionView');return;}
    beginShift();
  });
  $('#btnLogOff')?.addEventListener('click',()=>{
    clearSess();
    $('#loginEmail').value='';
    $('#loginPassword').value='';
    showLoginView();
  });
  $('#shiftBadge')?.addEventListener('click',()=>{
    if(!shift.onDuty){
      if(!shift.inspectionDone){showView('inspectionView');return;}
      beginShift();
      return;
    }
    if(!shift.onBreak){
      shift.onBreak=true;
      shift.breakStart=Date.now();
      dashNotice('Break started. Tap the header badge again to end break.','info');
    }else{
      shift.breakMs+=Date.now()-shift.breakStart;
      shift.breakStart=null;
      shift.onBreak=false;
      dashNotice('Break ended. You are available again.','ok');
    }
    saveShift();
    renderDash();
  });
  function beginShift(){
    const unit=shift.vehicleUnit||prompt('Enter your assigned vehicle unit (e.g. SE-254-01):');
    if(!unit?.trim())return;
    shift.vehicleUnit=unit.trim().toUpperCase();
    if(!shift.inspectedVehicleUnit&&shift.inspectionDone)shift.inspectedVehicleUnit=shift.vehicleUnit;
    shift.onDuty=true;shift.startedAt=Date.now();shift.breakMs=0;shift.breakStart=null;shift.onBreak=false;
    saveShift();startGPS();renderDash();
    dashNotice('Shift started. Check your manifest for today\'s trips.','ok');
  }
  $('#btnBreak')?.addEventListener('click',()=>{
    if(!shift.onDuty)return;
    if(!shift.onBreak){shift.onBreak=true;shift.breakStart=Date.now();dashNotice('Break started. Dispatch shows you as unavailable.','info');}
    else{shift.breakMs+=Date.now()-shift.breakStart;shift.breakStart=null;shift.onBreak=false;dashNotice('Break ended. You are available.','ok');}
    saveShift();renderDash();
  });
  $('#btnEndShift')?.addEventListener('click',()=>{
    if($('#endDriverName'))$('#endDriverName').textContent=usr().display_name||'Driver';
    if($('#endHours'))$('#endHours').textContent=fmtH(elapsed());
    if($('#endTrips'))$('#endTrips').textContent=shift.completedTrips;
    if($('#endMiles'))$('#endMiles').textContent=totalMiles().toFixed(1);
    if($('#endVehicle'))$('#endVehicle').textContent=shift.vehicleUnit||'—';
    showView('endView');
  });
  $('#btnConfirmEndShift')?.addEventListener('click',()=>{
    const odo=Number($('#endOdo')?.value)||null;
    if(odo){miles.odoEnd=odo;saveMiles();}
    shift={onDuty:false,onBreak:false,vehicleUnit:shift.vehicleUnit,startedAt:null,breakMs:0,breakStart:null,completedTrips:0,inspectionDone:false,inspectedVehicleUnit:'',lastTripVehicleUnit:''};
    saveShift();stopGPS();showView('dashView');renderDash();
    dashNotice('Shift complete. Drive safe!','ok');
  });
  $('#btnCancelEndShift')?.addEventListener('click',()=>showView('dashView'));

  // ── Pre-trip inspection — vehicle-specific groups ────────────
  //
  // Groups are tagged so we can show only what applies to each vehicle type.
  // profileGroups() returns the right set for the selected unit.
  //
  // RULE: dashboard_alerts is always FIRST. If any item is marked 'fail',
  //       the inspection banner shows and shift start is blocked with an
  //       escalation notice requiring Fleet contact.

  const ALL_INSP_GROUPS = {
    // ══════════════════════════════════════════════════════════
    // SE-254-01 — 2016 Tesla Model 3 (Electric Sedan)
    // Ambulatory only. Normal passenger car. No lift, no wheelchair.
    // ══════════════════════════════════════════════════════════
    alerts_tesla: {id:'alerts_tesla', label:'Dashboard Warning Lights', critical:true, items:[
      {id:'t_warn_hv',    label:'High-Voltage / EV System Warning',  note:'Must be OFF. Orange/red EV warning → do not drive; report to Fleet.'},
      {id:'t_warn_brake', label:'Brake System Warning',              note:'Must be OFF. Tesla regenerative + hydraulic brakes — if warning ON → do not drive.'},
      {id:'t_warn_tpms',  label:'Tire Pressure (TPMS)',              note:'Must be OFF. Check tire before driving if this is ON.'},
      {id:'t_warn_abs',   label:'ABS / Stability Warning',           note:'Must be OFF. If ON → braking behavior may be unpredictable; report to Fleet.'},
      {id:'t_warn_12v',   label:'12V Battery / Power Warning',       note:'Must be OFF. Powers accessories — if ON → report to Fleet.'},
      {id:'t_warn_other', label:'Any other active warning',          note:'All lights must be OFF. Any orange or red → report to Fleet before driving.'},
    ]},
    prestart_tesla: {id:'prestart_tesla', label:'Tesla Pre-Start Check', items:[
      {id:'t_charge',     label:'Battery charge sufficient (display)',     note:'Check center screen — range should cover full shift. Charge if below 30% or 80 miles.'},
      {id:'t_no_leaks',   label:'No puddle or drip under vehicle',         note:'Tesla has a coolant loop — look at the ground for any wet spots.'},
      {id:'t_sounds',     label:'No unusual sounds or vibrations',         note:'Driving slowly in parking lot — no grinding, clicking, or rattling.'},
      {id:'t_washer',     label:'Windshield washer fluid',                 note:'Check frunk fluid reservoir is not empty; refill if needed.'},
    ]},
    exterior_tesla: {id:'exterior_tesla', label:'Exterior Lights & Glass', items:[
      {id:'t_headlights', label:'Headlights (both sides)',   note:'Auto headlights functional; manual high beam works.'},
      {id:'t_taillights', label:'Tail lights & brake lights',note:'Have someone observe from behind while you press brake.'},
      {id:'t_signals',    label:'Turn signals (all 4)',       note:'All four corners flash at normal rate.'},
      {id:'t_hazards',    label:'Hazard flashers',            note:'All 4 corners flash simultaneously.'},
      {id:'t_windshield', label:'Windshield — no cracks',    note:'No cracks or chips in driver\'s field of vision; camera lane-assist not obstructed.'},
      {id:'t_wipers',     label:'Wipers clean and streak-free',note:'Run wipers — no streaking, no torn blades.'},
      {id:'t_mirrors',    label:'Side mirrors & camera',     note:'Both mirrors adjusted; backup camera clean and clear.'},
      {id:'t_doors',      label:'All doors close fully',     note:'All 4 doors close and latch; handles extend properly.'},
    ]},
    tires_tesla: {id:'tires_tesla', label:'Tires', items:[
      {id:'t_tires_all',  label:'All 4 tires visually OK',  note:'No visible flat, bulge, or damage; TPMS light is OFF (checked above).'},
    ]},
    interior_tesla: {id:'interior_tesla', label:'Cab & Passenger Area', items:[
      {id:'t_seat_belt',  label:'Driver seatbelt latches and retracts',   note:'Click in and pull to test.'},
      {id:'t_screen',     label:'Touchscreen & controls responsive',       note:'Main screen boots; climate, mirrors, and windows all respond.'},
      {id:'t_climate',    label:'Heat & A/C working (rear vents)',         note:'Rear passengers need climate — check rear vent airflow.'},
      {id:'t_pax_belts',  label:'Both rear passenger seatbelts',           note:'Both rear seats: belt clicks in and retracts properly.'},
      {id:'t_clean',      label:'Interior clean — no hazards',             note:'Rear passenger area clean; no loose objects; floor clean.'},
      {id:'t_firstaid',   label:'Basic first aid kit present',             note:'Small kit in glovebox or trunk — ensure it\'s there.'},
      {id:'t_docs',       label:'Registration & insurance in vehicle',     note:'Check glovebox — registration and insurance card present and current.'},
    ]},

    // ══════════════════════════════════════════════════════════
    // SUV-254-01 — 2017 Land Rover Range Rover HSE (Gas SUV)
    // Ambulatory, up to 3 passengers. Luxury SUV. No lift. No wheelchair.
    // ══════════════════════════════════════════════════════════
    alerts_landrover: {id:'alerts_landrover', label:'Dashboard Warning Lights', critical:true, items:[
      {id:'lr_warn_engine',label:'Check Engine / MIL',              note:'Must be OFF. If ON → possible engine fault; do not operate; report to Fleet.'},
      {id:'lr_warn_oil',   label:'Oil Pressure Warning',            note:'Must be OFF. If ON → stop engine immediately; engine damage risk.'},
      {id:'lr_warn_cool',  label:'Coolant Temperature Warning',     note:'Must be OFF. If ON → overheating; do not drive.'},
      {id:'lr_warn_bat',   label:'Battery / Alternator Warning',    note:'Must be OFF. If ON → electrical fault; report to Fleet.'},
      {id:'lr_warn_brake', label:'Brake System Warning',            note:'Must be OFF. If ON → do not drive; safety-critical.'},
      {id:'lr_warn_susp',  label:'Air Suspension Warning',          note:'Must be OFF. Range Rover uses air suspension — if ON, vehicle height may be wrong; report to Fleet.'},
      {id:'lr_warn_tpms',  label:'Tire Pressure (TPMS)',            note:'Must be OFF. Check and inflate tires before driving if ON.'},
      {id:'lr_warn_abs',   label:'ABS / Traction Control Warning',  note:'Must be OFF. If ON → braking affected; report to Fleet.'},
      {id:'lr_warn_other', label:'Any other active warning',        note:'All lights must be OFF. Any orange or red → report to Fleet.'},
    ]},
    prestart_landrover: {id:'prestart_landrover', label:'Range Rover Pre-Start Check', items:[
      {id:'lr_fuel',      label:'Fuel level adequate (dashboard)',  note:'Gauge shows at least 1/4 tank; V8 burns fuel quickly — fill if low.'},
      {id:'lr_no_leaks',  label:'No fluid leaks under vehicle',     note:'Look at the ground — no oil, coolant, or power steering fluid puddles.'},
      {id:'lr_no_smell',  label:'No burning smell at startup',      note:'Start engine — no burning oil or electrical smell.'},
      {id:'lr_no_sounds', label:'No unusual engine or suspension sounds', note:'Air suspension should inflate quietly; no knocking or grinding.'},
    ]},
    exterior_landrover: {id:'exterior_landrover', label:'Exterior Lights & Glass', items:[
      {id:'lr_headlights',label:'Headlights (both sides — auto and high beam)', note:'Adaptive LED headlights functional; no condensation inside housing.'},
      {id:'lr_taillights',label:'Tail lights & brake lights',       note:'Both sides; have someone confirm brake lights from behind.'},
      {id:'lr_signals',   label:'Turn signals (all 4)',             note:'All 4 corners working.'},
      {id:'lr_hazards',   label:'Hazard flashers',                  note:'All 4 corners flash.'},
      {id:'lr_windshield',label:'Windshield — no cracks',          note:'No cracks in driver\'s field of vision.'},
      {id:'lr_wipers',    label:'Wipers and washers',               note:'Both wipers; front and rear wash sprays.'},
      {id:'lr_mirrors',   label:'Door mirrors & camera',            note:'Power mirrors adjust; 360° surround-view camera clean.'},
    ]},
    tires_lr: {id:'tires_lr', label:'Tires', items:[
      {id:'lr_tires_all', label:'All 4 tires visually OK',         note:'No visible damage, flat, or severe uneven wear; TPMS light OFF.'},
    ]},
    interior_landrover: {id:'interior_landrover', label:'Cab & Passenger Area', items:[
      {id:'lr_seat_belt', label:'Driver seatbelt',                  note:'Latches and retracts properly; seat locks in position.'},
      {id:'lr_climate',   label:'4-zone climate control working',   note:'Driver and rear-passenger zones respond; heat and A/C functional.'},
      {id:'lr_pax_belts', label:'All 3 passenger seatbelts',        note:'Row 2 (L, R) and row 3 — each belt clicks and retracts.'},
      {id:'lr_clean',     label:'Interior clean — no hazards',      note:'All seats clean; no loose items; carpets clean.'},
      {id:'lr_firstaid',  label:'First aid kit present',            note:'Kit present in center console or luggage area.'},
      {id:'lr_docs',      label:'Registration & insurance in vehicle',note:'Check glovebox — current and valid.'},
    ]},

    // ══════════════════════════════════════════════════════════
    // COMMON: Dashboard alerts for combustion vans / ambulances
    // (WV, SH, AMB, ST all use this)
    // ══════════════════════════════════════════════════════════
    dashboard_alerts: {id:'dashboard_alerts', label:'Dashboard Warning Lights', critical:true, items:[
      {id:'da_check_engine',label:'Check Engine / Malfunction Indicator Lamp (MIL)', note:'Must be OFF. If ON → possible engine fault; do not operate; report to Fleet.'},
      {id:'da_oil_press',   label:'Oil Pressure Warning',                            note:'Must be OFF. If ON → stop engine immediately; engine damage risk.'},
      {id:'da_coolant',     label:'Coolant Temperature Warning',                     note:'Must be OFF. If ON → overheating risk; do not operate.'},
      {id:'da_battery',     label:'Battery / Charging Warning',                      note:'Must be OFF. If ON → electrical system fault; report to Fleet.'},
      {id:'da_brake',       label:'Brake System Warning',                            note:'Must be OFF. If ON → do not drive; safety-critical fault.'},
      {id:'da_tpms',        label:'Tire Pressure (TPMS) Warning',                   note:'Must be OFF. If ON → check and inflate tires before driving.'},
      {id:'da_abs',         label:'ABS / Traction Control Warning',                 note:'Must be OFF. If ON → report to Fleet.'},
      {id:'da_trans',       label:'Transmission Warning',                            note:'Must be OFF. If ON → do not drive; report to Fleet.'},
      {id:'da_any_other',   label:'Any other active warning or error light',         note:'All lights must be OFF. Any orange or red → report to Fleet before driving.'},
    ]},
    engine_gas: {id:'engine_gas', label:'Engine & Pre-Start Visual', items:[
      {id:'eng_no_leaks',  label:'No fluid leaks under vehicle',    note:'Look at the ground — no oil, coolant, fuel, or brake fluid puddles'},
      {id:'eng_no_smell',  label:'No burning smell at startup',     note:'Brief idle — no burning oil, fuel, or electrical smell'},
      {id:'eng_no_sounds', label:'No unusual engine sounds',        note:'No knocking, grinding, or rattling at idle'},
      {id:'eng_fuel',      label:'Fuel level adequate (dashboard)', note:'Gauge shows at least 1/4 tank for full shift; fill if needed'},
      {id:'eng_washer',    label:'Windshield washer fluid',         note:'Reservoir above MIN; top up if low'},
    ]},
    exterior_van: {id:'exterior_van', label:'Exterior Lights & Body', items:[
      {id:'vn_headlights', label:'Headlights (low & high beam)',    note:'Both sides'},
      {id:'vn_taillights', label:'Tail lights & brake lights',      note:'Both sides; confirm brake lights from outside'},
      {id:'vn_signals',    label:'Turn signals — all 4 corners',    note:''},
      {id:'vn_hazards',    label:'Emergency / hazard flashers',     note:''},
      {id:'vn_reverse',    label:'Reverse lights',                  note:''},
      {id:'vn_windshield', label:'Windshield — no cracks',          note:'Driver\'s field of vision clear'},
      {id:'vn_wipers',     label:'Wiper blades & washer',           note:'Blades not torn; washer sprays'},
      {id:'vn_mirrors',    label:'Side mirrors & cameras',          note:'Both mirrors adjusted; backup/360° camera clean'},
      {id:'vn_fuel_cap',   label:'Fuel cap secure',                 note:'No fuel odor; cap clicks tight'},
      {id:'vn_body',       label:'Body, doors & cargo doors',       note:'No damage affecting safety; all latch and close properly'},
    ]},
    tires_van: {id:'tires_van', label:'Tires & Wheels', items:[
      {id:'vn_tires',     label:'All tires visually OK (no flats/damage)', note:'Walk around and check all tires — no visible flat, bulge, or severe wear'},
      {id:'vn_lug_nuts',  label:'Lug nuts appear secure',                  note:'No missing lug nuts visible; no cracking or rust around wheel'},
    ]},
    brakes_van: {id:'brakes_van', label:'Brakes', items:[
      {id:'vn_brake_pedal',label:'Brake pedal firm',               note:'Pump brake — firm resistance; does not sink to floor or feel spongy'},
      {id:'vn_park_brake', label:'Parking brake holds',            note:'Apply parking brake; vehicle should not roll on flat surface'},
    ]},
    interior_van: {id:'interior_van', label:'Cab Interior', items:[
      {id:'vn_driver_belt',label:'Driver seat & seatbelt',         note:'Seat locks in position; belt clicks and retracts'},
      {id:'vn_hvac',       label:'Heating & A/C',                  note:'Both functional in cab and patient area'},
      {id:'vn_docs',       label:'Vehicle documents',              note:'Registration, insurance, inspection sticker — current and in vehicle'},
    ]},
    // ── Wheelchair Van (WV-254-01: 3 WC + 12 pax) ─────────
    med_wv: {id:'med_wv', label:'Wheelchair Van Equipment', items:[
      {id:'wc_straps',   label:'Wheelchair tie-down straps — 3 sets (12 straps total)', note:'No fraying; Q\'Straint hooks latch and lock audibly'},
      {id:'wc_seatbelt', label:'Wheelchair occupant seatbelts × 3',   note:'Each WC position — belt clicks and retracts'},
      {id:'side_ramp',   label:'Hydraulic side-door ramp',            note:'Test full cycle: deploy → raise → lower → stow; limit switch beeps; surface not slippery'},
      {id:'rear_lift',   label:'Rear hydraulic wheelchair lift',      note:'Full cycle test: up, load, down, stow; emergency lowering works'},
      {id:'grab_handles',label:'Interior grab handles all secure',    note:'No wobble; firmly mounted'},
      {id:'floor_cond',  label:'Floor — clean, dry, no trip hazards', note:'Flooring not lifted; clean from prior trip; no debris'},
      {id:'pax_belts_12',label:'All 12 passenger seatbelts',          note:'Each seat has a working seatbelt'},
      {id:'oxygen',      label:'Oxygen system',                       note:'Tank ≥ 500 PSI; regulator works; no leaks; mask/cannula present'},
      {id:'suction',     label:'Suction unit',                        note:'Powers on; canister clean'},
      {id:'aed',         label:'AED',                                 note:'Green indicator; pads not expired'},
      {id:'med_kit_wv',  label:'Medical first aid kit',               note:'Stocked (gloves, BP cuff, pulse ox, bandages)'},
      {id:'sanitation',  label:'Patient area sanitized',              note:'Wiped down since last trip; no biohazard contamination'},
    ]},
    // ── Shuttle (SH-254-01: 1 WC + 14 pax) ─────────────────
    med_shuttle: {id:'med_shuttle', label:'Shuttle Equipment', items:[
      {id:'sh_wc_straps',  label:'1× wheelchair tie-down set (4 straps)', note:'No fraying; hooks latch; securements lock'},
      {id:'sh_wc_belt',    label:'Wheelchair occupant seatbelt',          note:'WC position — belt clicks and retracts'},
      {id:'sh_ramp',       label:'Side-door hydraulic ramp',              note:'Full cycle: deploy, raise, lower, stow; not slippery'},
      {id:'sh_grab',       label:'Grab handles secure',                   note:'All handles firm; no wobble'},
      {id:'sh_floor',      label:'Floor clean and dry',                   note:'No hazards; clean from prior trip'},
      {id:'sh_belts_14',   label:'All 14 passenger seatbelts',            note:'Each seat has a working seatbelt — walk the aisle to check'},
      {id:'sh_firstaid',   label:'First aid kit present',                 note:'ANSI Class A minimum'},
      {id:'sh_clean',      label:'Interior clean and ready',              note:'All seats clean; no trash or hazards'},
    ]},
    // ── Ambulance BLS base (AMB-254-01 & AMB-254-02) ────────
    med_amb_base: {id:'med_amb_base', label:'Ambulance Equipment', items:[
      {id:'emerg_lights',  label:'Emergency lights & all siren tones',  note:'All LED light bars on; test all siren tones (wail, yelp, air horn)'},
      {id:'stretcher',     label:'Power stretcher / cot loads correctly',note:'Auto-load mechanism functions; cot locks into vehicle; legs deploy and collapse'},
      {id:'oxygen_amb',    label:'Oxygen — main tank & portable',        note:'Main ≥ 500 PSI; portable charged; regulators functional; no leaks'},
      {id:'suction_amb',   label:'Suction unit',                         note:'Powers on; adequate vacuum; tubing clean'},
      {id:'aed_amb',       label:'AED / defibrillator',                  note:'Self-test passes; pads not expired; battery charged'},
      {id:'bvm',           label:'BVM (bag-valve mask)',                  note:'Adult and pediatric masks; valve functional'},
      {id:'bp_pulse',      label:'BP cuff & pulse oximeter',             note:'Both functional'},
      {id:'trauma_kit',    label:'Trauma bag stocked',                   note:'Gloves, dressings, bandages, splints, cervical collars — all present'},
      {id:'airway_basic',  label:'Basic airway supplies',                note:'OPA, NPA, suction catheters accessible'},
      {id:'pax_belts_amb', label:'Patient & attendant seatbelts',        note:'Stretcher straps; attendant belt; squad bench belts'},
      {id:'sanitation_amb',label:'Patient compartment sanitized',        note:'All surfaces wiped; no biohazard from prior call'},
      {id:'comm_amb',      label:'Radio & MDT',                          note:'Radio transmits and receives clearly; MDT connected'},
    ]},
    // ── ALS 2 extras (AMB-254-02 only) ──────────────────────
    med_amb_als: {id:'med_amb_als', label:'ALS 2 Advanced Equipment', items:[
      {id:'cardiac_mon',  label:'Cardiac monitor (12-lead ECG)',          note:'Powers on; self-test passes; pads installed; battery charged; 12-lead cable present'},
      {id:'iv_pump',      label:'IV pump',                                note:'Powers on; tubing sets present; battery charged'},
      {id:'adv_airway',   label:'Advanced airway kit',                   note:'Laryngoscope + blades, ET tubes, stylet, CO2 detector — all present'},
      {id:'ventilator',   label:'Transport ventilator',                   note:'Powers on; battery charged; circuits clean; test lung attached'},
      {id:'capnography',  label:'Waveform capnography',                   note:'Module attached; sampling line present'},
      {id:'als_meds',     label:'ALS medications',                        note:'Cabinet sealed or supervisor-checked; all meds present and in-date'},
      {id:'telemedicine', label:'Telemedicine system',                    note:'Camera functional; hospital link tested'},
    ]},
    // ── Stretcher transport (ST-254-01) ──────────────────────
    med_stretcher: {id:'med_stretcher', label:'Stretcher Equipment', items:[
      {id:'st_stretcher',  label:'Power stretcher / cot',                note:'Auto-load functional; locks in place; legs deploy and retract'},
      {id:'st_straps',     label:'Patient restraint straps',             note:'Head, chest, lap straps all present and functional'},
      {id:'st_oxygen',     label:'Oxygen — onboard & portable',          note:'≥ 500 PSI; regulators work; no leaks; mask available'},
      {id:'st_suction',    label:'Suction unit',                         note:'Powers on; tubing clean'},
      {id:'st_aed',        label:'AED',                                  note:'Green indicator; pads not expired'},
      {id:'st_med',        label:'Basic medical kit',                    note:'BP cuff, pulse ox, gloves, bandages — present and stocked'},
      {id:'st_climate',    label:'Patient area climate control',         note:'Heat and A/C work in the patient compartment'},
      {id:'st_clean',      label:'Patient compartment clean',            note:'No contamination from prior trip; surfaces wiped'},
    ]},
  };

  // ── Vehicle type → inspection group list mapping ─────────────
  const VEHICLE_PROFILES = {
    // SE-254-01 — 2016 Tesla Model 3 — lean car checklist, no van/medical groups
    'SE': {
      label: 'SE-254-01 — 2016 Tesla Model 3',
      note:  'Electric sedan. Ambulatory passengers only. No lift, no wheelchair equipment.',
      groups: ['alerts_tesla','prestart_tesla','exterior_tesla','tires_tesla','interior_tesla'],
    },
    // SUV-254-01 — 2017 Land Rover Range Rover HSE — lean car checklist
    'SUV': {
      label: 'SUV-254-01 — 2017 Land Rover Range Rover HSE',
      note:  'Gas luxury SUV. Ambulatory, up to 3 passengers. No lift, no wheelchair equipment.',
      groups: ['alerts_landrover','prestart_landrover','exterior_landrover','tires_lr','interior_landrover'],
    },
    // WV-254-01 — 2017 Ford Transit 350 HD — full ADA wheelchair van
    'WV': {
      label: 'WV-254-01 — 2017 Ford Transit 350 HD (Wheelchair Van)',
      note:  'ADA wheelchair transport. 3 wheelchair positions + 12 ambulatory passengers.',
      groups: ['dashboard_alerts','engine_gas','exterior_van','tires_van','brakes_van','interior_van','med_wv'],
    },
    // SH-254-01 — 2017 Ford Transit 350 HD — shuttle
    'SH': {
      label: 'SH-254-01 — 2017 Ford Transit 350 HD (Shuttle)',
      note:  'Group shuttle. 1 wheelchair position + 14 ambulatory passengers.',
      groups: ['dashboard_alerts','engine_gas','exterior_van','tires_van','brakes_van','interior_van','med_shuttle'],
    },
    // AMB-254-01 — 2010 Ford Transit CG — BLS Ambulance
    'AMB-254-01': {
      label: 'AMB-254-01 — 2010 Ford Transit CG (BLS Ambulance)',
      note:  'Basic Life Support. Full BLS equipment inspection required.',
      groups: ['dashboard_alerts','engine_gas','exterior_van','tires_van','brakes_van','interior_van','med_amb_base'],
    },
    // AMB-254-02 — 2010 Ford Transit CG — ALS 2 Ambulance
    'AMB-254-02': {
      label: 'AMB-254-02 — 2010 Ford Transit CG (ALS 2 Ambulance)',
      note:  'Advanced Life Support 2. Full BLS + ALS equipment inspection required.',
      groups: ['dashboard_alerts','engine_gas','exterior_van','tires_van','brakes_van','interior_van','med_amb_base','med_amb_als'],
    },
    // ST-254-01 — 2010 Ford Transit CG — Stretcher Transport
    'ST': {
      label: 'ST-254-01 — 2010 Ford Transit CG (Stretcher Transport)',
      note:  'Non-emergency stretcher transport. Check stretcher and basic medical equipment.',
      groups: ['dashboard_alerts','engine_gas','exterior_van','tires_van','brakes_van','interior_van','med_stretcher'],
    },
  };

  // Resolve profile from unit number
  function profileForUnit(unit) {
    if (!unit) return null;
    const u = unit.toUpperCase();
    if (VEHICLE_PROFILES[u]) return VEHICLE_PROFILES[u];
    const prefix = u.split('-')[0];
    return VEHICLE_PROFILES[prefix] || null;
  }

  let inspState = loadJ(INSP_KEY);
  let inspCollapsed = loadJ(INSP_COLLAPSE_KEY);
  let activeInspProfile = null; // set when vehicle selected

  // Load fleet into inspector vehicle selector
  async function loadFleetForInspection() {
    const sel = $('#inspVehicleSelect'); if (!sel) return;
    try {
      const r = await fetch('/api/fleet/live', { headers: ah(), cache: 'no-store' });
      if (!r.ok) return;
      const j = await r.json();
      const vehicles = j.vehicles || [];
      sel.innerHTML = '<option value="">-- Choose vehicle --</option>' +
        vehicles.map(v => {
          const p = profileForUnit(v.unit);
          const label = p ? p.label : `${v.unit} (${v.type})`;
          return `<option value="${v.unit}">${v.unit} — ${label.split('(')[0].trim()}</option>`;
        }).join('');
      // Pre-select saved vehicle
      if (shift.vehicleUnit) sel.value = shift.vehicleUnit;
      onVehicleSelected(sel.value);
    } catch (e) { console.error('[DRIVER] loadFleet:', e); }
  }

  function onVehicleSelected(unit) {
    const proceed = $('#btnProceedInspection');
    const infoBox = $('#inspVehicleInfo');
    const nameEl  = $('#inspVehicleName');
    const noteEl  = $('#inspVehicleNote');
    const card = $('#inspVehicleCard');
    const cardStep = $('#inspVehicleCardStep');
    const cardTitle = $('#inspVehicleCardTitle');
    const profile = profileForUnit(unit);
    activeInspProfile = profile;
    if (profile && unit) {
      if (infoBox) infoBox.hidden = false;
      if (nameEl)  nameEl.textContent = profile.label;
      if (noteEl)  noteEl.textContent = profile.note;
      if (proceed) proceed.disabled = false;
      if (card) card.classList.remove('inspVehicleCardCollapsed');
      if (cardStep) cardStep.textContent = 'Step 1 of 2';
      if (cardTitle) cardTitle.textContent = 'Select your vehicle';
    } else {
      if (infoBox) infoBox.hidden = true;
      if (proceed) proceed.disabled = true;
      if (card) card.classList.remove('inspVehicleCardCollapsed');
      if (cardStep) cardStep.textContent = 'Step 1 of 2';
      if (cardTitle) cardTitle.textContent = 'Select your vehicle';
    }
  }

  $('#inspVehicleSelect')?.addEventListener('change', e => onVehicleSelected(e.target.value));

  $('#btnProceedInspection')?.addEventListener('click', () => {
    const unit = $('#inspVehicleSelect')?.value;
    if (!unit) return;
    shift.vehicleUnit = unit.toUpperCase();
    saveShift();
    // Set the active profile BEFORE rendering
    activeInspProfile = profileForUnit(shift.vehicleUnit);
    inspState = {}; // clear any prior inspection state for a fresh checklist
    inspCollapsed = {};
    localStorage.removeItem(INSP_KEY);
    localStorage.removeItem(INSP_COLLAPSE_KEY);
    // Show checklist
    const section = $('#inspChecklistSection'), footer = $('#inspFormFooter'), vehicleCard = $('#inspVehicleCard');
    const cardStep = $('#inspVehicleCardStep');
    const cardTitle = $('#inspVehicleCardTitle');
    if (section) section.hidden = false;
    if (footer)  footer.hidden  = false;
    if (vehicleCard) {
      vehicleCard.classList.add('inspVehicleCardCollapsed');
      vehicleCard.style.opacity = '';
    }
    if (cardStep) cardStep.textContent = 'Assigned Vehicle';
    if (cardTitle) cardTitle.textContent = activeInspProfile?.label || shift.vehicleUnit;
    renderInspection();
    section?.scrollIntoView({ behavior: 'smooth' });
  });

  function renderInspection() {
    const list = $('#inspChecklist'); if (!list) return;
    const profile = activeInspProfile || profileForUnit(shift.vehicleUnit);
    // Don't render until a vehicle is chosen
    if (!profile) { list.innerHTML = ''; return; }
    const groupIds = profile.groups;
    const activeGroups = groupIds.map(id => ALL_INSP_GROUPS[id]).filter(Boolean);
    activeGroups.forEach((g)=>{
      if(typeof inspCollapsed[g.id]!=='boolean')inspCollapsed[g.id]=true;
    });
    let total = 0, checked = 0;
    list.innerHTML = activeGroups.map(g => {
      const states = g.items.map(item=>inspState[item.id]||null);
      const passCount = states.filter(v=>v==='pass').length;
      const failCount = states.filter(v=>v==='fail').length;
      const itemCount = g.items.length;
      const allPass = itemCount>0 && passCount===itemCount;
      const allFail = itemCount>0 && failCount===itemCount;
      const collapsed = inspCollapsed[g.id]!==false;
      const items = g.items.map(item => {
        total++; const val = inspState[item.id]; if (val) checked++;
        return `<div class="inspItem">
          <div class="inspLabel">${item.label}${item.note ? `<small>${item.note}</small>` : ''}</div>
          <div class="inspToggle">
            <button type="button" class="${val === 'pass' ? 'pass' : ''}" data-insp="${item.id}" data-v="pass">Pass</button>
            <button type="button" class="${val === 'fail' ? 'fail' : ''}" data-insp="${item.id}" data-v="fail">Fail</button>
          </div>
        </div>`;
      }).join('');
      return `<section class="inspSection">
        <div class="inspGroupHead">
          <button type="button" class="inspGroupTitleBtn" data-insp-toggle="${g.id}" aria-expanded="${!collapsed}">
            <span>${collapsed ? '▸' : '▾'} ${g.label}</span>
            <span class="meta">${passCount + failCount}/${itemCount}</span>
          </button>
          <div class="inspGroupActions">
            <button type="button" class="inspGroupBulkBtn ${allPass ? 'active-pass' : ''}" data-insp-bulk="${g.id}" data-v="pass">✓ Pass All</button>
            <button type="button" class="inspGroupBulkBtn ${allFail ? 'active-fail' : ''}" data-insp-bulk="${g.id}" data-v="fail">✕ Fail All</button>
          </div>
        </div>
        <div class="inspGroupItems" ${collapsed ? 'hidden' : ''}>${items}</div>
      </section>`;
    }).join('');
    $$('[data-insp]', list).forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.insp, v = btn.dataset.v;
        inspState[id] = inspState[id] === v ? null : v;
        localStorage.setItem(INSP_KEY, JSON.stringify(inspState));
        renderInspection();
      });
    });
    $$('[data-insp-toggle]', list).forEach(btn => {
      btn.addEventListener('click', () => {
        const gid = btn.dataset.inspToggle;
        inspCollapsed[gid] = !(inspCollapsed[gid] === true);
        saveInspCollapse();
        renderInspection();
      });
    });
    $$('[data-insp-bulk]', list).forEach(btn => {
      btn.addEventListener('click', () => {
        const gid = btn.dataset.inspBulk;
        const v = btn.dataset.v;
        const group = activeGroups.find((x)=>x.id===gid);
        if(!group)return;
        group.items.forEach((item)=>{ inspState[item.id]=v; });
        localStorage.setItem(INSP_KEY, JSON.stringify(inspState));
        renderInspection();
      });
    });
    const pct = total ? Math.round(checked / total * 100) : 0;
    if ($('#inspProgressLabel')) $('#inspProgressLabel').textContent = `${checked} / ${total}`;
    if ($('#inspProgressBar'))   $('#inspProgressBar').style.width   = pct + '%';
    // Real-time dashboard alert detection — find the critical group for this vehicle
    const activeGroups2 = (activeInspProfile || profileForUnit(shift.vehicleUnit))?.groups || [];
    const criticalGroupId = activeGroups2.find(gid => ALL_INSP_GROUPS[gid]?.critical);
    const criticalGroup = criticalGroupId ? ALL_INSP_GROUPS[criticalGroupId] : null;
    const anyAlertFailed = criticalGroup?.items.some(i => inspState[i.id] === 'fail') || false;
    const banner = $('#inspAlertBanner');
    if (banner) banner.hidden = !anyAlertFailed;
    // Change submit button if alert is active
    const submitBtn = $('#btnSubmitInspection');
    if (submitBtn) {
      if (anyAlertFailed) {
        submitBtn.textContent = '⚠️ Warning Light Active — Cannot Start Shift';
        submitBtn.className = 'btn primary';
        submitBtn.style.opacity = '0.6';
      } else {
        submitBtn.textContent = 'Submit Inspection & Start Shift';
        submitBtn.className = 'btn ok';
        submitBtn.style.opacity = '';
      }
    }
  }

  $('#inspectionForm')?.addEventListener('submit', e => {
    e.preventDefault();
    const profile = activeInspProfile || profileForUnit(shift.vehicleUnit);
    if (!profile) { alert('Select your vehicle before submitting.'); return; }
    const groupIds = profile.groups;
    const allItems = groupIds.map(id => ALL_INSP_GROUPS[id]).filter(Boolean).flatMap(g => g.items);
    const missing  = allItems.filter(i => !inspState[i.id]);
    const failures = allItems.filter(i => inspState[i.id] === 'fail').map(i => i.label);
    const noticeEl = $('#inspSubmitNotice');
    // Block if any dashboard warning light is ON (failed)
    const activeGroupIds = profile.groups;
    const critGid = activeGroupIds.find(gid => ALL_INSP_GROUPS[gid]?.critical);
    const critGroup = critGid ? ALL_INSP_GROUPS[critGid] : null;
    const alertFails = critGroup?.items.filter(i => inspState[i.id] === 'fail').map(i => i.label) || [];
    if (alertFails.length) {
      if (noticeEl) {
        noticeEl.hidden = false;
        noticeEl.textContent = `Cannot start shift — ${alertFails.length} dashboard warning light(s) are ON. Contact Fleet before operating this vehicle.`;
      }
      return;
    }
    if (missing.length) {
      if (noticeEl) { noticeEl.hidden = false; noticeEl.textContent = `${missing.length} item(s) not checked. Mark every item Pass or Fail.`; }
      return;
    }
    const odo = Number($('#inspOdometer')?.value) || null;
    if (odo) { miles.odoStart = odo; saveMiles(); }
    shift.inspectionDone = true;
    shift.inspectedVehicleUnit = String(shift.vehicleUnit || '').toUpperCase();
    saveShift();
    if (failures.length) alert(`FAILED ITEMS (${failures.length}):\n${failures.join('\n')}\n\nReport to Fleet before operating.`);
    if(!shift.onDuty){
      beginShift();
      showView('dashView');
    }else{
      showView('dashView');
      dashNotice(`Inspection complete for ${shift.inspectedVehicleUnit}. You may continue trips.`, 'ok');
    }
  });

  // ── Trips / manifest ──────────────────────────────────────────
  async function loadTrips(){
    try{
      const r=await fetch('/api/driver/assignments',{headers:ah(),cache:'no-store'});
      if(!r.ok)return;
      const j=await r.json();
      trips=(j.assignments||[]).map(b=>({
        ...(()=>{
          const pickupFromApi=b.pickupLat!=null?Number(b.pickupLat):b.pickup_lat!=null?Number(b.pickup_lat):null;
          const pickupLngFromApi=b.pickupLng!=null?Number(b.pickupLng):b.pickup_lng!=null?Number(b.pickup_lng):null;
          const destFromApi=b.destinationLat!=null?Number(b.destinationLat):b.destination_lat!=null?Number(b.destination_lat):null;
          const destLngFromApi=b.destinationLng!=null?Number(b.destinationLng):b.destination_lng!=null?Number(b.destination_lng):null;
          const pickupFallback=coordForAddress(b.pickup||'');
          const destFallback=coordForAddress(b.destination||'');
          return {
            pickupLat:Number.isFinite(pickupFromApi)?pickupFromApi:(pickupFallback?.lat??null),
            pickupLng:Number.isFinite(pickupLngFromApi)?pickupLngFromApi:(pickupFallback?.lng??null),
            destinationLat:Number.isFinite(destFromApi)?destFromApi:(destFallback?.lat??null),
            destinationLng:Number.isFinite(destLngFromApi)?destLngFromApi:(destFallback?.lng??null),
          };
        })(),
        ref:b.reference||b.id,date:normalizeTripDate(b.date||b.trip_date||''),
        time:(b.time||b.trip_time||'').slice(0,5),
        pickup:b.pickup||'',destination:b.destination||'',
        vehicleUnit:String(b.vehicleUnit||b.vehicle_unit||b.vehicle||'').trim().toUpperCase(),
        patient:b.name||'Patient',service:b.service||'',
        status:normalizeBookingStatus(b.status||'SCHEDULED'),notes:b.notes||'',
        distanceMiles:b.distanceMiles!=null?Number(b.distanceMiles):null,
        distMi:b.distanceMiles!=null?Number(b.distanceMiles).toFixed(1):null,
        accepted:false,
        comments:'',
      }));
      updateBadge();
      renderDash();
      if($('#manifestView')?.classList.contains('active'))renderManifest();
    }catch(e){console.error('[DRIVER]',e);}
  }

  async function acceptTrip(ref){
    const t=trips.find(x=>x.ref===ref);if(!t)return;
    try{
      const r=await fetch(`/api/bookings/${encodeURIComponent(ref)}/accept`,{method:'POST',headers:ah(),cache:'no-store'});
      const j=await r.json().catch(()=>({}));
      if(!r.ok)throw new Error(j.error||'Unable to accept trip');
      t.status=normalizeBookingStatus(j.booking?.status||'ASSIGNED');
      t.accepted=true;
      renderManifest();renderDash();
      dashNotice('Trip accepted. Acceptance is allowed regardless of scheduled time.','ok');
    }catch(err){dashNotice(err.message,'err');}
  }

  function updateBadge(){
    const today=new Date().toISOString().slice(0,10);
    const n=trips.filter(t=>t.date===today&&!isTerminalStatus(t.status)).length;
    const b=$('#manifestBadge');if(b){b.hidden=n===0;b.textContent=n;}
  }

  function renderManifest(){
    const now=new Date();
    const todayIso=new Date().toISOString().slice(0,10);
    const startOfToday=new Date(now.getFullYear(),now.getMonth(),now.getDate());
    const dayEnd=new Date(startOfToday.getTime()+manifestDays*86400000);
    const rollingEnd=new Date(now.getTime()+manifestDays*86400000);
    const list=trips.filter(t=>{
      if(!t.date)return false;
      const tripDt=new Date(`${t.date}T${(t.time||'00:00').slice(0,5)}:00`);
      if(Number.isNaN(tripDt.getTime()))return false;
      if(manifestDays===1){
        if(tripDt>=now&&tripDt<rollingEnd)return true;
        if(isTerminalStatus(t.status)&&t.date===todayIso)return true;
        return false;
      }
      const tripDay=new Date(t.date+'T00:00:00');
      return tripDay>=startOfToday&&tripDay<dayEnd;
    })
      .sort((a,b)=>(a.date+a.time).localeCompare(b.date+b.time));
    const el=$('#manifestList');if(!el)return;
    if(!list.length){el.innerHTML='<div class="empty"><p>No assigned trips in this period.</p></div>';return;}
    const sc={SCHEDULED:'gray',REQUESTED:'gray',SUBMITTED:'gray',PENDING_DISPATCH_CONFIRMATION:'gray',ASSIGNED:'blue',EN_ROUTE:'amber',PATIENT_ON_BOARD:'amber',ARRIVED_PICKUP:'amber',DEPARTED:'amber',ARRIVED_DESTINATION:'amber',DELIVERED:'green',COMPLETED:'green',MISSED:'red',NO_SHOW:'red',CANCELLED:'red'};
    const canAccept=t=>['ASSIGNED','SCHEDULED','REQUESTED','SUBMITTED','PENDING_DISPATCH_CONFIRMATION'].includes(t.status)&&!t.accepted;
    const isCompleted=t=>['COMPLETED','NO_SHOW','MISSED','CANCELLED'].includes(t.status);
    const upcoming=list.filter(t=>!isCompleted(t));
    const completed=list.filter(isCompleted);

    const row=(t)=>`<div class="tripCard${t.ref===activeRef?' active-trip':''}" data-ref="${t.ref}" role="button" tabindex="0">
        <div class="tripTime"><strong>${t.time||'—'}</strong><small>${fmtDate(t.date)}</small></div>
        <div class="tripInfo"><strong>${t.patient}</strong><span>${t.pickup}</span><span>to ${t.destination}</span></div>
        <div style="display:flex;flex-direction:column;gap:8px;align-items:flex-end">
          <span class="badge ${sc[t.status]||'gray'}">${t.status.replace(/_/g,' ')}</span>
          <span style="font:800 11px/1 Manrope,sans-serif;letter-spacing:.06em;text-transform:uppercase;color:var(--muted)">${t.distMi!=null?`${t.distMi} mi`:'Miles n/a'}</span>
          ${canAccept(t)?`<button class="btn ghost sm" data-accept-ref="${t.ref}" type="button">Accept</button>`:'<span style="font-size:11px;color:var(--muted)">'+(t.accepted?'Accepted':(isCompleted(t)?'Closed':'In progress'))+'</span>'}
        </div>
      </div>`;

    el.innerHTML=`<div class="card" style="margin-bottom:10px;padding:12px 14px;display:flex;justify-content:space-between;align-items:center;gap:12px">
      <div>
        <strong>Upcoming trips</strong>
        <div style="font-size:12px;color:var(--muted);margin-top:3px">Accept pending assignments and advance active trips.</div>
      </div>
      <button class="btn primary sm" id="acceptAllBtn" ${upcoming.filter(canAccept).length?'':'disabled'}>Accept All</button>
    </div>`+
    (upcoming.length?upcoming.map(row).join(''):'<div class="empty"><p>No upcoming trips in this period.</p></div>')+
    `<div class="card" style="margin:12px 0 8px;padding:12px 14px;background:#f8fafc;border-style:dashed">
      <div>
        <strong>Completed trips</strong>
        <div style="font-size:12px;color:var(--muted);margin-top:3px">Trips move here after completion, no-show, cancellation, or missed status.</div>
      </div>
    </div>`+
    (completed.length?completed.map(row).join(''):'<div class="empty"><p>No completed trips yet in this period.</p></div>');
    $$('.tripCard',el).forEach(c=>{
      const open=()=>openTrip(c.dataset.ref);
      c.addEventListener('click',open);
      c.addEventListener('keypress',e=>e.key==='Enter'&&open());
    });
    $$('.btn[data-accept-ref]',el).forEach(btn=>btn.addEventListener('click',e=>{e.stopPropagation();acceptTrip(btn.dataset.acceptRef);}));
    const acceptAllBtn=$('#acceptAllBtn');
    if(acceptAllBtn){acceptAllBtn.addEventListener('click',async()=>{
      const pending=upcoming.filter(canAccept);
      if(!pending.length)return;
      acceptAllBtn.disabled=true;acceptAllBtn.textContent='Accepting…';
      try{
        await Promise.all(pending.map(t=>acceptTrip(t.ref)));
      } finally {acceptAllBtn.disabled=false;acceptAllBtn.textContent='Accept All';}
    });}
  }

  $$('#manifestTabs button').forEach(b=>b.addEventListener('click',()=>{
    manifestDays=Number(b.dataset.days);
    $$('#manifestTabs button').forEach(x=>x.classList.remove('active'));
    b.classList.add('active');renderManifest();
  }));

  // ── Trip detail + workflow ────────────────────────────────────
  const WORKFLOW=[
    {label:'En Route to Pickup',    status:'EN_ROUTE',            hint:'Start navigation to pickup and call dispatch if traffic or delay exceeds 10 minutes.'},
    {label:'Arrived at Pickup',     status:'ARRIVED_PICKUP',      hint:'Park safely, confirm passenger name and destination, and assist with secure boarding.'},
    {label:'Patient On Board',      status:'PATIENT_ON_BOARD',    hint:'Verify seatbelt or restraint is secured, then confirm everyone is ready to depart.'},
    {label:'Departed',              status:'DEPARTED',            hint:'Drive to destination and report any route, safety, or condition changes to dispatch.'},
    {label:'Arrived at Destination',status:'ARRIVED_DESTINATION', hint:'Stop at the correct entrance, assist unloading, and confirm handoff location.'},
    {label:'Patient Delivered',     status:'DELIVERED',           hint:'Confirm patient handoff is complete and capture any notes before closing trip.'},
    {label:'Trip Complete',         status:'COMPLETED',           hint:'Log final mileage and notes so billing and compliance records are complete.'},
  ];
  const WF_STATUS=WORKFLOW.map(w=>w.status);
  let stepHintsOpen=false;
  function wfIdx(s){return WF_STATUS.indexOf(normalizeBookingStatus(s));}
  function nextWorkflowStep(status){
    const i=wfIdx(status);
    if(i===-1)return WORKFLOW[0]||null;
    return WORKFLOW[i+1]||null;
  }

  function renderStepHints(t){
    const box=$('#tripStepHints');
    const body=$('#tripStepHintsBody');
    if(!box||!body||!t)return;
    const idx=wfIdx(t.status);
    body.innerHTML=WORKFLOW.map((w,i)=>{
      const tone=i<idx?'var(--ok)':i===idx?'var(--ink)':'var(--muted)';
      const marker=i<idx?'Done':i===idx?'Current':'Next';
      const markerBg=i<idx?'#ecfdf3':i===idx?'#eff6ff':'#f8fafc';
      const markerColor=i<idx?'var(--ok)':i===idx?'#1e40af':'#475569';
      return `<div style="border:1px solid var(--line);border-radius:10px;padding:8px 10px;background:#fff">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:4px">
          <strong style="font:700 13px/1.2 Manrope,sans-serif;color:${tone}">${i+1}. ${w.label}</strong>
          <span style="display:inline-flex;align-items:center;padding:3px 7px;border-radius:999px;background:${markerBg};color:${markerColor};font:800 10px/1 Manrope,sans-serif;letter-spacing:.06em;text-transform:uppercase">${marker}</span>
        </div>
        <div style="font:500 13px/1.35 Source Sans 3,sans-serif;color:var(--muted)">${w.hint}</div>
      </div>`;
    }).join('');
    box.hidden=!stepHintsOpen;
    const toggle=$('#btnTripStepHelp');
    if(toggle)toggle.textContent=stepHintsOpen?'Hide Step Hints':'Show Step Hints';
  }

  function buildAiHintLines(trip){
    const driverName=usr().display_name||usr().email||'Driver';
    const lines=[];
    lines.push(`Driver on file: ${driverName}.`);
    if(trip){
      const next=nextWorkflowStep(trip.status);
      const policy=next?.status==='EN_ROUTE'?tripStartPolicy(trip):null;
      lines.push(`Active trip: ${trip.patient} (${trip.ref}).`);
      lines.push(`Route: ${trip.pickup} to ${trip.destination}.`);
      if(next?.status==='EN_ROUTE'){
        lines.push(policy?.allowed ? 'You can start this trip now.' : policy?.message || 'Start window is not open yet.');
      } else if(next?.label){
        lines.push(`Next step: ${next.label}.`);
      }
    } else {
      lines.push('Open a trip to get step-by-step guidance.');
    }
    const recs=(window.NexusAI?.recommendations?.(trips)||[]).slice(0,2);
    if(recs.length){
      lines.push('System suggestions:');
      recs.forEach((rec)=>lines.push(`${rec.priority}: ${rec.title} — ${rec.detail}`));
    }
    return lines;
  }

  function renderAiHelp(trip, question=''){
    const panel=$('#tripAiHelp');
    const body=$('#tripAiHelpBody');
    if(!panel||!body)return;
    if(!aiHelpOpen){
      panel.hidden=true;
      return;
    }
    panel.hidden=false;
    const q=String(question||$('#tripAiHelpQuestion')?.value||'').trim();
    const lines=q?[
      `You asked: ${q}`,
      ...buildAiHintLines(trip)
    ]:buildAiHintLines(trip);
    body.innerHTML=lines.map((line,i)=>`<div style="padding:8px 10px;border-radius:10px;border:1px solid var(--line);background:${i===0&&q?'#eff6ff':'#fff'};font-size:13px;line-height:1.4;color:var(--ink)">${line}</div>`).join('');
    const toggle=$('#btnTripAiHelp');
    if(toggle)toggle.textContent='Hide AI Help';
  }

  function askEarlyPickupReason(message){
    return new Promise((resolve)=>{
      const modal=$('#earlyReasonModal');
      const text=$('#earlyReasonInput');
      const msg=$('#earlyReasonMessage');
      const ok=$('#earlyReasonSubmit');
      const cancel=$('#earlyReasonCancel');
      if(!modal||!text||!msg||!ok||!cancel){
        resolve('');
        return;
      }
      msg.textContent=message||'Please provide why this trip is starting early.';
      text.value='';
      modal.hidden=false;
      setTimeout(()=>text.focus(),30);

      const close=(value)=>{
        modal.hidden=true;
        ok.removeEventListener('click',onOk);
        cancel.removeEventListener('click',onCancel);
        resolve(String(value||'').trim());
      };
      const onOk=()=>close(text.value);
      const onCancel=()=>close('');
      ok.addEventListener('click',onOk);
      cancel.addEventListener('click',onCancel);
    });
  }

  function activeTripForRoute(){
    return trips.find(t=>t.ref===activeRef&&!['COMPLETED','DELIVERED','CANCELLED'].includes(t.status))
      || trips.find(t=>!['COMPLETED','DELIVERED','CANCELLED','SCHEDULED'].includes(t.status));
  }

  function resetRouteAuto(tripRef=null){
    routeAuto={
      enabled:false,
      tripRef,
      startOdo:null,
      milesSinceStart:0,
      lastPos:null,
      segmentStartMiles:0,
      segmentStartOdo:null,
      pickupCoord:null,
      destinationCoord:null,
      arrivedDestinationAt:null,
      updating:false,
    };
  }

  function statusLabelPlain(status){
    return String(status||'').replaceAll('_',' ').trim();
  }

  function syncRouteAutoUi(trip){
    const startInput=$('#routeAutoStartOdo');
    const toggle=$('#btnRouteAutoToggle');
    const info=$('#routeAutoInfo');
    const doneBtn=$('#btnRouteCompleteTrip');
    if(!toggle||!info||!doneBtn)return;
    if(startInput&&!routeAuto.enabled&&Number.isFinite(routeAuto.startOdo))startInput.value=String(routeAuto.startOdo);
    toggle.textContent=routeAuto.enabled?'Stop Auto Log':'Start Auto Log';
    if(routeAuto.enabled){
      const estOdo=Number(routeAuto.startOdo||0)+Number(routeAuto.milesSinceStart||0);
      info.textContent=`Auto log ON • Miles ${Number(routeAuto.milesSinceStart||0).toFixed(1)} • Est. odometer ${estOdo.toFixed(1)}`;
    }else{
      const hasCoords=Number.isFinite(trip?.pickupLat)&&Number.isFinite(trip?.pickupLng)&&Number.isFinite(trip?.destinationLat)&&Number.isFinite(trip?.destinationLng);
      info.textContent=hasCoords
        ? 'Enter starting odometer, then start auto log. The app will detect arrival/departure and log route mileage.'
        : 'Enter starting odometer, then start auto log. Auto status detection requires dispatch coordinates for pickup and destination.';
    }
    const st=normalizeBookingStatus(trip?.status||'');
    const canComplete=['ARRIVED_DESTINATION','DELIVERED'].includes(st);
    doneBtn.disabled=!canComplete;
    doneBtn.textContent=canComplete?'Trip Complete':'Trip Complete (after dropoff)';
  }

  async function ensureRouteCoords(trip){
    if(!trip)return;
    if(!routeAuto.pickupCoord){
      if(Number.isFinite(trip.pickupLat)&&Number.isFinite(trip.pickupLng))routeAuto.pickupCoord={lat:Number(trip.pickupLat),lng:Number(trip.pickupLng)};
    }
    if(!routeAuto.destinationCoord){
      if(Number.isFinite(trip.destinationLat)&&Number.isFinite(trip.destinationLng))routeAuto.destinationCoord={lat:Number(trip.destinationLat),lng:Number(trip.destinationLng)};
    }
  }

  function logAutoRouteSegment(trip,fromStatus,toStatus){
    if(!routeAuto.enabled||!Number.isFinite(routeAuto.startOdo))return;
    const segMiles=Math.max(0,Number(routeAuto.milesSinceStart||0)-Number(routeAuto.segmentStartMiles||0));
    if(segMiles<0.05)return;
    const odoStart=Number(routeAuto.segmentStartOdo||routeAuto.startOdo);
    const odoEnd=odoStart+segMiles;
    const nextSt=normalizeBookingStatus(toStatus);
    const type=['ARRIVED_PICKUP','EN_ROUTE'].includes(nextSt)?'DEADHEAD':'LOADED';
    const from=nextSt==='ARRIVED_PICKUP'?'Current location':trip.pickup;
    const to=nextSt==='ARRIVED_PICKUP'?trip.pickup:trip.destination;
    miles.legs.push({
      id:Date.now(),
      from,
      to,
      odoStart:Number(odoStart.toFixed(1)),
      odoEnd:Number(odoEnd.toFixed(1)),
      miles:Number(segMiles.toFixed(1)),
      type,
      tripRef:trip.ref,
      time:new Date().toISOString(),
      note:`Auto status: ${statusLabelPlain(fromStatus)} -> ${statusLabelPlain(toStatus)}`,
    });
    routeAuto.segmentStartMiles=Number(routeAuto.milesSinceStart||0);
    routeAuto.segmentStartOdo=odoEnd;
    saveMiles();
    if($('#statMiles'))$('#statMiles').textContent=totalMiles().toFixed(1);
  }

  async function updateTripStatusAuto(trip,nextStatus,note=''){
    if(!trip||routeAuto.updating)return false;
    const current=normalizeBookingStatus(trip.status);
    const next=normalizeBookingStatus(nextStatus);
    if(!next||current===next)return true;
    routeAuto.updating=true;
    try{
      const payload={status:next,vehicleUnit:shift.vehicleUnit||undefined};
      if(note)payload.note=note;
      const r=await fetch(`/api/bookings/${encodeURIComponent(trip.ref)}/update`,{method:'POST',headers:ah(),body:JSON.stringify(payload)});
      if(!r.ok){const j=await r.json().catch(()=>({}));throw new Error(j.error||`HTTP ${r.status}`);}
      logAutoRouteSegment(trip,current,next);
      trip.status=next;
      if(next==='ARRIVED_DESTINATION')routeAuto.arrivedDestinationAt=Date.now();
      renderRouteFocus();
      renderTripWorkflow(trip);
      renderStepHints(trip);
      renderManifest();
      dashNotice(`Auto update: ${statusLabelPlain(next)}.`, 'ok');
      return true;
    }catch(err){
      dashNotice(`Auto status update failed: ${err.message}`,'warn');
      return false;
    }finally{routeAuto.updating=false;}
  }

  async function maybeAdvanceRouteByPosition(pos){
    if(!routeAuto.enabled)return;
    const trip=trips.find(t=>t.ref===routeAuto.tripRef);
    if(!trip)return;
    const curr={lat:Number(pos?.coords?.latitude),lng:Number(pos?.coords?.longitude)};
    if(!Number.isFinite(curr.lat)||!Number.isFinite(curr.lng))return;
    if(routeAuto.lastPos){
      const delta=milesBetween(routeAuto.lastPos,curr);
      if(Number.isFinite(delta)&&delta>0&&delta<2)routeAuto.milesSinceStart+=delta;
    }
    routeAuto.lastPos=curr;
    await ensureRouteCoords(trip);
    const speed=Number(pos?.coords?.speed||0)*2.237;
    const st=normalizeBookingStatus(trip.status);
    const distToPickup=milesBetween(curr,routeAuto.pickupCoord);
    const distToDest=milesBetween(curr,routeAuto.destinationCoord);

    if(st==='EN_ROUTE'&&Number.isFinite(distToPickup)&&distToPickup<=ROUTE_AUTO_ARRIVAL_MI){
      await updateTripStatusAuto(trip,'ARRIVED_PICKUP','Auto-detected near pickup');
      syncRouteAutoUi(trip);
      return;
    }
    if(st==='ARRIVED_PICKUP'&&Number.isFinite(distToPickup)&&distToPickup>=ROUTE_AUTO_DEPART_MI&&speed>=4){
      await updateTripStatusAuto(trip,'PATIENT_ON_BOARD','Auto-detected departure from pickup');
      await updateTripStatusAuto(trip,'DEPARTED','Auto-detected trip departure');
      syncRouteAutoUi(trip);
      return;
    }
    if(st==='PATIENT_ON_BOARD'&&speed>=4){
      await updateTripStatusAuto(trip,'DEPARTED','Auto-detected trip departure');
      syncRouteAutoUi(trip);
      return;
    }
    if(st==='DEPARTED'&&Number.isFinite(distToDest)&&distToDest<=ROUTE_AUTO_ARRIVAL_MI){
      await updateTripStatusAuto(trip,'ARRIVED_DESTINATION','Auto-detected near destination');
      syncRouteAutoUi(trip);
      return;
    }
    if(st==='ARRIVED_DESTINATION'&&Number.isFinite(distToDest)&&distToDest<=ROUTE_AUTO_ARRIVAL_MI&&speed<=2){
      const dwell=Date.now()-(routeAuto.arrivedDestinationAt||Date.now());
      if(dwell>=20000){
        await updateTripStatusAuto(trip,'DELIVERED','Auto-confirmed destination stop');
      }
    }
    syncRouteAutoUi(trip);
  }

  function renderRouteFocus(){
    const t=activeTripForRoute();
    if(!t)return;
    if($('#routeFocusTitle'))$('#routeFocusTitle').textContent=t.patient;
    const towardPickup=wfIdx(t.status)<=1;
    const legFrom=towardPickup?'Current location':t.pickup;
    const legTo=towardPickup?t.pickup:t.destination;
    const fullMode=routeFocusMapMode==='full';
    if($('#routeFocusCurrentLeg'))$('#routeFocusCurrentLeg').textContent=fullMode?'Full route overview':(towardPickup?'Heading to pickup':'Heading to destination');
    if($('#routeFocusCurrentLegSub'))$('#routeFocusCurrentLegSub').textContent=`${t.status.replace(/_/g,' ')} • ${fmtDate(t.date)} ${t.time||''}`;
    if($('#routeFocusFrom'))$('#routeFocusFrom').textContent=`From: ${fullMode?t.pickup:legFrom}`;
    if($('#routeFocusTo'))$('#routeFocusTo').textContent=`To: ${fullMode?t.destination:legTo}`;
    if($('#routeFocusMeta'))$('#routeFocusMeta').textContent=`Service: ${t.service||'N/A'} • Ref: ${t.ref}`;
    const routeWarn=$('#routeFocusVehicleWarning');
    if(routeWarn){
      const needsStart=nextWorkflowStep(t.status)?.status==='EN_ROUTE';
      const policy=needsStart?inspectionPolicyForTripStart(t):null;
      if(policy&&!policy.allowed){
        routeWarn.hidden=false;
        routeWarn.textContent=`Vehicle Switch Required: ${policy.message}`;
      }else{
        routeWarn.hidden=true;
        routeWarn.textContent='';
      }
    }

    const mapUrl=fullMode
      ? `https://www.google.com/maps?q=${encodeURIComponent(`${t.pickup} to ${t.destination}`)}&output=embed`
      : `https://www.google.com/maps?q=${encodeURIComponent(legTo)}&output=embed`;
    const frame=$('#routeFocusMap');if(frame)frame.src=mapUrl;
    const legBtn=$('#btnRouteOpenLegNav');
    const fullBtn=$('#btnRouteOpenFullNav');
    if(legBtn){
      legBtn.classList.toggle('navy',!fullMode);
      legBtn.classList.toggle('ghost',fullMode);
    }
    if(fullBtn){
      fullBtn.classList.toggle('navy',fullMode);
      fullBtn.classList.toggle('ghost',!fullMode);
    }
    syncRouteAutoUi(t);
  }

  function setRouteFocus(open){
    routeFocusOpen=Boolean(open);
    const dash=$('#dashView');
    const card=$('#routeFocusCard');
    if(routeFocusOpen&&dash)clearCardFocus(dash);
    if(dash)dash.classList.toggle('route-mode',routeFocusOpen);
    if(card)card.hidden=!routeFocusOpen;
    if(routeFocusOpen){
      const t=activeTripForRoute();
      if(t)activeRef=t.ref;
      if(t&&routeAuto.tripRef&&routeAuto.tripRef!==t.ref)resetRouteAuto(t.ref);
      if(t&&!routeAuto.tripRef)routeAuto.tripRef=t.ref;
      routeFocusMapMode='leg';
      renderRouteFocus();
      if(!dash?.classList.contains('active'))showView('dashView');
    }
  }

  function maybeAutoOpenRouteFocus(){
    if(routeFocusOpen)return;
    const dash=$('#dashView');
    if(!dash?.classList.contains('active'))return;
    const t=activeTripForRoute();
    if(!t)return;
    if(routeFocusDismissedRef&&routeFocusDismissedRef===t.ref)return;
    activeRef=t.ref;
    setRouteFocus(true);
  }

  function openTrip(ref){
    const t=trips.find(x=>x.ref===ref);if(!t)return;
    activeRef=ref;
    $('#tripRef').textContent=t.ref;
    $('#tripPatient').textContent=t.patient;
    $('#tripPickup').textContent=t.pickup;
    $('#tripDestination').textContent=t.destination;
    $('#tripServiceBadge').textContent=t.service;
    $('#tripDateBadge').textContent=`${fmtDate(t.date)} ${t.time}`;
    const sc={COMPLETED:'green',DELIVERED:'green',CANCELLED:'red',MISSED:'red',NO_SHOW:'red',EN_ROUTE:'amber',PATIENT_ON_BOARD:'amber',DEPARTED:'amber'};
    $('#tripStatusBadge').textContent=t.status.replace(/_/g,' ');
    $('#tripStatusBadge').className=`badge ${sc[t.status]||'blue'}`;
    $('#tripComments').value=t.comments||'';
    renderTripWorkflow(t);
    renderStepHints(t);
    renderAiHelp(t);
    const last=miles.legs[miles.legs.length-1];
    if(last?.odoEnd&&$('#legOdoStart'))$('#legOdoStart').value=last.odoEnd;
    const inTrip=['PATIENT_ON_BOARD','DEPARTED'].includes(t.status);
    const lt=$('#legType');if(lt)lt.value=inTrip?'LOADED':'DEADHEAD';
    showView('tripView');
  }

  function renderTripWorkflow(t){
    const done=['COMPLETED','CANCELLED','NO_SHOW','MISSED'].includes(t.status);
    const idx=wfIdx(t.status);
    const next=nextWorkflowStep(t.status);
    const wfEl=$('#tripWorkflow');if(!wfEl)return;
    const startNotice=$('#tripStartNotice');
    const startPolicy=next?.status==='EN_ROUTE'?tripStartPolicy(t):null;
    const vehiclePolicy=next?.status==='EN_ROUTE'?inspectionPolicyForTripStart(t):null;
    if(startNotice){
      if(done){
        startNotice.hidden=true;
        startNotice.textContent='';
      }
      else
      if(next?.status==='EN_ROUTE'&&vehiclePolicy&&!vehiclePolicy.allowed){
        startNotice.hidden=false;
        startNotice.textContent=vehiclePolicy.message;
      }
      else
      if(next?.status==='EN_ROUTE'&&!startPolicy.allowed){
        startNotice.hidden=false;
        startNotice.textContent=startPolicy.message;
      } else {
        startNotice.hidden=true;
        startNotice.textContent='';
      }
    }
    wfEl.innerHTML=WORKFLOW.map((w,i)=>{
      const st=i<idx?'done':i===idx?'current':'pending';
      return `<div style="display:flex;align-items:center;gap:10px;padding:10px 16px;border-bottom:1px solid var(--line)${i===WORKFLOW.length-1?';border-bottom:0':''}">
        <div style="width:28px;height:28px;border-radius:50%;display:grid;place-items:center;font:800 12px Manrope,sans-serif;flex:0 0 auto;background:${st==='done'?'var(--ok)':st==='current'?'var(--navy)':'var(--line)'};color:${st?'#fff':'var(--muted)'}">
          ${st==='done'?'✓':i+1}
        </div>
        <div style="display:flex;flex-direction:column;gap:4px;min-width:0">
          <span style="font:${st==='current'?'700':'500'} 14px Source Sans 3,sans-serif;color:${st==='done'?'var(--ok)':st==='current'?'var(--ink)':'var(--muted)'}">
            ${w.label}
          </span>
        </div>
      </div>`;
    }).join('');
    const btn=$('#btnAdvanceTrip');if(!btn)return;
    if(done){btn.textContent='Trip Complete';btn.disabled=true;}
    else{
      btn.textContent=next?.status==='EN_ROUTE'?'START TRIP':(next?.label||'Advance').toUpperCase();
      const blockedByVehicle=next?.status==='EN_ROUTE'&&vehiclePolicy?!vehiclePolicy.allowed:false;
      btn.disabled=!shift.onDuty||!next||blockedByVehicle;
    }
    const noShowBtn=$('#btnMarkNoShow');
    if(noShowBtn){
      noShowBtn.disabled=done;
      noShowBtn.textContent=done?'No Show Marked':'Mark No Show';
    }
    if(stepHintsOpen)renderStepHints(t);
    if(aiHelpOpen)renderAiHelp(t);
  }

  async function markTripNoShow(){
    const t=trips.find(x=>x.ref===activeRef);if(!t)return;
    if(['COMPLETED','CANCELLED','NO_SHOW','MISSED'].includes(t.status))return;
    const reason=prompt('Enter no-show details (optional):','')?.trim()||'';
    const btn=$('#btnMarkNoShow');
    if(btn){btn.disabled=true;btn.textContent='Marking…';}
    try{
      const r=await fetch(`/api/bookings/${encodeURIComponent(t.ref)}/update`,{method:'POST',headers:ah(),body:JSON.stringify({status:'NO_SHOW',note:reason||undefined})});
      if(!r.ok){const j=await r.json().catch(()=>({}));throw new Error(j.error||`HTTP ${r.status}`);}
      t.status='NO_SHOW';
      renderTripWorkflow(t);renderStepHints(t);updateBadge();renderManifest();
      dashNotice('Trip marked as No Show.','ok');
    }catch(err){alert('No-show update failed: '+err.message);renderTripWorkflow(t);}
    finally{
      if(btn){btn.disabled=false;btn.textContent='Mark No Show';}
    }
  }

  $('#btnMarkNoShow')?.addEventListener('click',markTripNoShow);

  $('#btnTripStepHelp')?.addEventListener('click',()=>{
    const t=trips.find(x=>x.ref===activeRef);if(!t)return;
    stepHintsOpen=!stepHintsOpen;
    renderStepHints(t);
  });
  $('#btnTripStepHelpClose')?.addEventListener('click',()=>{
    const t=trips.find(x=>x.ref===activeRef);if(!t)return;
    stepHintsOpen=false;
    renderStepHints(t);
  });

  $('#btnTripAiHelp')?.addEventListener('click',()=>{
    const t=trips.find(x=>x.ref===activeRef);if(!t)return;
    aiHelpOpen=!aiHelpOpen;
    renderAiHelp(t);
  });
  $('#btnTripAiHelpClose')?.addEventListener('click',()=>{
    const t=trips.find(x=>x.ref===activeRef);if(!t)return;
    aiHelpOpen=false;
    renderAiHelp(t);
  });
  $('#btnTripAiHelpAsk')?.addEventListener('click',()=>{
    const t=trips.find(x=>x.ref===activeRef);if(!t)return;
    renderAiHelp(t,$('#tripAiHelpQuestion')?.value||'');
  });

  $('#btnAdvanceTrip')?.addEventListener('click',async()=>{
    const t=trips.find(x=>x.ref===activeRef);if(!t)return;
    const next=nextWorkflowStep(t.status);if(!next)return;
    if(next.status==='EN_ROUTE'){
      const vehiclePolicy=inspectionPolicyForTripStart(t);
      if(!vehiclePolicy.allowed){
        const startNotice=$('#tripStartNotice');
        if(startNotice){
          startNotice.hidden=false;
          startNotice.textContent=vehiclePolicy.message;
        }
        if(vehiclePolicy.tripUnit){
          shift.vehicleUnit=vehiclePolicy.tripUnit;
          saveShift();
          showView('inspectionView');
          const sel=$('#inspVehicleSelect');
          if(sel){sel.value=vehiclePolicy.tripUnit;onVehicleSelected(vehiclePolicy.tripUnit);}
        }
        return;
      }
      if(vehiclePolicy.tripUnit&&vehiclePolicy.tripUnit!==shift.vehicleUnit){
        shift.vehicleUnit=vehiclePolicy.tripUnit;
        saveShift();
      }
    }
    const btn=$('#btnAdvanceTrip');btn.disabled=true;btn.textContent='Updating…';
    const startNotice=$('#tripStartNotice');
    try{
      let earlyPickupReason='';
      if(next.status==='EN_ROUTE'){
        const policy=tripStartPolicy(t);
        if(!policy.allowed){
          earlyPickupReason=await askEarlyPickupReason(`${policy.message} If the patient requested an earlier pickup, enter the driver or dispatch reason now:`);
          if(!earlyPickupReason){throw new Error('Early pickup reason is required before starting this trip.');}
        }
      }
      const r=await fetch(`/api/bookings/${encodeURIComponent(t.ref)}/update`,{method:'POST',headers:ah(),body:JSON.stringify({status:next.status,vehicleUnit:shift.vehicleUnit||undefined,earlyPickupReason:earlyPickupReason||undefined})});
      if(!r.ok){const j=await r.json().catch(()=>({}));throw new Error(j.error||`HTTP ${r.status}`);}
      t.status=next.status;
      if(next.status==='EN_ROUTE'){
        shift.lastTripVehicleUnit=shift.vehicleUnit||assignedVehicleUnit(t)||'';
        saveShift();
      }
      if(next.status==='COMPLETED'){shift.completedTrips++;saveShift();}
      if(startNotice){startNotice.hidden=true;startNotice.textContent='';}
      renderTripWorkflow(t);renderStepHints(t);updateBadge();renderManifest();
    }catch(err){
      if(startNotice){
        startNotice.hidden=false;
        startNotice.textContent='Update failed: '+err.message;
      }
      renderTripWorkflow(t);
    }
  });

  $('#btnSaveComments')?.addEventListener('click',()=>{
    const t=trips.find(x=>x.ref===activeRef);if(!t)return;
    t.comments=$('#tripComments').value.trim();
    const btn=$('#btnSaveComments');btn.textContent='Saved';setTimeout(()=>{btn.textContent='Save Notes';},2000);
  });

  $('#btnGoActiveTrip')?.addEventListener('click',()=>{if(activeRef)openTrip(activeRef);});
  $('#btnNavActiveTrip')?.addEventListener('click',()=>{
    const t=activeTripForRoute();
    if(!t){dashNotice('No active trip route to navigate right now.','warn');return;}
    activeRef=t.ref;
    routeFocusDismissedRef=null;
    setRouteFocus(true);
  });
  $('#btnExitRouteFocus')?.addEventListener('click',()=>{
    const t=activeTripForRoute();
    routeFocusDismissedRef=t?.ref||activeRef||null;
    setRouteFocus(false);
  });
  $('#btnRouteAutoToggle')?.addEventListener('click',async()=>{
    const t=activeTripForRoute();
    if(!t){dashNotice('No active trip to automate.','warn');return;}
    if(routeAuto.enabled){
      routeAuto.enabled=false;
      routeAuto.lastPos=null;
      syncRouteAutoUi(t);
      dashNotice('Auto route logging paused.','info');
      return;
    }
    const odoRaw=$('#routeAutoStartOdo')?.value;
    const startOdo=Number(odoRaw);
    if(!Number.isFinite(startOdo)||startOdo<=0){dashNotice('Enter a valid starting odometer first.','warn');return;}
    routeAuto.enabled=true;
    routeAuto.tripRef=t.ref;
    routeAuto.startOdo=startOdo;
    routeAuto.milesSinceStart=0;
    routeAuto.lastPos=null;
    routeAuto.segmentStartMiles=0;
    routeAuto.segmentStartOdo=startOdo;
    routeAuto.pickupCoord=null;
    routeAuto.destinationCoord=null;
    routeAuto.arrivedDestinationAt=null;
    await ensureRouteCoords(t);
    if(!routeAuto.pickupCoord||!routeAuto.destinationCoord){
      routeAuto.enabled=false;
      dashNotice('Auto detection needs pickup/destination coordinates from dispatch for this trip.','warn');
      syncRouteAutoUi(t);
      return;
    }
    syncRouteAutoUi(t);
    dashNotice('Auto log enabled. Trip statuses and mileage will update from route movement.','ok');
  });
  $('#btnRouteOpenLegNav')?.addEventListener('click',()=>{routeFocusMapMode='leg';renderRouteFocus();});
  $('#btnRouteOpenFullNav')?.addEventListener('click',()=>{routeFocusMapMode='full';renderRouteFocus();});
  $('#btnRouteCompleteTrip')?.addEventListener('click',async()=>{
    const t=activeTripForRoute();
    if(!t){dashNotice('No active trip to complete.','warn');return;}
    const st=normalizeBookingStatus(t.status);
    if(!['ARRIVED_DESTINATION','DELIVERED'].includes(st)){
      dashNotice('Trip can be completed after destination arrival and dropoff.','warn');
      return;
    }
    if(st==='ARRIVED_DESTINATION'){
      const ok=await updateTripStatusAuto(t,'DELIVERED','Driver confirmed patient dropoff');
      if(!ok)return;
    }
    const ok=await updateTripStatusAuto(t,'COMPLETED','Driver completed trip from route card');
    if(!ok)return;
    shift.completedTrips+=1;
    saveShift();
    routeAuto.enabled=false;
    renderDash();
    await loadTrips();
    maybeAutoOpenRouteFocus();
  });
  $('#btnRouteManageTrip')?.addEventListener('click',()=>{if(activeRef)openTrip(activeRef);});

  // ── Mileage ───────────────────────────────────────────────────
  function calcLeg(){
    const s=Number($('#legOdoStart')?.value)||0,e=Number($('#legOdoEnd')?.value)||0;
    const el=$('#legMilesCalc');if(!el)return 0;
    const d=e-s;
    if(s&&e&&d>0){el.style.display='block';el.textContent=`${d.toFixed(1)} miles`;}else{el.style.display='none';}
    return d>0?d:0;
  }
  $('#legOdoStart')?.addEventListener('input',calcLeg);
  $('#legOdoEnd')?.addEventListener('input',calcLeg);

  $('#btnLogLeg')?.addEventListener('click',()=>{
    const s=Number($('#legOdoStart').value),e=Number($('#legOdoEnd').value);
    if(!s||!e||e<=s){alert('Enter valid start and end odometer readings.');return;}
    const t=trips.find(x=>x.ref===activeRef),type=$('#legType').value;
    miles.legs.push({id:Date.now(),from:t?t.pickup:'Previous stop',to:t?t.destination:'Next stop',odoStart:s,odoEnd:e,miles:e-s,type,tripRef:activeRef||null,time:new Date().toISOString()});
    saveMiles();
    $('#legOdoStart').value=e;$('#legOdoEnd').value='';calcLeg();
    const btn=$('#btnLogLeg');btn.textContent='Logged';setTimeout(()=>{btn.textContent='+ Log Mile Leg';},2000);
    if($('#statMiles'))$('#statMiles').textContent=totalMiles().toFixed(1);
  });

  $('#btnUpdateOdometer')?.addEventListener('click',()=>{
    const s=Number($('#milesOdoStart')?.value),e=Number($('#milesOdoEnd')?.value);
    if(s)miles.odoStart=s;if(e)miles.odoEnd=e;saveMiles();renderMiles();
  });

  $('#btnAddManualLeg')?.addEventListener('click',()=>{
    const from=prompt('From (address or place):');if(!from)return;
    const to=prompt('To (address or place):');if(!to)return;
    const mi=Number(prompt('Miles:'));if(!mi||mi<=0)return;
    miles.legs.push({id:Date.now(),from,to,odoStart:null,odoEnd:null,miles:mi,type:'DEADHEAD',tripRef:null,time:new Date().toISOString()});
    saveMiles();renderMiles();
  });

  function renderMiles(){
    if(miles.odoStart&&$('#milesOdoStart'))$('#milesOdoStart').value=miles.odoStart;
    if(miles.odoEnd&&$('#milesOdoEnd'))$('#milesOdoEnd').value=miles.odoEnd;
    const el=$('#milesLegList');if(!el)return;
    if(!miles.legs.length){
      el.innerHTML='<div class="card" style="margin:0 14px;padding:20px;text-align:center;color:var(--muted);font-size:14px">No mileage legs recorded yet.<br>Open a trip and log each leg.</div>';
      const tc=$('#milesTotalCard');if(tc)tc.hidden=true;return;
    }
    const tl={DEADHEAD:'Deadhead',LOADED:'Loaded',RETURN:'Return'},tc2={DEADHEAD:'gray',LOADED:'blue',RETURN:'green'};
    el.innerHTML=`<div class="card" style="margin:0 14px;overflow:hidden">`+
      miles.legs.map(l=>`<div class="legRow">
        <div class="legInfo"><strong>${l.from}</strong><span>to ${l.to}</span>
          <span style="margin-top:3px"><span class="badge ${tc2[l.type]||'gray'}" style="font-size:10px">${tl[l.type]||l.type}</span> ${new Date(l.time).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})}</span>
        </div>
        <div style="text-align:right">
          <div class="legMiles">${Number(l.miles).toFixed(1)}<small> mi</small></div>
          <button onclick="window.__rmLeg(${l.id})" style="border:0;background:0;color:var(--err);font-size:11px;font-weight:700;cursor:pointer;margin-top:4px">Remove</button>
        </div>
      </div>`).join('')+`</div>`;
    const tot=totalMiles(),tc=$('#milesTotalCard');
    if(tc){tc.hidden=false;$('#milesTotalVal').textContent=tot.toFixed(1)+' mi';}
    if($('#statMiles'))$('#statMiles').textContent=tot.toFixed(1);
  }
  window.__rmLeg=id=>{miles.legs=miles.legs.filter(l=>l.id!==id);saveMiles();renderMiles();};

  // ── Dashboard ─────────────────────────────────────────────────
  function renderDash(){
    const u=usr(),name=u.display_name||u.email?.split('@')[0]||'Driver';
    if($('#dashDriverName'))$('#dashDriverName').textContent=`Good ${tod()}, ${name}`;
    if($('#dashVehicle')){$('#dashVehicle').textContent=shift.vehicleUnit||'No vehicle';$('#dashVehicle').className='badge '+(shift.vehicleUnit?'blue':'gray');}
    if($('#statHours'))$('#statHours').textContent=fmtH(elapsed());
    if($('#statTrips'))$('#statTrips').textContent=shift.completedTrips;
    if($('#statMiles'))$('#statMiles').textContent=totalMiles().toFixed(1);
    const badge=$('#shiftBadge');
    if(badge){
      badge.textContent=shift.onBreak?'On Break':shift.onDuty?'On Duty':'Off Duty';
      badge.className='topBadge '+(shift.onBreak?'break':shift.onDuty?'on':'off');
      badge.title=shift.onDuty?(shift.onBreak?'Click to end break':'Click to start break'):'Click to start shift';
      badge.setAttribute('aria-label',badge.title);
    }
    const sc=$('#shiftControls'),oc=$('#onDutyControls');
    if(sc)sc.hidden=shift.onDuty;
    if(oc){oc.hidden=!shift.onDuty;oc.style.display=shift.onDuty?'grid':'none';}
    const bb=$('#btnBreak');if(bb)bb.textContent=shift.onBreak?'End Break':'Take Break';
    const startBtn=$('#btnStartShift');
    if(startBtn){
      const pendingToday=trips.filter(t=>t.date===new Date().toISOString().slice(0,10) && tripNeedsAcceptance(t));
      startBtn.textContent=pendingToday.length?'Continue to Shift':'Start Shift';
    }
    const logBtn=$('#btnLogOff');
    if(logBtn)logBtn.hidden=shift.onDuty;
    const notice=$('#dashNotice');
    const pendingToday=trips.filter(t=>t.date===new Date().toISOString().slice(0,10) && tripNeedsAcceptance(t));
    if(notice){
      if(pendingToday.length && !shift.onDuty){
        notice.hidden=false; notice.className='notice info'; notice.textContent=`You have ${pendingToday.length} trip${pendingToday.length===1?'':'s'} waiting to be accepted today.`;
      } else if(!shift.onDuty){
        notice.hidden=true;
      }
    }
    // Active trip
    const active=trips.find(t=>t.ref===activeRef&&!['COMPLETED','DELIVERED','CANCELLED'].includes(t.status))
                ||trips.find(t=>!['COMPLETED','DELIVERED','CANCELLED','SCHEDULED'].includes(t.status));
    const atc=$('#activeTripCard');
    if(active&&atc){
      atc.hidden=false;
      if($('#activeTripTitle'))$('#activeTripTitle').textContent=active.patient;
      const asc={COMPLETED:'green',DELIVERED:'green',CANCELLED:'red',EN_ROUTE:'amber',PATIENT_ON_BOARD:'amber',DEPARTED:'amber'};
      if($('#activeTripBadge')){$('#activeTripBadge').textContent=active.status.replace(/_/g,' ');$('#activeTripBadge').className=`badge ${asc[active.status]||'blue'}`;}
      if($('#activeTripSub'))$('#activeTripSub').textContent=`${active.pickup} to ${active.destination}`;
      const vehicleWarn=$('#activeTripVehicleWarning');
      if(vehicleWarn){
        const needsStart=nextWorkflowStep(active.status)?.status==='EN_ROUTE';
        const policy=needsStart?inspectionPolicyForTripStart(active):null;
        if(policy&&!policy.allowed){
          vehicleWarn.hidden=false;
          vehicleWarn.textContent=`Vehicle Switch Required: ${policy.message}`;
        }else{
          vehicleWarn.hidden=true;
          vehicleWarn.textContent='';
        }
      }
      if(!activeRef)activeRef=active.ref;
      if(aiHelpOpen)renderAiHelp(active);
    }else if(atc)atc.hidden=true;
    // Next upcoming
    const today=new Date().toISOString().slice(0,10);
    const next=trips.filter(t=>t.date>=today&&tripNeedsAcceptance(t)).sort((a,b)=>(a.date+a.time).localeCompare(b.date+b.time))[0];
    const nb=$('#nextTripBody');
    if(nb&&next){nb.innerHTML=`<p style="margin:0 0 4px;font:700 15px Manrope,sans-serif">${next.patient}</p>
      <p style="margin:0 0 4px;font-size:13px;color:var(--muted)">${fmtDate(next.date)} at ${next.time}</p>
      <p style="margin:0;font-size:13px;color:var(--muted)">${next.pickup} to ${next.destination}</p>
      <div style="margin-top:10px"><button class="btn ghost sm" onclick="window.__ot('${next.ref}')">Open Trip</button></div>`;}
    else if(nb)nb.innerHTML='<p style="color:var(--muted);margin:0;font-size:14px">No upcoming trips. Check your manifest.</p>';
    if(routeFocusOpen)renderRouteFocus();
    renderDriverAnalytics();
    const dash=$('#dashView');
    if(dash&&dash.classList.contains('active')){
      requestAnimationFrame(()=>ensureCardFocus(dash));
    }
  }
  window.__ot=ref=>openTrip(ref);

  // ── GPS ───────────────────────────────────────────────────────
  function startGPS(){
    if(!navigator.geolocation||gpsId!=null)return;
    gpsId=navigator.geolocation.watchPosition(async pos=>{
      if(!shift.onDuty)return;
      if(routeAuto.enabled){
        maybeAdvanceRouteByPosition(pos).catch(()=>{});
      }
      if(!shift.vehicleUnit)return;
      try{await fetch('/api/gps',{method:'POST',headers:ah(),body:JSON.stringify({vehicleUnit:shift.vehicleUnit,latitude:pos.coords.latitude,longitude:pos.coords.longitude,heading:pos.coords.heading||null,speedMph:pos.coords.speed?pos.coords.speed*2.237:null,accuracyM:pos.coords.accuracy||null,bookingReference:routeAuto.tripRef||activeRef||null})});}catch{}
    },null,{enableHighAccuracy:true,maximumAge:20000,timeout:25000});
  }
  function stopGPS(){if(gpsId!=null){navigator.geolocation.clearWatch(gpsId);gpsId=null;}}

  // ── Init ──────────────────────────────────────────────────────
  async function initApp(){
    checkResetToken(); // Check for ?action=reset&token= in URL
    const ok=await checkAuth();if(!ok)return;
    hideLoginView();renderDash();renderInspection();loadFleetForInspection();bindAnalyticsTabs();
    await loadTrips();
    showView('dashView');
    if(shift.onDuty)startGPS();
    setInterval(()=>{if(shift.onDuty)renderDash();},30000);
    setInterval(()=>{if(shift.onDuty)loadTrips();},120000);
  }
  initApp();
})();
