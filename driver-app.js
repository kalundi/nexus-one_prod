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

  const tok = () => sessionStorage.getItem('nexusAccessToken');
  const usr = () => { try { return JSON.parse(sessionStorage.getItem('nexusUser') || '{}'); } catch { return {}; } };
  const ah  = () => ({ authorization: `Bearer ${tok()}`, 'content-type': 'application/json' });

  function loadJ(k) { try { return JSON.parse(localStorage.getItem(k) || '{}'); } catch { return {}; } }
  function saveShift() { localStorage.setItem(SHIFT_KEY, JSON.stringify(shift)); }
  function saveMiles() { localStorage.setItem(MILES_KEY, JSON.stringify(miles)); }

  let shift = { onDuty:false, onBreak:false, vehicleUnit:'', startedAt:null, breakMs:0, breakStart:null, completedTrips:0, inspectionDone:false, ...loadJ(SHIFT_KEY) };
  let miles = { odoStart:null, odoEnd:null, legs:[], ...loadJ(MILES_KEY) };
  let trips = [];
  let activeRef = null;
  let manifestDays = 1;
  let gpsId = null;

  function elapsed() {
    if (!shift.onDuty || !shift.startedAt) return 0;
    const p = shift.breakMs + (shift.onBreak && shift.breakStart ? Date.now() - shift.breakStart : 0);
    return Math.max(0, Date.now() - shift.startedAt - p);
  }
  function fmtH(ms) { const h=Math.floor(ms/3600000), m=Math.floor((ms%3600000)/60000); return `${h}:${String(m).padStart(2,'0')}`; }
  function fmtDate(s) { if(!s)return ''; return new Date(s+'T00:00:00').toLocaleDateString([],{month:'short',day:'numeric'}); }
  function tod() { const h=new Date().getHours(); return h<12?'morning':h<17?'afternoon':'evening'; }
  function totalMiles() { return miles.legs.reduce((s,l)=>s+(Number(l.miles)||0),0); }
  function dashNotice(msg,type) { const el=$('#dashNotice');if(!el)return; el.className=`notice ${type||'info'}`;el.textContent=msg;el.hidden=false; setTimeout(()=>{el.hidden=true;},5000); }

  // ── View routing ──────────────────────────────────────────────
  const VT = { dashView:'Dashboard', inspectionView:'Pre-Trip Inspection', manifestView:'Trip Manifest', milesView:'Mileage Log', tripView:'Trip Detail', endView:'End Shift' };
  function showView(id) {
    $$('.view').forEach(v=>v.classList.remove('active'));
    $$('.navBtn').forEach(b=>b.classList.toggle('active',b.dataset.view===id));
    const v=$('#'+id); if(v)v.classList.add('active');
    if($('#topViewTitle'))$('#topViewTitle').textContent=VT[id]||'';
    if(id==='manifestView')renderManifest();
    if(id==='milesView')renderMiles();
    if(id==='inspectionView'){renderInspection();loadFleetForInspection();}
    if(id==='dashView')renderDash();
  }
  $$('.navBtn').forEach(b=>b.addEventListener('click',()=>showView(b.dataset.view)));

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
      hideLoginView();await initApp();
    }catch(err){showLoginErr(err.message);}
    finally{btn.disabled=false;btn.textContent='Sign In';}
  });

  // ── Shift ─────────────────────────────────────────────────────
  $('#btnStartShift')?.addEventListener('click',()=>{
    if(!shift.inspectionDone){showView('inspectionView');return;}
    beginShift();
  });
  function beginShift(){
    const unit=shift.vehicleUnit||prompt('Enter your assigned vehicle unit (e.g. SE-254-01):');
    if(!unit?.trim())return;
    shift.vehicleUnit=unit.trim().toUpperCase();
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
    shift={onDuty:false,onBreak:false,vehicleUnit:shift.vehicleUnit,startedAt:null,breakMs:0,breakStart:null,completedTrips:0,inspectionDone:false};
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
    // ── Dashboard alerts — FIRST for ALL vehicles ─────────────
    // These are what drivers CAN reliably check without mechanical expertise.
    // If ANY light is ON the vehicle must NOT be driven.
    dashboard_alerts: {id:'dashboard_alerts', label:'Dashboard Warning Lights', critical:true, items:[
      {id:'da_check_engine',label:'Check Engine / Malfunction Indicator Lamp (MIL)', note:'Must be OFF. If ON → possible engine fault; do not operate; report to Fleet.'},
      {id:'da_oil_press',   label:'Oil Pressure Warning',                            note:'Must be OFF. If ON → stop engine immediately; serious engine damage risk.'},
      {id:'da_coolant',     label:'Coolant Temperature Warning',                     note:'Must be OFF. If ON → overheating risk; do not operate.'},
      {id:'da_battery',     label:'Battery / Charging Warning',                      note:'Must be OFF. If ON → electrical system fault; report to Fleet.'},
      {id:'da_brake',       label:'Brake System Warning',                            note:'Must be OFF. If ON → do not drive; safety-critical fault.'},
      {id:'da_tpms',        label:'Tire Pressure (TPMS) Warning',                   note:'Must be OFF. If ON → check and inflate tires before driving.'},
      {id:'da_abs',         label:'ABS / Traction Control Warning',                 note:'Must be OFF. If ON → braking may be affected; report to Fleet.'},
      {id:'da_trans',       label:'Transmission Warning',                            note:'Must be OFF. If ON → do not drive; report to Fleet.'},
      {id:'da_any_other',   label:'Any other active warning or error light',         note:'All dashboard lights must be off. Any orange or red light → report to Fleet before driving.'},
    ]},
    // ── Engine pre-start visual (combustion) — what drivers CAN check ──
    // Drivers should NOT be expected to check oil dipstick, coolant overflow,
    // PS fluid, etc. Those are mechanic responsibilities. Drivers verify:
    engine_gas: {id:'engine_gas', label:'Engine Pre-Start Visual Check', items:[
      {id:'eng_no_leaks',  label:'No fluid leaks under vehicle',    note:'Look at the ground under the vehicle — no oil, coolant, fuel, or brake fluid puddles or drips'},
      {id:'eng_no_smell',  label:'No burning smell at startup',     note:'Start engine and idle briefly — no burning oil, fuel, rubber, or electrical smell'},
      {id:'eng_no_sounds', label:'No unusual engine sounds',        note:'No knocking, grinding, rattling, or squealing when engine starts and idles'},
      {id:'eng_fuel',      label:'Fuel level adequate (dashboard)', note:'Dashboard fuel gauge shows at least 1/4 tank for a full shift; fill if needed'},
      {id:'eng_washer',    label:'Windshield washer fluid visible', note:'Open hood — visually check reservoir is above MIN line; top up if low'},
    ]},
    engine_ev: {id:'engine_ev', label:'EV Pre-Start Check', items:[
      {id:'ev_charge',     label:'Battery state of charge (dashboard)', note:'Check energy display — adequate range for full shift; charge if below 30%'},
      {id:'ev_no_leaks',   label:'No fluid leaks under vehicle',        note:'EV coolant loop — look for coolant puddles under front or rear; no drips'},
      {id:'ev_no_sounds',  label:'No unusual sounds at startup',        note:'No grinding, rattling, or clicking when vehicle powers on and moves slowly'},
      {id:'ev_washer',     label:'Windshield washer fluid visible',     note:'Open hood — check reservoir is above MIN; top up if low'},
      {id:'ev_hv_sealed',  label:'High-voltage system sealed',          note:'No visible damage to orange HV cable conduits, battery undercarriage, or charge port'},
    ]},
    exterior_std: {id:'exterior_std', label:'Exterior Lights & Body', items:[
      {id:'headlights',    label:'Headlights (low & high beam)', note:'Both sides operational'},
      {id:'tail_lights',   label:'Tail lights',                  note:'Both sides'},
      {id:'brake_lights',  label:'Brake lights',                 note:'Both sides'},
      {id:'turn_signals',  label:'Turn signals — all 4 corners', note:''},
      {id:'hazards',       label:'Emergency / hazard flashers',  note:''},
      {id:'reverse',       label:'Reverse lights',               note:''},
      {id:'reflectors',    label:'Reflectors (front & rear)',    note:'Clean and visible'},
      {id:'horn',          label:'Horn',                         note:'Functional'},
      {id:'windshield',    label:'Windshield',                   note:'No cracks in driver\'s field of vision'},
      {id:'wipers',        label:'Wiper blades & washer',        note:'Blades not torn; washer sprays'},
      {id:'mirrors',       label:'Side mirrors',                 note:'Clean, adjusted, not cracked'},
      {id:'body_panels',   label:'Body panels & doors',          note:'No damage affecting safety; all latch properly'},
      {id:'hood',          label:'Hood',                         note:'Properly latched'},
    ]},
    exterior_combustion_extra: {id:'exterior_combustion_extra', label:'Fuel & Undercarriage', items:[
      {id:'fuel_cap',      label:'Fuel cap',                note:'Secure, no leaks, no fuel odor'},
      {id:'exhaust',       label:'Exhaust / emissions',     note:'No unusual smoke, leaks, or noise'},
      {id:'undercarriage', label:'Undercarriage — no leaks',note:'Oil, coolant, fuel, brake fluid — all dry'},
    ]},
    exterior_ev_extra: {id:'exterior_ev_extra', label:'Charging & Undercarriage', items:[
      {id:'charge_port',   label:'Charge port door & cable',note:'Door closes flush; no damage to port or cable'},
      {id:'undercarriage_ev',label:'Undercarriage',         note:'No damage to battery pack or HV cable conduits; no fluid leaks'},
    ]},
    tires: {id:'tires', label:'Tires & Wheels', items:[
      {id:'tires_front',label:'Front tires',            note:'Tread ≥ 4/32"; no bulges, cuts, or flat spots; inflation OK'},
      {id:'tires_rear', label:'Rear tires',             note:'Tread ≥ 2/32"; no damage; duals not touching'},
      {id:'lug_nuts',   label:'Lug nuts / wheel bolts', note:'All present; no cracked or broken studs'},
      {id:'wheel_rims', label:'Wheel rims',             note:'No cracks or bends'},
      {id:'spare',      label:'Spare tire (if equipped)',note:'Mounted, inflated, accessible'},
    ]},
    brakes: {id:'brakes', label:'Brakes', items:[
      {id:'svc_brake',  label:'Service brake',             note:'Firm pedal; does not fade, pull, or grab'},
      {id:'park_brake', label:'Parking / emergency brake', note:'Holds vehicle on grade; releases fully'},
      {id:'brake_warn', label:'Brake warning lights',      note:'No ABS, brake, or traction-control warnings active'},
    ]},
    interior: {id:'interior', label:'Cab & Interior Safety', items:[
      {id:'driver_seat', label:'Driver seat & seatbelt',    note:'Seat locked; belt latches and retracts'},
      {id:'dash_lights', label:'Dashboard warning lights',  note:'No check-engine or safety warnings active'},
      {id:'speedometer', label:'Speedometer & gauges',      note:'Functional; no red-zone readings'},
      {id:'hvac',        label:'Heating & air conditioning',note:'Both functional'},
      {id:'defroster',   label:'Front & rear defroster',    note:'Functional'},
      {id:'cab_lighting',label:'Interior lighting',         note:'Dome and reading lights work'},
      {id:'fire_ext',    label:'Fire extinguisher',         note:'Charged (green gauge); mounted; accessible — min 10 lb ABC'},
      {id:'triangles',   label:'Warning triangles / flares',note:'Minimum 3 present and serviceable'},
      {id:'fuses',       label:'Spare fuses',               note:'Present in fuse kit'},
      {id:'first_aid',   label:'First aid kit',             note:'ANSI Class A minimum; stocked and accessible'},
      {id:'docs',        label:'Vehicle documents',         note:'Registration, insurance, inspection sticker — current and in vehicle'},
    ]},
    // ── Sedan / SUV — ambulatory only ────────────────────────
    med_ambulatory: {id:'med_ambulatory', label:'Passenger Safety', items:[
      {id:'pax_belts_2', label:'Passenger seatbelts',  note:'All positions — belt present, latches, and retracts'},
      {id:'pax_comfort', label:'Passenger area clean', note:'No hazards; climate control working for passengers'},
    ]},
    // ── Wheelchair Van (3 WC + 12 pax) ───────────────────────
    med_wv: {id:'med_wv', label:'Wheelchair Van Equipment', items:[
      {id:'wc_straps',   label:'Wheelchair 4-point tie-down straps (×3 sets)', note:'12 straps total; no fraying; Q\'Straint hooks latch and lock'},
      {id:'wc_seatbelt', label:'Wheelchair occupant seatbelts (×3)',           note:'Each WC position — belt present, latches, and retracts'},
      {id:'lift_ramp',   label:'Hydraulic side-door ramp',                     note:'Full test: deploys, raises, lowers, stows; limit switch sounds; rated load OK'},
      {id:'rear_lift',   label:'Rear wheelchair lift',                         note:'Powers up, holds rated load, lowers smoothly; emergency lowering tested'},
      {id:'ramp_cleats', label:'Ramp & lift surface cleats',                   note:'Not worn; non-slip traction confirmed'},
      {id:'grab_handles',label:'Interior grab handles',                        note:'All secure; no wobble or corrosion'},
      {id:'floor_cond',  label:'Floor condition',                              note:'Clean, dry; no lifted edges or tripping hazards'},
      {id:'pax_belts_12',label:'All 12 passenger seatbelts',                   note:'Each seat — belt present, latches, and retracts'},
      {id:'oxygen',      label:'Oxygen system',                                note:'Tank ≥ 500 PSI; regulator functional; mask/cannula available; no leaks'},
      {id:'suction',     label:'Suction unit',                                 note:'Powers on; tubing and canister clean and free of contamination'},
      {id:'aed',         label:'AED',                                          note:'Charged; electrode pads not expired; indicator green'},
      {id:'med_kit_wv',  label:'Medical first aid kit',                        note:'Gloves, BP cuff, pulse oximeter, bandages, trauma dressing — stocked'},
      {id:'sanitation',  label:'Interior sanitation',                          note:'No biohazard contamination; surfaces wiped from prior trip'},
      {id:'comm',        label:'Communication device / MDT',                   note:'Powered on; app accessible; adequate signal'},
    ]},
    // ── Shuttle (1 WC + 14 pax) ──────────────────────────────
    med_shuttle: {id:'med_shuttle', label:'Shuttle Transport Equipment', items:[
      {id:'wc_straps_sh',  label:'Wheelchair 4-point tie-down straps (×1 set)', note:'4 straps; no fraying; hooks latch and lock'},
      {id:'wc_seatbelt_sh',label:'Wheelchair occupant seatbelt',                note:'WC position — belt present, latches, and retracts'},
      {id:'ramp_sh',       label:'Hydraulic side-door ramp / lift',             note:'Full test: deploys, raises, lowers, stows; limit switch sounds'},
      {id:'ramp_cleats_sh',label:'Ramp surface cleats',                         note:'Not worn; non-slip traction confirmed'},
      {id:'grab_handles_sh',label:'Interior grab handles',                      note:'All secure; no wobble'},
      {id:'floor_sh',      label:'Floor condition',                             note:'Clean, dry; no hazards'},
      {id:'pax_belts_14',  label:'All 14 passenger seatbelts',                  note:'Each seat — belt present, latches, and retracts'},
      {id:'first_aid_sh',  label:'First aid kit',                               note:'ANSI Class A minimum; stocked and accessible'},
      {id:'sanitation_sh', label:'Interior sanitation',                         note:'Clean; no biohazard contamination from prior trip'},
      {id:'comm_sh',       label:'Communication device',                        note:'Powered on; signal adequate'},
    ]},
    // ── Ambulance — BLS base (shared by both AMB units) ──────
    med_amb_base: {id:'med_amb_base', label:'Ambulance Base Equipment', items:[
      {id:'stretcher',     label:'Power stretcher / cot',           note:'Load mechanism OK; locks in loaded position; legs deploy/retract; weight rated'},
      {id:'pax_belts_amb', label:'Patient & attendant seatbelts',   note:'All positions — belt present, latches, and retracts'},
      {id:'oxygen_amb',    label:'Oxygen — onboard & portable',     note:'Main tank ≥ 500 PSI; portable tank charged; regulators functional; no leaks'},
      {id:'suction_amb',   label:'Suction unit',                    note:'Powers on; test suction; tubing and canister clean'},
      {id:'aed_amb',       label:'AED / defibrillator (AED mode)',  note:'Charged; pads not expired; self-test passes'},
      {id:'bvm',           label:'BVM (bag-valve mask)',            note:'Mask seals; valve functions; reservoir intact'},
      {id:'bp_pulse',      label:'BP cuff & pulse oximeter',        note:'Both functional; readings plausible'},
      {id:'trauma_kit',    label:'Trauma & first aid supplies',     note:'Gloves, dressings, bandages, splints, cervical collars — stocked'},
      {id:'airway_basic',  label:'Basic airway kit',                note:'OPA, NPA, suction catheters present and accessible'},
      {id:'emerg_lights',  label:'Emergency lights & siren',        note:'All LED lights functional (front/rear/side); all siren tones functional'},
      {id:'sanitation_amb',label:'Patient compartment sanitation',  note:'No biohazard contamination; all surfaces wiped down from prior call'},
      {id:'comm_amb',      label:'Radio & MDT',                    note:'Radio transmits/receives; MDT powered on and connected'},
      {id:'docs_amb',      label:'MDPSC / State certification docs',note:'Vehicle certification, medical director approval, and PCR supply present'},
    ]},
    // ── Ambulance ALS 2 extras ────────────────────────────────
    med_amb_als: {id:'med_amb_als', label:'ALS 2 Advanced Equipment', items:[
      {id:'cardiac_mon',  label:'Cardiac monitor / defibrillator (12-lead)', note:'Powers on; ECG electrodes present; pads installed; self-test passes; battery charged'},
      {id:'iv_pump',      label:'IV pump',                                    note:'Powers on; tubing sets present; alarm functional; battery charged'},
      {id:'adv_airway',   label:'Advanced airway kit',                        note:'Laryngoscope (blade + handle), ET tubes, stylet, CO2 detector, video laryngoscope (if equipped)'},
      {id:'ventilator',   label:'Transport ventilator',                       note:'Powers on; test ventilation; circuits clean; battery charged'},
      {id:'capnography',  label:'Waveform capnography',                       note:'Module attached; sample line present; test waveform plausible'},
      {id:'als_meds',     label:'ALS medications cabinet',                    note:'Sealed/locked; sealed if supervisor checked; all required meds present and in-date'},
      {id:'iv_supplies',  label:'IV start supplies',                          note:'Catheters (18g/20g/22g), tubing, saline flush, tape — stocked'},
      {id:'telemedicine', label:'Telemedicine / ALS telemetry',               note:'Camera functional; hospital link connects; transmission tested'},
    ]},
    // ── Stretcher transport ───────────────────────────────────
    med_stretcher: {id:'med_stretcher', label:'Stretcher Transport Equipment', items:[
      {id:'stretcher_st',    label:'Power stretcher / cot',         note:'Auto-load mechanism functional; locks in place; weight-rated; legs deploy/retract'},
      {id:'cot_mount_st',    label:'Stretcher mount / fastening system',note:'Mount locks; manual release accessible; stretcher does not shift'},
      {id:'pax_belts_st',    label:'Patient seatbelts',             note:'Head, chest, lap straps present; all buckle and tighten'},
      {id:'oxygen_st',       label:'Oxygen — onboard & portable',   note:'Main tank ≥ 500 PSI; portable charged; regulators functional; no leaks'},
      {id:'suction_st',      label:'Suction unit',                  note:'Powers on; test suction; tubing and canister clean'},
      {id:'aed_st',          label:'AED',                           note:'Charged; pads not expired; indicator green'},
      {id:'basic_med_st',    label:'Basic medical kit',             note:'BP cuff, pulse oximeter, gloves, bandages, trauma dressings — stocked'},
      {id:'climate_st',      label:'Patient compartment climate',   note:'Heat and AC functional in patient area'},
      {id:'sanitation_st',   label:'Compartment sanitation',        note:'No biohazard contamination; surfaces wiped from prior trip'},
      {id:'comm_st',         label:'Communication device',          note:'Powered on; signal adequate'},
    ]},
  };

  // ── Vehicle type → inspection group list mapping ─────────────
  const VEHICLE_PROFILES = {
    // Unit prefix → profile
    // dashboard_alerts is FIRST in every profile — if any light is ON, driver is blocked.
    'SE':  { label:'Sedan — Electric (2016 Tesla Model 3)',   note:'Ambulatory passengers only. Electric vehicle — no combustion engine checks.',
              groups:['dashboard_alerts','engine_ev','exterior_std','exterior_ev_extra','tires','brakes','interior','med_ambulatory'] },
    'SUV': { label:'SUV — Luxury (2017 Land Rover HSE)',      note:'Ambulatory passengers, up to 3. Check all dashboard lights first.',
              groups:['dashboard_alerts','engine_gas','exterior_std','exterior_combustion_extra','tires','brakes','interior','med_ambulatory'] },
    'WV':  { label:'Wheelchair Van (2017 Ford Transit 350)',  note:'ADA wheelchair transport: 3 wheelchair positions + 12 ambulatory.',
              groups:['dashboard_alerts','engine_gas','exterior_std','exterior_combustion_extra','tires','brakes','interior','med_wv'] },
    'SH':  { label:'Shuttle (2017 Ford Transit 350)',         note:'Group shuttle: 1 wheelchair position + 14 ambulatory passengers.',
              groups:['dashboard_alerts','engine_gas','exterior_std','exterior_combustion_extra','tires','brakes','interior','med_shuttle'] },
    'AMB-254-01': { label:'BLS Ambulance (2010 Ford Transit CG)',  note:'Basic Life Support certification. Check dashboard lights and all BLS equipment.',
              groups:['dashboard_alerts','engine_gas','exterior_std','exterior_combustion_extra','tires','brakes','interior','med_amb_base'] },
    'AMB-254-02': { label:'ALS 2 Ambulance (2010 Ford Transit CG)',note:'Advanced Life Support 2 certification. Full BLS + ALS equipment inspection required.',
              groups:['dashboard_alerts','engine_gas','exterior_std','exterior_combustion_extra','tires','brakes','interior','med_amb_base','med_amb_als'] },
    'ST':  { label:'Stretcher Transport (2010 Ford Transit CG)',   note:'Non-emergency stretcher transport. Check dashboard lights and stretcher equipment.',
              groups:['dashboard_alerts','engine_gas','exterior_std','exterior_combustion_extra','tires','brakes','interior','med_stretcher'] },
  };

  // Resolve profile from unit number
  function profileForUnit(unit) {
    if (!unit) return null;
    const u = unit.toUpperCase();
    // Exact match first (for AMB-254-01 vs AMB-254-02)
    if (VEHICLE_PROFILES[u]) return VEHICLE_PROFILES[u];
    // Prefix match
    const prefix = u.split('-')[0];
    return VEHICLE_PROFILES[prefix] || null;
  }

  let inspState = loadJ(INSP_KEY);
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
    const profile = profileForUnit(unit);
    activeInspProfile = profile;
    if (profile && unit) {
      if (infoBox) infoBox.hidden = false;
      if (nameEl)  nameEl.textContent = profile.label;
      if (noteEl)  noteEl.textContent = profile.note;
      if (proceed) proceed.disabled = false;
    } else {
      if (infoBox) infoBox.hidden = true;
      if (proceed) proceed.disabled = true;
    }
  }

  $('#inspVehicleSelect')?.addEventListener('change', e => onVehicleSelected(e.target.value));

  $('#btnProceedInspection')?.addEventListener('click', () => {
    const unit = $('#inspVehicleSelect')?.value;
    if (!unit) return;
    shift.vehicleUnit = unit.toUpperCase();
    saveShift();
    // Show checklist
    const section = $('#inspChecklistSection'), footer = $('#inspFormFooter'), vehicleCard = $('#inspVehicleCard');
    if (section) section.hidden = false;
    if (footer)  footer.hidden  = false;
    if (vehicleCard) vehicleCard.style.opacity = '0.6';
    renderInspection();
    section?.scrollIntoView({ behavior: 'smooth' });
  });

  function renderInspection() {
    const list = $('#inspChecklist'); if (!list) return;
    const profile = activeInspProfile || profileForUnit(shift.vehicleUnit);
    const groupIds = profile ? profile.groups : Object.keys(ALL_INSP_GROUPS);
    const activeGroups = groupIds.map(id => ALL_INSP_GROUPS[id]).filter(Boolean);
    let total = 0, checked = 0;
    list.innerHTML = activeGroups.map(g => {
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
      return `<p class="inspGroupHead">${g.label}</p><div class="inspGroup">${items}</div>`;
    }).join('');
    $$('[data-insp]', list).forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.insp, v = btn.dataset.v;
        inspState[id] = inspState[id] === v ? null : v;
        localStorage.setItem(INSP_KEY, JSON.stringify(inspState));
        renderInspection();
      });
    });
    const pct = total ? Math.round(checked / total * 100) : 0;
    if ($('#inspProgressLabel')) $('#inspProgressLabel').textContent = `${checked} / ${total}`;
    if ($('#inspProgressBar'))   $('#inspProgressBar').style.width   = pct + '%';
    // Real-time dashboard alert detection
    const alertGroup = ALL_INSP_GROUPS['dashboard_alerts'];
    const anyAlertFailed = alertGroup?.items.some(i => inspState[i.id] === 'fail');
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
    const alertGroup = ALL_INSP_GROUPS['dashboard_alerts'];
    const alertFails = alertGroup?.items.filter(i => inspState[i.id] === 'fail').map(i => i.label) || [];
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
    shift.inspectionDone = true; saveShift();
    if (failures.length) alert(`FAILED ITEMS (${failures.length}):\n${failures.join('\n')}\n\nReport to Fleet before operating.`);
    beginShift(); showView('dashView');
  });

  // ── Trips / manifest ──────────────────────────────────────────
  async function loadTrips(){
    try{
      const r=await fetch('/api/bookings',{headers:ah(),cache:'no-store'});
      if(!r.ok)return;
      const j=await r.json();
      trips=(j.bookings||j||[]).map(b=>({
        ref:b.reference||b.id,date:b.trip_date||'',
        time:b.trip_time?b.trip_time.slice(0,5):'',
        pickup:b.pickup||'',destination:b.destination||'',
        patient:b.name||'Patient',service:b.service||'',
        status:b.status||'SCHEDULED',notes:b.notes||'',
        distMi:b.distance_miles?Number(b.distance_miles).toFixed(1):null,
        comments:'',
      }));
      updateBadge();renderDash();
    }catch(e){console.error('[DRIVER]',e);}
  }

  function updateBadge(){
    const today=new Date().toISOString().slice(0,10);
    const n=trips.filter(t=>t.date===today&&!['COMPLETED','DELIVERED','CANCELLED'].includes(t.status)).length;
    const b=$('#manifestBadge');if(b){b.hidden=n===0;b.textContent=n;}
  }

  function renderManifest(){
    const now=new Date();
    const start=new Date(now.getFullYear(),now.getMonth(),now.getDate());
    const end=new Date(start.getTime()+manifestDays*86400000);
    const list=trips.filter(t=>{if(!t.date)return false;const d=new Date(t.date+'T00:00:00');return d>=start&&d<end;})
      .sort((a,b)=>(a.date+a.time).localeCompare(b.date+b.time));
    const el=$('#manifestList');if(!el)return;
    if(!list.length){el.innerHTML='<div class="empty"><p>No trips in this period.</p></div>';return;}
    const sc={SCHEDULED:'gray',ASSIGNED:'blue',EN_ROUTE:'amber',PATIENT_ON_BOARD:'amber',ARRIVED_PICKUP:'amber',DEPARTED:'amber',ARRIVED_DESTINATION:'amber',DELIVERED:'green',COMPLETED:'green',CANCELLED:'red'};
    el.innerHTML=list.map(t=>`
      <div class="tripCard${t.ref===activeRef?' active-trip':''}" data-ref="${t.ref}" role="button" tabindex="0">
        <div class="tripTime"><strong>${t.time||'—'}</strong><small>${fmtDate(t.date)}</small></div>
        <div class="tripInfo"><strong>${t.patient}</strong><span>${t.pickup}</span><span>to ${t.destination}</span></div>
        <span class="badge ${sc[t.status]||'gray'}">${t.status.replace(/_/g,' ')}</span>
      </div>`).join('');
    $$('.tripCard',el).forEach(c=>{
      const open=()=>openTrip(c.dataset.ref);
      c.addEventListener('click',open);
      c.addEventListener('keypress',e=>e.key==='Enter'&&open());
    });
  }

  $$('#manifestTabs button').forEach(b=>b.addEventListener('click',()=>{
    manifestDays=Number(b.dataset.days);
    $$('#manifestTabs button').forEach(x=>x.classList.remove('active'));
    b.classList.add('active');renderManifest();
  }));

  // ── Trip detail + workflow ────────────────────────────────────
  const WORKFLOW=[
    {label:'En Route to Pickup',    status:'EN_ROUTE'},
    {label:'Arrived at Pickup',     status:'ARRIVED_PICKUP'},
    {label:'Patient On Board',      status:'PATIENT_ON_BOARD'},
    {label:'Departed',              status:'DEPARTED'},
    {label:'Arrived at Destination',status:'ARRIVED_DESTINATION'},
    {label:'Patient Delivered',     status:'DELIVERED'},
    {label:'Trip Complete',         status:'COMPLETED'},
  ];
  const WF_STATUS=WORKFLOW.map(w=>w.status);
  function wfIdx(s){const i=WF_STATUS.indexOf(s);return i===-1?0:i;}

  function openTrip(ref){
    const t=trips.find(x=>x.ref===ref);if(!t)return;
    activeRef=ref;
    $('#tripRef').textContent=t.ref;
    $('#tripPatient').textContent=t.patient;
    $('#tripPickup').textContent=t.pickup;
    $('#tripDestination').textContent=t.destination;
    $('#tripServiceBadge').textContent=t.service;
    $('#tripDateBadge').textContent=`${fmtDate(t.date)} ${t.time}`;
    const sc={COMPLETED:'green',DELIVERED:'green',CANCELLED:'red',EN_ROUTE:'amber',PATIENT_ON_BOARD:'amber',DEPARTED:'amber'};
    $('#tripStatusBadge').textContent=t.status.replace(/_/g,' ');
    $('#tripStatusBadge').className=`badge ${sc[t.status]||'blue'}`;
    $('#tripComments').value=t.comments||'';
    renderTripWorkflow(t);
    const last=miles.legs[miles.legs.length-1];
    if(last?.odoEnd&&$('#legOdoStart'))$('#legOdoStart').value=last.odoEnd;
    const inTrip=['PATIENT_ON_BOARD','DEPARTED'].includes(t.status);
    const lt=$('#legType');if(lt)lt.value=inTrip?'LOADED':'DEADHEAD';
    showView('tripView');
  }

  function renderTripWorkflow(t){
    const done=['COMPLETED','DELIVERED','CANCELLED'].includes(t.status);
    const idx=wfIdx(t.status);
    const wfEl=$('#tripWorkflow');if(!wfEl)return;
    wfEl.innerHTML=WORKFLOW.map((w,i)=>{
      const st=i<idx?'done':i===idx?'current':'';
      return `<div style="display:flex;align-items:center;gap:10px;padding:10px 16px;border-bottom:1px solid var(--line)${i===WORKFLOW.length-1?';border-bottom:0':''}">
        <div style="width:28px;height:28px;border-radius:50%;display:grid;place-items:center;font:800 12px Manrope,sans-serif;flex:0 0 auto;background:${st==='done'?'var(--ok)':st==='current'?'var(--navy)':'var(--line)'};color:${st?'#fff':'var(--muted)'}">
          ${st==='done'?'✓':i+1}
        </div>
        <span style="font:${st==='current'?'700':'500'} 14px Source Sans 3,sans-serif;color:${st==='done'?'var(--ok)':st==='current'?'var(--ink)':'var(--muted)'}">
          ${w.label}
        </span>
      </div>`;
    }).join('');
    const btn=$('#btnAdvanceTrip');if(!btn)return;
    if(done){btn.textContent='Trip Complete';btn.disabled=true;}
    else{btn.textContent=(WORKFLOW[idx]?.label||'Advance').toUpperCase();btn.disabled=!shift.onDuty||!WORKFLOW[idx];}
  }

  $('#btnAdvanceTrip')?.addEventListener('click',async()=>{
    const t=trips.find(x=>x.ref===activeRef);if(!t)return;
    const idx=wfIdx(t.status),next=WORKFLOW[idx];if(!next)return;
    const btn=$('#btnAdvanceTrip');btn.disabled=true;btn.textContent='Updating…';
    try{
      const r=await fetch(`/api/bookings/${encodeURIComponent(t.ref)}/update`,{method:'POST',headers:ah(),body:JSON.stringify({status:next.status,vehicleUnit:shift.vehicleUnit||undefined})});
      if(!r.ok){const j=await r.json().catch(()=>({}));throw new Error(j.error||`HTTP ${r.status}`);}
      t.status=next.status;
      if(['COMPLETED','DELIVERED'].includes(next.status)){shift.completedTrips++;saveShift();}
      renderTripWorkflow(t);updateBadge();renderManifest();
    }catch(err){alert('Update failed: '+err.message);renderTripWorkflow(t);}
  });

  $('#btnSaveComments')?.addEventListener('click',()=>{
    const t=trips.find(x=>x.ref===activeRef);if(!t)return;
    t.comments=$('#tripComments').value.trim();
    const btn=$('#btnSaveComments');btn.textContent='Saved';setTimeout(()=>{btn.textContent='Save Notes';},2000);
  });

  $('#btnGoActiveTrip')?.addEventListener('click',()=>{if(activeRef)openTrip(activeRef);});
  $('#btnNavActiveTrip')?.addEventListener('click',()=>{
    const t=trips.find(x=>x.ref===activeRef);if(!t)return;
    const dest=wfIdx(t.status)<=1?t.pickup:t.destination;
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(dest)}`,'_blank','noopener');
  });

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
    const u=usr(),name=u.display_name?.split(' ')[0]||'Driver';
    if($('#dashDriverName'))$('#dashDriverName').textContent=`Good ${tod()}, ${name}`;
    if($('#dashVehicle')){$('#dashVehicle').textContent=shift.vehicleUnit||'No vehicle';$('#dashVehicle').className='badge '+(shift.vehicleUnit?'blue':'gray');}
    if($('#statHours'))$('#statHours').textContent=fmtH(elapsed());
    if($('#statTrips'))$('#statTrips').textContent=shift.completedTrips;
    if($('#statMiles'))$('#statMiles').textContent=totalMiles().toFixed(1);
    const badge=$('#shiftBadge');
    if(badge){badge.textContent=shift.onBreak?'On Break':shift.onDuty?'On Duty':'Off Duty';badge.className='topBadge '+(shift.onBreak?'break':shift.onDuty?'on':'off');}
    const sc=$('#shiftControls'),oc=$('#onDutyControls');
    if(sc)sc.hidden=shift.onDuty;
    if(oc){oc.hidden=!shift.onDuty;oc.style.display=shift.onDuty?'grid':'none';}
    const bb=$('#btnBreak');if(bb)bb.textContent=shift.onBreak?'End Break':'Take Break';
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
      if(!activeRef)activeRef=active.ref;
    }else if(atc)atc.hidden=true;
    // Next upcoming
    const today=new Date().toISOString().slice(0,10);
    const next=trips.filter(t=>t.date>=today&&t.status==='SCHEDULED').sort((a,b)=>(a.date+a.time).localeCompare(b.date+b.time))[0];
    const nb=$('#nextTripBody');
    if(nb&&next){nb.innerHTML=`<p style="margin:0 0 4px;font:700 15px Manrope,sans-serif">${next.patient}</p>
      <p style="margin:0 0 4px;font-size:13px;color:var(--muted)">${fmtDate(next.date)} at ${next.time}</p>
      <p style="margin:0;font-size:13px;color:var(--muted)">${next.pickup} to ${next.destination}</p>
      <div style="margin-top:10px"><button class="btn ghost sm" onclick="window.__ot('${next.ref}')">Open Trip</button></div>`;}
    else if(nb)nb.innerHTML='<p style="color:var(--muted);margin:0;font-size:14px">No upcoming trips. Check your manifest.</p>';
  }
  window.__ot=ref=>openTrip(ref);

  // ── GPS ───────────────────────────────────────────────────────
  function startGPS(){
    if(!navigator.geolocation||gpsId!=null)return;
    gpsId=navigator.geolocation.watchPosition(async pos=>{
      if(!shift.onDuty||!shift.vehicleUnit)return;
      try{await fetch('/api/gps',{method:'POST',headers:ah(),body:JSON.stringify({vehicleUnit:shift.vehicleUnit,latitude:pos.coords.latitude,longitude:pos.coords.longitude,heading:pos.coords.heading||null,speedMph:pos.coords.speed?pos.coords.speed*2.237:null,accuracyM:pos.coords.accuracy||null,bookingReference:activeRef||null})});}catch{}
    },null,{enableHighAccuracy:true,maximumAge:20000,timeout:25000});
  }
  function stopGPS(){if(gpsId!=null){navigator.geolocation.clearWatch(gpsId);gpsId=null;}}

  // ── Init ──────────────────────────────────────────────────────
  async function initApp(){
    const ok=await checkAuth();if(!ok)return;
    hideLoginView();renderDash();renderInspection();loadFleetForInspection();
    await loadTrips();
    if(shift.onDuty)startGPS();
    setInterval(()=>{if(shift.onDuty)renderDash();},30000);
    setInterval(()=>{if(shift.onDuty)loadTrips();},120000);
  }
  initApp();
})();
