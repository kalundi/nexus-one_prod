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

// Reset standard non-production accounts
document.getElementById('resetCredentialsBtn')?.addEventListener('click',async()=>{
  const btn=document.getElementById('resetCredentialsBtn');
  const msgEl=document.getElementById('resetCredentialsMsg');
  if(!confirm('This will reset all 7 standard non-production accounts. Continue?'))return;
  btn.disabled=true;btn.textContent='Resetting…';
  msgEl.hidden=true;
  try{
    const r=await fetch('/api/admin/reset-credentials',{method:'POST',headers:{authorization:`Bearer ${token()}`,'content-type':'application/json'}});
    const data=await r.json();
    if(!r.ok)throw new Error(data.error||'Failed to reset credentials');
    const processed=Array.isArray(data.results)?data.results.length:0;
    msgEl.style.cssText='background:#ecfdf3;color:#065f46;border:1px solid #6ee7b7;';
    msgEl.textContent=`✓ ${data.message}${processed?` (${processed} accounts updated)`:''}`;
    msgEl.hidden=false;
    loadUsers();
  }catch(e){
    msgEl.style.cssText='background:#fef2f2;color:#991b1b;border:1px solid #fca5a5;';
    msgEl.textContent=`✗ ${e.message}`;
    msgEl.hidden=false;
  }finally{btn.disabled=false;btn.textContent='⟳ Reset standard accounts';}
});

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
const ACTION_ICONS={LOGIN:'🔑',CREATED:'➕',UPDATED:'✏️',ACTIVATED:'✅',DEACTIVATED:'🚫',STATUS_ADVANCED:'🔄',DRIVER_REFERRAL_INCENTIVE:'💵',DEFAULT:'📋'};

function summarizeAuditChanges(entry){
  const changes=entry?.changes;
  if(!changes||typeof changes!=='object')return '';
  if(entry.action==='DRIVER_REFERRAL_INCENTIVE'){
    const amount=Number(changes.amount||10).toFixed(2);
    const currency=String(changes.currency||'USD').toUpperCase();
    const driver=changes.driverEmail?` | Driver: ${changes.driverEmail}`:'';
    return `Referral incentive: ${currency} ${amount}${driver}`;
  }
  if(entry.action==='CREATED'&&String(changes.bookingSource||'').toUpperCase()==='DRIVER_REFERRAL'){
    return `Driver referral booking created${changes.pickupTimeEstimate?` | Pickup estimate: ${changes.pickupTimeEstimate}`:''}`;
  }
  const compact=JSON.stringify(changes);
  return compact.length>120?`${compact.slice(0,117)}...`:compact;
}

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
          <small>Entity: ${e.entityId}${summarizeAuditChanges(e)?` - ${summarizeAuditChanges(e)}`:''}</small>
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
  document.getElementById('orgName').value=org.name??'';
  document.getElementById('orgPhone').value=org.phone??'';
  document.getElementById('orgEmail').value=org.email??'';
  document.getElementById('orgWebsite').value=org.website??'';
  document.getElementById('minimumFare').value=fare.minimumFare==null?'':Number(fare.minimumFare);
  document.getElementById('fuelSurchargePerMile').value=fare.fuelSurchargePerMile==null?'':Number(fare.fuelSurchargePerMile);
  document.getElementById('fuelPricingMode').value=(fare.fuelPricingMode||'MANUAL').toUpperCase()==='AUTO'?'AUTO':'MANUAL';
  document.getElementById('fuelIndexPricePerGallon').value=fare.fuelIndexPricePerGallon==null?'':Number(fare.fuelIndexPricePerGallon);
  document.getElementById('fuelBaselinePricePerGallon').value=fare.fuelBaselinePricePerGallon==null?'':Number(fare.fuelBaselinePricePerGallon);
  document.getElementById('fuelEfficiencyMpg').value=fare.fuelEfficiencyMpg==null?'':Number(fare.fuelEfficiencyMpg);
  document.getElementById('fuelOperationalBufferPct').value=fare.fuelOperationalBufferPct==null?'':Number(fare.fuelOperationalBufferPct);
  document.getElementById('fuelLastUpdatedAt').value=fare.fuelLastUpdatedAt?new Date(fare.fuelLastUpdatedAt).toLocaleString():'';
  document.getElementById('afterHoursSurchargePct').value=fare.afterHoursSurchargePct==null?'':Number(fare.afterHoursSurchargePct);
  document.getElementById('weekendSurchargePct').value=fare.weekendSurchargePct==null?'':Number(fare.weekendSurchargePct);
  document.getElementById('holidaySurchargePct').value=fare.holidaySurchargePct==null?'':Number(fare.holidaySurchargePct);
  document.getElementById('cancellationFee').value=fare.cancellationFee==null?'':Number(fare.cancellationFee);
  document.getElementById('cancellationWindowHours').value=fare.cancellationWindowHours==null?'':Number(fare.cancellationWindowHours);
  document.getElementById('cancellationLeadHours').value=fare.cancellationLeadHours==null?'':Number(fare.cancellationLeadHours);
  document.getElementById('noShowFee').value=fare.noShowFee==null?'':Number(fare.noShowFee);
  document.getElementById('freeWaitMinutes').value=fare.freeWaitMinutes==null?'':Number(fare.freeWaitMinutes);
  document.getElementById('mileageRoundingRule').value=fare.mileageRoundingRule||'TENTH_MILE';
  document.getElementById('telemetryRefreshSeconds').value=fare.telemetryRefreshSeconds==null?'':Number(fare.telemetryRefreshSeconds);
  document.getElementById('maxBookingDistanceMiles').value=fare.maxBookingDistanceMiles==null?'':Number(fare.maxBookingDistanceMiles);
  document.getElementById('returnMilesThreshold').value=fare.returnMilesThreshold==null?'':Number(fare.returnMilesThreshold);
  document.getElementById('returnMilesInclusionPct').value=fare.returnMilesInclusionPct==null?'':Number(fare.returnMilesInclusionPct);
  document.getElementById('trafficOverageFeePerHour').value=fare.trafficOverageFeePerHour==null?'':Number(fare.trafficOverageFeePerHour);
  document.getElementById('trafficOverageGraceMinutes').value=fare.trafficOverageGraceMinutes==null?'':Number(fare.trafficOverageGraceMinutes);
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
  const socialSection=document.getElementById('socialSection');
  if(userSection) userSection.style.display='none';
  if(auditSection) auditSection.style.display='none';
  if(socialSection) socialSection.style.display='none';
  document.getElementById('savePricing').disabled=true;
  document.getElementById('resetPricing').disabled=true;
  document.getElementById('saveSettings').disabled=true;
  document.getElementById('refreshFuelIndexBtn').disabled=true;
}

function getSelectedSocialChannels(){
  return Array.from(document.querySelectorAll('.socialChannel:checked')).map((el)=>String(el.value||'').trim()).filter(Boolean);
}

function socialMsg(text,type='ok'){
  const el=document.getElementById('socialMsg');
  if(!el) return;
  showMsg(el,text,type);
}

function renderSocialPreviewRows(items=[]){
  const body=document.getElementById('socialPreviewRows');
  if(!body) return;
  if(!items.length){
    body.innerHTML='<tr><td colspan="5" style="padding:20px;text-align:center;color:var(--muted)">No social preview items found.</td></tr>';
    return;
  }
  body.innerHTML=items.map((item)=>{
    const channel=String(item.channel||'--');
    const postId=String(item.postId||'--');
    const pillar=String(item.pillar||'--');
    const status=String(item.status||'--');
    const text=String(item.payload?.text||item.response?.error||item.reason||'').replaceAll('<','&lt;').replaceAll('>','&gt;');
    return `<tr>
      <td>${channel}</td>
      <td>${postId}</td>
      <td>${pillar}</td>
      <td><span class="pill ${status==='published'?'green':status==='failed'?'red':'blue'}">${status}</span></td>
      <td style="max-width:520px;white-space:normal">${text||'--'}</td>
    </tr>`;
  }).join('');
}

function renderSocialHistoryRows(rows=[]){
  const body=document.getElementById('socialHistoryRows');
  if(!body) return;
  if(!rows.length){
    body.innerHTML='<tr><td colspan="6" style="padding:20px;text-align:center;color:var(--muted)">No social publish history found.</td></tr>';
    return;
  }
  body.innerHTML=rows.map((row)=>{
    const createdAt=row.created_at?new Date(row.created_at).toLocaleString():'--';
    const channel=String(row.channel||'--');
    const postId=String(row.post_id||'--');
    const status=String(row.status||'--');
    const mode=row.dry_run?'Dry run':'Live';
    const error=String(row.error_message||'').replaceAll('<','&lt;').replaceAll('>','&gt;');
    const tone=status==='published'?'green':status==='failed'?'red':'blue';
    return `<tr>
      <td>${createdAt}</td>
      <td>${channel}</td>
      <td>${postId}</td>
      <td><span class="pill ${tone}">${status}</span></td>
      <td>${mode}</td>
      <td style="max-width:360px;white-space:normal">${error||'--'}</td>
    </tr>`;
  }).join('');
}

async function loadSocialHistory(){
  const btn=document.getElementById('socialHistoryRefreshBtn');
  if(btn){btn.disabled=true;btn.textContent='Loading...';}
  try{
    const res=await fetch('/api/admin/social/history?limit=50',{headers:{authorization:`Bearer ${token()}`},cache:'no-store'});
    const data=await res.json().catch(()=>({}));
    if(!res.ok) throw new Error(data.error||'Failed to load social history');
    const rows=Array.isArray(data.history)?data.history:[];
    renderSocialHistoryRows(rows);
  }catch(error){
    renderSocialHistoryRows([]);
    socialMsg(error.message,'err');
  }finally{
    if(btn){btn.disabled=false;btn.textContent='Refresh history';}
  }
}

async function loadSocialPreview(){
  const channels=getSelectedSocialChannels();
  if(!channels.length){socialMsg('Select at least one channel.','err');return;}
  const btn=document.getElementById('socialPreviewBtn');
  if(btn){btn.disabled=true;btn.textContent='Loading...';}
  try{
    const qs=`channels=${encodeURIComponent(channels.join(','))}`;
    const res=await fetch(`/api/admin/social/preview?${qs}`,{headers:{authorization:`Bearer ${token()}`},cache:'no-store'});
    const data=await res.json().catch(()=>({}));
    if(!res.ok) throw new Error(data.error||'Failed to load social preview');
    const selected=Array.isArray(data.preview?.selected)?data.preview.selected:[];
    renderSocialPreviewRows(selected);
    socialMsg(`Loaded preview for ${channels.join(', ')}.`,'ok');
    loadSocialHistory().catch((err)=>console.error(err));
  }catch(error){
    renderSocialPreviewRows([]);
    socialMsg(error.message,'err');
  }finally{
    if(btn){btn.disabled=false;btn.textContent='Refresh preview';}
  }
}

async function runSocialPublish(){
  const channels=getSelectedSocialChannels();
  if(!channels.length){socialMsg('Select at least one channel.','err');return;}
  const btn=document.getElementById('socialPublishBtn');
  if(btn){btn.disabled=true;btn.textContent='Running...';}
  try{
    const dryRun=Boolean(document.getElementById('socialDryRun')?.checked);
    const postId=String(document.getElementById('socialForcePostId')?.value||'').trim();
    const res=await fetch('/api/admin/social/publish',{
      method:'POST',
      headers:{authorization:`Bearer ${token()}`,'content-type':'application/json'},
      body:JSON.stringify({channels:channels.join(','),dryRun,postId})
    });
    const data=await res.json().catch(()=>({}));
    if(!res.ok) throw new Error(data.error||'Failed to run social publish');
    const items=Array.isArray(data.report?.results)?data.report.results:[];
    renderSocialPreviewRows(items);
    const publishedCount=items.filter((item)=>String(item.status||'')==='published').length;
    socialMsg(dryRun?`Dry run complete for ${channels.join(', ')}.`:`Publish run complete. ${publishedCount} channel(s) published.`, 'ok');
    loadSocialHistory().catch((err)=>console.error(err));
  }catch(error){
    socialMsg(error.message,'err');
  }finally{
    if(btn){btn.disabled=false;btn.textContent='Run publish';}
  }
}

let adminTripsCache=[];

function adminTripRef(trip){
  return String(trip?.reference || trip?.id || '').trim();
}

function adminTripDateTime(trip){
  const date=String(trip?.date || '').trim();
  const time=String(trip?.time || '00:00').trim();
  if(!date) return null;
  const normalizedTime=/^\d{2}:\d{2}$/.test(time)?`${time}:00`:'00:00:00';
  const dt=new Date(`${date}T${normalizedTime}`);
  return Number.isNaN(dt.getTime())?null:dt;
}

function isDemoTripRecord(trip){
  const source=String(trip?.bookingSource || trip?.source || '').toUpperCase();
  const ref=adminTripRef(trip).toUpperCase();
  return source.includes('DEMO') || source.includes('LOCAL') || source.includes('MOCK') || ref.includes('DEMO');
}

function matchAdminTimeframe(trip,timeframe){
  if(timeframe==='ALL') return true;
  const dt=adminTripDateTime(trip);
  if(!dt) return timeframe==='PAST';
  const now=new Date();
  const startToday=new Date(now.getFullYear(),now.getMonth(),now.getDate());
  const endToday=new Date(startToday.getTime()+24*60*60*1000);
  if(timeframe==='TODAY') return dt>=startToday && dt<endToday;
  if(timeframe==='NEXT_24H') return dt>=now && dt<=new Date(now.getTime()+24*60*60*1000);
  if(timeframe==='NEXT_7D') return dt>=now && dt<=new Date(now.getTime()+7*24*60*60*1000);
  if(timeframe==='PAST') return dt<now;
  return true;
}

function applyAdminTripsFilters(){
  const sourceEl=document.getElementById('adminTripSourceFilter');
  const timeframeEl=document.getElementById('adminTripTimeframeFilter');
  const referenceEl=document.getElementById('adminTripReferenceFilter');
  const source=String(sourceEl?.value || 'ALL').toUpperCase();
  const timeframe=String(timeframeEl?.value || 'ALL').toUpperCase();
  const refQuery=String(referenceEl?.value || '').trim().toUpperCase();
  return adminTripsCache.filter((trip)=>{
    const ref=adminTripRef(trip).toUpperCase();
    if(refQuery && !ref.includes(refQuery)) return false;
    const kind=isDemoTripRecord(trip)?'DEMO':'REAL';
    if(source!=='ALL' && source!==kind) return false;
    return matchAdminTimeframe(trip,timeframe);
  });
}

function renderAdminTripsRows(){
  const body=document.getElementById('adminTripRows');
  const summary=document.getElementById('adminTripsSummary');
  if(!body || !summary) return;
  const filtered=applyAdminTripsFilters();
  const realCount=adminTripsCache.filter((trip)=>!isDemoTripRecord(trip)).length;
  const demoCount=adminTripsCache.length-realCount;
  summary.textContent=`Showing ${filtered.length} of ${adminTripsCache.length} trips · Real: ${realCount} · Demo: ${demoCount}`;
  if(!filtered.length){
    body.innerHTML='<tr><td colspan="7" style="padding:20px;text-align:center;color:var(--muted)">No trips match the selected filters.</td></tr>';
    return;
  }
  body.innerHTML=filtered.map((trip)=>{
    const ref=adminTripRef(trip) || '—';
    const isDemo=isDemoTripRecord(trip);
    const sourceLabel=isDemo?'DEMO':'REAL';
    const sourceTone=isDemo?'amber':'green';
    const status=String(trip?.statusLabel || trip?.status || 'Requested');
    const date=String(trip?.date || '—');
    const time=String(trip?.time || '—');
    const patient=String(trip?.name || '—');
    const service=String(trip?.service || '—');
    return `<tr>
      <td>${ref}</td>
      <td>${patient}</td>
      <td>${date} ${time}</td>
      <td>${service}</td>
      <td>${status}</td>
      <td><span class="pill ${sourceTone}">${sourceLabel}</span></td>
      <td><button class="button" data-admin-advance="${ref}" ${isDemo?'disabled title="Demo/local trip"':''}>Advance</button></td>
    </tr>`;
  }).join('');
}

async function loadAdminTrips(){
  const body=document.getElementById('adminTripRows');
  if(body) body.innerHTML='<tr><td colspan="7" style="padding:20px;text-align:center;color:var(--muted)">Loading trips…</td></tr>';
  const res=await fetch('/api/admin/bookings',{headers:{authorization:`Bearer ${token()}`},cache:'no-store'});
  const data=await res.json().catch(()=>({}));
  if(!res.ok) throw new Error(data.error || 'Unable to load admin trips');
  adminTripsCache=Array.isArray(data.bookings)?data.bookings:[];
  document.getElementById('statTrips').textContent=adminTripsCache.length;
  renderAdminTripsRows();
}

async function advanceAdminTrip(reference){
  const ref=String(reference || '').trim();
  if(!ref) return;
  const button=document.querySelector(`[data-admin-advance="${ref}"]`);
  if(button){button.disabled=true;button.textContent='Advancing...';}
  try{
    const res=await fetch(`/api/admin/bookings/${encodeURIComponent(ref)}/advance`,{method:'POST',headers:{authorization:`Bearer ${token()}`,'content-type':'application/json'}});
    const data=await res.json().catch(()=>({}));
    if(!res.ok) throw new Error(data.error || 'Unable to advance trip');
    const booking=data.booking;
    if(booking){
      adminTripsCache=adminTripsCache.map((trip)=>adminTripRef(trip)===ref?booking:trip);
      renderAdminTripsRows();
    }
  }catch(err){
    alert(err.message || 'Unable to advance trip');
  }finally{
    if(button){button.disabled=false;button.textContent='Advance';}
  }
}

// Helpers
function showMsg(el,text,type){el.textContent=text;el.className='msgBox '+(type||'ok');el.hidden=false;if(type==='ok')setTimeout(()=>{el.hidden=true},5000);}

document.getElementById('refreshAdminTrips')?.addEventListener('click',()=>{loadAdminTrips().catch((err)=>console.error(err));});
document.getElementById('adminTripSourceFilter')?.addEventListener('change',renderAdminTripsRows);
document.getElementById('adminTripTimeframeFilter')?.addEventListener('change',renderAdminTripsRows);
document.getElementById('adminTripReferenceFilter')?.addEventListener('input',renderAdminTripsRows);
document.getElementById('adminTripRows')?.addEventListener('click',(event)=>{
  const button=event.target?.closest?.('[data-admin-advance]');
  if(!button) return;
  const ref=button.getAttribute('data-admin-advance');
  if(ref) advanceAdminTrip(ref);
});
document.getElementById('socialPreviewBtn')?.addEventListener('click',()=>{loadSocialPreview().catch((err)=>console.error(err));});
document.getElementById('socialPublishBtn')?.addEventListener('click',()=>{runSocialPublish().catch((err)=>console.error(err));});
document.getElementById('socialHistoryRefreshBtn')?.addEventListener('click',()=>{loadSocialHistory().catch((err)=>console.error(err));});
document.querySelectorAll('.socialChannel').forEach((el)=>el.addEventListener('change',()=>{loadSocialPreview().catch((err)=>console.error(err));}));

// Wait for auth-guard to authorize, then load data
window.addEventListener('nexus:authorized',async()=>{
  applyRoleRestrictions();
  if(userRole()==='ADMIN'){
    loadUsers();
    loadAudit();
    loadAdminTrips().catch((err)=>console.error(err));
    loadSocialPreview().catch((err)=>console.error(err));
    loadSocialHistory().catch((err)=>console.error(err));
  }
  try{await loadPlatformSettings();}catch(e){console.error(e);}
});
// Fallback if event already fired
if(window.NexusAuthorizedUser){
  applyRoleRestrictions();
  if(userRole()==='ADMIN'){
    loadUsers();
    loadAudit();
    loadAdminTrips().catch((err)=>console.error(err));
    loadSocialPreview().catch((err)=>console.error(err));
    loadSocialHistory().catch((err)=>console.error(err));
  }
  loadPlatformSettings().catch(()=>{});
}
