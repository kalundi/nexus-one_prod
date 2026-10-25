(function(){
 'use strict';
 const $=id=>document.getElementById(id),esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const headers=()=>({authorization:`Bearer ${sessionStorage.getItem('nexusAccessToken')||''}`,'content-type':'application/json'});
 const ROLES={ADMIN:'Administrator',DISPATCHER:'Dispatcher',DRIVER:'Driver',FACILITY:'Facility',STAFF:'Staff / attendant',BILLING:'Billing',QA:'Quality assurance',EXECUTIVE:'Executive',PATIENT:'Patient',CARETAKER:'Caretaker'};
 let users=[],functions={},groups=[],editingIds=[],selectedUser=null,saveInProgress=false,scheduleRequest=0;
 const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 function message(id,text,error=false){const el=$(id);if(!el)return;el.hidden=!text;el.className='msgBox '+(error?'err':'ok');el.textContent=text;}
 async function request(url,options={}){const r=await fetch(url,{headers:headers(),cache:'no-store',...options});const body=await r.json().catch(()=>({}));if(!r.ok)throw new Error(body.error||'Unable to complete this change.');return body;}
 const roleOptions=()=>Object.entries(ROLES).map(([key,label])=>`<option value="${key}">${label}</option>`).join('');
 $('userRoleFilter').insertAdjacentHTML('beforeend',roleOptions());$('editUserRole').innerHTML=roleOptions();
 const isDriver=u=>u.role==='DRIVER'||u.roles?.includes('DRIVER');
 function driverOptions(){
  const select=$('scheduleDriverEmail'),selected=select.value;
  select.innerHTML='<option value="">All drivers / select a driver</option>'+users.filter(isDriver).map(u=>`<option value="${esc(u.email)}">${esc(u.userCode||'')} · ${esc(u.name||u.email)}${u.active?'':' (inactive)'}</option>`).join('');
  if([...select.options].some(o=>o.value===selected))select.value=selected;
 }
 function renderUsers(){
  const search=$('userSearch').value.trim().toLowerCase(),role=$('userRoleFilter').value,status=$('userStatusFilter').value;
  const filtered=users.filter(u=>(!role||u.role===role||u.roles?.includes(role))&&(!status||u.active===(status==='active'))&&(!search||[u.name,u.email,u.phone,u.userCode,...(u.functions||[]).map(f=>functions[f]||f)].join(' ').toLowerCase().includes(search)));
  $('userListSummary').textContent=`${filtered.length} of ${users.length} people · ${users.filter(u=>u.active).length} active`;
  $('userTableBody').innerHTML=filtered.map(u=>`<tr><td><span class="userCode">${esc(u.userCode||'—')}</span></td><td><strong class="userLine" title="${esc(u.name||u.email)}">${esc(u.name||u.email)}</strong><span class="userLine" title="${esc(u.email)}"><small>${esc(u.email)}</small></span></td><td><span class="pill ${isDriver(u)?'green':'blue'}">${esc(u.demoOnly?'Facility demo only':ROLES[u.role]||u.role)}</span>${u.functions?.length?`<span class="userLine" title="${esc(u.functions.map(f=>functions[f]||f).join(', '))}"><small>${esc(u.functions.map(f=>functions[f]||f).join(', '))}</small></span>`:''}</td><td><span class="pill ${u.active?'green':'muted'}">${u.active?'Active':'Inactive'}</span></td><td><button class="button compact" type="button" data-manage-user="${esc(u.id)}">Manage</button></td></tr>`).join('')||'<tr><td colspan="5">No people match these filters.</td></tr>';
 }
 async function loadUsers(){
  try{
   const data=await request('/api/admin/users');users=Array.isArray(data.users)?data.users:[];functions=data.functions||functions;
   $('statUsers').textContent=users.length;$('statActiveUsers').textContent=users.filter(u=>u.active).length;
   driverOptions();renderUsers();window.updateDashboardSignals?.();
  }catch(e){message('userManagerMsg',e.message,true);$('userTableBody').innerHTML='<tr><td colspan="5">Unable to load people. Refresh to try again.</td></tr>';}
 }
 function openUser(id){
  selectedUser=users.find(u=>u.id===id);if(!selectedUser)return;
  const u=selectedUser;$('userAccountTitle').textContent=u.name||'Manage account';$('userAccountIdentity').textContent=`${u.userCode||'ID pending'} · ${u.email}`;
  $('editUserName').value=u.name||'';$('editUserPhone').value=u.phone||'';$('editUserPhone').required=!u.demoOnly;$('editUserRole').value=u.role;$('editUserScope').value=u.scopeId||'';
  $('editUserRole').disabled=!!u.demoOnly;$('editUserScope').readOnly=!!u.demoOnly;$('resendUserAccount').textContent=u.demoOnly?'Issue demo password':'Reissue credentials';
  $('editUserFunctions').innerHTML='<legend>Operational functions</legend>'+Object.entries(functions).map(([key,label])=>`<label class="functionChoice"><input type="checkbox" value="${key}" ${u.functions?.includes(key)?'checked':''}>${esc(label)}</label>`).join('');
  $('userAccountAccess').textContent=u.demoOnly?'Demo-only access: FutureCare Annapolis presentation. Credentials use the production user directory. No production trip, patient, billing, or dispatch access.':`Experiences: ${(u.roles||[u.role]).map(r=>ROLES[r]||r).join(', ')}. Functions label responsibilities; role access controls permissions.`;
  $('userAccountCreated').textContent=`Account created ${u.createdAt?new Date(u.createdAt).toLocaleDateString('en-US'):'—'}. Nexus ID stays the same across all experiences.`;
  $('toggleUserAccount').textContent=u.active&&u.employeeActive===false?'Activate workforce':u.active?'Deactivate account':'Activate account';$('toggleUserAccount').classList.toggle('danger',u.active&&u.employeeActive!==false);
  $('userAccountSchedule').hidden=!isDriver(u);message('userAccountMsg','');
  if(!$('userAccountDialog').open)$('userAccountDialog').showModal();
 }
 $('userTableBody').addEventListener('click',e=>{const b=e.target.closest('[data-manage-user]');if(b)openUser(b.dataset.manageUser);});
 ['userSearch','userRoleFilter','userStatusFilter'].forEach(id=>$(id).addEventListener(id==='userSearch'?'input':'change',renderUsers));
 $('closeUserAccount').addEventListener('click',()=>$('userAccountDialog').close());
 $('userAccountDialog').addEventListener('click',e=>{if(e.target===e.currentTarget){const box=e.currentTarget.getBoundingClientRect();if(e.clientX<box.left||e.clientX>box.right||e.clientY<box.top||e.clientY>box.bottom)e.currentTarget.close();}});
 async function updateAccount(payload){
  if(saveInProgress||!selectedUser)return;saveInProgress=true;
  if(selectedUser.demoOnly&&payload.phone==='')delete payload.phone;
  const id=selectedUser.id;['saveUserAccount','toggleUserAccount'].forEach(key=>$(key).disabled=true);message('userAccountMsg','');
  try{
   await request(`/api/admin/users/${encodeURIComponent(id)}`,{method:'PATCH',body:JSON.stringify(payload)});
   await loadUsers();openUser(id);message('userAccountMsg','Account updated. Availability and access use the updated account.');await loadDriverSchedule({silent:true});
  }catch(e){message('userAccountMsg',e.message,true);}finally{saveInProgress=false;['saveUserAccount','toggleUserAccount'].forEach(key=>$(key).disabled=false);}
 }
 $('userAccountForm').addEventListener('submit',e=>{e.preventDefault();updateAccount({name:$('editUserName').value.trim(),phone:$('editUserPhone').value.trim(),role:$('editUserRole').value,scopeId:$('editUserScope').value.trim(),functions:[...$('editUserFunctions').querySelectorAll('input:checked')].map(el=>el.value)});});
 $('toggleUserAccount').addEventListener('click',()=>updateAccount({active:!(selectedUser.active&&selectedUser.employeeActive!==false)}));
 $('userAccountSchedule').addEventListener('click',()=>{
  const email=selectedUser.email;$('userAccountDialog').close();document.querySelector('[data-user-module-open="driverSchedulePanel"]').click();$('scheduleDriverEmail').value=email;resetSchedule();loadDriverSchedule();
  $('scheduleDriverEmail').focus({preventScroll:true});
 });
 $('resendUserAccount').addEventListener('click',async()=>{
  if(!selectedUser)return;
  if(selectedUser.demoOnly){const button=$('resendUserAccount');button.disabled=true;try{const issued=await request(`/api/admin/users/${encodeURIComponent(selectedUser.id)}/demo-password`,{method:'POST'});message('userAccountMsg',`New password for ${issued.email}: ${issued.password}. ${issued.message} Sign in at ${issued.loginUrl}`);}catch(e){message('userAccountMsg',e.message,true);}finally{button.disabled=false;}return;}
  if(!confirm(`Reissue temporary credentials and email ${selectedUser.email}?`))return;
  const button=$('resendUserAccount');button.disabled=true;
  try{const data=await request(`/api/admin/users/${encodeURIComponent(selectedUser.id)}/resend-credentials`,{method:'POST'});message('userAccountMsg',data.emailDeliveryStatus==='sent'?'Temporary login emailed. It expires in two hours.':data.warning||'Temporary login reissued; email delivery was unavailable.',data.emailDeliveryStatus!=='sent');}
  catch(e){message('userAccountMsg',e.message,true);}finally{button.disabled=false;}
 });
 $('userAccountHistory').addEventListener('click',async()=>{
  $('auditType').value='CREDENTIALS_REISSUED';$('auditSearch').value=selectedUser.email;$('auditDetails').open=true;$('userAccountDialog').close();window.focusDashboardSection?.('auditSection');await window.loadAudit?.();
 });
 const DAYS=['','Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
 function timeLabel(time){const [hour,minute]=String(time).slice(0,5).split(':').map(Number);return `${hour%12||12}:${String(minute).padStart(2,'0')} ${hour>=12?'PM':'AM'}`;}
 function renderDriverScheduleRows(rows=[]){
  const grouped=new Map();
  for(const row of rows){const key=[row.employee_id,row.start_time,row.end_time,row.effective_start_date,row.effective_end_date,row.active].join('|');if(!grouped.has(key))grouped.set(key,{...row,days:[],ids:[]});const group=grouped.get(key);group.days.push(Number(row.weekday_iso));group.ids.push(row.shift_id);}
  groups=[...grouped.values()];const date=today();
  $('driverScheduleRows').innerHTML=groups.map((g,index)=>{
   const expired=g.effective_end_date&&g.effective_end_date<date,future=g.effective_start_date>date;
   const label=!g.active?'Inactive':expired?'Ended':g.account_active===false?'Account inactive':future?'Upcoming':'Active';
   const days=[...new Set(g.days)].sort((a,b)=>a-b).map(day=>DAYS[day]).join(', ');
   return `<tr><td><strong class="userLine">${esc(g.display_name||g.email)}</strong><small class="userCode">${esc(g.user_code||g.employee_code||'')}</small></td><td><strong style="white-space:nowrap">${esc(timeLabel(g.start_time))}–${esc(timeLabel(g.end_time))}</strong><span class="userLine"><small>${esc(days)}</small></span></td><td><span style="white-space:nowrap">${esc(g.effective_start_date)}</span><span class="userLine"><small>${g.effective_end_date?`Through ${esc(g.effective_end_date)}`:'No end date'}</small></span></td><td><span class="pill ${label==='Active'?'green':label==='Upcoming'?'blue':'muted'}">${label}</span></td><td><div class="scheduleActions"><button class="button compact" type="button" data-edit-schedule="${index}">Edit</button><button class="button compact" type="button" data-toggle-schedule="${index}" ${expired?'disabled':''}>${g.active?'Deactivate':'Activate'}</button></div></td></tr>`;
  }).join('')||'<tr><td colspan="5">No schedules found. Select a driver and add weekly coverage.</td></tr>';
 }
 async function loadDriverSchedule({silent=false}={}){
  const version=++scheduleRequest,qs=new URLSearchParams({activeOnly:String(!$('showInactiveSchedules').checked),limit:'2000'});if($('scheduleDriverEmail').value)qs.set('driverEmail',$('scheduleDriverEmail').value);
  try{const data=await request(`/api/admin/driver-schedule?${qs}`);if(version!==scheduleRequest)return;renderDriverScheduleRows(data.schedules||[]);if(!silent)message('saveDriverScheduleMsg','');}
  catch(e){if(version===scheduleRequest)message('saveDriverScheduleMsg',e.message,true);}
 }
 function resetSchedule(){editingIds=[];$('scheduleStartTime').value='06:00';$('scheduleEndTime').value='15:00';$('scheduleEffectiveDate').value=today();$('scheduleEffectiveEndDate').value='';document.querySelectorAll('#scheduleWeekdayGroup input').forEach(el=>el.checked=Number(el.value)<=5);$('scheduleEditingLabel').textContent='Add a separate schedule for these days and hours. Each schedule controls availability independently.';$('saveDriverScheduleBtn').textContent='Save schedule';message('saveDriverScheduleMsg','');}
 function editSchedule(index){const g=groups[index];if(!g)return;editingIds=g.ids.slice();$('scheduleDriverEmail').value=g.email;$('scheduleStartTime').value=g.start_time.slice(0,5);$('scheduleEndTime').value=g.end_time.slice(0,5);$('scheduleEffectiveDate').value=g.effective_start_date;$('scheduleEffectiveEndDate').value=g.effective_end_date||'';document.querySelectorAll('#scheduleWeekdayGroup input').forEach(el=>el.checked=g.days.includes(Number(el.value)));$('scheduleEditingLabel').textContent=`Editing ${g.display_name}'s selected schedule. Changes apply to this schedule from its effective date.`;$('saveDriverScheduleBtn').textContent='Save schedule changes';$('scheduleDriverEmail').focus({preventScroll:true});$('scheduleDriverEmail').scrollIntoView({block:'center',behavior:'smooth'});}
 $('driverScheduleRows').addEventListener('click',async e=>{
  const edit=e.target.closest('[data-edit-schedule]');if(edit){editSchedule(Number(edit.dataset.editSchedule));return;}
  const toggle=e.target.closest('[data-toggle-schedule]');if(!toggle)return;const group=groups[Number(toggle.dataset.toggleSchedule)];toggle.disabled=true;
  try{await request('/api/admin/driver-schedule',{method:'PATCH',body:JSON.stringify({shiftIds:group.ids,active:!group.active})});await loadDriverSchedule({silent:true});message('saveDriverScheduleMsg',group.active?'Schedule deactivated. These shifts are no longer available in Nexus apps.':'Schedule activated. Coverage now follows these shifts.');}
  catch(error){message('saveDriverScheduleMsg',error.message,true);}finally{toggle.disabled=false;}
 });
 $('saveDriverScheduleBtn').addEventListener('click',async()=>{
  const button=$('saveDriverScheduleBtn');if(button.disabled)return;
  const payload={driverEmail:$('scheduleDriverEmail').value,startTime:$('scheduleStartTime').value,endTime:$('scheduleEndTime').value,effectiveStartDate:$('scheduleEffectiveDate').value,effectiveEndDate:$('scheduleEffectiveEndDate').value,weekdays:[...document.querySelectorAll('#scheduleWeekdayGroup input:checked')].map(el=>Number(el.value)),shiftIds:editingIds.slice()};
  if(!payload.driverEmail||!payload.weekdays.length||!payload.effectiveStartDate||payload.endTime<=payload.startTime){message('saveDriverScheduleMsg','Select a driver, weekdays, effective date and a shift ending later on the same day.',true);return;}
  button.disabled=true;button.textContent='Saving…';
  try{const data=await request('/api/admin/driver-schedule',{method:'POST',body:JSON.stringify(payload)});editingIds=(data.schedule?.created||[]).map(row=>row.id);await loadDriverSchedule({silent:true});message('saveDriverScheduleMsg','Schedule saved. All Nexus availability checks use this coverage.');}
  catch(e){message('saveDriverScheduleMsg',e.message,true);}finally{button.disabled=false;button.textContent=editingIds.length?'Save schedule changes':'Save schedule';}
 });
 $('scheduleDriverEmail').addEventListener('change',()=>{resetSchedule();loadDriverSchedule();});
 $('showInactiveSchedules').addEventListener('change',()=>loadDriverSchedule());$('newDriverScheduleBtn').addEventListener('click',resetSchedule);$('loadDriverScheduleBtn').addEventListener('click',()=>loadDriverSchedule());
 resetSchedule();window.NexusUserManager={loadUsers,loadDriverSchedule,renderDriverScheduleRows};
})();
