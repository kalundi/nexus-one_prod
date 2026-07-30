// Mobile nav toggle
(function(){const t=document.querySelector('.mobileNavToggle'),l=document.querySelector('.globalLinks');if(t)t.addEventListener('click',()=>{const e=t.getAttribute('aria-expanded')==='true';t.setAttribute('aria-expanded',!e);l.classList.toggle('open')})})();

const token=()=>sessionStorage.getItem('nexusAccessToken');
const userRole=()=>{
  try{return String(JSON.parse(sessionStorage.getItem('nexusUser')||'{}').role||window.NexusAuthorizedUser?.role||'').toUpperCase();}
  catch{return String(window.NexusAuthorizedUser?.role||'').toUpperCase();}
};
const canEditSettings=()=>userRole()==='ADMIN';
let currentSettings=null;

// Users
const ROLE_COLORS={ADMIN:'red',DISPATCHER:'blue',FACILITY:'blue',DRIVER:'green',BILLING:'amber',QA:'amber',EXECUTIVE:'blue',PATIENT:'muted'};

async function loadUsers(){
  const tbody=document.getElementById('userTableBody');
  tbody.innerHTML='<tr><td colspan="6" style="padding:20px;text-align:center;color:var(--muted)">Loading...</td></tr>';
  try{
    const r=await fetch('/api/admin/users',{headers:{authorization:`Bearer ${token()}`}});
    if(!r.ok){const e=await r.json();throw new Error(e.error||'Failed to load users');}
    const {users}=await r.json();
    document.getElementById('statUsers').textContent=users.length;
    document.getElementById('statActiveUsers').textContent=users.filter(u=>u.active).length;
    if(!users.length){tbody.innerHTML='<tr><td colspan="6" style="padding:20px;text-align:center;color:var(--muted)">No users found.</td></tr>';return;}
    tbody.innerHTML=users.map(u=>`
      <tr data-user-id="${u.id}">
        <td>${u.email}</td>
        <td>${u.name||'--'}</td>
        <td><span class="pill ${ROLE_COLORS[u.role]||'muted'}">${u.role}</span></td>
        <td><span class="pill ${u.active?'green':'muted'}">${u.active?'Active':'Inactive'}</span></td>
        <td style="font-size:12px;color:var(--muted)">${u.createdAt?new Date(u.createdAt).toLocaleDateString():'--'}</td>
        <td><button class="button compact" data-toggle-user="${u.id}" data-active="${u.active}" style="min-width:90px">${u.active?'Deactivate':'Activate'}</button></td>
      </tr>`).join('');
    document.querySelectorAll('[data-toggle-user]').forEach(btn=>{
      btn.addEventListener('click',async()=>{
        const id=btn.dataset.toggleUser,active=btn.dataset.active==='true';
        btn.disabled=true;btn.textContent='...';
        try{
          const r=await fetch(`/api/admin/users/${encodeURIComponent(id)}`,{method:'PATCH',headers:{authorization:`Bearer ${token()}`,'content-type':'application/json'},body:JSON.stringify({active:!active})});
          if(!r.ok){const e=await r.json();throw new Error(e.error||'Failed')}
          loadUsers();
        }catch(e){btn.disabled=false;btn.textContent=active?'Deactivate':'Activate';alert(e.message)}
      });
    });
  }catch(e){tbody.innerHTML=`<tr><td colspan="6" style="padding:20px;text-align:center;color:var(--red)">${e.message}</td></tr>`;}
}

document.getElementById('refreshUsers').addEventListener('click',loadUsers);

document.getElementById('createUserBtn').addEventListener('click',async()=>{
  const email=document.getElementById('newEmail').value.trim();
  const name=document.getElementById('newName').value.trim();
  const role=document.getElementById('newRole').value;
  const password=document.getElementById('newPassword').value;
  const msgEl=document.getElementById('createUserMsg');
  msgEl.hidden=true;
  if(!email||!name||!role||!password){showMsg(msgEl,'All fields are required.','err');return;}
  const btn=document.getElementById('createUserBtn');
  btn.disabled=true;btn.textContent='Creating...';
  try{
    const r=await fetch('/api/admin/users',{method:'POST',headers:{authorization:`Bearer ${token()}`,'content-type':'application/json'},body:JSON.stringify({email,name,role,password})});
    const data=await r.json();
    if(!r.ok)throw new Error(data.error||'Failed to create user');
    showMsg(msgEl,`User ${data.user.email} created successfully.`,'ok');
    document.getElementById('newEmail').value='';
    document.getElementById('newName').value='';
    document.getElementById('newRole').value='';
    document.getElementById('newPassword').value='';
    loadUsers();
  }catch(e){showMsg(msgEl,e.message,'err');}
  finally{btn.disabled=false;btn.textContent='Create user';}
});

// Pricing
function renderPricing(){
  const p=currentSettings?.pricing||NexusCore.getPricing();
  document.getElementById('statPricing').textContent=Object.keys(p).length;
  document.getElementById('pricingRows').innerHTML=Object.entries(p).map(([key,r])=>`
    <tr data-key="${key}">
      <td><strong>${r.label}</strong></td>
      <td><input aria-label="${r.label} base fare" type="number" step="0.01" min="0" data-field="base" value="${r.base}" style="width:100px;padding:8px;border:1px solid #c5d3dd;border-radius:8px"></td>
      <td><input aria-label="${r.label} included miles" type="number" step="1" min="0" data-field="includedMiles" value="${r.includedMiles}" style="width:80px;padding:8px;border:1px solid #c5d3dd;border-radius:8px"></td>
      <td><input aria-label="${r.label} per mile" type="number" step="0.01" min="0" data-field="perMile" value="${r.perMile}" style="width:90px;padding:8px;border:1px solid #c5d3dd;border-radius:8px"></td>
      <td><input aria-label="${r.label} wait fee" type="number" step="0.01" min="0" data-field="waitPer15" value="${r.waitPer15}" style="width:90px;padding:8px;border:1px solid #c5d3dd;border-radius:8px"></td>
    </tr>`).join('');
}
function getEditedPricing(){
  const p={...(currentSettings?.pricing||NexusCore.getPricing())};
  document.getElementById('pricingRows').querySelectorAll('tr').forEach(tr=>{
    const key=tr.dataset.key;
    tr.querySelectorAll('input').forEach(i=>{p[key][i.dataset.field]=Number(i.value)});
  });
  return p;
}

document.getElementById('savePricing').addEventListener('click',async()=>{
  if(!canEditSettings()){
    showMsg(document.getElementById('pricingSavedMsg'),'Dispatcher access is view-only for settings.','err');
    return;
  }
  const p=getEditedPricing();
  const r=await fetch('/api/admin/settings',{method:'PATCH',headers:{authorization:`Bearer ${token()}`,'content-type':'application/json'},body:JSON.stringify({pricing:p})});
  const data=await r.json().catch(()=>({}));
  if(!r.ok){showMsg(document.getElementById('pricingSavedMsg'),data.error||'Failed to save pricing.','err');return;}
  currentSettings=data.settings;
  renderPricing();
  const msg=document.getElementById('pricingSavedMsg');
  showMsg(msg,`Pricing saved at ${new Date().toLocaleTimeString()}.`,'ok');
});

document.getElementById('resetPricing').addEventListener('click',async()=>{
  if(!canEditSettings()){
    showMsg(document.getElementById('pricingSavedMsg'),'Dispatcher access is view-only for settings.','err');
    return;
  }
  const defaults=JSON.parse(JSON.stringify(window.NexusCore?.DEFAULT||{}));
  const r=await fetch('/api/admin/settings',{method:'PATCH',headers:{authorization:`Bearer ${token()}`,'content-type':'application/json'},body:JSON.stringify({pricing:defaults})});
  const data=await r.json().catch(()=>({}));
  if(!r.ok){showMsg(document.getElementById('pricingSavedMsg'),data.error||'Failed to reset pricing.','err');return;}
  currentSettings=data.settings;
  renderPricing();
  const msg=document.getElementById('pricingSavedMsg');
  showMsg(msg,'Default pricing restored.','ok');
});

// Manage trip fare adjustment
let currentManagedTrip=null;

function setManageTripMsg(text,type){
  const el=document.getElementById('manageTripMsg');
  showMsg(el,text,type);
}

function fillManageTripEditor(booking){
  currentManagedTrip=booking;
  document.getElementById('manageTripEditor').style.display='block';
  document.getElementById('manageTripService').value=booking.service||'--';
  document.getElementById('manageTripStatus').value=booking.statusLabel||booking.status||'--';
  document.getElementById('manageTripCurrentFare').value=Number.isFinite(Number(booking.estimatedFare))?Number(booking.estimatedFare).toFixed(2):'--';
  document.getElementById('manageTripNewFare').value=Number.isFinite(Number(booking.estimatedFare))?Number(booking.estimatedFare).toFixed(2):'';
  document.getElementById('manageTripRoute').value=`${booking.pickup||'--'} -> ${booking.destination||'--'}`;
}

document.getElementById('manageTripLookup').addEventListener('click',async()=>{
  const ref=document.getElementById('manageTripRef').value.trim();
  if(!ref){setManageTripMsg('Enter a trip reference first.','err');return;}
  const btn=document.getElementById('manageTripLookup');
  btn.disabled=true;
  btn.textContent='Looking up...';
  try{
    const r=await fetch(`/api/admin/bookings/${encodeURIComponent(ref)}`,{headers:{authorization:`Bearer ${token()}`},cache:'no-store'});
    const data=await r.json().catch(()=>({}));
    if(!r.ok)throw new Error(data.error||'Trip not found');
    fillManageTripEditor(data.booking);
    setManageTripMsg(`Loaded ${data.booking.reference}.`,'ok');
  }catch(e){
    document.getElementById('manageTripEditor').style.display='none';
    currentManagedTrip=null;
    setManageTripMsg(e.message,'err');
  }finally{
    btn.disabled=false;
    btn.textContent='Lookup trip';
  }
});

document.getElementById('manageTripSaveFare').addEventListener('click',async()=>{
  if(!currentManagedTrip){setManageTripMsg('Lookup a trip first.','err');return;}
  if(!canEditSettings()){setManageTripMsg('Only Admin can adjust fares.','err');return;}
  const fareValue=Number(document.getElementById('manageTripNewFare').value);
  const note=document.getElementById('manageTripNote').value.trim()||'Fare adjusted from Admin';
  if(!Number.isFinite(fareValue)||fareValue<0){setManageTripMsg('Enter a valid fare amount.','err');return;}
  const btn=document.getElementById('manageTripSaveFare');
  btn.disabled=true;
  btn.textContent='Saving...';
  try{
    const r=await fetch(`/api/admin/bookings/${encodeURIComponent(currentManagedTrip.reference)}`,{method:'PATCH',headers:{authorization:`Bearer ${token()}`,'content-type':'application/json'},body:JSON.stringify({estimatedFare:fareValue,note})});
    const data=await r.json().catch(()=>({}));
    if(!r.ok)throw new Error(data.error||'Failed to save fare adjustment');
    fillManageTripEditor(data.booking);
    setManageTripMsg(`Fare updated to $${Number(data.booking.estimatedFare||0).toFixed(2)}.`,'ok');
  }catch(e){
    setManageTripMsg(e.message,'err');
  }finally{
    btn.disabled=false;
    btn.textContent='Save fare adjustment';
  }
});

// Audit log
const ACTION_ICONS={LOGIN:'🔑',CREATED:'➕',UPDATED:'✏️',ACTIVATED:'✅',DEACTIVATED:'🚫',STATUS_ADVANCED:'🔄',DEFAULT:'📋'};

async function loadAudit(){
  const container=document.getElementById('auditList');
  container.innerHTML='<p style="color:var(--muted)">Loading...</p>';
  const since=document.getElementById('auditSince').value;
  const type=document.getElementById('auditType').value;
  try{
    let url='/api/admin/audit-log?limit=100';
    if(since)url+=`&since=${encodeURIComponent(since)}`;
    const r=await fetch(url,{headers:{authorization:`Bearer ${token()}`}});
    if(!r.ok){const e=await r.json();throw new Error(e.error||'Failed to load audit log');}
    const {entries}=await r.json();
    const filtered=type?entries.filter(e=>e.action===type):entries;
    if(!filtered.length){container.innerHTML='<p style="color:var(--muted)">No audit records found.</p>';return;}
    container.innerHTML=filtered.map(e=>`
      <div class="auditRow">
        <div class="auditIcon">${ACTION_ICONS[e.action]||ACTION_ICONS.DEFAULT}</div>
        <div class="auditInfo">
          <strong>${e.action} - ${e.entityType}</strong>
          <small>Entity: ${e.entityId}${e.changes?` - ${JSON.stringify(e.changes).slice(0,80)}`:''}</small>
        </div>
        <div class="auditTime">${e.createdAt?new Date(e.createdAt).toLocaleString():'--'}</div>
      </div>`).join('');
  }catch(e){container.innerHTML=`<p style="color:var(--red)">${e.message}</p>`;}
}

document.getElementById('refreshAudit').addEventListener('click',loadAudit);
document.getElementById('applyAuditFilter').addEventListener('click',loadAudit);

// Settings
const SERVICE_POLICY_ORDER=['wheelchair','ambulatory','facility_transfer','facility_transfer_critical','broda','stretcher','bariatric','bls','als1','als2'];

function renderServicePolicyRows(settings){
  const rowsEl=document.getElementById('servicePolicyRows');
  if(!rowsEl)return;
  const pricing=settings?.pricing||currentSettings?.pricing||window.NexusCore?.getPricing?.()||{};
  const rules=settings?.fareRules||currentSettings?.fareRules||{};
  const policies=rules.servicePolicies||{};
  const keys=Object.keys(pricing).length?Object.keys(pricing):SERVICE_POLICY_ORDER;
  const ordered=[...SERVICE_POLICY_ORDER.filter(k=>keys.includes(k)),...keys.filter(k=>!SERVICE_POLICY_ORDER.includes(k))];
  rowsEl.innerHTML=ordered.map((key)=>{
    const label=pricing[key]?.label||key.toUpperCase();
    const p=policies[key]||{};
    return `<tr data-service-policy="${key}">
      <td><strong>${label}</strong></td>
      <td><input type="number" step="0.01" min="0" data-field="cancellationFee" value="${Number(p.cancellationFee||0)}" style="width:95px;padding:8px;border:1px solid #c5d3dd;border-radius:8px"></td>
      <td><input type="number" step="0.01" min="0" data-field="noShowFee" value="${Number(p.noShowFee||0)}" style="width:95px;padding:8px;border:1px solid #c5d3dd;border-radius:8px"></td>
      <td><input type="number" step="0.01" min="0" data-field="trafficOverageFeePerHour" value="${Number(p.trafficOverageFeePerHour||0)}" style="width:95px;padding:8px;border:1px solid #c5d3dd;border-radius:8px"></td>
      <td><input type="number" step="1" min="0" max="100" data-field="returnMilesInclusionPct" value="${Number(p.returnMilesInclusionPct||0)}" style="width:95px;padding:8px;border:1px solid #c5d3dd;border-radius:8px"></td>
      <td><input type="number" step="0.1" min="0" max="100" data-field="afterHoursSurchargePct" value="${Number(p.afterHoursSurchargePct||0)}" style="width:95px;padding:8px;border:1px solid #c5d3dd;border-radius:8px"></td>
      <td><input type="number" step="0.1" min="0" max="100" data-field="weekendSurchargePct" value="${Number(p.weekendSurchargePct||0)}" style="width:95px;padding:8px;border:1px solid #c5d3dd;border-radius:8px"></td>
      <td><input type="number" step="0.1" min="0" max="100" data-field="holidaySurchargePct" value="${Number(p.holidaySurchargePct||0)}" style="width:95px;padding:8px;border:1px solid #c5d3dd;border-radius:8px"></td>
    </tr>`;
  }).join('');
}

function readServicePoliciesFromTable(){
  const out={};
  document.querySelectorAll('#servicePolicyRows tr[data-service-policy]').forEach((tr)=>{
    const key=tr.getAttribute('data-service-policy');
    if(!key)return;
    const row={};
    tr.querySelectorAll('input[data-field]').forEach((input)=>{
      row[input.getAttribute('data-field')]=Number(input.value||0);
    });
    out[key]=row;
  });
  return out;
}

function readSettingsForm(){
  const serviceInputs=Array.from(document.querySelectorAll('#activeServicesGroup input[type="checkbox"]'));
  const activeServices=serviceInputs.filter(i=>i.checked).map(i=>i.value);
  return {
    organization:{
      name:document.getElementById('orgName').value.trim(),
      phone:document.getElementById('orgPhone').value.trim(),
      email:document.getElementById('orgEmail').value.trim(),
      website:document.getElementById('orgWebsite').value.trim()
    },
    activeServices,
    fareRules:{
      minimumFare:Number(document.getElementById('minimumFare').value||0),
      fuelSurchargePerMile:Number(document.getElementById('fuelSurchargePerMile').value||0),
      fuelPricingMode:document.getElementById('fuelPricingMode').value,
      fuelIndexPricePerGallon:Number(document.getElementById('fuelIndexPricePerGallon').value||0),
      fuelBaselinePricePerGallon:Number(document.getElementById('fuelBaselinePricePerGallon').value||3.25),
      fuelEfficiencyMpg:Number(document.getElementById('fuelEfficiencyMpg').value||10),
      fuelOperationalBufferPct:Number(document.getElementById('fuelOperationalBufferPct').value||20),
      afterHoursSurchargePct:Number(document.getElementById('afterHoursSurchargePct').value||0),
      weekendSurchargePct:Number(document.getElementById('weekendSurchargePct').value||0),
      holidaySurchargePct:Number(document.getElementById('holidaySurchargePct').value||0),
      cancellationFee:Number(document.getElementById('cancellationFee').value||0),
      cancellationWindowHours:Number(document.getElementById('cancellationWindowHours').value||24),
      cancellationLeadHours:Number(document.getElementById('cancellationLeadHours').value||72),
      noShowFee:Number(document.getElementById('noShowFee').value||0),
      freeWaitMinutes:Number(document.getElementById('freeWaitMinutes').value||0),
      mileageRoundingRule:document.getElementById('mileageRoundingRule').value,
      telemetryRefreshSeconds:Number(document.getElementById('telemetryRefreshSeconds').value||20),
      maxBookingDistanceMiles:Number(document.getElementById('maxBookingDistanceMiles').value||125),
      returnMilesThreshold:Number(document.getElementById('returnMilesThreshold').value||10),
      returnMilesInclusionPct:Number(document.getElementById('returnMilesInclusionPct').value||100),
      trafficOverageFeePerHour:Number(document.getElementById('trafficOverageFeePerHour').value||0),
      trafficOverageGraceMinutes:Number(document.getElementById('trafficOverageGraceMinutes').value||0),
      servicePolicies:readServicePoliciesFromTable()
    }
  };
}

function applyFuelModeUi(){
  const mode=(document.getElementById('fuelPricingMode').value||'MANUAL').toUpperCase();
  const isAuto=mode==='AUTO';
  document.getElementById('fuelSurchargePerMile').disabled=isAuto;
  document.getElementById('fuelIndexPricePerGallon').disabled=isAuto;
  const btn=document.getElementById('refreshFuelIndexBtn');
  if(btn) btn.disabled=!canEditSettings();
}

function applySettingsToForm(settings){
  if(!settings)return;
  const org=settings.organization||{};
  const fare=settings.fareRules||{};
  document.getElementById('orgName').value=org.name||'Nexus Medical Transit';
  document.getElementById('orgPhone').value=org.phone||'(888) 760-4990';
  document.getElementById('orgEmail').value=org.email||'contact@nexusmt.com';
  document.getElementById('orgWebsite').value=org.website||'https://nexusmt.com';
  document.getElementById('minimumFare').value=Number(fare.minimumFare||0);
  document.getElementById('fuelSurchargePerMile').value=Number(fare.fuelSurchargePerMile||0);
  document.getElementById('fuelPricingMode').value=(fare.fuelPricingMode||'MANUAL').toUpperCase()==='AUTO'?'AUTO':'MANUAL';
  document.getElementById('fuelIndexPricePerGallon').value=Number(fare.fuelIndexPricePerGallon||0);
  document.getElementById('fuelBaselinePricePerGallon').value=Number(fare.fuelBaselinePricePerGallon||3.25);
  document.getElementById('fuelEfficiencyMpg').value=Number(fare.fuelEfficiencyMpg||10);
  document.getElementById('fuelOperationalBufferPct').value=Number(fare.fuelOperationalBufferPct||20);
  document.getElementById('fuelLastUpdatedAt').value=fare.fuelLastUpdatedAt?new Date(fare.fuelLastUpdatedAt).toLocaleString():'Not updated';
  document.getElementById('afterHoursSurchargePct').value=Number(fare.afterHoursSurchargePct||0);
  document.getElementById('weekendSurchargePct').value=Number(fare.weekendSurchargePct||0);
  document.getElementById('holidaySurchargePct').value=Number(fare.holidaySurchargePct||0);
  document.getElementById('cancellationFee').value=Number(fare.cancellationFee||0);
  document.getElementById('cancellationWindowHours').value=Number(fare.cancellationWindowHours||24);
  document.getElementById('cancellationLeadHours').value=Number(fare.cancellationLeadHours||72);
  document.getElementById('noShowFee').value=Number(fare.noShowFee||0);
  document.getElementById('freeWaitMinutes').value=Number(fare.freeWaitMinutes||15);
  document.getElementById('mileageRoundingRule').value=fare.mileageRoundingRule||'TENTH_MILE';
  document.getElementById('telemetryRefreshSeconds').value=Number(fare.telemetryRefreshSeconds||20);
  document.getElementById('maxBookingDistanceMiles').value=Number(fare.maxBookingDistanceMiles||125);
  document.getElementById('returnMilesThreshold').value=Number(fare.returnMilesThreshold||10);
  document.getElementById('returnMilesInclusionPct').value=Number(fare.returnMilesInclusionPct||100);
  document.getElementById('trafficOverageFeePerHour').value=Number(fare.trafficOverageFeePerHour||0);
  document.getElementById('trafficOverageGraceMinutes').value=Number(fare.trafficOverageGraceMinutes||0);
  renderServicePolicyRows(settings);
  const active=new Set((settings.activeServices||[]).map(x=>String(x).toUpperCase()));
  document.querySelectorAll('#activeServicesGroup input[type="checkbox"]').forEach(i=>{i.checked=active.has(String(i.value).toUpperCase());});
  applyFuelModeUi();
}

async function loadPlatformSettings(){
  const r=await fetch('/api/admin/settings',{headers:{authorization:`Bearer ${token()}`},cache:'no-store'});
  const data=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error(data.error||'Failed to load settings');
  currentSettings=data.settings||null;
  renderPricing();
  applySettingsToForm(currentSettings);
}

document.getElementById('saveSettings').addEventListener('click',async()=>{
  if(!canEditSettings()){
    const msg=document.getElementById('settingsSavedMsg');
    msg.textContent='Dispatcher access is view-only for settings.';
    msg.style.color='var(--red)';
    msg.style.display='inline';
    setTimeout(()=>msg.style.display='none',3000);
    return;
  }
  const payload=readSettingsForm();
  const name=document.getElementById('orgName').value;
  const phone=document.getElementById('orgPhone').value;
  const email=document.getElementById('orgEmail').value;
  if(!name||!phone||!email){alert('Name, phone and email are required.');return;}
  const r=await fetch('/api/admin/settings',{method:'PATCH',headers:{authorization:`Bearer ${token()}`,'content-type':'application/json'},body:JSON.stringify(payload)});
  const data=await r.json().catch(()=>({}));
  if(!r.ok){alert(data.error||'Failed to save settings.');return;}
  currentSettings=data.settings;
  applySettingsToForm(currentSettings);
  const msg=document.getElementById('settingsSavedMsg');
  msg.textContent='Settings saved.';
  msg.style.color='var(--green)';
  msg.style.display='inline';
  setTimeout(()=>msg.style.display='none',3000);
});

document.getElementById('fuelPricingMode').addEventListener('change',applyFuelModeUi);

document.getElementById('refreshFuelIndexBtn').addEventListener('click',async()=>{
  const msg=document.getElementById('refreshFuelIndexMsg');
  if(!canEditSettings()){
    msg.textContent='Admin access required.';
    return;
  }
  msg.textContent='Refreshing fuel index...';
  try{
    const r=await fetch('/.netlify/functions/fuel-index-refresh',{method:'POST'});
    const data=await r.json().catch(()=>({}));
    if(!r.ok) throw new Error(data.error||'Refresh failed');
    msg.textContent=data.updated?`Updated: $${Number(data.fuelIndexPricePerGallon||0).toFixed(3)}/gal, surcharge $${Number(data.fuelSurchargePerMile||0).toFixed(2)}/mile`:(data.reason||'No update');
    await loadPlatformSettings();
  }catch(e){
    msg.textContent=e.message;
  }
});

function applyRoleRestrictions(){
  if(canEditSettings()) return;
  const userSection=document.getElementById('userSection');
  const auditSection=document.getElementById('auditSection');
  if(userSection) userSection.style.display='none';
  if(auditSection) auditSection.style.display='none';
  document.getElementById('savePricing').disabled=true;
  document.getElementById('resetPricing').disabled=true;
  document.getElementById('saveSettings').disabled=true;
  document.getElementById('refreshFuelIndexBtn').disabled=true;
}

// Load trips stat
fetch('/api/portal/trips',{headers:{authorization:`Bearer ${token()}`}}).then(r=>r.ok?r.json():null).then(d=>{if(d)document.getElementById('statTrips').textContent=d.trips?.length||0;}).catch(()=>{});

// Helpers
function showMsg(el,text,type){el.textContent=text;el.className='msgBox '+(type||'ok');el.hidden=false;if(type==='ok')setTimeout(()=>{el.hidden=true},5000);}

// Wait for auth-guard to authorize, then load data
window.addEventListener('nexus:authorized',async()=>{
  applyRoleRestrictions();
  if(userRole()==='ADMIN'){
    loadUsers();
    loadAudit();
  }
  try{await loadPlatformSettings();}catch(e){console.error(e);}
});
// Fallback if event already fired
if(window.NexusAuthorizedUser){
  applyRoleRestrictions();
  if(userRole()==='ADMIN'){
    loadUsers();
    loadAudit();
  }
  loadPlatformSettings().catch(()=>{});
}
