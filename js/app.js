(function(){
 const $=s=>document.querySelector(s), esc=s=>String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
 const order=['SUBMITTED','REVIEWING','CONFIRMED','DRIVER_ASSIGNED','EN_ROUTE','ARRIVED','PATIENT_ON_BOARD','COMPLETED'];
 const labels={SUBMITTED:'Submitted',REVIEWING:'Reviewing',CONFIRMED:'Confirmed',DRIVER_ASSIGNED:'Driver assigned',EN_ROUTE:'En route',ARRIVED:'Arrived',PATIENT_ON_BOARD:'Patient on board',COMPLETED:'Completed'};
 let verified={reference:'',phone:''}, preview=null;
 function isProductionHost(){
  const host=String(window.location.hostname||'').toLowerCase();
  return !(host==='localhost'||host==='127.0.0.1'||host==='0.0.0.0'||host.endsWith('.local'));
 }
 const navToggle=$('.mobileNavToggle');
 navToggle?.addEventListener('click',e=>{const nav=$('#livecareNav'),open=!nav.classList.contains('open');nav.classList.toggle('open',open);e.currentTarget.setAttribute('aria-expanded',String(open));e.currentTarget.setAttribute('aria-label',open?'Close navigation':'Open navigation')});
 $('#livecareNav')?.addEventListener('click',e=>{if(window.innerWidth<=950&&e.target&&e.target.closest('a')){$('#livecareNav').classList.remove('open');navToggle?.setAttribute('aria-expanded','false');navToggle?.setAttribute('aria-label','Open navigation')}});
 document.querySelectorAll('[data-open]').forEach(b=>b.addEventListener('click',()=>{document.querySelectorAll('.securePanel').forEach(x=>x.hidden=true);if(b.classList.contains('livecareRoleButton')){document.querySelectorAll('.livecareRoleButton').forEach(x=>x.classList.remove('selected'));b.classList.add('selected')}const panel=$('#'+b.dataset.open);panel.hidden=false;if(b.dataset.role){$('#expectedRole').value=b.dataset.role;$('#staffRoleLabel').textContent=b.dataset.role==='FACILITY'?'Facility administrator':b.dataset.role==='DRIVER'?'Driver access':'Dispatch access';$('#staffHelp').textContent=b.dataset.role==='FACILITY'?'Use the facility account number issued by Nexus.':'Use your individual Nexus username. Never use a shared account.'}panel.scrollIntoView({behavior:'smooth',block:'center'});panel.querySelector('input:not([type=hidden])')?.focus()}));
 document.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',()=>b.closest('.securePanel').hidden=true));
 const testPanel=$('#testPortalAccess');
 if(testPanel)testPanel.hidden=true;
 $('#livecareLogout')?.addEventListener('click',async()=>{const token=sessionStorage.getItem('nexusAccessToken');try{if(token)await fetch('/api/auth/logout',{method:'POST',headers:{authorization:`Bearer ${token}`}})}catch{}sessionStorage.removeItem('nexusAccessToken');sessionStorage.removeItem('nexusUser');sessionStorage.removeItem('nexusPatientRide');verified={reference:'',phone:''};location.assign('/livecare.html');});
 const qp=new URLSearchParams(location.search); if(qp.get('reference')){$('#reference').value=qp.get('reference');$('#patientAccess').hidden=false}
 function render(data){const t=data.booking,h=data.history||[],msgs=data.messages||[];$('#liveCommand').hidden=false; personalizeLivecare('PATIENT',t); const primaryVehicle={unit:t.vehicleUnit||'Your vehicle',status:t.status||'DRIVER_ASSIGNED',statusLabel:t.statusLabel||labels[t.status]||t.status,service:t.service||'Medical transportation',progress:Number(t.progress)||42,routeLabel:'Your authorized ride',eta:t.eta||'Live updates active',route:routeLibrary[0],driverName:t.driverName||''}; const networkContext=fallbackFleet().slice(0,4).map((v,i)=>({...v,unit:`NEX-N${i+1}`,service:v.service||'Network movement',routeLabel:'Regional network context'})); renderFleet({generatedAt:new Date().toISOString(),vehicles:[primaryVehicle,...networkContext]},'PATIENT','live');$('#patientAccess').hidden=true;$('#tripRef').textContent=t.reference;$('#liveStatus').textContent=t.statusLabel||labels[t.status]||t.status;$('#tripSummary').innerHTML=`<span><small>Pickup</small><b>${esc(t.pickup)}</b></span><span><small>Destination</small><b>${esc(t.destination)}</b></span><span><small>Date and time</small><b>${esc(t.date)} at ${esc(t.time)}</b></span><span><small>Service</small><b>${esc(t.service)}</b></span><span><small>Driver</small><b>${esc(t.driverName||'Pending assignment')}</b></span><span><small>Vehicle</small><b>${esc(t.vehicleUnit||'Pending assignment')}</b></span>`;$('#mapTrip').textContent=`${t.pickup} → ${t.destination}`;const current=Math.max(0,order.indexOf(t.status));$('#liveTimeline').innerHTML=order.map((s,i)=>`<li class="${i<current?'done':i===current?'current':''}"><span class="node">${i<current?'✓':i+1}</span><span><strong>${labels[s]}</strong><small>${i<current?'Completed':i===current?'Current stage':'Pending'}</small></span></li>`).join('');$('#messages').innerHTML=msgs.length?msgs.map(m=>`<div class="message ${m.senderRole==='CLIENT'?'client':'dispatch'}"><strong>${esc(m.senderName)}</strong><p>${esc(m.message)}</p><small>${new Date(m.createdAt).toLocaleString()}</small></div>`).join(''):'<div class="notice">No messages yet.</div>';$('#liveCommand').scrollIntoView({behavior:'smooth',block:'start'})}
 async function request(url,options){let r;try{r=await fetch(url,options)}catch{throw Error('The secure server is not running. Start this project with npm start, then open the displayed local address.')}let j={};try{j=await r.json()}catch{}if(!r.ok)throw Error(j.error||`Request failed (${r.status}).`);return j}
 async function load(){render(await request(`/api/livecare/${encodeURIComponent(verified.reference)}?phone=${encodeURIComponent(verified.phone)}`,{cache:'no-store'}))}
 $('#patientVerify').addEventListener('submit',async e=>{e.preventDefault();$('#patientError').textContent='';verified={reference:$('#reference').value.trim().toUpperCase(),phone:$('#phone').value.trim()};try{await load();forceShowAccessGateway=false;sessionStorage.setItem('nexusPatientRide',JSON.stringify(verified))}catch(err){$('#patientError').textContent=err.message}});
 $('#messageForm').addEventListener('submit',async e=>{e.preventDefault();try{await request(`/api/livecare/${encodeURIComponent(verified.reference)}?action=message`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({phone:verified.phone,message:$('#messageText').value.trim()})});$('#messageText').value='';await load()}catch(err){alert(err.message)}});
 $('#shareButton').addEventListener('click',async()=>{try{const j=await request(`/api/livecare/${encodeURIComponent(verified.reference)}?action=share`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({phone:verified.phone,hours:24})});const url=new URL(j.url,location.origin).href;await navigator.clipboard?.writeText(url);$('#shareResult').textContent='A 24-hour caregiver link was copied. Share only with an authorized person.'}catch(err){$('#shareResult').textContent=err.message}});
 $('#endPatientSession').addEventListener('click',()=>{verified={reference:'',phone:''};sessionStorage.removeItem('nexusPatientRide');$('#liveCommand').hidden=true;$('#patientAccess').hidden=false;$('#phone').value='';focusedVehicleUnit=null;forceShowAccessGateway=true;personalizeLivecare('PUBLIC');$('#patientAccess').scrollIntoView({behavior:'smooth'})});

 let fleetAnimationFrame=0, fleetVehicles=[], allFleetVehicles=[], fleetMap=null, fleetMarkers=[], activeStatusFilter=null, activeServiceFilter="ALL";
 let forceShowAccessGateway=false;
 let lastWorkspaceRevealRole='';
 function shouldUseMapFocusMode(role){
  return role==='PATIENT'||role==='DRIVER';
 }
 function shouldAutoRevealWorkspace(role){
  return role==='DISPATCHER'||role==='ADMIN';
 }
 function revealWorkspaceForRole(role){
  if(lastWorkspaceRevealRole===role) return;
  const target=role==='FACILITY' ? $('#facilityWorkspace') : $('#roleWorkspace');
  if(!target||target.hidden) return;
  target.scrollIntoView({behavior:'smooth',block:'start'});
  lastWorkspaceRevealRole=role;
 }
 function syncLivecareFocusMode(roleOverride){
  const role=(roleOverride||livecareRole||'PUBLIC');
  const shouldFocus=shouldUseMapFocusMode(role)&&!forceShowAccessGateway;
  document.body.classList.toggle('livecare-focus-mode',shouldFocus);
 }
 function openAccessGatewayForSwitch(){
  const gateway=$('#accessTitle')?.closest('.accessGateway');
  forceShowAccessGateway=true;
  if(gateway)gateway.hidden=false;
  document.querySelectorAll('.securePanel').forEach((panel)=>{panel.hidden=true;});
  const accessLabel=$('#currentAccessLabel');
  if(accessLabel)accessLabel.textContent='Choose your user type';
  syncLivecareFocusMode();
  gateway?.scrollIntoView({behavior:'smooth',block:'start'});
 }
 $('#switchLivecareUser')?.addEventListener('click',openAccessGatewayForSwitch);
 $('#heroSwitchUser')?.addEventListener('click',openAccessGatewayForSwitch);
 $('#accessBackToMap')?.addEventListener('click',()=>{const gateway=$('#accessTitle')?.closest('.accessGateway');forceShowAccessGateway=false;if(gateway)gateway.hidden=true;syncLivecareFocusMode();window.scrollTo({top:0,behavior:'smooth'});});
 let livecareRole='PUBLIC', focusedVehicleUnit=null, pinnedVehicleUnit=null;
 const routeLibrary=[
  [[39.1732,-77.2717],[39.1528,-77.2336],[39.1192,-77.1989],[39.0840,-77.1528],[39.0468,-77.1195]],
  [[39.0005,-77.0259],[38.9812,-77.0374],[38.9567,-77.0325],[38.9312,-77.0369],[38.9072,-77.0369]],
  [[39.0376,-77.0553],[39.0139,-77.0297],[38.9909,-77.0261],[38.9670,-77.0066],[38.9477,-76.9897]],
  [[38.9786,-76.8644],[38.9634,-76.9040],[38.9438,-76.9451],[38.9219,-76.9821],[38.9007,-77.0154]],
  [[39.1404,-77.2014],[39.1120,-77.1814],[39.0869,-77.1513],[39.0611,-77.1117],[39.0404,-77.0540]],
  [[39.0068,-77.1010],[38.9896,-77.0886],[38.9678,-77.0790],[38.9446,-77.0628],[38.9210,-77.0450]],
  [[39.1148,-77.5636],[39.1097,-77.4794],[39.1001,-77.3899],[39.0922,-77.2990],[39.0837,-77.2161]],
  [[38.9393,-76.9178],[38.9266,-76.9565],[38.9119,-76.9954],[38.8977,-77.0208],[38.8847,-77.0324]]
 ];
 function fallbackFleet(){
  const defs=[
   ['NEX-01','EN_ROUTE','Wheelchair transport',18,'Germantown to Rockville','12 min operational ETA'],
   ['NEX-04','PATIENT_ON_BOARD','Stretcher transport',46,'Silver Spring to Washington','8 min operational ETA'],
   ['NEX-07','DRIVER_ASSIGNED','Ambulatory transport',8,'Bethesda response route','Preparing to move'],
   ['NEX-09','EN_ROUTE','Bariatric transport',62,'Lanham to Washington','16 min operational ETA'],
   ['NEX-12','ARRIVED','Wheelchair transport',92,'Rockville pickup zone','Arrived'],
   ['NEX-14','AVAILABLE','Ready vehicle',0,'Gaithersburg response zone','Ready for assignment'],
   ['NEX-18','AVAILABLE','Ready vehicle',0,'Bethesda response zone','Ready for assignment'],
   ['NEX-22','REVIEWING','Medical transport',24,'Prince George’s review zone','Dispatch review']
  ];
  return defs.map((d,i)=>({unit:d[0],status:d[1],statusLabel:labels[d[1]]||d[1].replaceAll('_',' '),service:d[2],progress:d[3],routeLabel:d[4],eta:d[5],attention:d[1]==='REVIEWING',simulated:true,index:i,route:routeLibrary[i%routeLibrary.length]}));
 }
 function getActiveUser(){
  try{return JSON.parse(sessionStorage.getItem('nexusUser')||'null')}catch{return null}
 }
 function selectFocusedVehicle(role,vehicles){
  if(!Array.isArray(vehicles)||!vehicles.length)return null;
  if(role==='PUBLIC')return null;
  if(role==='PATIENT')return vehicles[0]?.unit||null;
  const user=getActiveUser();
  const byUnit=[user?.vehicleUnit,user?.vehicle_unit,user?.unitNumber,user?.assignedVehicle].map(v=>String(v||'').toUpperCase()).filter(Boolean);
  const unitMatch=vehicles.find(v=>byUnit.includes(String(v.unit||'').toUpperCase()));
  if(unitMatch)return unitMatch.unit;
  const byDriver=[user?.displayName,user?.name,user?.email].map(v=>String(v||'').toUpperCase()).filter(Boolean);
  const driverMatch=vehicles.find(v=>byDriver.some(s=>String(v.driverName||v.driver||'').toUpperCase().includes(s)));
  if(driverMatch)return driverMatch.unit;
  if(role==='DRIVER'){
   const moving=vehicles.find(v=>['EN_ROUTE','ARRIVED','PATIENT_ON_BOARD','DRIVER_ASSIGNED'].includes(v.status));
   if(moving)return moving.unit;
  }
  return vehicles[0].unit;
 }
 function statusClass(v){return v.attention?'attention':v.status==='PATIENT_ON_BOARD'?'onboard':v.status==='AVAILABLE'?'available':'moving'}
 function interpolateRoute(route,pct){
  if(!route?.length)return [39.03,-77.05];
  if(route.length===1)return route[0];
  const scaled=Math.max(0,Math.min(99.999,pct))/100*(route.length-1), idx=Math.floor(scaled), frac=scaled-idx;
  const a=route[idx],b=route[Math.min(idx+1,route.length-1)];
  return [a[0]+(b[0]-a[0])*frac,a[1]+(b[1]-a[1])*frac];
 }
 function nativeMap(el){
  const map={el,zoom:10,center:[39.02,-77.03],drag:null,tiles:null,routes:null,markers:null,popup:null};
  el.innerHTML='<div class="nativeMapTiles"></div><svg class="nativeMapRoutes" aria-hidden="true"></svg><div class="nativeMapMarkers"></div><div class="nativeMapPopup" hidden></div><div class="nativeMapControls"><button type="button" data-map-zoom="in" aria-label="Zoom in">+</button><button type="button" data-map-zoom="out" aria-label="Zoom out">−</button><button type="button" data-map-fit aria-label="Show all vehicles">⌖</button></div><div class="nativeMapAttribution">© OpenStreetMap contributors</div>';
  map.tiles=el.querySelector('.nativeMapTiles');map.routes=el.querySelector('.nativeMapRoutes');map.markers=el.querySelector('.nativeMapMarkers');map.popup=el.querySelector('.nativeMapPopup');
  const world=(lat,lng,z)=>{const n=256*Math.pow(2,z),x=(lng+180)/360*n,s=Math.sin(lat*Math.PI/180),y=(.5-Math.log((1+s)/(1-s))/(4*Math.PI))*n;return[x,y]};
  map.project=(lat,lng)=>{const c=world(map.center[0],map.center[1],map.zoom),p=world(lat,lng,map.zoom),r=el.getBoundingClientRect();return[p[0]-c[0]+r.width/2,p[1]-c[1]+r.height/2]};
  map.renderTiles=()=>{const r=el.getBoundingClientRect(),c=world(map.center[0],map.center[1],map.zoom),minX=Math.floor((c[0]-r.width/2)/256),maxX=Math.floor((c[0]+r.width/2)/256),minY=Math.floor((c[1]-r.height/2)/256),maxY=Math.floor((c[1]+r.height/2)/256),count=Math.pow(2,map.zoom);map.tiles.innerHTML='';for(let x=minX;x<=maxX;x++)for(let y=minY;y<=maxY;y++){if(y<0||y>=count)continue;const img=document.createElement('img');img.alt='';img.draggable=false;img.loading='eager';img.src=`https://tile.openstreetmap.org/${map.zoom}/${((x%count)+count)%count}/${y}.png`;img.style.left=`${x*256-(c[0]-r.width/2)}px`;img.style.top=`${y*256-(c[1]-r.height/2)}px`;img.addEventListener('error',()=>img.remove());map.tiles.appendChild(img)}};
  map.renderOverlays=()=>{const r=el.getBoundingClientRect();map.routes.setAttribute('viewBox',`0 0 ${r.width} ${r.height}`);map.routes.innerHTML=fleetVehicles.map(v=>{const pts=(v.route||[]).map(p=>map.project(p[0],p[1]).join(',')).join(' ');return `<polyline points="${pts}" class="nativeRoute ${statusClass(v)}"/>`}).join('');fleetMarkers.forEach((m,i)=>{const v=fleetVehicles[i],p=interpolateRoute(v.route,v.progress),xy=map.project(p[0],p[1]);m.style.transform=`translate(${xy[0]}px,${xy[1]}px) translate(-50%,-50%)`;m.hidden=xy[0]<-60||xy[1]<-60||xy[0]>r.width+60||xy[1]>r.height+60})};
  map.render=()=>{map.renderTiles();map.renderOverlays()};
  map.setView=(center,zoom=map.zoom)=>{map.center=center;map.zoom=Math.max(8,Math.min(15,zoom));map.render()};
  map.fit=()=>{if(!fleetVehicles.length)return;const pts=fleetVehicles.flatMap(v=>v.route||[]),lats=pts.map(p=>p[0]),lngs=pts.map(p=>p[1]);map.center=[(Math.min(...lats)+Math.max(...lats))/2,(Math.min(...lngs)+Math.max(...lngs))/2];map.zoom=10;map.render()};
  el.querySelector('[data-map-zoom="in"]').addEventListener('click',()=>map.setView(map.center,map.zoom+1));el.querySelector('[data-map-zoom="out"]').addEventListener('click',()=>map.setView(map.center,map.zoom-1));el.querySelector('[data-map-fit]').addEventListener('click',map.fit);
  el.addEventListener('wheel',e=>{e.preventDefault();map.setView(map.center,map.zoom+(e.deltaY<0?1:-1))},{passive:false});
  el.addEventListener('pointerdown',e=>{if(e.target.closest('button'))return;el.setPointerCapture(e.pointerId);map.drag={x:e.clientX,y:e.clientY,c:[...map.center]}});el.addEventListener('pointermove',e=>{if(!map.drag)return;const c=world(map.drag.c[0],map.drag.c[1],map.zoom),dx=e.clientX-map.drag.x,dy=e.clientY-map.drag.y,n=256*Math.pow(2,map.zoom),wx=c[0]-dx,wy=c[1]-dy,lng=wx/n*360-180,lat=Math.atan(Math.sinh(Math.PI*(1-2*wy/n)))*180/Math.PI;map.center=[lat,lng];map.render()});el.addEventListener('pointerup',()=>map.drag=null);el.addEventListener('pointercancel',()=>map.drag=null);window.addEventListener('resize',()=>map.render());map.render();return map;
 }
 function ensureFleetMap(){const el=$('#fleetMap');if(!el)return false;if(!fleetMap)fleetMap=nativeMap(el);return true}
 function clearFleetMap(){fleetMarkers=[];if(fleetMap){fleetMap.markers.innerHTML='';fleetMap.routes.innerHTML='';fleetMap.popup.hidden=true}}
 function showVehicle(index){const v=fleetVehicles[index],m=fleetMarkers[index];if(!v||!m||!fleetMap)return;const pos=interpolateRoute(v.route,v.progress);fleetMap.setView(pos,13);fleetMap.popup.innerHTML=`<strong>${esc(v.unit)}</strong><span>${esc(v.service||'Nexus transport')}</span><b>${esc(v.statusLabel)}</b><small>${esc(v.routeLabel||'Operational route')} · ${Math.round(v.progress)}%</small><small>${esc(v.eta||'Monitoring')}</small>`;fleetMap.popup.hidden=false;fleetMap.popup.style.left='50%';fleetMap.popup.style.top='38%'}
 function syncPinnedPopup(){
  if(!fleetMap||!pinnedVehicleUnit)return;
  const idx=fleetVehicles.findIndex(v=>v.unit===pinnedVehicleUnit);
  if(idx<0){fleetMap.popup.hidden=true;return;}
  const v=fleetVehicles[idx];
  fleetMap.popup.innerHTML=`<strong>${esc(v.unit)}</strong><span>${esc(v.service||'Nexus transport')}</span><b>${esc(v.statusLabel)}</b><small>${esc(v.routeLabel||'Operational route')} · ${Math.round(v.progress)}%</small><small>${esc(v.eta||'Monitoring')}</small>`;
  fleetMap.popup.hidden=false;
 }
 function animateFleetMap(){if(!fleetMap||!fleetVehicles.length)return;fleetVehicles.forEach((v,i)=>{if(!['AVAILABLE','ARRIVED'].includes(v.status)){v.progress=(Number(v.progress)||0)+0.035;if(v.progress>=100)v.progress=1}const m=fleetMarkers[i];if(m){const pos=interpolateRoute(v.route,v.progress),xy=fleetMap.project(pos[0],pos[1]);m.style.transform=`translate(${xy[0]}px,${xy[1]}px) translate(-50%,-50%)`}});syncPinnedPopup();fleetAnimationFrame=requestAnimationFrame(animateFleetMap)}
 function personalizeLivecare(role,trip){
  const audience=$('#livecareAudience'),headline=$('#livecareHeadline'),intro=$('#livecareIntro'),gateway=document.querySelector('.accessGateway');
  const user=(()=>{try{return JSON.parse(sessionStorage.getItem('nexusUser')||'null')}catch{return null}})();
  const copy={
   PUBLIC:['Livecare 2.0','Know where your ride stands.','Sign in or verify a ride to see only the transportation information authorized for you.'],
   PATIENT:['Your live ride','Your ride, clearly in view.',`Tracking ${trip?.reference||'your verified ride'} with privacy-aware vehicle and arrival updates.`],
   FACILITY:['Facility Livecare',`${user?.displayName||user?.name||'Your facility'} transportation view.`, 'Only rides connected to your organization are shown on this map.'],
   DRIVER:['Driver Livecare','Your assigned route is in view.','The map shows your assigned vehicle and active transportation work only.'],
   DISPATCHER:['Dispatch Livecare','Coordinate the moving fleet.','System-wide operational movement and exceptions are displayed without an expanding vehicle list.'],
   ADMIN:['Operations Livecare','System-wide transportation movement.','Authorized operational movement is consolidated into one live map.']
  }[role]||null;
  if(copy){audience.textContent=copy[0];headline.textContent=copy[1];intro.textContent=copy[2]} document.querySelector('.livecareExperience')?.setAttribute('data-role',role);
  livecareRole=role;
  if(gateway)gateway.hidden=!forceShowAccessGateway&&role!=='PUBLIC';
  const accessLabel=$('#currentAccessLabel'),logout=$('#livecareLogout');
  if(accessLabel)accessLabel.textContent=role==='PUBLIC'?'Choose your user type':`${copy?.[0]||role} active`;
  if(logout)logout.hidden=role==='PUBLIC';
  const focusEl=$('#fleetUserFocus');
  if(focusEl)focusEl.textContent=role==='PUBLIC'?'Public network overview':'User-focused live operations';
  syncLivecareFocusMode(role);
}
function serviceMatches(vehicle,filter){
  if(filter==='ALL')return true;
  const text=`${vehicle.service||''} ${vehicle.routeLabel||''}`.toUpperCase();
  if(filter==='AMBULANCE')return text.includes('AMBULANCE')||text.includes('BLS')||text.includes('ALS');
  if(filter==='WHEELCHAIR')return text.includes('WHEELCHAIR');
  if(filter==='AMBULATORY')return text.includes('AMBULATORY');
  if(filter==='STRETCHER')return text.includes('STRETCHER');
  if(filter==='BARIATRIC')return text.includes('BARIATRIC');
  if(filter==='HOSPITAL')return text.includes('HOSPITAL')||text.includes('DISCHARGE');
  if(filter==='FACILITY_TRANSFER')return text.includes('FACILITY')&&text.includes('TRANSFER');
  return true;
}

function normalizeServiceFilter(value){
  const raw=String(value||'').trim().toLowerCase();
  if(!raw||raw==='all')return 'ALL';
  if(raw==='ambulance')return 'AMBULANCE';
  if(raw==='wheelchair')return 'WHEELCHAIR';
  if(raw==='ambulatory')return 'AMBULATORY';
  if(raw==='stretcher')return 'STRETCHER';
  if(raw==='bariatric')return 'BARIATRIC';
  if(raw==='hospital-discharge'||raw==='hospital')return 'HOSPITAL';
  if(raw==='facility-transfer')return 'FACILITY_TRANSFER';
  return String(value||'ALL').toUpperCase().replaceAll('-','_');
}

function syncServicePillState(){
  const serviceButtons=Array.from(document.querySelectorAll('[data-service-filter],[data-service]'));
  serviceButtons.forEach((btn)=>{
    const token=normalizeServiceFilter(btn.dataset.serviceFilter||btn.dataset.service||'ALL');
    const on=token===activeServiceFilter;
    btn.classList.toggle('active',on);
    btn.setAttribute('aria-pressed',String(on));
  });
}

function bindServiceMarqueeRail(){
  const wraps=Array.from(document.querySelectorAll('.service-marquee-wrap'));
  wraps.forEach((wrap)=>{
    if(wrap.dataset.dragBound==='1') return;
    wrap.dataset.dragBound='1';
    let dragging=false;
    let moved=false;
    let startX=0;
    let startScrollLeft=0;

    wrap.addEventListener('pointerdown',(event)=>{
      dragging=true;
      moved=false;
      startX=event.clientX;
      startScrollLeft=wrap.scrollLeft;
      wrap.classList.add('is-dragging');
      wrap.setPointerCapture?.(event.pointerId);
    });

    wrap.addEventListener('pointermove',(event)=>{
      if(!dragging) return;
      const delta=event.clientX-startX;
      if(Math.abs(delta)>4) moved=true;
      wrap.scrollLeft=startScrollLeft-delta;
      event.preventDefault();
    });

    const stopDrag=(event)=>{
      if(!dragging) return;
      dragging=false;
      wrap.classList.remove('is-dragging');
      wrap.releasePointerCapture?.(event.pointerId);
    };

    wrap.addEventListener('pointerup',stopDrag);
    wrap.addEventListener('pointercancel',stopDrag);
    wrap.addEventListener('pointerleave',(event)=>{if(dragging) stopDrag(event);});

    wrap.addEventListener('click',(event)=>{
      if(!moved) return;
      event.preventDefault();
      event.stopPropagation();
      moved=false;
    },true);

    wrap.addEventListener('wheel',(event)=>{
      if(Math.abs(event.deltaY)<=Math.abs(event.deltaX)) return;
      wrap.scrollLeft+=event.deltaY;
      event.preventDefault();
    },{passive:false});
  });
}
function statusMatches(vehicle,filter){
  if(!filter)return true;
  if(filter==='MOVING')return ['EN_ROUTE','ARRIVED','PATIENT_ON_BOARD','DRIVER_ASSIGNED'].includes(vehicle.status);
  if(filter==='ATTENTION')return Boolean(vehicle.attention);
  return vehicle.status===filter;
}
function drawFilteredFleet(){
  fleetVehicles=allFleetVehicles.filter(v=>serviceMatches(v,activeServiceFilter)&&statusMatches(v,activeStatusFilter));
  const focusedFromAll=focusedVehicleUnit?allFleetVehicles.find(v=>v.unit===focusedVehicleUnit):null;
  if(focusedFromAll&&!fleetVehicles.some(v=>v.unit===focusedVehicleUnit))fleetVehicles=[focusedFromAll,...fleetVehicles];
  if(!ensureFleetMap())return;
  clearFleetMap();
  fleetVehicles.forEach((v,i)=>{const isFocused=focusedVehicleUnit&&v.unit===focusedVehicleUnit,isDimmed=Boolean(focusedVehicleUnit&&!isFocused);const b=document.createElement('button');b.type='button';b.className=`nativeVehicleMarker ${statusClass(v)} ${isFocused?'focused':''} ${isDimmed?'dimmed':''}`.trim();b.innerHTML=`<span>N</span><b>${esc((v.unit||'N').replace('NEX-',''))}</b>`;b.setAttribute('aria-label',`${v.unit} ${v.statusLabel}`);b.addEventListener('click',()=>{pinnedVehicleUnit=v.unit;showVehicle(i)});fleetMap.markers.appendChild(b);fleetMarkers.push(b)});
  if(fleetVehicles.length)fleetMap.fit(); else {fleetMap.routes.innerHTML='';fleetMap.popup.hidden=true;}
  if(focusedVehicleUnit){
   pinnedVehicleUnit=focusedVehicleUnit;
   const focusedIndex=fleetVehicles.findIndex(v=>v.unit===focusedVehicleUnit);
   if(focusedIndex>=0)showVehicle(focusedIndex);
  }else pinnedVehicleUnit=null;
  syncPinnedPopup();
  const statusText=activeStatusFilter?document.querySelector(`[data-status-filter="${activeStatusFilter}"] small`)?.textContent:'all statuses';
  const serviceText=document.querySelector('[data-service-filter].active,[data-service].active')?.textContent||'all services';
  const mapStatus=$('#fleetMapStatus');if(mapStatus)mapStatus.textContent=`${fleetVehicles.length} vehicle${fleetVehicles.length===1?'':'s'} · ${serviceText} · ${statusText}`;
  const focusEl=$('#fleetUserFocus');
  if(focusEl){
   if(focusedVehicleUnit)focusEl.textContent=`Focused vehicle ${focusedVehicleUnit} · broader network remains visible`;
   else focusEl.textContent=livecareRole==='PUBLIC'?'Public network overview':'User-focused live operations';
  }
  cancelAnimationFrame(fleetAnimationFrame);animateFleetMap();
}
function bindFleetFilters(){
  document.querySelectorAll('[data-status-filter]').forEach(btn=>{if(btn.dataset.bound)return;btn.dataset.bound='1';btn.addEventListener('click',()=>{const next=btn.dataset.statusFilter;activeStatusFilter=activeStatusFilter===next?null:next;document.querySelectorAll('[data-status-filter]').forEach(x=>{const on=x.dataset.statusFilter===activeStatusFilter;x.classList.toggle('active',on);x.setAttribute('aria-pressed',String(on))});drawFilteredFleet()})});
  const serviceButtons=Array.from(document.querySelectorAll('[data-service-filter],[data-service]'));
  serviceButtons.forEach((btn)=>{
    if(btn.dataset.bound)return;
    btn.dataset.bound='1';
    btn.addEventListener('click',()=>{
      activeServiceFilter=normalizeServiceFilter(btn.dataset.serviceFilter||btn.dataset.service||'ALL');
      syncServicePillState();
      drawFilteredFleet();
    });
  });
  syncServicePillState();
  bindServiceMarqueeRail();
}

window.filterVehiclesByService=function(service){
  activeServiceFilter=normalizeServiceFilter(service);
  syncServicePillState();
  drawFilteredFleet();
};
function renderFleet(data,role,mode){
  personalizeLivecare(role);
  const board=$('#liveRideBoard'),metrics=$('#liveRideMetrics'),scope=$('#rideBoardScope'),updated=$('#fleetUpdated'),mapStatus=$('#fleetMapStatus');
  allFleetVehicles=(data.vehicles||[]).map((v,i)=>({...v,route:Array.isArray(v.route)&&v.route.length?v.route:routeLibrary[i%routeLibrary.length],progress:Number(v.progress)||0}));
  focusedVehicleUnit=selectFocusedVehicle(role,allFleetVehicles);
  fleetVehicles=[...allFleetVehicles];
  const vehicles=allFleetVehicles,moving=vehicles.filter(v=>['EN_ROUTE','ARRIVED','PATIENT_ON_BOARD','DRIVER_ASSIGNED'].includes(v.status)).length,onboard=vehicles.filter(v=>v.status==='PATIENT_ON_BOARD').length,available=vehicles.filter(v=>v.status==='AVAILABLE').length,attention=vehicles.filter(v=>v.attention).length;
  metrics.innerHTML=`<button type="button" data-status-filter="MOVING" aria-pressed="false"><small>Moving</small><strong>${moving}</strong></button><button type="button" data-status-filter="PATIENT_ON_BOARD" aria-pressed="false"><small>With patient</small><strong>${onboard}</strong></button><button type="button" data-status-filter="AVAILABLE" aria-pressed="false"><small>Available</small><strong>${available}</strong></button><button type="button" data-status-filter="ATTENTION" aria-pressed="false"><small>Attention</small><strong>${attention}</strong></button>`; bindFleetFilters();
  updated.textContent=`Updated ${new Date(data.generatedAt||Date.now()).toLocaleTimeString([], {hour:'numeric',minute:'2-digit',second:'2-digit'})}`;mapStatus.textContent=mode==='fallback'?'Moving fleet preview · native map':'Live fleet telemetry connected';
  drawFilteredFleet();
  if(board){
   board.hidden=true;
   board.innerHTML='';
  }
  if(scope) scope.textContent=mode==='fallback'?'The moving map is running without any map-library package. Connect production GPS telemetry to replace preview coordinates with actual fleet locations.':role==='DISPATCHER'||role==='ADMIN'?'Dispatch view: system-wide fleet movement, assignments and operational exceptions.':role==='FACILITY'?'Facility view: vehicle movement connected only to your facility rides.':role==='DRIVER'?'Driver view: your assigned vehicle and route movement only.':'Privacy-safe public view: vehicle movement is anonymized and exact patient locations are not displayed.';
 }

 function rideStatusClass(status){return status==='COMPLETED'?'green':status==='CANCELLED'?'red':status==='REVIEWING'?'amber':'blue'}
 function facilityRow(trip,history=false){
  const patient=esc(trip.patientName||'Patient');
  const route=`<span class="facilityRoute"><b>${esc(trip.pickup||'Pickup pending')}</b><i aria-hidden="true">→</i><b>${esc(trip.destination||'Destination pending')}</b></span>`;
  if(history)return `<tr><td><strong>${patient}</strong><small>${esc(trip.patientPhone||'')}</small></td><td><b>${esc(trip.reference||'—')}</b></td><td>${esc(trip.service||'Medical transportation')}</td><td>${esc(trip.pickup||'—')}</td><td>${esc(trip.destination||'—')}</td><td>${esc(trip.date||'—')}<small>${esc(trip.time||'')}</small></td><td><span class="status ${rideStatusClass(trip.status)}">${esc(trip.statusLabel||trip.status||'Pending')}</span></td></tr>`;
  return `<tr><td><strong>${patient}</strong><small>${esc(trip.patientPhone||'')}</small></td><td><b>${esc(trip.reference||'—')}</b><small>${esc(trip.service||'')}</small></td><td>${route}</td><td>${esc(trip.date||'—')}<small>${esc(trip.time||'')}</small></td><td><span class="status ${rideStatusClass(trip.status)}">${esc(trip.statusLabel||trip.status||'Pending')}</span></td><td>${esc(trip.vehicleUnit||'Pending')}<small>${esc(trip.driverName||'Unassigned')}</small></td></tr>`;
 }
 function renderFacilityWorkspace(trips,user){
  const workspace=$('#facilityWorkspace'); if(!workspace)return; workspace.hidden=false;
  const now=new Date(), today=now.toISOString().slice(0,10);
  const active=trips.filter(t=>!['COMPLETED','CANCELLED'].includes(t.status));
  const completed=trips.filter(t=>t.status==='COMPLETED');
  const todayTrips=trips.filter(t=>t.date===today);
  const attention=active.filter(t=>['REVIEWING','SUBMITTED'].includes(t.status)||!t.vehicleUnit);
  $('#facilityWorkspaceTitle').textContent=`${user?.displayName||'Facility'} transportation operations`;
  $('#facilityKpis').innerHTML=`<article><small>Today’s rides</small><strong>${todayTrips.length}</strong><span>${active.length} active or upcoming</span></article><article><small>Patients served</small><strong>${new Set(trips.map(t=>t.patientName).filter(Boolean)).size}</strong><span>Within available history</span></article><article><small>Completed rides</small><strong>${completed.length}</strong><span>${trips.length?Math.round(completed.length/trips.length*100):0}% of recorded rides</span></article><article><small>Needs attention</small><strong>${attention.length}</strong><span>${attention.length?'Review assignments':'No immediate exceptions'}</span></article>`;
  $('#facilityActiveCount').textContent=`${active.length} ride${active.length===1?'':'s'}`;
  $('#facilityActiveRides').innerHTML=active.length?active.slice(0,25).map(t=>facilityRow(t)).join(''):'<tr><td colspan="6" class="facilityEmpty">No active or upcoming rides are currently assigned to this facility.</td></tr>';
  $('#facilityAttentionList').innerHTML=attention.length?attention.slice(0,8).map(t=>`<article><span class="status ${rideStatusClass(t.status)}">${esc(t.statusLabel||t.status)}</span><strong>${esc(t.patientName||'Patient')} · ${esc(t.reference)}</strong><p>${esc(t.vehicleUnit?'Operational review required':'Vehicle assignment pending')}</p><small>${esc(t.date||'')} ${esc(t.time||'')}</small></article>`).join(''):'<div class="facilityEmptyCard"><strong>All clear</strong><p>No facility rides currently require immediate attention.</p></div>';
  const historyBody=$('#facilityRideHistory');
  const draw=(query='')=>{const q=query.trim().toLowerCase(),rows=trips.filter(t=>!q||[t.patientName,t.reference,t.pickup,t.destination,t.service,t.statusLabel].some(v=>String(v||'').toLowerCase().includes(q)));historyBody.innerHTML=rows.length?rows.slice(0,100).map(t=>facilityRow(t,true)).join(''):'<tr><td colspan="7" class="facilityEmpty">No matching facility rides found.</td></tr>'};
  draw(); const search=$('#facilityRideSearch'); search.oninput=()=>draw(search.value);
 }
 function roleTripRow(trip,role,history=false){
  const status=`<span class="status ${rideStatusClass(trip.status)}">${esc(trip.statusLabel||trip.status||'Pending')}</span>`;
  const schedule=`${esc(trip.date||'—')}<small>${esc(trip.time||'')}</small>`;
  const route=`<span class="facilityRoute"><b>${esc(trip.pickup||'Pickup pending')}</b><i aria-hidden="true">→</i><b>${esc(trip.destination||'Destination pending')}</b></span>`;
  if(role==='DRIVER') return `<tr><td><b>${esc(trip.reference||'—')}</b><small>${esc(trip.service||'')}</small></td><td><strong>${esc(trip.patientName||'Patient')}</strong><small>${esc(trip.patientPhone||'')}</small></td><td>${route}</td><td>${schedule}</td><td>${status}</td><td>${esc(trip.notes||'No special instructions')}</td></tr>`;
  if(['DISPATCHER','ADMIN'].includes(role)) return `<tr><td><b>${esc(trip.reference||'—')}</b><small>${esc(trip.service||'')}</small></td><td><strong>${esc(trip.patientName||'Patient')}</strong><small>${esc(trip.patientPhone||'')}</small></td><td>${route}</td><td>${schedule}</td><td>${status}</td><td>${esc(trip.vehicleUnit||'Unassigned')}<small>${esc(trip.driverName||'Driver pending')}</small></td></tr>`;
  if(role==='EXECUTIVE') return `<tr><td><b>${esc(trip.reference||'—')}</b></td><td>${esc(trip.service||'Transportation')}</td><td>${esc(trip.pickup||'—')} → ${esc(trip.destination||'—')}</td><td>${schedule}</td><td>${status}</td><td>${esc(trip.vehicleUnit||'Pending')}</td></tr>`;
  if(role==='QA') return `<tr><td><b>${esc(trip.reference||'—')}</b></td><td>${esc(trip.service||'Transportation')}</td><td>${status}</td><td>${esc(trip.vehicleUnit||'Pending')}</td><td>${esc(trip.driverName||'Unassigned')}</td><td>${esc(trip.notes||'No quality note')}</td></tr>`;
  if(role==='BILLING') return `<tr><td><b>${esc(trip.reference||'—')}</b></td><td>${esc(trip.patientName||'Patient')}</td><td>${esc(trip.service||'Transportation')}</td><td>${schedule}</td><td>${status}</td><td>${esc(trip.facilityId||'Direct/private pay')}</td></tr>`;
  return `<tr><td><b>${esc(trip.reference||'—')}</b></td><td>${esc(trip.service||'Transportation')}</td><td>${route}</td><td>${schedule}</td><td>${status}</td><td>${esc(trip.vehicleUnit||'Pending')}</td></tr>`;
 }
 function renderRoleWorkspace(role,trips,user){
  const facility=$('#facilityWorkspace'),workspace=$('#roleWorkspace'); if(facility)facility.hidden=true; if(!workspace)return; workspace.hidden=false;
  const active=trips.filter(t=>!['COMPLETED','CANCELLED'].includes(t.status)),completed=trips.filter(t=>t.status==='COMPLETED'),cancelled=trips.filter(t=>t.status==='CANCELLED'),attention=active.filter(t=>['REVIEWING','SUBMITTED'].includes(t.status)||!t.vehicleUnit),today=new Date().toISOString().slice(0,10),todayTrips=trips.filter(t=>t.date===today);
  const cfg={
  DRIVER:{eyebrow:'Driver command center',title:`${user?.displayName||'Driver'} assigned transportation`,intro:'Only your assigned vehicle, current routes and minimum necessary patient details are displayed.',actions:'<a class="button" href="/driver-app.html">Open full driver app</a>',primary:'Assigned and upcoming rides',primaryIntro:'Your route sequence, rider contact and trip instructions.',history:'Completed assignment history',historyIntro:'Your recent completed and cancelled assignments.',head:'<tr><th>Ride</th><th>Patient</th><th>Route</th><th>Schedule</th><th>Status</th><th>Instructions</th></tr>',kpis:[['Assigned today',todayTrips.length],['Active rides',active.length],['Completed',completed.length],['Needs attention',attention.length]]},
   DISPATCHER:{eyebrow:'Dispatch command center',title:'System-wide transportation operations',intro:'Fleet movement, trip assignments, patients, drivers and operational exceptions across Nexus.',actions:'<a class="button" href="/dispatch.html">Open full dispatch portal</a><a class="button secondary" href="/booking-app.html">Create ride</a>',primary:'Active fleet assignments',primaryIntro:'Current and upcoming rides requiring dispatch awareness.',history:'System ride history',historyIntro:'Search completed, cancelled and upcoming transportation records.',head:'<tr><th>Ride</th><th>Patient</th><th>Route</th><th>Schedule</th><th>Status</th><th>Vehicle / driver</th></tr>',kpis:[['Today’s rides',todayTrips.length],['Active fleet rides',active.length],['Completed',completed.length],['Exceptions',attention.length]]},
   ADMIN:{eyebrow:'Administrator command center',title:'Nexus Livecare administration',intro:'Enterprise-wide visibility across rides, users, vehicles and operational performance.',actions:'<a class="button" href="/admin.html">Open administration</a><a class="button secondary" href="/dispatch.html">Open dispatch</a>',primary:'Enterprise ride operations',primaryIntro:'System-wide transportation activity and assignments.',history:'Enterprise ride records',historyIntro:'Search all authorized ride records across the platform.',head:'<tr><th>Ride</th><th>Patient</th><th>Route</th><th>Schedule</th><th>Status</th><th>Vehicle / driver</th></tr>',kpis:[['Today’s rides',todayTrips.length],['Active operations',active.length],['Completed',completed.length],['Exceptions',attention.length]]},
   EXECUTIVE:{eyebrow:'Executive command center',title:'Network performance overview',intro:'De-identified transportation demand, service delivery and fleet utilization.',actions:'<a class="button" href="/executive.html">Open executive dashboard</a>',primary:'Current network activity',primaryIntro:'Operational movement presented without unnecessary patient details.',history:'Service performance history',historyIntro:'Recent system transportation activity for performance review.',head:'<tr><th>Ride</th><th>Service</th><th>Route</th><th>Schedule</th><th>Status</th><th>Vehicle</th></tr>',kpis:[['Today’s volume',todayTrips.length],['Active rides',active.length],['Completion rate',`${trips.length?Math.round(completed.length/trips.length*100):0}%`],['Cancelled',cancelled.length]]},
   QA:{eyebrow:'Quality command center',title:'Safety and quality oversight',intro:'Authorized quality review of ride status, exceptions, notes and service delivery.',actions:'<a class="button" href="/qa.html">Open quality portal</a>',primary:'Quality review queue',primaryIntro:'Active and exception-prone rides requiring oversight.',history:'Quality review history',historyIntro:'Recent ride records available for audit and performance review.',head:'<tr><th>Ride</th><th>Service</th><th>Status</th><th>Vehicle</th><th>Driver</th><th>Quality note</th></tr>',kpis:[['Review queue',attention.length],['Active rides',active.length],['Completed',completed.length],['Cancelled',cancelled.length]]},
   BILLING:{eyebrow:'Billing command center',title:'Transportation revenue operations',intro:'Authorized trip records supporting billing readiness, reconciliation and payer follow-up.',actions:'<a class="button" href="/billing.html">Open billing portal</a>',primary:'Billing-ready trip activity',primaryIntro:'Transportation records requiring billing awareness.',history:'Billing trip history',historyIntro:'Search transportation records by ride, patient, service or status.',head:'<tr><th>Ride</th><th>Patient</th><th>Service</th><th>Schedule</th><th>Status</th><th>Account</th></tr>',kpis:[['Today’s trips',todayTrips.length],['Completed',completed.length],['Pending completion',active.length],['Cancelled',cancelled.length]]}
  }[role]||{eyebrow:'Personalized command center',title:'Your Livecare workspace',intro:'Role-specific transportation information.',actions:'',primary:'Current rides',primaryIntro:'Authorized transportation activity.',history:'Recent history',historyIntro:'Authorized ride history.',head:'<tr><th>Ride</th><th>Service</th><th>Route</th><th>Schedule</th><th>Status</th><th>Vehicle</th></tr>',kpis:[['Today',todayTrips.length],['Active',active.length],['Completed',completed.length],['Attention',attention.length]]};
  $('#roleWorkspaceEyebrow').textContent=cfg.eyebrow; $('#roleWorkspaceTitle').textContent=cfg.title; $('#roleWorkspaceIntro').textContent=cfg.intro; $('#roleWorkspaceActions').innerHTML=cfg.actions;
  $('#roleKpis').innerHTML=cfg.kpis.map(([label,value],i)=>`<article><small>${esc(label)}</small><strong>${esc(value)}</strong><span>${i===3&&attention.length?'Review required':'Livecare authorized view'}</span></article>`).join('');
  $('#rolePrimaryTitle').textContent=cfg.primary; $('#rolePrimaryIntro').textContent=cfg.primaryIntro; $('#rolePrimaryCount').textContent=`${active.length} ride${active.length===1?'':'s'}`; $('#rolePrimaryHead').innerHTML=cfg.head; $('#rolePrimaryBody').innerHTML=active.length?active.slice(0,50).map(t=>roleTripRow(t,role)).join(''):'<tr><td colspan="6" class="facilityEmpty">No active assignments are currently available for this account.</td></tr>';
  $('#rolePriorityList').innerHTML=attention.length?attention.slice(0,10).map(t=>`<article><span class="status ${rideStatusClass(t.status)}">${esc(t.statusLabel||t.status)}</span><strong>${esc(t.reference||'Ride')} · ${esc(t.patientName||t.service||'Transportation')}</strong><p>${esc(!t.vehicleUnit?'Vehicle assignment pending':'Operational review required')}</p><small>${esc(t.date||'')} ${esc(t.time||'')}</small></article>`).join(''):'<div class="facilityEmptyCard"><strong>All clear</strong><p>No authorized rides currently require immediate attention.</p></div>';
  $('#roleHistoryTitle').textContent=cfg.history; $('#roleHistoryIntro').textContent=cfg.historyIntro; $('#roleHistoryHead').innerHTML=cfg.head;
  const draw=(query='')=>{const q=query.trim().toLowerCase(),rows=trips.filter(t=>!q||[t.patientName,t.reference,t.pickup,t.destination,t.service,t.statusLabel,t.vehicleUnit,t.driverName].some(v=>String(v||'').toLowerCase().includes(q)));$('#roleHistoryBody').innerHTML=rows.length?rows.slice(0,150).map(t=>roleTripRow(t,role,true)).join(''):'<tr><td colspan="6" class="facilityEmpty">No matching authorized records found.</td></tr>'}; draw(); $('#roleHistorySearch').oninput=e=>draw(e.target.value);
 }
 async function loadRoleWorkspace(role,user,token){
  const facility=$('#facilityWorkspace'),workspace=$('#roleWorkspace'); if(facility)facility.hidden=true; if(workspace)workspace.hidden=true;
  if(!['FACILITY','DRIVER','DISPATCHER','ADMIN','EXECUTIVE','QA','BILLING'].includes(role))return;
  try{const data=await request('/api/portal/trips',{headers:{authorization:`Bearer ${token}`},cache:'no-store'});if(role==='FACILITY')renderFacilityWorkspace(data.trips||[],user);else renderRoleWorkspace(role,data.trips||[],user);if(shouldAutoRevealWorkspace(role))revealWorkspaceForRole(role)}catch(err){const target=role==='FACILITY'?facility:workspace;if(target){target.hidden=false;target.innerHTML=`<div class="facilityPanel roleErrorPanel"><h2>Role information unavailable</h2><p>${esc(err.message)}</p></div>`}}
 }
 async function loadRideBoard(){
  if(verified.reference)return;
  const board=$('#liveRideBoard'),metrics=$('#liveRideMetrics');if(!board||!metrics)return;
  $('#fleetMapStatus').textContent='Connecting to fleet telemetry…';
  try{const token=sessionStorage.getItem('nexusAccessToken');let data,role='PUBLIC',user=null;if(token){const me=await request('/api/auth/me',{headers:{authorization:`Bearer ${token}`},cache:'no-store'});role=me.user.role;user=me.user;sessionStorage.setItem('nexusUser',JSON.stringify(user));data=await request('/api/fleet/live',{headers:{authorization:`Bearer ${token}`},cache:'no-store'});await loadRoleWorkspace(role,user,token);}else{data=await request('/api/fleet/live',{cache:'no-store'});const w=$('#facilityWorkspace'),rw=$('#roleWorkspace');if(w)w.hidden=true;if(rw)rw.hidden=true;}if(!(data.vehicles||[]).length&&role==='PUBLIC')throw Error('No telemetry');renderFleet(data,role,'live')}catch(err){const token=sessionStorage.getItem('nexusAccessToken'),savedUser=(()=>{try{return JSON.parse(sessionStorage.getItem('nexusUser')||'null')}catch{return null}})(),role=savedUser?.role||'PUBLIC';if(token&&role!=='PUBLIC'){renderFleet({generatedAt:new Date().toISOString(),vehicles:[]},role,'live');loadRoleWorkspace(role,savedUser,token)}else if(isProductionHost())renderFleet({generatedAt:new Date().toISOString(),vehicles:[]},'PUBLIC','live');else renderFleet({generatedAt:new Date().toISOString(),vehicles:fallbackFleet()},'PUBLIC','fallback')}
 }
 $('#refreshRideBoard')?.addEventListener('click',loadRideBoard);loadRideBoard();setInterval(loadRideBoard,30000);

 async function loadPreview(){
  const panel=$('#previewAccess');
  if(panel)panel.hidden=true;
 }
 const togglePassword=$('#togglePassword');
 if(togglePassword){
  togglePassword.addEventListener('click',e=>{e.preventDefault();const input=$('#password'),toggle=$('#togglePassword'),isPassword=input&&input.type==='password';if(!input||!toggle)return;input.type=isPassword?'text':'password';toggle.textContent=isPassword?'🙈':'👁';toggle.setAttribute('aria-label',isPassword?'Hide password':'Show password');input.focus()});
 }
 $('#staffLogin').addEventListener('submit',async e=>{e.preventDefault();const error=$('#staffError'),submit=$('#staffSubmit'),label=submit.querySelector('span');error.textContent='';submit.disabled=true;label.textContent='Signing in…';try{const expected=$('#expectedRole').value;const j=await request('/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:$('#identifier').value.trim(),password:$('#password').value})});if(expected&&j.user.role!==expected&&j.user.role!=='ADMIN'){await fetch('/api/auth/logout',{method:'POST',headers:{authorization:`Bearer ${j.token}`}});throw Error('This account does not have permission for the selected portal.')}forceShowAccessGateway=false;sessionStorage.setItem('nexusAccessToken',j.token);sessionStorage.setItem('nexusUser',JSON.stringify(j.user));const requested=new URLSearchParams(location.search).get('redirect');const safeRequested=requested&&requested.startsWith('/')&&!requested.startsWith('//')?requested:'';const routes={FACILITY:'/facility.html',DISPATCHER:'/dispatch.html',DRIVER:'/driver-app.html',ADMIN:'/admin.html'};location.assign(safeRequested||routes[j.user.role]||'/livecare.html')}catch(err){error.textContent=err.message}finally{submit.disabled=false;label.textContent='Sign in securely'}});
 const saved=sessionStorage.getItem('nexusPatientRide');if(saved){try{verified=JSON.parse(saved);load().catch(()=>sessionStorage.removeItem('nexusPatientRide'))}catch{}}
 loadPreview();
})();

