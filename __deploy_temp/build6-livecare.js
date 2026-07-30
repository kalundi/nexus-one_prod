(function(){
 const $=s=>document.querySelector(s), esc=s=>String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
 const order=['SUBMITTED','REVIEWING','CONFIRMED','DRIVER_ASSIGNED','EN_ROUTE','ARRIVED','PATIENT_ON_BOARD','COMPLETED'];
 const labels={SUBMITTED:'Submitted',REVIEWING:'Reviewing',CONFIRMED:'Confirmed',DRIVER_ASSIGNED:'Driver assigned',EN_ROUTE:'En route',ARRIVED:'Arrived',PATIENT_ON_BOARD:'Patient on board',COMPLETED:'Completed'};
 let verified={reference:'',phone:''}, preview=null;
 const navToggle=$('.mobileNavToggle');
 navToggle?.addEventListener('click',e=>{const nav=$('#livecareNav'),open=!nav.classList.contains('open');nav.classList.toggle('open',open);e.currentTarget.setAttribute('aria-expanded',String(open));e.currentTarget.setAttribute('aria-label',open?'Close navigation':'Open navigation')});
 $('#livecareNav')?.addEventListener('click',()=>{if(innerWidth<=950){$('#livecareNav').classList.remove('open');navToggle?.setAttribute('aria-expanded','false');navToggle?.setAttribute('aria-label','Open navigation')}});
 document.querySelectorAll('[data-open]').forEach(b=>b.addEventListener('click',()=>{document.querySelectorAll('.securePanel').forEach(x=>x.hidden=true);const panel=$('#'+b.dataset.open);panel.hidden=false;if(b.dataset.role){$('#expectedRole').value=b.dataset.role;$('#staffRoleLabel').textContent=b.dataset.role==='FACILITY'?'Facility administrator':b.dataset.role==='DRIVER'?'Driver access':'Dispatch access';$('#staffHelp').textContent=b.dataset.role==='FACILITY'?'Use the facility account number issued by Nexus.':'Use your individual Nexus username. Never use a shared account.'}panel.scrollIntoView({behavior:'smooth',block:'center'});panel.querySelector('input:not([type=hidden])')?.focus()}));
 document.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',()=>b.closest('.securePanel').hidden=true));
 const qp=new URLSearchParams(location.search); if(qp.get('reference')){$('#reference').value=qp.get('reference');$('#patientAccess').hidden=false}
 function render(data){const t=data.booking,h=data.history||[],msgs=data.messages||[];$('#liveCommand').hidden=false;$('#patientAccess').hidden=true;$('#tripRef').textContent=t.reference;$('#liveStatus').textContent=t.statusLabel||labels[t.status]||t.status;$('#tripSummary').innerHTML=`<span><small>Pickup</small><b>${esc(t.pickup)}</b></span><span><small>Destination</small><b>${esc(t.destination)}</b></span><span><small>Date and time</small><b>${esc(t.date)} at ${esc(t.time)}</b></span><span><small>Service</small><b>${esc(t.service)}</b></span><span><small>Driver</small><b>${esc(t.driverName||'Pending assignment')}</b></span><span><small>Vehicle</small><b>${esc(t.vehicleUnit||'Pending assignment')}</b></span>`;$('#mapTrip').textContent=`${t.pickup} → ${t.destination}`;const current=Math.max(0,order.indexOf(t.status));$('#liveTimeline').innerHTML=order.map((s,i)=>`<li class="${i<current?'done':i===current?'current':''}"><span class="node">${i<current?'✓':i+1}</span><span><strong>${labels[s]}</strong><small>${i<current?'Completed':i===current?'Current stage':'Pending'}</small></span></li>`).join('');$('#messages').innerHTML=msgs.length?msgs.map(m=>`<div class="message ${m.senderRole==='CLIENT'?'client':'dispatch'}"><strong>${esc(m.senderName)}</strong><p>${esc(m.message)}</p><small>${new Date(m.createdAt).toLocaleString()}</small></div>`).join(''):'<div class="notice">No messages yet.</div>';$('#liveCommand').scrollIntoView({behavior:'smooth',block:'start'})}
 async function request(url,options){let r;try{r=await fetch(url,options)}catch{throw Error('The secure server is not running. Start this project with npm start, then open the displayed local address.')}let j={};try{j=await r.json()}catch{}if(!r.ok)throw Error(j.error||`Request failed (${r.status}).`);return j}
 async function load(){render(await request(`/api/livecare/${encodeURIComponent(verified.reference)}?phone=${encodeURIComponent(verified.phone)}`,{cache:'no-store'}))}
 $('#patientVerify').addEventListener('submit',async e=>{e.preventDefault();$('#patientError').textContent='';verified={reference:$('#reference').value.trim().toUpperCase(),phone:$('#phone').value.trim()};try{await load();sessionStorage.setItem('nexusPatientRide',JSON.stringify(verified))}catch(err){$('#patientError').textContent=err.message}});
 $('#messageForm').addEventListener('submit',async e=>{e.preventDefault();try{await request(`/api/livecare/${encodeURIComponent(verified.reference)}?action=message`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({phone:verified.phone,message:$('#messageText').value.trim()})});$('#messageText').value='';await load()}catch(err){alert(err.message)}});
 $('#shareButton').addEventListener('click',async()=>{try{const j=await request(`/api/livecare/${encodeURIComponent(verified.reference)}?action=share`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({phone:verified.phone,hours:24})});const url=new URL(j.url,location.origin).href;await navigator.clipboard?.writeText(url);$('#shareResult').textContent='A 24-hour caregiver link was copied. Share only with an authorized person.'}catch(err){$('#shareResult').textContent=err.message}});
 $('#endPatientSession').addEventListener('click',()=>{verified={reference:'',phone:''};sessionStorage.removeItem('nexusPatientRide');$('#liveCommand').hidden=true;$('#patientAccess').hidden=false;$('#phone').value='';$('#patientAccess').scrollIntoView({behavior:'smooth'})});

 let fleetAnimationFrame=0, fleetVehicles=[];
 function fallbackFleet(){
  const defs=[
   ['NEX-01','EN_ROUTE','Wheelchair transport',14,26,0.035,0.018,58,'Approaching pickup zone','12 min operational ETA'],
   ['NEX-04','PATIENT_ON_BOARD','Stretcher transport',74,31,-0.028,0.022,84,'Transport corridor','8 min operational ETA'],
   ['NEX-07','DRIVER_ASSIGNED','Ambulatory transport',31,67,0.022,-0.025,34,'Assigned service zone','Preparing to move'],
   ['NEX-09','EN_ROUTE','Bariatric transport',58,73,0.03,-0.018,62,'Approaching pickup zone','16 min operational ETA'],
   ['NEX-12','ARRIVED','Wheelchair transport',82,57,-0.02,-0.02,71,'Pickup zone','Arrived'],
   ['NEX-14','AVAILABLE','Ready vehicle',18,81,0,0,0,'Available response zone','Ready for assignment'],
   ['NEX-18','AVAILABLE','Ready vehicle',49,79,0,0,0,'Available response zone','Ready for assignment'],
   ['NEX-22','REVIEWING','Medical transport',67,18,-0.018,0.026,18,'Operations review zone','Dispatch review']
  ];
  return defs.map((d,i)=>({unit:d[0],status:d[1],statusLabel:labels[d[1]]||d[1].replaceAll('_',' '),service:d[2],x:d[3],y:d[4],vx:d[5],vy:d[6],progress:d[7],routeLabel:d[8],eta:d[9],attention:d[1]==='REVIEWING',simulated:true,index:i}));
 }
 function animateFleet(){
  const layer=$('#fleetVehicleLayer');
  if(!layer||!fleetVehicles.length)return;
  fleetVehicles.forEach((v,i)=>{
   if(v.status!=='AVAILABLE'){
    v.x+=v.vx||((i%2?1:-1)*0.018); v.y+=v.vy||((i%3?1:-1)*0.012);
    if(v.x>90||v.x<8){v.vx=-(v.vx||0.02);v.x=Math.max(8,Math.min(90,v.x))}
    if(v.y>86||v.y<10){v.vy=-(v.vy||0.015);v.y=Math.max(10,Math.min(86,v.y))}
    v.progress=Math.min(99,(Number(v.progress)||0)+0.012);
   }
   const el=layer.querySelector(`[data-fleet-index="${i}"]`);
   if(el){el.style.setProperty('--x',`${v.x}%`);el.style.setProperty('--y',`${v.y}%`)}
  });
  fleetAnimationFrame=requestAnimationFrame(animateFleet);
 }
 function renderFleet(data,role,mode){
  const board=$('#liveRideBoard'),metrics=$('#liveRideMetrics'),scope=$('#rideBoardScope'),layer=$('#fleetVehicleLayer'),updated=$('#fleetUpdated');
  fleetVehicles=(data.vehicles||[]).map((v,i)=>({...v,vx:v.vx??((i%2?1:-1)*(0.014+(i%4)*0.004)),vy:v.vy??((i%3?1:-1)*(0.01+(i%3)*0.004))}));
  const vehicles=fleetVehicles;
  const moving=vehicles.filter(v=>['EN_ROUTE','ARRIVED','PATIENT_ON_BOARD','DRIVER_ASSIGNED'].includes(v.status)).length;
  const onboard=vehicles.filter(v=>v.status==='PATIENT_ON_BOARD').length;
  const available=vehicles.filter(v=>v.status==='AVAILABLE').length;
  const attention=vehicles.filter(v=>v.attention).length;
  metrics.innerHTML=`<span><small>Vehicles moving</small><strong>${moving}</strong></span><span><small>With patient</small><strong>${onboard}</strong></span><span><small>Available</small><strong>${available}</strong></span><span><small>Attention</small><strong>${attention}</strong></span>`;
  updated.textContent=`${mode==='fallback'?'Simulation active · ':''}Updated ${new Date(data.generatedAt||Date.now()).toLocaleTimeString([], {hour:'numeric',minute:'2-digit',second:'2-digit'})}`;
  layer.innerHTML=vehicles.length?vehicles.map((v,i)=>{
   const cls=v.attention?'attention':v.status==='PATIENT_ON_BOARD'?'onboard':v.status==='AVAILABLE'?'available':'moving';
   return `<button type="button" data-fleet-index="${i}" class="fleetVehicle ${cls}" style="--x:${Number(v.x)||20}%;--y:${Number(v.y)||30}%" aria-label="${esc(v.unit)} ${esc(v.statusLabel)}"><span class="vehiclePulseRing"></span><b>${esc(v.unit)}</b><small>${esc(v.statusLabel)}</small></button>`
  }).join(''):'<div class="rideBoardLoading">No vehicles are currently reporting movement.</div>';
  board.innerHTML=vehicles.length?vehicles.slice(0,8).map(v=>`<article class="movementRow"><div class="movementUnit"><span class="movementIcon ${v.attention?'attention':v.status==='PATIENT_ON_BOARD'?'onboard':v.status==='AVAILABLE'?'available':'moving'}">N</span><span><b>${esc(v.unit)}</b><small>${esc(v.service||'Nexus transport')}</small></span></div><div class="movementProgress"><span><i style="width:${Math.max(4,Math.min(100,Number(v.progress)||0))}%"></i></span><small>${esc(v.routeLabel||'Operational zone')} · ${Math.round(Number(v.progress)||0)}%</small></div><div class="movementState"><b>${esc(v.statusLabel)}</b><small>${esc(v.eta||'Monitoring')}</small></div></article>`).join(''):'<div class="rideBoardLoading">No active vehicle telemetry is available.</div>';
  scope.textContent=mode==='fallback'?'Interactive system-wide movement preview is active. Connect the Node server and vehicle GPS provider to replace simulated units with production telemetry.':role==='DISPATCHER'||role==='ADMIN'?'Dispatch view: system-wide fleet movement, assignments and operational exceptions.':role==='FACILITY'?'Facility view: vehicle movement connected only to your facility rides.':role==='DRIVER'?'Driver view: your assigned vehicle and route movement only.':'Privacy-safe public view: system movement is anonymized and exact patient locations are not displayed.';
  cancelAnimationFrame(fleetAnimationFrame);animateFleet();
 }
 async function loadRideBoard(){
  const board=$('#liveRideBoard'),metrics=$('#liveRideMetrics'),layer=$('#fleetVehicleLayer');
  if(!board||!metrics||!layer)return;
  layer.innerHTML='<div class="rideBoardLoading">Connecting to fleet telemetry…</div>';board.innerHTML='';
  try{
   const token=sessionStorage.getItem('nexusAccessToken');let data,role='PUBLIC';
   if(token){const me=await request('/api/auth/me',{headers:{authorization:`Bearer ${token}`},cache:'no-store'});role=me.user.role;data=await request('/api/fleet/live',{headers:{authorization:`Bearer ${token}`},cache:'no-store'});}else data=await request('/api/fleet/live',{cache:'no-store'});
   if(!(data.vehicles||[]).some(v=>['EN_ROUTE','ARRIVED','PATIENT_ON_BOARD','DRIVER_ASSIGNED'].includes(v.status))) throw Error('No active telemetry');
   renderFleet(data,role,'live');
  }catch(err){renderFleet({generatedAt:new Date().toISOString(),vehicles:fallbackFleet()},'PUBLIC','fallback')}
 }
 $('#refreshRideBoard')?.addEventListener('click',loadRideBoard);loadRideBoard();setInterval(loadRideBoard,30000);

 async function loadPreview(){try{preview=await request('/api/auth/preview-access',{cache:'no-store'});if(!preview.enabled)return;$('#previewAccess').hidden=false;$('#previewPassword').textContent=preview.password;document.querySelectorAll('[data-preview-role]').forEach(btn=>btn.addEventListener('click',()=>{const role=btn.dataset.previewRole;$('#expectedRole').value=role;$('#identifier').value=role==='FACILITY'?preview.accounts.facility:role==='DRIVER'?preview.accounts.driver:preview.accounts.dispatch;$('#password').value=preview.password;$('#staffRoleLabel').textContent=role==='FACILITY'?'Facility administrator':role==='DRIVER'?'Driver access':'Dispatch access';$('#staffError').textContent='Preview credentials filled. Select Sign in securely.';$('#staffSubmit').focus()}))}catch{/* Production or static-only preview: no demo credentials shown. */}}
 $('#staffLogin').addEventListener('submit',async e=>{e.preventDefault();const error=$('#staffError'),submit=$('#staffSubmit'),label=submit.querySelector('span');error.textContent='';submit.disabled=true;label.textContent='Signing in…';try{const expected=$('#expectedRole').value;const j=await request('/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:$('#identifier').value.trim(),password:$('#password').value})});if(expected&&j.user.role!==expected&&j.user.role!=='ADMIN'){await fetch('/api/auth/logout',{method:'POST',headers:{authorization:`Bearer ${j.token}`}});throw Error('This account does not have permission for the selected portal.')}sessionStorage.setItem('nexusAccessToken',j.token);sessionStorage.setItem('nexusUser',JSON.stringify(j.user));const routes={FACILITY:'/facility.html',DISPATCHER:'/dispatch.html',DRIVER:'/driver.html',ADMIN:'/dispatch.html'};location.assign(routes[j.user.role]||'/livecare.html')}catch(err){error.textContent=err.message}finally{submit.disabled=false;label.textContent='Sign in securely'}});
 const saved=sessionStorage.getItem('nexusPatientRide');if(saved){try{verified=JSON.parse(saved);load().catch(()=>sessionStorage.removeItem('nexusPatientRide'))}catch{}}
 loadPreview();
})();
