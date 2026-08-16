// Mobile nav toggle
(function(){const t=document.querySelector('.mobileNavToggle'),l=document.querySelector('.globalLinks');if(t)t.addEventListener('click',()=>{const e=t.getAttribute('aria-expanded')==='true';t.setAttribute('aria-expanded',!e);l.classList.toggle('open')})})();

const token=()=>sessionStorage.getItem('nexusAccessToken');
const userRole=()=>{
  try{return String(JSON.parse(sessionStorage.getItem('nexusUser')||'{}').role||window.NexusAuthorizedUser?.role||'').toUpperCase();}
  catch{return String(window.NexusAuthorizedUser?.role||'').toUpperCase();}
};
const canEditSettings=()=>userRole()==='ADMIN';
let currentSettings=null;
const ADMIN_DASHBOARD_SECTIONS=['userSection','pricingSection','manageTripSection','adminTripsSection','settingsSection','costAnalyzerSection','socialSection','auditSection'];
const ADMIN_DASHBOARD_LABELS={
  userSection:'User management',
  pricingSection:'Pricing manager',
  manageTripSection:'Manage trip',
  adminTripsSection:'Trips oversight',
  settingsSection:'Organization settings',
  costAnalyzerSection:'Cost analyzer',
  socialSection:'Social automation',
  auditSection:'Audit log'
};
let adminFocusSectionId='';
const DASHBOARD_THRESHOLDS={
  userActiveWarnRatio:0.75,
  userActiveAlertRatio:0.6,
  overdueWarnMinutes:30,
  overdueAlertMinutes:90,
  demoTripWarnCount:10,
  profitWarnFloor:0,
  profitAlertFloor:-250,
  socialFailureWindowHours:24,
  socialFailureAlertCount:3,
  auditStaleWarnHours:24,
  auditStaleAlertHours:72
};

function normalizeNumberText(value){
  return Number(String(value||'').replace(/[^0-9.-]/g,''));
}

function hoursAgoIso(hours){
  return Date.now()-(hours*60*60*1000);
}

function parseIsoTime(value){
  const text=String(value||'').trim();
  if(!text) return null;
  const dt=new Date(text);
  return Number.isNaN(dt.getTime())?null:dt;
}

function countRecentFailedPublishes(){
  const cutoff=hoursAgoIso(DASHBOARD_THRESHOLDS.socialFailureWindowHours);
  let count=0;
  document.querySelectorAll('#socialHistoryRows tr[data-created-at]').forEach((row)=>{
    const dt=parseIsoTime(row.getAttribute('data-created-at'));
    if(!dt||dt.getTime()<cutoff) return;
    const statusCell=row.querySelector('td:nth-child(4) .pill');
    if(statusCell?.classList.contains('red')) count+=1;
  });
  return count;
}

function getLatestAuditAgeHours(){
  let latestTs=0;
  document.querySelectorAll('#auditList .auditRow[data-created-at]').forEach((row)=>{
    const dt=parseIsoTime(row.getAttribute('data-created-at'));
    if(!dt) return;
    latestTs=Math.max(latestTs,dt.getTime());
  });
  if(!latestTs) return null;
  return (Date.now()-latestTs)/(60*60*1000);
}

function setDashboardSignal(sectionId,tone,label){
  const signal=document.querySelector(`[data-signal-for="${sectionId}"]`);
  if(!signal) return;
  signal.classList.remove('normal','warn','alert');
  signal.classList.add(tone);
  signal.textContent=label;
}

function updateDashboardAnomalySummary(){
  const summary=document.getElementById('dashboardAnomalySummary');
  if(!summary) return;
  const alertCount=document.querySelectorAll('.dashSignal.alert').length;
  const warnCount=document.querySelectorAll('.dashSignal.warn').length;
  if(alertCount>0){
    summary.textContent=`${alertCount} critical issue${alertCount===1?'':'s'}`;
    summary.style.background='#fee2e2';
    summary.style.borderColor='#fecaca';
    summary.style.color='#991b1b';
    return;
  }
  if(warnCount>0){
    summary.textContent=`${warnCount} watch item${warnCount===1?'':'s'}`;
    summary.style.background='#ffedd5';
    summary.style.borderColor='#fed7aa';
    summary.style.color='#9a3412';
    return;
  }
  summary.textContent='All monitored areas normal';
  summary.style.background='#dcfce7';
  summary.style.borderColor='#bbf7d0';
  summary.style.color='#166534';
}

function updateDashboardSignals(){
  const totalUsers=normalizeNumberText(document.getElementById('statUsers')?.textContent);
  const activeUsers=normalizeNumberText(document.getElementById('statActiveUsers')?.textContent);
  if(Number.isFinite(totalUsers)&&totalUsers>0){
    const activeRatio=activeUsers/totalUsers;
    if(activeRatio<DASHBOARD_THRESHOLDS.userActiveAlertRatio) setDashboardSignal('userSection','alert',`${Math.round(activeRatio*100)}% active`);
    else if(activeRatio<DASHBOARD_THRESHOLDS.userActiveWarnRatio) setDashboardSignal('userSection','warn',`${Math.round(activeRatio*100)}% active`);
    else setDashboardSignal('userSection','normal','Healthy access');
  }

  const pricedServices=normalizeNumberText(document.getElementById('statPricing')?.textContent);
  if(!Number.isFinite(pricedServices)||pricedServices<=0) setDashboardSignal('pricingSection','alert','Missing pricing');
  else setDashboardSignal('pricingSection','normal',`${pricedServices} services priced`);

  const overdueMetrics=adminTripsCache.reduce((acc,trip)=>{
    const dt=adminTripDateTime(trip);
    if(!dt) return acc;
    const minutesLate=(Date.now()-dt.getTime())/(60*1000);
    if(minutesLate<=0) return acc;
    const status=String(trip?.status||trip?.statusLabel||'').toUpperCase();
    if(['COMPLETED','CANCELLED','NO_SHOW','MISSED'].some((done)=>status.includes(done))) return acc;
    acc.total+=1;
    if(minutesLate>=DASHBOARD_THRESHOLDS.overdueAlertMinutes) acc.severe+=1;
    return acc;
  },{total:0,severe:0});
  if(overdueMetrics.severe>0) setDashboardSignal('adminTripsSection','alert',`${overdueMetrics.severe} severe overdue`);
  else if(overdueMetrics.total>0) setDashboardSignal('adminTripsSection','warn',`${overdueMetrics.total} overdue ${DASHBOARD_THRESHOLDS.overdueWarnMinutes}+m`);
  else setDashboardSignal('adminTripsSection','normal','On schedule');

  const tripTotal=adminTripsCache.length;
  const demoTrips=adminTripsCache.filter((trip)=>isDemoTripRecord(trip)).length;
  if(tripTotal>0&&demoTrips>=DASHBOARD_THRESHOLDS.demoTripWarnCount) setDashboardSignal('manageTripSection','warn',`${demoTrips} demo trips`);
  else if(tripTotal>0&&demoTrips>0) setDashboardSignal('manageTripSection','normal',`${demoTrips} demo baseline`);
  else setDashboardSignal('manageTripSection','normal','Operational set');

  const profitValue=normalizeNumberText(document.getElementById('costProfit')?.textContent);
  if(Number.isFinite(profitValue)&&profitValue<=DASHBOARD_THRESHOLDS.profitAlertFloor) setDashboardSignal('costAnalyzerSection','alert','Material loss');
  else if(Number.isFinite(profitValue)&&profitValue<DASHBOARD_THRESHOLDS.profitWarnFloor) setDashboardSignal('costAnalyzerSection','warn','Slight loss');
  else if(Number.isFinite(profitValue)) setDashboardSignal('costAnalyzerSection','normal','Profit positive');

  const failedPublishes=countRecentFailedPublishes();
  if(failedPublishes>=DASHBOARD_THRESHOLDS.socialFailureAlertCount) setDashboardSignal('socialSection','alert',`${failedPublishes} failed (24h)`);
  else if(failedPublishes>0) setDashboardSignal('socialSection','warn',`${failedPublishes} failed (24h)`);
  else setDashboardSignal('socialSection','normal','Channels stable');

  const auditRows=document.querySelectorAll('#auditList .auditRow').length;
  const latestAuditAgeHours=getLatestAuditAgeHours();
  if(auditRows===0||latestAuditAgeHours==null) setDashboardSignal('auditSection','warn','No recent entries');
  else if(latestAuditAgeHours>=DASHBOARD_THRESHOLDS.auditStaleAlertHours) setDashboardSignal('auditSection','alert',`Last audit ${Math.round(latestAuditAgeHours)}h ago`);
  else if(latestAuditAgeHours>=DASHBOARD_THRESHOLDS.auditStaleWarnHours) setDashboardSignal('auditSection','warn',`Last audit ${Math.round(latestAuditAgeHours)}h ago`);
  else setDashboardSignal('auditSection','normal',`${auditRows} recent actions`);

  setDashboardSignal('settingsSection','normal',canEditSettings()?'Admin editable':'Dispatcher view');
  updateDashboardAnomalySummary();
}

function syncDashboardTilesWithVisibility(){
  document.querySelectorAll('[data-section-target]').forEach((tile)=>{
    const sectionId=tile.getAttribute('data-section-target');
    const section=document.getElementById(sectionId);
    const available=Boolean(section&&section.style.display!=='none');
    if(!available){
      tile.setAttribute('disabled','disabled');
      tile.setAttribute('aria-disabled','true');
      tile.title='Not available for this role';
    }else{
      tile.removeAttribute('disabled');
      tile.removeAttribute('aria-disabled');
      tile.title='';
    }
  });
}

function setDashboardActiveTile(sectionId){
  document.querySelectorAll('[data-section-target]').forEach((tile)=>{
    tile.classList.toggle('active',tile.getAttribute('data-section-target')===sectionId);
  });
}

function showDashboardHome(){
  adminFocusSectionId='';
  document.body.classList.remove('adminFocusMode');
  document.body.classList.add('adminDashboardMode');
  document.querySelectorAll('.sectionTab').forEach((section)=>section.classList.remove('focusVisible'));
  setDashboardActiveTile('');
  updateDashboardSignals();
  const currentHash=String(window.location.hash||'').replace('#','');
  if(currentHash&&ADMIN_DASHBOARD_SECTIONS.includes(currentHash)){
    history.replaceState(null,'',window.location.pathname+window.location.search);
  }
}

function focusDashboardSection(sectionId){
  const target=document.getElementById(sectionId);
  if(!target||target.style.display==='none') return;
  adminFocusSectionId=sectionId;
  document.body.classList.remove('adminDashboardMode');
  document.body.classList.add('adminFocusMode');
  document.querySelectorAll('.sectionTab').forEach((section)=>section.classList.toggle('focusVisible',section.id===sectionId));
  const focusTitle=document.getElementById('adminFocusTitle');
  if(focusTitle) focusTitle.textContent=ADMIN_DASHBOARD_LABELS[sectionId]||'Focused workspace';
  setDashboardActiveTile(sectionId);
  if(window.location.hash!==`#${sectionId}`){
    history.replaceState(null,'',`#${sectionId}`);
  }
  target.scrollIntoView({behavior:'smooth',block:'start'});
}

function initAdminDashboardWorkspace(){
  const navigateFromTile=(tile,event)=>{
    if(event) event.preventDefault();
    if(!tile||tile.hasAttribute('disabled')) return;
    const sectionId=tile.getAttribute('data-section-target');
    if(!sectionId) return;
    focusDashboardSection(sectionId);
  };
  document.getElementById('adminDashboardBack')?.addEventListener('click',showDashboardHome);
  document.getElementById('adminDashboardGrid')?.addEventListener('click',(event)=>{
    const tile=event.target?.closest?.('[data-section-target]');
    navigateFromTile(tile,event);
  });
  document.querySelectorAll('#adminDashboardGrid [data-section-target]').forEach((tile)=>{
    tile.addEventListener('click',(event)=>navigateFromTile(tile,event));
  });
  document.querySelectorAll('.adminShortcut[href^="#"]').forEach((link)=>{
    link.addEventListener('click',(event)=>{
      const href=String(link.getAttribute('href')||'').trim();
      if(!href.startsWith('#')) return;
      const sectionId=href.slice(1);
      if(!sectionId) return;
      event.preventDefault();
      focusDashboardSection(sectionId);
    });
  });
  window.addEventListener('hashchange',()=>{
    const sectionId=String(window.location.hash||'').replace('#','').trim();
    if(sectionId&&ADMIN_DASHBOARD_SECTIONS.includes(sectionId)){
      focusDashboardSection(sectionId);
      return;
    }
    showDashboardHome();
  });
  const initialSection=String(window.location.hash||'').replace('#','').trim();
  if(initialSection&&ADMIN_DASHBOARD_SECTIONS.includes(initialSection)) focusDashboardSection(initialSection);
  else showDashboardHome();
}

function initUserSectionDashboard(){
  const section=document.getElementById('userSection');
  if(!section) return;
  const modules=Array.from(section.querySelectorAll('[data-user-module]')).filter((el)=>el.id);
  const chips=Array.from(section.querySelectorAll('[data-user-module-open]'));
  if(!modules.length||!chips.length) return;
  const validIds=new Set(modules.map((m)=>m.id));
  const storageKey='nexusAdmin.userSection.activeModule';

  const setActiveChip=(moduleId)=>{
    chips.forEach((chip)=>chip.classList.toggle('active',chip.getAttribute('data-user-module-open')===moduleId));
  };

  const openModule=(moduleId,{persist=true,scroll=false}={})=>{
    if(!validIds.has(moduleId)) return;
    modules.forEach((module)=>{module.open=module.id===moduleId;});
    setActiveChip(moduleId);
    if(persist){
      try{localStorage.setItem(storageKey,moduleId);}catch{}
    }
    if(scroll){
      const target=document.getElementById(moduleId);
      target?.scrollIntoView({behavior:'smooth',block:'start'});
    }
  };

  chips.forEach((chip)=>{
    chip.addEventListener('click',()=>{
      const moduleId=chip.getAttribute('data-user-module-open');
      if(moduleId) openModule(moduleId,{persist:true,scroll:true});
    });
  });

  modules.forEach((module)=>{
    const summary=module.querySelector('summary');
    if(!summary) return;
    summary.addEventListener('click',(event)=>{
      event.preventDefault();
      openModule(module.id,{persist:true,scroll:false});
    });
  });

  let preferred='';
  try{preferred=localStorage.getItem(storageKey)||'';}catch{}
  if(!validIds.has(preferred)){
    preferred=modules.find((module)=>module.hasAttribute('open'))?.id||modules[0]?.id||'';
  }
  if(preferred) openModule(preferred,{persist:false,scroll:false});
}

// Users
const ROLE_COLORS={ADMIN:'red',DISPATCHER:'blue',FACILITY:'blue',DRIVER:'green',BILLING:'amber',QA:'amber',EXECUTIVE:'blue',PATIENT:'muted'};
let latestAuditEntries=[];

async function loadUsers(){
  const tbody=document.getElementById('userTableBody');
  tbody.innerHTML='<tr><td colspan="7" style="padding:20px;text-align:center;color:var(--muted)">Loading...</td></tr>';
  try{
    const r=await fetch('/api/admin/users',{headers:{authorization:`Bearer ${token()}`}});
    if(!r.ok){const e=await r.json();throw new Error(e.error||'Failed to load users');}
    const {users}=await r.json();
    document.getElementById('statUsers').textContent=users.length;
    document.getElementById('statActiveUsers').textContent=users.filter(u=>u.active).length;
    if(!users.length){tbody.innerHTML='<tr><td colspan="7" style="padding:20px;text-align:center;color:var(--muted)">No users found.</td></tr>';return;}
    tbody.innerHTML=users.map(u=>`
      <tr data-user-id="${u.id}">
        <td>${u.email}</td>
        <td>${u.phone||'--'}</td>
        <td>${u.name||'--'}</td>
        <td><span class="pill ${ROLE_COLORS[u.role]||'muted'}">${u.role}</span></td>
        <td><span class="pill ${u.active?'green':'muted'}">${u.active?'Active':'Inactive'}</span></td>
        <td style="font-size:12px;color:var(--muted)">${u.createdAt?new Date(u.createdAt).toLocaleDateString():'--'}</td>
        <td>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <button class="button compact" data-toggle-user="${u.id}" data-active="${u.active}" style="min-width:90px">${u.active?'Deactivate':'Activate'}</button>
            <button class="button compact" data-resend-user="${u.id}" style="min-width:120px">Resend login</button>
            <button class="button compact" data-view-resend-history="${u.id}" data-user-email="${u.email}" style="min-width:160px">View resend history</button>
          </div>
        </td>
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
    document.querySelectorAll('[data-resend-user]').forEach(btn=>{
      btn.addEventListener('click',async()=>{
        const id=btn.dataset.resendUser;
        if(!id) return;
        if(!confirm('Reissue temporary credentials and email this user now?')) return;
        btn.disabled=true;
        const prev=btn.textContent;
        btn.textContent='Sending...';
        try{
          const r=await fetch(`/api/admin/users/${encodeURIComponent(id)}/resend-credentials`,{method:'POST',headers:{authorization:`Bearer ${token()}`,'content-type':'application/json'}});
          const data=await r.json().catch(()=>({}));
          if(!r.ok) throw new Error(data.error||'Failed to resend credentials');
          const expiresText=data.tempPasswordExpiresAt?new Date(data.tempPasswordExpiresAt).toLocaleString():'2 hours';
          const emailText=data.emailDeliveryStatus==='sent'?'Credential email sent.':'Credential email not sent automatically.';
          alert(`Temporary password reissued for ${data.user?.email||'user'}. Expires: ${expiresText}. ${emailText}`);
          if(data.warning) alert(data.warning);
        }catch(e){
          alert(e.message||'Failed to resend credentials');
        }finally{
          btn.disabled=false;
          btn.textContent=prev;
        }
      });
    });
    document.querySelectorAll('[data-view-resend-history]').forEach(btn=>{
      btn.addEventListener('click',async()=>{
        const email=(btn.dataset.userEmail||'').trim();
        const userId=(btn.dataset.viewResendHistory||'').trim();
        document.getElementById('auditType').value='CREDENTIALS_REISSUED';
        document.getElementById('auditSearch').value=email||userId;
        const auditDetails=document.getElementById('auditDetails');
        if(auditDetails) auditDetails.open=true;
        focusDashboardSection('auditSection');
        await loadAudit();
        const matches=Array.isArray(latestAuditEntries)?latestAuditEntries.length:0;
        showToast(`Audit filter applied: credential reissues for ${email||userId}. ${matches} record${matches===1?'':'s'} found.`,'ok');
      });
    });
    updateDashboardSignals();
  }catch(e){tbody.innerHTML=`<tr><td colspan="7" style="padding:20px;text-align:center;color:var(--red)">${e.message}</td></tr>`;}
  updateDashboardSignals();
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
  const phone=document.getElementById('newPhone').value.trim();
  const name=document.getElementById('newName').value.trim();
  const role=document.getElementById('newRole').value;
  const msgEl=document.getElementById('createUserMsg');
  msgEl.hidden=true;
  if(!email||!phone||!name||!role){showMsg(msgEl,'All fields are required.','err');return;}
  const btn=document.getElementById('createUserBtn');
  btn.disabled=true;btn.textContent='Creating...';
  try{
    const r=await fetch('/api/admin/users',{method:'POST',headers:{authorization:`Bearer ${token()}`,'content-type':'application/json'},body:JSON.stringify({email,phone,name,role})});
    const data=await r.json();
    if(!r.ok)throw new Error(data.error||'Failed to create user');
    const expiresText=data.tempPasswordExpiresAt?new Date(data.tempPasswordExpiresAt).toLocaleString():'2 hours';
    const emailText=data.emailDeliveryStatus==='sent'
      ? ' Credential email sent to the user.'
      : ' Credential email was not sent automatically.';
    const policyText=data.warning?` ${data.warning}`:' User must change it on first sign-in.';
    showMsg(msgEl,`User ${data.user.email} created. Temporary password: ${data.tempPassword}. Expires: ${expiresText}.${emailText}${policyText}`,'ok');
    document.getElementById('newEmail').value='';
    document.getElementById('newPhone').value='';
    document.getElementById('newName').value='';
    document.getElementById('newRole').value='';
    loadUsers();
  }catch(e){showMsg(msgEl,e.message,'err');}
  finally{btn.disabled=false;btn.textContent='Create user';}
});

function selectedDriverScheduleWeekdays(){
  return Array.from(document.querySelectorAll('#scheduleWeekdayGroup input[type="checkbox"]:checked'))
    .map((input)=>Number(input.value))
    .filter((value)=>Number.isInteger(value)&&value>=1&&value<=7)
    .sort((a,b)=>a-b);
}

const WEEKDAY_LABELS={1:'Mon',2:'Tue',3:'Wed',4:'Thu',5:'Fri',6:'Sat',7:'Sun'};

function renderDriverScheduleRows(rows=[]){
  const body=document.getElementById('driverScheduleRows');
  if(!body) return;
  if(!Array.isArray(rows)||!rows.length){
    body.innerHTML='<tr><td colspan="6" style="padding:12px;color:var(--muted)">No matching schedules found.</td></tr>';
    return;
  }
  body.innerHTML=rows.map((row)=>{
    const weekday=WEEKDAY_LABELS[Number(row.weekday_iso)]||String(row.weekday_iso||'--');
    const effectiveStart=row.effective_start_date?String(row.effective_start_date).slice(0,10):'--';
    const status=row.active?'Active':'Inactive';
    return `<tr>
      <td>${row.display_name||row.email||'--'}</td>
      <td>${weekday}</td>
      <td>${String(row.start_time||'').slice(0,5)||'--'}</td>
      <td>${String(row.end_time||'').slice(0,5)||'--'}</td>
      <td>${effectiveStart}</td>
      <td><span class="pill ${row.active?'green':'muted'}">${status}</span></td>
    </tr>`;
  }).join('');
}

async function loadDriverSchedule(){
  const email=String(document.getElementById('scheduleDriverEmail')?.value||'').trim();
  const msgEl=document.getElementById('saveDriverScheduleMsg');
  const body=document.getElementById('driverScheduleRows');
  if(body) body.innerHTML='<tr><td colspan="6" style="padding:12px;color:var(--muted)">Loading schedule...</td></tr>';
  try{
    const qs=new URLSearchParams();
    if(email) qs.set('driverEmail',email);
    qs.set('activeOnly','true');
    const r=await fetch(`/api/admin/driver-schedule?${qs.toString()}`,{headers:{authorization:`Bearer ${token()}`}});
    const data=await r.json().catch(()=>({}));
    if(!r.ok) throw new Error(data.error||'Failed to load schedule');
    renderDriverScheduleRows(Array.isArray(data.schedules)?data.schedules:[]);
    if(msgEl) showMsg(msgEl,'Driver schedule loaded.','ok');
  }catch(e){
    renderDriverScheduleRows([]);
    if(msgEl) showMsg(msgEl,e.message||'Failed to load schedule','err');
  }
}

document.getElementById('saveDriverScheduleBtn')?.addEventListener('click',async()=>{
  const driverEmail=String(document.getElementById('scheduleDriverEmail')?.value||'').trim().toLowerCase();
  const startTime=String(document.getElementById('scheduleStartTime')?.value||'').trim();
  const endTime=String(document.getElementById('scheduleEndTime')?.value||'').trim();
  const effectiveStartDate=String(document.getElementById('scheduleEffectiveDate')?.value||'').trim();
  const weekdays=selectedDriverScheduleWeekdays();
  const msgEl=document.getElementById('saveDriverScheduleMsg');
  if(!msgEl) return;
  msgEl.hidden=true;

  if(!driverEmail||!startTime||!endTime||!weekdays.length){
    showMsg(msgEl,'Driver email, shift times, and at least one weekday are required.','err');
    return;
  }

  const btn=document.getElementById('saveDriverScheduleBtn');
  btn.disabled=true;
  btn.textContent='Saving...';
  try{
    const payload={driverEmail,startTime,endTime,weekdays};
    if(effectiveStartDate) payload.effectiveStartDate=effectiveStartDate;
    const r=await fetch('/api/admin/driver-schedule',{
      method:'POST',
      headers:{authorization:`Bearer ${token()}`,'content-type':'application/json'},
      body:JSON.stringify(payload)
    });
    const data=await r.json().catch(()=>({}));
    if(!r.ok){
      if(r.status===404){
        throw new Error('Driver schedule API is not available in this deploy yet. Trigger latest production deploy and try again.');
      }
      throw new Error(data.error||'Failed to save driver schedule');
    }
    showMsg(msgEl,`Schedule saved for ${data?.driver?.email||driverEmail}: ${startTime}-${endTime}, weekdays ${weekdays.join(', ')}.`,'ok');
    loadDriverSchedule().catch(()=>{});
    if(userRole()==='ADMIN') loadUsers();
  }catch(e){
    showMsg(msgEl,e.message||'Failed to save driver schedule','err');
  }finally{
    btn.disabled=false;
    btn.textContent='Save driver schedule';
  }
});

document.getElementById('loadDriverScheduleBtn')?.addEventListener('click',()=>{loadDriverSchedule().catch(()=>{});});

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
  updateDashboardSignals();
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
const ACTION_ICONS={LOGIN:'🔑',CREATED:'➕',UPDATED:'✏️',ACTIVATED:'✅',DEACTIVATED:'🚫',CREDENTIALS_REISSUED:'📨',STATUS_ADVANCED:'🔄',DRIVER_REFERRAL_INCENTIVE:'💵',DEFAULT:'📋'};

function summarizeAuditChanges(entry){
  const changes=entry?.changes;
  if(!changes||typeof changes!=='object')return '';
  if(entry.action==='CREDENTIALS_REISSUED'){
    const by=changes.by?`By: ${changes.by}`:'';
    const email=changes.email?`Email: ${changes.email}`:'';
    const status=changes.emailDeliveryStatus?`Delivery: ${changes.emailDeliveryStatus}`:'';
    return [by,email,status].filter(Boolean).join(' | ');
  }
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
  const search=(document.getElementById('auditSearch')?.value||'').trim();
  try{
    let url='/api/admin/audit-log?limit=100';
    if(since)url+=`&since=${encodeURIComponent(since)}`;
    if(type)url+=`&action=${encodeURIComponent(type)}`;
    if(search)url+=`&q=${encodeURIComponent(search)}`;
    const r=await fetch(url,{headers:{authorization:`Bearer ${token()}`}});
    if(!r.ok){const e=await r.json();throw new Error(e.error||'Failed to load audit log');}
    const {entries}=await r.json();
    const filtered=Array.isArray(entries)?entries:[];
    latestAuditEntries=filtered;
    if(!filtered.length){container.innerHTML='<p style="color:var(--muted)">No audit records found.</p>';updateDashboardSignals();return;}
    container.innerHTML=filtered.map(e=>`
      <div class="auditRow" data-created-at="${e.createdAt||''}">
        <div class="auditIcon">${ACTION_ICONS[e.action]||ACTION_ICONS.DEFAULT}</div>
        <div class="auditInfo">
          <strong>${e.action} - ${e.entityType}</strong>
          <small>Entity: ${e.entityId}${summarizeAuditChanges(e)?` - ${summarizeAuditChanges(e)}`:''}</small>
        </div>
        <div class="auditTime">${e.createdAt?new Date(e.createdAt).toLocaleString():'--'}</div>
      </div>`).join('');
    updateDashboardSignals();
  }catch(e){container.innerHTML=`<p style="color:var(--red)">${e.message}</p>`;}
  updateDashboardSignals();
}

function csvEscape(value){
  const raw=String(value??'');
  return /[",\n]/.test(raw)?`"${raw.replace(/"/g,'""')}"`:raw;
}

async function exportAuditCsv(){
  if(!Array.isArray(latestAuditEntries)||latestAuditEntries.length===0){
    await loadAudit();
  }
  if(!Array.isArray(latestAuditEntries)||latestAuditEntries.length===0){
    alert('No audit records to export for the current filters.');
    return;
  }
  const header=['createdAt','action','entityType','entityId','changes'];
  const rows=[header.join(',')];
  for(const entry of latestAuditEntries){
    rows.push([
      csvEscape(entry.createdAt||''),
      csvEscape(entry.action||''),
      csvEscape(entry.entityType||''),
      csvEscape(entry.entityId||''),
      csvEscape(JSON.stringify(entry.changes||{}))
    ].join(','));
  }
  const blob=new Blob([rows.join('\n')],{type:'text/csv'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url;
  a.download=`audit-log-${new Date().toISOString().slice(0,10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

document.getElementById('refreshAudit').addEventListener('click',loadAudit);
document.getElementById('applyAuditFilter').addEventListener('click',loadAudit);
document.getElementById('auditSearch')?.addEventListener('keydown',(event)=>{
  if(event.key==='Enter') loadAudit();
});
document.getElementById('exportAuditCsv')?.addEventListener('click',()=>{exportAuditCsv().catch((err)=>alert(err.message||'Failed to export audit CSV'));});

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
      tollCostPerTrip:Number(document.getElementById('tollCostPerTrip').value||0),
      maintenanceCostPerMile:Number(document.getElementById('maintenanceCostPerMile').value||0),
      insuranceCostPerTrip:Number(document.getElementById('insuranceCostPerTrip').value||0),
      dispatchOverheadPerTrip:Number(document.getElementById('dispatchOverheadPerTrip').value||0),
      cleaningCostPerTrip:Number(document.getElementById('cleaningCostPerTrip').value||0),
      complianceCostPerTrip:Number(document.getElementById('complianceCostPerTrip').value||0),
      otherVariableCostPerTrip:Number(document.getElementById('otherVariableCostPerTrip').value||0),
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
  document.getElementById('tollCostPerTrip').value=fare.tollCostPerTrip==null?'':Number(fare.tollCostPerTrip);
  document.getElementById('maintenanceCostPerMile').value=fare.maintenanceCostPerMile==null?'':Number(fare.maintenanceCostPerMile);
  document.getElementById('insuranceCostPerTrip').value=fare.insuranceCostPerTrip==null?'':Number(fare.insuranceCostPerTrip);
  document.getElementById('dispatchOverheadPerTrip').value=fare.dispatchOverheadPerTrip==null?'':Number(fare.dispatchOverheadPerTrip);
  document.getElementById('cleaningCostPerTrip').value=fare.cleaningCostPerTrip==null?'':Number(fare.cleaningCostPerTrip);
  document.getElementById('complianceCostPerTrip').value=fare.complianceCostPerTrip==null?'':Number(fare.complianceCostPerTrip);
  document.getElementById('otherVariableCostPerTrip').value=fare.otherVariableCostPerTrip==null?'':Number(fare.otherVariableCostPerTrip);
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
  updateDashboardSignals();
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
  const costSection=document.getElementById('costAnalyzerSection');
  const socialSection=document.getElementById('socialSection');
  if(userSection) userSection.style.display='none';
  if(auditSection) auditSection.style.display='none';
  if(costSection) costSection.style.display='none';
  if(socialSection) socialSection.style.display='none';
  document.getElementById('savePricing').disabled=true;
  document.getElementById('resetPricing').disabled=true;
  document.getElementById('saveSettings').disabled=true;
  document.getElementById('refreshFuelIndexBtn').disabled=true;
  syncDashboardTilesWithVisibility();
}

let lastCostQuery='';

function money(value){
  const num=Number(value||0);
  return `$${num.toFixed(2)}`;
}

function costMsg(text,type='ok'){
  const el=document.getElementById('costAnalyzerMsg');
  if(!el) return;
  showMsg(el,text,type);
}

function setCostSelectOptions(selectId,values=[],placeholder='Any'){
  const select=document.getElementById(selectId);
  if(!select) return;
  const current=select.value||'';
  const options=Array.from(new Set((values||[]).map((value)=>String(value||'').trim()).filter(Boolean))).sort((a,b)=>a.localeCompare(b));
  select.innerHTML=`<option value="">${placeholder}</option>${options.map((value)=>`<option value="${value.replaceAll('"','&quot;')}">${value}</option>`).join('')}`;
  if(current&&options.includes(current)) select.value=current;
}

function applyCostFilters(filters={}){
  setCostSelectOptions('costDriverFilter',filters.drivers||[],'Any driver');
  setCostSelectOptions('costVehicleFilter',filters.vehicles||[],'Any vehicle');
  setCostSelectOptions('costServiceFilter',filters.services||[],'Any service');
  setCostSelectOptions('costSourceFilter',filters.sources||[],'Any source');
  setCostSelectOptions('costStatusFilter',filters.statuses||[],'Any status');
}

function buildCostQuery(){
  const params=new URLSearchParams();
  const start=document.getElementById('costStart')?.value||'';
  const end=document.getElementById('costEnd')?.value||'';
  const groupBy=document.getElementById('costGroupBy')?.value||'day';
  const driver=document.getElementById('costDriverFilter')?.value?.trim()||'';
  const vehicle=document.getElementById('costVehicleFilter')?.value?.trim()||'';
  const service=document.getElementById('costServiceFilter')?.value?.trim()||'';
  const source=document.getElementById('costSourceFilter')?.value?.trim()||'';
  const status=document.getElementById('costStatusFilter')?.value?.trim()||'';
  const includeCancelled=Boolean(document.getElementById('costIncludeCancelled')?.checked);
  if(start)params.set('start',start);
  if(end)params.set('end',end);
  if(groupBy)params.set('groupBy',groupBy);
  if(driver)params.set('driver',driver);
  if(vehicle)params.set('vehicle',vehicle);
  if(service)params.set('service',service);
  if(source)params.set('source',source);
  if(status)params.set('status',status);
  if(includeCancelled)params.set('includeCancelled','true');
  params.set('limit','1500');
  return params.toString();
}

function renderCostVehicleRows(rows=[]){
  const body=document.getElementById('costVehicleRows');
  if(!body)return;
  if(!rows.length){
    body.innerHTML='<tr><td colspan="10" style="padding:20px;text-align:center;color:var(--muted)">No trip cost records found for selected filters.</td></tr>';
    return;
  }
  body.innerHTML=rows.slice(0,50).map((item)=>{
    const otherCosts=Number(item.maintenanceCost||0)+Number(item.insuranceCost||0)+Number(item.dispatchOverheadCost||0)+Number(item.cleaningCost||0)+Number(item.complianceCost||0)+Number(item.otherVariableCost||0);
    return `<tr><td>${item.vehicleUnit||'Unassigned'}</td><td>${item.vehicleType||'Unknown'}</td><td>${item.trips||0}</td><td>${money(item.driverPayCost||0)}</td><td>${money(item.fuelCost||0)}</td><td>${money(item.tollCost||0)}</td><td>${money(otherCosts)}</td><td>${money(item.totalCost)}</td><td>${money(item.averageCostPerTrip)}</td><td>${money(item.totalProfit)}</td></tr>`;
  }).join('');
}

async function runCostAnalyzer(){
  const btn=document.getElementById('costAnalyzerLoadBtn');
  if(btn){btn.disabled=true;btn.textContent='Running...';}
  try{
    const qs=buildCostQuery();
    lastCostQuery=qs;
    const res=await fetch(`/api/admin/analytics/cost?${qs}`,{headers:{authorization:`Bearer ${token()}`},cache:'no-store'});
    const data=await res.json().catch(()=>({}));
    if(!res.ok) throw new Error(data.error||'Failed to load cost analysis');
    const summary=data.summary||{};
    applyCostFilters(data.filters||{});
    document.getElementById('costTrips').textContent=String(summary.trips||0);
    document.getElementById('costTotal').textContent=money(summary.totalCost||0);
    document.getElementById('costRevenue').textContent=money(summary.totalRevenue||0);
    document.getElementById('costProfit').textContent=money(summary.totalProfit||0);
    renderCostVehicleRows(data.breakdowns?.byVehicle||[]);
    const componentSummary=document.getElementById('costComponentSummary');
    if(componentSummary){
      componentSummary.textContent=`Cost composition totals -> Driver ${money(summary.driverLaborCost||0)}, Fuel ${money(summary.fuelCost||0)}, Tolls ${money(summary.tollCost||0)}, Other Variable ${money(summary.nonFuelVariableCost||0)}.`;
    }
    costMsg('Cost analysis loaded.','ok');
  }catch(error){
    renderCostVehicleRows([]);
    const componentSummary=document.getElementById('costComponentSummary');
    if(componentSummary) componentSummary.textContent='';
    costMsg(error.message,'err');
  }finally{
    if(btn){btn.disabled=false;btn.textContent='Run analysis';}
    updateDashboardSignals();
  }
}

async function exportCostAnalyzerCsv(){
  try{
    const qs=lastCostQuery||buildCostQuery();
    const res=await fetch(`/api/admin/analytics/cost-export?${qs}`,{headers:{authorization:`Bearer ${token()}`}});
    if(!res.ok){const err=await res.json().catch(()=>({}));throw new Error(err.error||'Failed to export cost report');}
    const text=await res.text();
    const blob=new Blob([text],{type:'text/csv'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');
    a.href=url;
    a.download='cost-analyzer-export.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    costMsg('Cost CSV exported.','ok');
  }catch(error){
    costMsg(error.message,'err');
  }
}

async function sendCostAnalyzerReport(){
  const btn=document.getElementById('costAnalyzerSendBtn');
  if(btn){btn.disabled=true;btn.textContent='Sending...';}
  try{
    const qs=lastCostQuery||buildCostQuery();
    const body={};
    new URLSearchParams(qs).forEach((value,key)=>{body[key]=value;});
    const res=await fetch('/api/admin/analytics/cost-report',{method:'POST',headers:{authorization:`Bearer ${token()}`,'content-type':'application/json'},body:JSON.stringify(body)});
    const data=await res.json().catch(()=>({}));
    if(!res.ok) throw new Error(data.error||'Failed to send cost report');
    const emailStatus=data.delivery?.email?.status||'unknown';
    const teamsStatus=data.delivery?.teams?.status||'unknown';
    costMsg(`Report sent. Email: ${emailStatus}. Teams: ${teamsStatus}.`,'ok');
  }catch(error){
    costMsg(error.message,'err');
  }finally{
    if(btn){btn.disabled=false;btn.textContent='Send report';}
  }
}

function getSelectedSocialChannels(){
  return Array.from(document.querySelectorAll('.socialChannel:checked')).map((el)=>String(el.value||'').trim()).filter(Boolean);
}

function socialMsg(text,type='ok'){
  const el=document.getElementById('socialMsg');
  if(!el) return;
  showMsg(el,text,type);
}

async function runSocialDiagnostics(){
  const btn=document.getElementById('socialDiagnosticsBtn');
  const output=document.getElementById('socialDiagnosticsOutput');
  if(btn){btn.disabled=true;btn.textContent='Checking...';}
  try{
    const res=await fetch('/.netlify/functions/social-diagnostics',{headers:{authorization:`Bearer ${token()}`},cache:'no-store'});
    const data=await res.json().catch(()=>({}));
    if(!res.ok) throw new Error(data.error||'Failed to run social diagnostics');
    if(output){output.hidden=false;output.textContent=JSON.stringify(data.facebook||{},null,2);}
    const fb=data.facebook||{};
    const healthy=fb.configured&&fb.pageAccessible&&fb.feedReadable&&fb.requiredPermissions?.pages_read_engagement&&fb.requiredPermissions?.pages_manage_posts;
    socialMsg(healthy?'Facebook diagnostics passed.':'Facebook diagnostics found a configuration mismatch.',healthy?'ok':'err');
  }catch(error){
    if(output){output.hidden=false;output.textContent=String(error.message||error);}
    socialMsg(error.message,'err');
  }finally{
    if(btn){btn.disabled=false;btn.textContent='Run diagnostics';}
  }
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
    const diagnostic=String(item.response?.error||item.response?.reason||item.reason||'').trim();
    const text=String((status==='skipped'||status==='failed')&&diagnostic?diagnostic:(item.payload?.text||diagnostic||'')).replaceAll('<','&lt;').replaceAll('>','&gt;');
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
    const error=String(row.error_message||row.response?.error||row.response?.reason||'').replaceAll('<','&lt;').replaceAll('>','&gt;');
    const tone=status==='published'?'green':status==='failed'?'red':'blue';
    return `<tr data-created-at="${row.created_at||''}">
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
    updateDashboardSignals();
  }
}

async function loadSocialPreview(){
  const channels=getSelectedSocialChannels();
  if(!channels.length){socialMsg('Select at least one channel.','err');return;}
  const btn=document.getElementById('socialPreviewBtn');
  if(btn){btn.disabled=true;btn.textContent='Loading...';}
  try{
    const postId=String(document.getElementById('socialForcePostId')?.value||'').trim();
    const qs=`channels=${encodeURIComponent(channels.join(','))}&postId=${encodeURIComponent(postId)}`;
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
      body:JSON.stringify({channels:channels.join(','),dryRun,postId,forcedPostId:postId})
    });
    const data=await res.json().catch(()=>({}));
    if(!res.ok) throw new Error(data.error||'Failed to run social publish');
    const items=Array.isArray(data.report?.results)?data.report.results:[];
    renderSocialPreviewRows(items);
    const publishedCount=items.filter((item)=>String(item.status||'')==='published').length;
    const skippedOrFailed=items.filter((item)=>['skipped','failed'].includes(String(item.status||''))).length;
    socialMsg(
      dryRun?`Dry run complete for ${channels.join(', ')}.`:`Publish run complete. ${publishedCount} published; ${skippedOrFailed} skipped or failed.`,
      !dryRun&&skippedOrFailed?'err':'ok'
    );
    loadSocialHistory().catch((err)=>console.error(err));
  }catch(error){
    socialMsg(error.message,'err');
  }finally{
    if(btn){btn.disabled=false;btn.textContent='Run publish';}
  }
}

let adminTripsCache=[];
let adminTripsShowAll=false;
const ADMIN_TRIPS_DEFAULT_LIMIT=5;
const ADMIN_TRIP_STATUS_FLOW={
  SUBMITTED:'SCHEDULED',
  REQUESTED:'SCHEDULED',
  PENDING_DISPATCH_CONFIRMATION:'SCHEDULED',
  SCHEDULED:'ASSIGNED',
  ASSIGNED:'EN_ROUTE',
  EN_ROUTE:'ARRIVED',
  ARRIVED:'IN_TRANSIT',
  IN_TRANSIT:'COMPLETED'
};

function adminTripRef(trip){
  return String(trip?.reference || trip?.id || '').trim();
}

function normalizeAdminTripDate(value){
  const raw=String(value || '').trim();
  if(!raw) return '';
  const isoMatch=raw.match(/^(\d{4}-\d{2}-\d{2})/);
  if(isoMatch) return isoMatch[1];
  const parsed=new Date(raw);
  return Number.isNaN(parsed.getTime())?'':parsed.toISOString().slice(0,10);
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
  const dateEl=document.getElementById('adminTripDateFilter');
  const source=String(sourceEl?.value || 'ALL').toUpperCase();
  const timeframe=String(timeframeEl?.value || 'ALL').toUpperCase();
  const refQuery=String(referenceEl?.value || '').trim().toUpperCase();
  const selectedDate=normalizeAdminTripDate(dateEl?.value || '');
  return adminTripsCache.filter((trip)=>{
    const ref=adminTripRef(trip).toUpperCase();
    if(refQuery && !ref.includes(refQuery)) return false;
    if(selectedDate && normalizeAdminTripDate(trip?.date)!==selectedDate) return false;
    const kind=isDemoTripRecord(trip)?'DEMO':'REAL';
    if(source!=='ALL' && source!==kind) return false;
    return matchAdminTimeframe(trip,timeframe);
  });
}

function hasActiveAdminTripFilters(){
  const source=String(document.getElementById('adminTripSourceFilter')?.value || 'ALL').toUpperCase();
  const timeframe=String(document.getElementById('adminTripTimeframeFilter')?.value || 'ALL').toUpperCase();
  const refQuery=String(document.getElementById('adminTripReferenceFilter')?.value || '').trim();
  const selectedDate=normalizeAdminTripDate(document.getElementById('adminTripDateFilter')?.value || '');
  return Boolean(refQuery || selectedDate || source!=='ALL' || timeframe!=='ALL');
}

function sortAdminTripsLatestFirst(trips=[]){
  return [...trips].sort((a,b)=>{
    const aTime=adminTripDateTime(a)?.getTime() || 0;
    const bTime=adminTripDateTime(b)?.getTime() || 0;
    if(aTime!==bTime) return bTime-aTime;
    return adminTripRef(b).localeCompare(adminTripRef(a));
  });
}

function updateAdminTripsVisibilityButton(totalFiltered,hiddenCount,hasFilters){
  const button=document.getElementById('toggleAdminTripsVisibility');
  if(!button) return;
  if(hasFilters){
    button.disabled=true;
    button.textContent='Show all trips';
    button.title='Default latest-5 mode applies when no filters are active';
    return;
  }
  button.disabled=false;
  button.title='';
  if(adminTripsShowAll){
    button.textContent='Show latest 5 trips';
    return;
  }
  button.textContent=hiddenCount>0?`Show all trips (${totalFiltered})`:'Show all trips';
}

function renderAdminTripsRows(){
  const body=document.getElementById('adminTripRows');
  const summary=document.getElementById('adminTripsSummary');
  if(!body || !summary) return;
  const filtered=applyAdminTripsFilters();
  const hasFilters=hasActiveAdminTripFilters();
  const shouldLimit=!adminTripsShowAll && !hasFilters;
  const visibleTrips=shouldLimit?filtered.slice(0,ADMIN_TRIPS_DEFAULT_LIMIT):filtered;
  const hiddenCount=shouldLimit?Math.max(0,filtered.length-visibleTrips.length):0;
  const realCount=adminTripsCache.filter((trip)=>!isDemoTripRecord(trip)).length;
  const demoCount=adminTripsCache.length-realCount;
  summary.textContent=`Showing ${visibleTrips.length} of ${filtered.length} matching trips (total ${adminTripsCache.length}) · Real: ${realCount} · Demo: ${demoCount}${hiddenCount>0?` · ${hiddenCount} hidden`:''}`;
  updateAdminTripsVisibilityButton(filtered.length,hiddenCount,hasFilters);
  if(!visibleTrips.length){
    body.innerHTML='<tr><td colspan="7" style="padding:20px;text-align:center;color:var(--muted)">No trips match the selected filters.</td></tr>';
    return;
  }
  body.innerHTML=visibleTrips.map((trip)=>{
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
  adminTripsCache=sortAdminTripsLatestFirst(Array.isArray(data.bookings)?data.bookings:[]);
  adminTripsShowAll=false;
  document.getElementById('statTrips').textContent=adminTripsCache.length;
  renderAdminTripsRows();
  updateDashboardSignals();
}

async function advanceAdminTrip(reference){
  const ref=String(reference || '').trim();
  if(!ref) return;
  const button=document.querySelector(`[data-admin-advance="${ref}"]`);
  if(button){button.disabled=true;button.textContent='Advancing...';}
  const currentTrip=adminTripsCache.find((trip)=>adminTripRef(trip)===ref) || null;
  const currentStatus=String(currentTrip?.status || '').toUpperCase();
  const fallbackNextStatus=ADMIN_TRIP_STATUS_FLOW[currentStatus] || '';
  try{
    const res=await fetch(`/api/admin/bookings/${encodeURIComponent(ref)}/advance`,{method:'POST',headers:{authorization:`Bearer ${token()}`,'content-type':'application/json'}});
    const data=await res.json().catch(()=>({}));
    let booking=res.ok?data.booking:null;
    if(!res.ok){
      // Fallback path: update status directly through PATCH when advance endpoint fails.
      if(res.status>=500&&fallbackNextStatus){
        const patchRes=await fetch(`/api/admin/bookings/${encodeURIComponent(ref)}`,{
          method:'PATCH',
          headers:{authorization:`Bearer ${token()}`,'content-type':'application/json'},
          body:JSON.stringify({status:fallbackNextStatus})
        });
        const patchData=await patchRes.json().catch(()=>({}));
        if(!patchRes.ok) throw new Error(patchData.error || data.error || 'Unable to advance trip');
        booking=patchData.booking;
      }else{
        throw new Error(data.error || 'Unable to advance trip');
      }
    }
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

let toastTimer=null;
function showToast(text,type='ok'){
  const el=document.getElementById('adminToast');
  if(!el) return;
  if(toastTimer){clearTimeout(toastTimer);toastTimer=null;}
  el.textContent=text;
  el.className=`adminToast ${type==='err'?'err':''}`.trim();
  el.hidden=false;
  requestAnimationFrame(()=>el.classList.add('show'));
  toastTimer=setTimeout(()=>{
    el.classList.remove('show');
    setTimeout(()=>{el.hidden=true;},220);
  },2600);
}

document.getElementById('refreshAdminTrips')?.addEventListener('click',()=>{loadAdminTrips().catch((err)=>console.error(err));});
document.getElementById('adminTripSourceFilter')?.addEventListener('change',renderAdminTripsRows);
document.getElementById('adminTripTimeframeFilter')?.addEventListener('change',renderAdminTripsRows);
document.getElementById('adminTripReferenceFilter')?.addEventListener('input',renderAdminTripsRows);
document.getElementById('adminTripDateFilter')?.addEventListener('change',renderAdminTripsRows);
document.getElementById('toggleAdminTripsVisibility')?.addEventListener('click',()=>{
  adminTripsShowAll=!adminTripsShowAll;
  renderAdminTripsRows();
});
document.getElementById('adminTripRows')?.addEventListener('click',(event)=>{
  const button=event.target?.closest?.('[data-admin-advance]');
  if(!button) return;
  const ref=button.getAttribute('data-admin-advance');
  if(ref) advanceAdminTrip(ref);
});
document.getElementById('socialPreviewBtn')?.addEventListener('click',()=>{loadSocialPreview().catch((err)=>console.error(err));});
document.getElementById('socialDiagnosticsBtn')?.addEventListener('click',()=>{runSocialDiagnostics().catch((err)=>console.error(err));});
document.getElementById('socialPublishBtn')?.addEventListener('click',()=>{runSocialPublish().catch((err)=>console.error(err));});
document.getElementById('socialHistoryRefreshBtn')?.addEventListener('click',()=>{loadSocialHistory().catch((err)=>console.error(err));});
document.querySelectorAll('.socialChannel').forEach((el)=>el.addEventListener('change',()=>{loadSocialPreview().catch((err)=>console.error(err));}));
document.getElementById('costAnalyzerLoadBtn')?.addEventListener('click',()=>{runCostAnalyzer().catch((err)=>console.error(err));});
document.getElementById('costAnalyzerExportBtn')?.addEventListener('click',()=>{exportCostAnalyzerCsv().catch((err)=>console.error(err));});
document.getElementById('costAnalyzerSendBtn')?.addEventListener('click',()=>{sendCostAnalyzerReport().catch((err)=>console.error(err));});

initAdminDashboardWorkspace();
initUserSectionDashboard();

// Wait for auth-guard to authorize, then load data
window.addEventListener('nexus:authorized',async()=>{
  applyRoleRestrictions();
  syncDashboardTilesWithVisibility();
  if(userRole()==='ADMIN'){
    loadUsers();
    loadAudit();
    loadDriverSchedule().catch((err)=>console.error(err));
    loadAdminTrips().catch((err)=>console.error(err));
    runCostAnalyzer().catch((err)=>console.error(err));
    loadSocialPreview().catch((err)=>console.error(err));
    loadSocialHistory().catch((err)=>console.error(err));
  }
  try{await loadPlatformSettings();}catch(e){console.error(e);}
});
// Fallback if event already fired
if(window.NexusAuthorizedUser){
  applyRoleRestrictions();
  syncDashboardTilesWithVisibility();
  if(userRole()==='ADMIN'){
    loadUsers();
    loadAudit();
    loadDriverSchedule().catch((err)=>console.error(err));
    loadAdminTrips().catch((err)=>console.error(err));
    runCostAnalyzer().catch((err)=>console.error(err));
    loadSocialPreview().catch((err)=>console.error(err));
    loadSocialHistory().catch((err)=>console.error(err));
  }
  loadPlatformSettings().catch(()=>{});
}
