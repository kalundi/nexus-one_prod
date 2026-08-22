(function(){
 const N=window.NexusPatient; if(!N)return;
 const $=s=>document.querySelector(s); const esc=s=>String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
 const statusClass=s=>/complete|paid/i.test(s)?'green':/cancel|late/i.test(s)?'red':/confirm|transit|arriv|route/i.test(s)?'blue':'amber';
 const livecareUrl=reference=>`/livecare.html?reference=${encodeURIComponent(reference||'')}`;
 let routeRefreshTimer=0;
 const routeUi={detailsOpen:false,nextRideOpen:false,homeFocus:'nextRide',lastTelemetryAt:0,lastVehicles:[],viewFocus:{}};
 function upcoming(){return N.trips().filter(t=>!/complete|cancel/i.test(t.status)).sort((a,b)=>`${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));}
 function parseTripTime(trip){
  if(!trip?.date)return null;
  const dt=new Date(`${trip.date}T${trip.time||'00:00'}:00`);
  return Number.isNaN(dt.getTime())?null:dt;
 }
 function formatEta(minutes){
  if(!Number.isFinite(minutes))return '--';
  if(minutes<=1)return 'Now';
  if(minutes<60)return `${minutes} min`;
  const hrs=Math.floor(minutes/60), mins=minutes%60;
  return mins?`${hrs}h ${mins}m`:`${hrs}h`;
 }
 function liveRouteState(trip){
  const status=String(trip?.status||'').toLowerCase();
  const tripTime=parseTripTime(trip);
  const now=new Date();
  const minsToPickup=tripTime?Math.round((tripTime-now)/60000):NaN;
  let phase='scheduled',progress=0.08,headline='Ride is scheduled',subtext='Your transportation details are confirmed. We will show live movement as soon as your driver is dispatched.',eta=tripTime?formatEta(Math.max(0,minsToPickup)):'--';

  if(/cancel/.test(status)){
    phase='cancelled'; progress=0; headline='Trip cancelled'; subtext='This trip is no longer active. Please contact dispatch if you need to rebook.'; eta='--';
  }else if(/complete/.test(status)){
    phase='completed'; progress=1; headline='Trip completed'; subtext='You have arrived at your destination.'; eta='Arrived';
  }else if(/on\s*board|in\s*transit|toward|to destination|drop/.test(status)){
    phase='transit'; progress=0.72; headline='Driving to destination'; subtext='You are currently in transit to your destination.'; eta=Number.isFinite(minsToPickup)?formatEta(Math.max(5,Math.round(Math.abs(minsToPickup)*0.45))):'In progress';
  }else if(/arriv/.test(status)){
    phase='arrived'; progress=0.48; headline='Driver has arrived'; subtext='Your vehicle is at pickup and ready for boarding.'; eta='At pickup';
  }else if(/en\s*route|route|driver assigned|assigned/.test(status)){
    phase='approaching'; progress=0.34; headline='Driver is on the way'; subtext='Your driver is approaching the pickup location.'; eta=tripTime?formatEta(Math.max(1,minsToPickup)):'En route';
  }else if(/confirm/.test(status) && Number.isFinite(minsToPickup) && minsToPickup<=45){
    phase='approaching'; progress=0.22; headline='Preparing to dispatch'; subtext='Your trip is next in queue and dispatch prep has started.'; eta=formatEta(Math.max(1,minsToPickup));
  }

  if(phase==='scheduled' && Number.isFinite(minsToPickup) && minsToPickup<0){
    phase='approaching';
    progress=0.3;
    headline='Driver update pending';
    subtext='Pickup time has passed and dispatch is updating vehicle status.';
    eta='Updating';
  }

  const pos=10+Math.round(Math.max(0,Math.min(1,progress))*80);
  return {phase,progress,pos,headline,subtext,eta};
 }
 function deriveVehicleState(vehicle,fallback){
  if(!vehicle)return fallback;
  const rawStatus=String(vehicle.status||'').toUpperCase();
  const pctSource=Number(vehicle.progress);
  const clampedPct=Number.isFinite(pctSource)?Math.max(0,Math.min(100,pctSource)):null;
  let phase=fallback.phase,progress=fallback.progress,headline=fallback.headline,subtext=fallback.subtext,eta=fallback.eta;
  if(rawStatus==='PATIENT_ON_BOARD'){phase='transit';headline='Driving to destination';subtext='Live telemetry confirms the patient is onboard and moving to destination.';progress=clampedPct!=null?Math.max(.55,clampedPct/100):.72;}
  else if(rawStatus==='EN_ROUTE'){phase='approaching';headline='Driver is on the way';subtext='Live telemetry confirms your driver is actively approaching pickup.';progress=clampedPct!=null?Math.max(.2,clampedPct/100):.34;}
  else if(rawStatus==='ARRIVED'){phase='arrived';headline='Driver has arrived';subtext='Live telemetry indicates vehicle is at the pickup zone.';progress=clampedPct!=null?Math.max(.45,clampedPct/100):.48;eta='At pickup';}
  else if(rawStatus==='DRIVER_ASSIGNED'){phase='approaching';headline='Driver assigned and preparing';subtext='Your driver is assigned and dispatch is preparing route movement.';progress=clampedPct!=null?Math.max(.16,clampedPct/100):.24;}
  if(clampedPct!=null)progress=clampedPct/100;
  const pos=10+Math.round(Math.max(0,Math.min(1,progress))*80);
  return {phase,progress,pos,headline,subtext,eta};
 }
 function findTripVehicle(vehicles,trip){
  const ref=String(trip?.id||'').toUpperCase();
  if(!ref||!Array.isArray(vehicles)||!vehicles.length)return null;
  const refFields=['reference','tripReference','rideReference','bookingReference','tripId','rideId','id'];
  for(const v of vehicles){
   for(const f of refFields){
    const value=String(v?.[f]||'').toUpperCase();
    if(value&&value===ref)return v;
   }
  }
  return vehicles.find(v=>['EN_ROUTE','ARRIVED','PATIENT_ON_BOARD','DRIVER_ASSIGNED'].includes(String(v?.status||'').toUpperCase()))||null;
 }
 async function fetchLiveFleetVehicles(){
  const now=Date.now();
  if(now-routeUi.lastTelemetryAt<12000)return routeUi.lastVehicles;
  const token=sessionStorage.getItem('nexusAccessToken');
  const headers=token?{authorization:`Bearer ${token}`}:{ };
  try{
   const r=await fetch('/api/fleet/live',{headers,cache:'no-store'});
   if(!r.ok)throw new Error('fleet unavailable');
   const j=await r.json();
   routeUi.lastVehicles=Array.isArray(j.vehicles)?j.vehicles:[];
   routeUi.lastTelemetryAt=now;
   return routeUi.lastVehicles;
  }catch{
   return routeUi.lastVehicles;
  }
 }
 function renderLiveRoute(trip,vehicle){
  const card=$('#liveRouteCard'),btn=$('#liveRouteOpenBtn'),headline=$('#liveRouteHeadline'),sub=$('#liveRouteSubtext');
  const eta=$('#liveRouteEta'),progressText=$('#liveRouteProgress'),fill=$('#routeTrackFill'),pin=$('#routeVehiclePin');
  const pickupLabel=$('#routeStopPickup'),destinationLabel=$('#routeStopDestination');
  if(!card||!btn||!headline||!sub||!eta||!progressText||!fill||!pin||!pickupLabel||!destinationLabel)return;

  if(!trip){
    card.dataset.phase='scheduled';
    btn.href='/livecare.html';
    headline.textContent='No upcoming ride right now';
    sub.textContent='Once you book your next trip, this map will show driver approach and destination progress.';
    eta.textContent='--';
    sub.textContent='Once you book your next trip, this map will show driver approach and destination progress.';
    progressText.textContent='Book a ride to activate live route tracking.';
    pickupLabel.textContent='Pickup';
    destinationLabel.textContent='Destination';
    fill.style.width='10%';
    pin.style.left='calc(10% - 12px)';
    pin.setAttribute('aria-label','Driver location unavailable');
    return;
  }

  const fallback=liveRouteState(trip);
  const state=deriveVehicleState(vehicle,fallback);
  card.dataset.phase=state.phase;
  btn.href=livecareUrl(trip.id);
  headline.textContent=state.headline;
  sub.textContent=state.subtext;
  eta.textContent=state.eta;
  progressText.textContent=`${Math.round(state.progress*100)}% route visibility for ${trip.id}. Pickup: ${trip.pickup}. Destination: ${trip.destination}.`;
  pickupLabel.textContent=trip.pickup||'Pickup';
  destinationLabel.textContent=trip.destination||'Destination';
  fill.style.width=`${state.pos}%`;
  pin.style.left=`calc(${state.pos}% - 12px)`;
  pin.setAttribute('aria-label',vehicle?.unit?`Driver location: ${vehicle.unit}`:'Driver location');
 }
 function applyActiveRideRouteState(card,trip,state,vehicle){
  if(!card||!trip||!state)return;
  card.dataset.phase=state.phase;
  const headline=card.querySelector('[data-route-headline]');
  const subtext=card.querySelector('[data-route-subtext]');
  const eta=card.querySelector('[data-route-eta]');
  const progress=card.querySelector('[data-route-progress]');
  const pickup=card.querySelector('[data-route-pickup]');
  const destination=card.querySelector('[data-route-destination]');
  const fill=card.querySelector('[data-route-fill]');
  const pin=card.querySelector('[data-route-pin]');
  if(headline)headline.textContent=state.headline;
  if(subtext)subtext.textContent=state.subtext;
  if(eta)eta.textContent=state.eta;
  if(progress)progress.textContent=`${Math.round(state.progress*100)}% route visibility for ${trip.id}.`;
  if(pickup)pickup.textContent=trip.pickup||'Pickup';
  if(destination)destination.textContent=trip.destination||'Destination';
  if(fill)fill.style.width=`${state.pos}%`;
  if(pin){
   pin.style.left=`calc(${state.pos}% - 11px)`;
   pin.setAttribute('aria-label',vehicle?.unit?`Driver location: ${vehicle.unit}`:'Driver location');
  }
 }
 function renderActiveRideItem(trip,vehicle){
  const state=deriveVehicleState(vehicle,liveRouteState(trip));
  const pos=Math.round(Math.max(0,Math.min(1,state.progress))*100);
  return `<article class="manifestItem manifestItemRoute" data-active-route="${esc(trip.id)}" data-phase="${esc(state.phase)}"><div class="manifestMain"><div><strong>${esc(trip.pickup)} → ${esc(trip.destination)}</strong><small>${esc(trip.date)} ${esc(trip.time)} · ${esc(trip.service)} · ${esc(trip.id)}</small></div><div class="manifestMeta"><span class="status ${statusClass(trip.status)}">${esc(trip.status)}</span><span class="toolbar" style="align-items:center;justify-content:flex-end"><a class="button compact" href="${livecareUrl(trip.id)}">Track</a><button class="button compact secondary" type="button" data-share-trip="${esc(trip.id)}">Share</button></span></div></div><div class="routeMiniShell"><div class="routeMiniHead"><span><strong data-route-headline>${esc(state.headline)}</strong><small data-route-subtext>${esc(state.subtext)}</small></span><span class="routeMiniEta"><em>ETA</em><span data-route-eta>${esc(state.eta)}</span></span></div><div class="routeMapRail" aria-label="Active ride route"><span class="routeStop pickup" data-route-pickup>${esc(trip.pickup||'Pickup')}</span><span class="routeStop destination" data-route-destination>${esc(trip.destination||'Destination')}</span><div class="routeTrackBase"></div><div class="routeTrackFill" data-route-fill style="width:${state.pos}%"></div><button class="routeVehiclePin" type="button" data-route-pin aria-label="Driver location" style="left:calc(${state.pos}% - 11px)">N</button></div><p class="routeProgress" data-route-progress>${pos}% route visibility for ${esc(trip.id)}.</p><p class="routeShareHint">Share updates with family members and caregivers for live location awareness.</p></div></article>`;
 }
 function refreshActiveRideMaps(activeTrips,vehicles){
  if(!Array.isArray(activeTrips))return;
  const tripById=new Map(activeTrips.map(t=>[String(t.id||''),t]));
  document.querySelectorAll('[data-active-route]').forEach((card)=>{
   const ref=card.getAttribute('data-active-route')||'';
   const trip=tripById.get(ref);
   if(!trip)return;
   const state=deriveVehicleState(findTripVehicle(vehicles,trip),liveRouteState(trip));
   applyActiveRideRouteState(card,trip,state,findTripVehicle(vehicles,trip));
  });
 }
 async function refreshLiveRoute(){
  const trip=upcoming()[0];
  const activeTrips=upcoming();
  const vehicles=await fetchLiveFleetVehicles();
  const vehicle=findTripVehicle(vehicles,trip);
  renderLiveRoute(trip,vehicle);
  refreshActiveRideMaps(activeTrips,vehicles);
 }
 function bindLiveRouteDetails(){
  const btn=$('#routeDetailToggle'),panel=$('#liveRouteDetailPanel');
  if(!btn||!panel)return;
  const sync=()=>{
   panel.hidden=!routeUi.detailsOpen;
   btn.setAttribute('aria-expanded',String(routeUi.detailsOpen));
   btn.textContent=routeUi.detailsOpen?'Hide details':'Show details';
  };
  btn.addEventListener('click',()=>{routeUi.detailsOpen=!routeUi.detailsOpen;sync();});
  sync();
 }
 function bindRideDisclosures(){
  const nextBtn=$('#nextRideToggle');
  const sync=()=>{
   if(nextBtn){
    nextBtn.setAttribute('aria-expanded',String(routeUi.nextRideOpen));
    nextBtn.textContent=routeUi.nextRideOpen?'Hide details':'Show details';
   }
  };
  nextBtn?.addEventListener('click',()=>{routeUi.nextRideOpen=!routeUi.nextRideOpen;render();sync();});
  sync();
 }
 function bindTopAndFooterActions(){
  const title=$('#topViewTitle');
  const setTitle=text=>{if(title)title.textContent=text;};
  const homePage=$('#homePage');
  const profilePage=$('#profilePage');
  const historyPage=$('#historyPage');
  const supportPage=$('#supportPage');
  const setView=view=>{
   if(homePage)homePage.hidden=view!=='home';
   if(profilePage)profilePage.hidden=view!=='profile';
   if(historyPage)historyPage.hidden=view!=='history';
   if(supportPage)supportPage.hidden=view!=='support';
    syncViewFocusDeck(view);
   setTitle(view==='profile'?'Profile':view==='history'?'History':view==='support'?'Support':'Home');
  };
  const openProfile=()=>setView('profile');
  const openHistory=()=>setView('history');
  const openSupport=()=>setView('support');
  const showHome=()=>setView('home');
  $('#heroProfileBtn')?.addEventListener('click',openProfile);
  document.querySelectorAll('[data-footer-action]').forEach(btn=>{
   btn.addEventListener('click',()=>{
    document.querySelectorAll('.bottomNav .navBtn').forEach(x=>x.classList.remove('active'));
    btn.classList.add('active');
    const action=btn.dataset.footerAction;
    if(action==='home')showHome();
    if(action==='profile')openProfile();
    if(action==='history')openHistory();
    if(action==='support')openSupport();
   });
  });
  showHome();
 }
 function bindViewFocusDeck(){
  const viewConfig=[
   {name:'profile',root:'#profilePage',selector:':scope > .card'},
   {name:'history',root:'#historyPage',selector:':scope > .card, :scope > .historySplit'},
   {name:'support',root:'#supportPage',selector:':scope > .card'}
  ];

  viewConfig.forEach(cfg=>{
   const root=$(cfg.root);
   if(!root)return;
   root.classList.add('viewFocusMode');
   const items=()=>[...root.querySelectorAll(cfg.selector)];
   if(!items().length)return;
   routeUi.viewFocus[cfg.name]=items()[0];

   root.addEventListener('click',event=>{
    const focusCard=event.target.closest('.focusCard');
    if(!focusCard || !root.contains(focusCard))return;
    routeUi.viewFocus[cfg.name]=focusCard;
    syncViewFocusDeck(cfg.name);
   });

   items().forEach(item=>item.classList.add('focusCard'));
  });
 }
 function syncViewFocusDeck(viewName){
  const map={
   profile:{root:'#profilePage',selector:':scope > .card'},
   history:{root:'#historyPage',selector:':scope > .card, :scope > .historySplit'},
   support:{root:'#supportPage',selector:':scope > .card'}
  };
  const cfg=map[viewName];
  if(!cfg)return;
  const root=$(cfg.root);
  if(!root)return;
  const items=[...root.querySelectorAll(cfg.selector)];
  if(!items.length)return;
  const active=items.includes(routeUi.viewFocus[viewName])?routeUi.viewFocus[viewName]:items[0];
  routeUi.viewFocus[viewName]=active;
  items.forEach(item=>{
   item.classList.add('focusCard');
   item.classList.toggle('is-focused',item===active);
   item.classList.toggle('is-collapsed',item!==active);
  });
 }
 function bindHomeFocusDeck(){
  const home=$('#homePage');
  if(!home)return;
  const focusItems=()=>[...home.querySelectorAll('[data-home-focus]')];
  const sync=()=>{
   home.classList.add('homeFocusMode');
   focusItems().forEach(item=>{
    const active=item.dataset.homeFocus===routeUi.homeFocus;
    item.classList.toggle('is-focused',active);
    item.classList.toggle('is-collapsed',!active);
   });
  };
  home.addEventListener('click',event=>{
   const item=event.target.closest('[data-home-focus]');
   if(!item || !home.contains(item))return;
   routeUi.homeFocus=item.dataset.homeFocus||routeUi.homeFocus;
   sync();
  });
  sync();
 }
 function renderInsights(trips){
  const bars=$('#insightWeekBars'),ring=$('#insightStatusRing'),text=$('#insightStatusText'),meta=$('#insightWeekMeta');
  if(!bars||!ring||!text)return;
  const dates=[...new Set(trips.map(t=>t.date).filter(Boolean))].sort();
  const sampleDates=dates.slice(-7);
  if(!sampleDates.length){
   bars.innerHTML='';
   if(meta)meta.textContent='No recent ride history.';
   ring.style.background='#e2e8f0';
   text.textContent='0%';
   return;
  }
  const counts=sampleDates.map(d=>trips.filter(t=>t.date===d).length);
  const max=Math.max(1,...counts);
  const width=220, height=56;
  const xs=sampleDates.map((_,i)=>sampleDates.length===1?width/2:Math.round((i*(width-12))/(sampleDates.length-1))+6);
  const ys=counts.map(v=>Math.round(height-6-((v/max)*(height-16))));
  const points=xs.map((x,i)=>`${x},${ys[i]}`).join(' ');
  const firstLabel=new Date(`${sampleDates[0]}T00:00:00`);
  const lastLabel=new Date(`${sampleDates[sampleDates.length-1]}T00:00:00`);
  const start=Number.isNaN(firstLabel.getTime())?sampleDates[0].slice(5):firstLabel.toLocaleDateString([], {month:'numeric',day:'numeric'});
  const end=Number.isNaN(lastLabel.getTime())?sampleDates[sampleDates.length-1].slice(5):lastLabel.toLocaleDateString([], {month:'numeric',day:'numeric'});
  bars.innerHTML=`<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Trip trend sparkline from ${esc(start)} to ${esc(end)}"><polyline points="${points}" fill="none" stroke="#0b1d47" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"></polyline>${xs.map((x,i)=>`<circle cx="${x}" cy="${ys[i]}" r="2.4" fill="#0a6b99"><title>${esc(sampleDates[i])}: ${counts[i]} trip${counts[i]===1?'':'s'}</title></circle>`).join('')}</svg>`;
  if(meta){
   const totalWindow=counts.reduce((n,v)=>n+v,0);
   meta.textContent=`${totalWindow} rides between ${start} and ${end}.`;
  }

  const completed=trips.filter(t=>/complete/i.test(t.status)).length;
  const total=Math.max(1,trips.length);
  const pct=Math.round((completed/total)*100);
  ring.style.background=`conic-gradient(#067647 ${pct}%, #e2e8f0 0)`;
  text.textContent=`${pct}%`;
 }
 function render(){
  const trips=N.trips(), up=upcoming(), completed=trips.filter(t=>/complete/i.test(t.status));
  const active=trips.filter(t=>!/complete|cancel/i.test(t.status)).length;
  const activeTrips=trips.filter(t=>!/complete|cancel/i.test(t.status));
  const maxRideItemsPerCard=3;
  const heroLivecare=$('#openLivecareBtn');
  if(heroLivecare)heroLivecare.href=up[0]?.id?livecareUrl(up[0].id):'/livecare.html';
  $('#upcomingCount').textContent=up.length; $('#completedCount').textContent=completed.length;
  const rideCenterSummary=$('#rideCenterSummary');
  if(rideCenterSummary)rideCenterSummary.textContent=`${active} active rides, ${completed.length} completed rides. Extra rides are automatically split into additional cards.`;
  const rideCenterSummaryInline=$('#rideCenterSummaryInline');
  if(rideCenterSummaryInline)rideCenterSummaryInline.textContent=`${active} active rides, ${completed.length} completed rides. History is shown directly on this page.`;
  const historyActiveCount=$('#historyActiveCount');
  if(historyActiveCount)historyActiveCount.textContent=String(active);
  const historyCompletedCount=$('#historyCompletedCount');
  if(historyCompletedCount)historyCompletedCount.textContent=String(completed.length);
  const historyOnTimeRate=$('#historyOnTimeRate');
  const historyStatusText=$('#historyStatusText');
  const historyStatusRing=$('#historyStatusRing');
  const historyTrendBars=$('#historyTrendBars');
  const historyAvgFare=$('#historyAvgFare');
  const fares=trips.map(t=>Number(t.fare||0)).filter(v=>Number.isFinite(v) && v>0);
  if(historyAvgFare)historyAvgFare.textContent=`$${(fares.length?fares.reduce((sum,val)=>sum+val,0)/fares.length:0).toFixed(2)}`;
  const onTime=trips.filter(t=>/complete|confirmed|arriv|on[_\s-]?time/i.test(t.status)).length;
  const pct=Math.round((onTime/Math.max(1,trips.length))*100);
  if(historyOnTimeRate)historyOnTimeRate.textContent=`${pct}%`;
  if(historyStatusText)historyStatusText.textContent=`${pct}%`;
  if(historyStatusRing)historyStatusRing.style.background=`conic-gradient(#067647 ${pct}%, #e2e8f0 0)`;
  const notes=N.read(N.KEYS.notifications,[]); $('#notificationCount').textContent=notes.filter(n=>!n.read).length;
  const p=N.read(N.KEYS.profile,{}); $('#profileSummary').innerHTML=`<div><dt>Name</dt><dd>${esc(p.name)}</dd></div><div><dt>Mobility</dt><dd>${esc(p.mobility)}</dd></div><div><dt>Preferred language</dt><dd>${esc(p.language)}</dd></div><div><dt>Default pickup</dt><dd>${esc(p.pickup)}</dd></div>`;
  $('#nextTrip').innerHTML=up.length?tripCard(up[0],true):'<p class="notice">No upcoming transportation is scheduled.</p>';
  const activeList=$('#rideCenterActiveList');
  const activeOverflowList=$('#rideCenterActiveOverflowList');
  const activeOverflowCard=$('#rideCenterActiveOverflowCard');
  const activePrimary=activeTrips.slice(0,maxRideItemsPerCard);
  const activeOverflow=activeTrips.slice(maxRideItemsPerCard);
  if(activeList){
   activeList.innerHTML=activePrimary.length
    ?activePrimary.map(t=>renderActiveRideItem(t,findTripVehicle(routeUi.lastVehicles,t))).join('')
    :'<p class="muted">No active rides right now.</p>';
  }
  if(activeOverflowList){
   activeOverflowList.innerHTML=activeOverflow.map(t=>renderActiveRideItem(t,findTripVehicle(routeUi.lastVehicles,t))).join('');
  }
  if(activeOverflowCard)activeOverflowCard.hidden=!activeOverflow.length;
  refreshActiveRideMaps(activeTrips,routeUi.lastVehicles);

  const completedList=$('#rideCenterCompletedList');
  const completedOverflowList=$('#rideCenterCompletedOverflowList');
  const completedOverflowCard=$('#rideCenterCompletedOverflowCard');
  const completedPrimary=completed.slice(0,maxRideItemsPerCard);
  const completedOverflow=completed.slice(maxRideItemsPerCard);
  if(completedList){
   completedList.innerHTML=completedPrimary.length
    ?completedPrimary.map(t=>`<div class="manifestItem"><span><strong>${esc(t.pickup)} → ${esc(t.destination)}</strong><small>${esc(t.date)} ${esc(t.time)} · ${esc(t.service)} · ${esc(t.id)}</small></span><span class="toolbar" style="align-items:center;justify-content:flex-end"><span class="status ${statusClass(t.status)}">${esc(t.status)}</span><span class="muted">$${Number(t.fare||0).toFixed(2)}</span></span></div>`).join('')
    :'<p class="muted">No completed rides yet.</p>';
  }
  if(completedOverflowList){
   completedOverflowList.innerHTML=completedOverflow.map(t=>`<div class="manifestItem"><span><strong>${esc(t.pickup)} → ${esc(t.destination)}</strong><small>${esc(t.date)} ${esc(t.time)} · ${esc(t.service)} · ${esc(t.id)}</small></span><span class="toolbar" style="align-items:center;justify-content:flex-end"><span class="status ${statusClass(t.status)}">${esc(t.status)}</span><span class="muted">$${Number(t.fare||0).toFixed(2)}</span></span></div>`).join('');
  }
  if(completedOverflowCard)completedOverflowCard.hidden=!completedOverflow.length;
  const sampleDates=[...new Set(trips.map(t=>t.date).filter(Boolean))].sort().slice(-7);
  if(historyTrendBars){
   if(!sampleDates.length){
    historyTrendBars.innerHTML='';
   }else{
    const counts=sampleDates.map(d=>trips.filter(t=>t.date===d).length);
    const max=Math.max(1,...counts);
    const width=220, height=54;
    const xs=sampleDates.map((_,i)=>sampleDates.length===1?width/2:Math.round((i*(width-12))/(sampleDates.length-1))+6);
    const ys=counts.map(v=>Math.round(height-6-((v/max)*(height-16))));
    const points=xs.map((x,i)=>`${x},${ys[i]}`).join(' ');
    historyTrendBars.innerHTML=`<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Ride trend"><polyline points="${points}" fill="none" stroke="#0b1d47" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"></polyline>${xs.map((x,i)=>`<circle cx="${x}" cy="${ys[i]}" r="2.2" fill="#0a6b99"></circle>`).join('')}</svg>`;
   }
  }
  const rideRowsHistory=$('#rideRowsHistory');
  if(rideRowsHistory){
   const recent=[...trips].sort((a,b)=>`${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`)).slice(0,3);
   rideRowsHistory.innerHTML=recent.map(t=>`<div class="manifestItem"><span><strong>${esc(t.pickup)} → ${esc(t.destination)}</strong><small>${esc(t.date)} ${esc(t.time)} · ${esc(t.service)}</small></span><span class="toolbar" style="align-items:center;justify-content:flex-end"><span class="status ${statusClass(t.status)}">${esc(t.status)}</span>${/complete/i.test(t.status)?`<span class="muted">$${Number(t.fare||0).toFixed(2)}</span>`:`<a class="button compact" href="${livecareUrl(t.id)}">Track</a>`}</span></div>`).join('')||'<p class="muted">No rides found.</p>';
  }
  $('#contactList').innerHTML=N.read(N.KEYS.contacts,[]).map(c=>`<div class="manifestItem"><span><strong>${esc(c.name)}</strong><small>${esc(c.relationship)} · ${esc(c.phone)}</small></span><span class="status ${c.notify?'green':'amber'}">${c.notify?'Updates on':'Updates off'}</span></div>`).join('');
  $('#documentList').innerHTML=N.read(N.KEYS.docs,[]).map(d=>`<div class="manifestItem"><span><strong>${esc(d.name)}</strong><small>${esc(d.type)} · Updated ${esc(d.updated)}</small></span><button class="button compact secondary" data-remove-doc="${esc(d.id)}">Remove</button></div>`).join('')||'<p>No documents have been added.</p>';
  $('#notificationList').innerHTML=notes.map(n=>`<div class="message ${n.read?'':'dispatch'}"><strong>${esc(n.title)}</strong><p>${esc(n.body)}</p><small>${esc(n.time)}</small></div>`).join('');
  renderInsights(trips);
  renderLiveRoute(up[0],findTripVehicle(routeUi.lastVehicles,up[0]));
  refreshLiveRoute();
 }
 function tripCard(t,next){return `<p><span class="status ${statusClass(t.status)}">${esc(t.status)}</span></p><h3>${esc(t.pickup)} → ${esc(t.destination)}</h3><p class="muted" style="margin:6px 0 0">${esc(t.date)} at ${esc(t.time)}</p>${next?`<div class="toolbar" style="margin-top:8px"><a class="button" href="${livecareUrl(t.id)}">Open LiveCare</a><button class="button secondary" id="shareNext" data-trip="${esc(t.id)}">Share tracking</button></div>`:''}<div class="tripDetailBlock"${routeUi.nextRideOpen?'':' hidden'}><dl class="detailList"><div><dt>Service</dt><dd>${esc(t.service)}</dd></div><div><dt>Driver</dt><dd>${esc(t.driver||'Pending assignment')}</dd></div><div><dt>Vehicle</dt><dd>${esc(t.vehicle||'Pending')}</dd></div><div><dt>Reference</dt><dd>${esc(t.id)}</dd></div></dl></div>`}
 function open(id){const d=$(id); if(d?.showModal)d.showModal()}
 document.addEventListener('click',e=>{
  const a=e.target.closest('[data-open]');if(a)open(a.dataset.open);
  if(e.target.matches('[data-close]'))e.target.closest('dialog')?.close();
  const r=e.target.closest('[data-remove-doc]');if(r){N.write(N.KEYS.docs,N.read(N.KEYS.docs,[]).filter(d=>d.id!==r.dataset.removeDoc));render()}
    const s=e.target.closest('#shareNext,[data-share-trip]');if(s){const prefix=location.protocol==='file:'?'':location.origin;const link=`${prefix}${livecareUrl(s.dataset.trip||s.dataset.shareTrip)}`;navigator.clipboard?.writeText(link);$('#portalNotice').textContent='Livecare link copied. Share with family or caregivers and verify identity by phone for privacy.';}
 });
 function fillProfileForm(profile){const form=$('#profileForm');if(!form)return;['name','phone','email','mobility','language','communication','pickup','notes'].forEach(name=>{if(form.elements[name]&&profile[name]!=null)form.elements[name].value=profile[name]});['remainsInWheelchair','transferAssistance','oxygenRequired'].forEach(name=>{if(form.elements[name])form.elements[name].checked=profile[name]===true||profile[name]==='on'})}
 async function loadPatientPreferences(){const token=sessionStorage.getItem('nexusAccessToken');if(!token){fillProfileForm(N.read(N.KEYS.profile,{}));return}try{const response=await fetch('/api/patient/preferences',{headers:{authorization:`Bearer ${token}`},cache:'no-store'});if(!response.ok)return fillProfileForm(N.read(N.KEYS.profile,{}));const data=await response.json(),p=data.preferences||{},local=N.read(N.KEYS.profile,{}),profile={...local,mobility:String(p.mobilityType||local.mobility||'Ambulatory').replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase()),language:p.preferredLanguage||local.language||'',communication:p.communicationPreference||local.communication||'SMS',pickup:p.defaultPickup||local.pickup||'',notes:p.accessibilityNotes||local.notes||'',remainsInWheelchair:!!p.remainsInWheelchair,transferAssistance:!!p.transferAssistance,oxygenRequired:!!p.oxygenRequired};N.write(N.KEYS.profile,profile);fillProfileForm(profile);render()}catch{fillProfileForm(N.read(N.KEYS.profile,{}))}}
 $('#profileForm').addEventListener('submit',async e=>{e.preventDefault();const form=e.target,profile={...Object.fromEntries(new FormData(form)),remainsInWheelchair:form.remainsInWheelchair.checked,transferAssistance:form.transferAssistance.checked,oxygenRequired:form.oxygenRequired.checked};N.write(N.KEYS.profile,profile);const token=sessionStorage.getItem('nexusAccessToken');try{if(token){const response=await fetch('/api/patient/preferences',{method:'PATCH',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify({mobilityType:String(profile.mobility||'AMBULATORY').toUpperCase(),remainsInWheelchair:profile.remainsInWheelchair,transferAssistance:profile.transferAssistance,oxygenRequired:profile.oxygenRequired,preferredLanguage:profile.language,communicationPreference:profile.communication||'SMS',defaultPickup:profile.pickup,accessibilityNotes:profile.notes})});const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error||'Unable to save preferences')}}catch(error){$('#portalNotice').textContent=error.message;return}render();$('#portalNotice').textContent='Profile updated. These needs will now prefill future bookings.'});
 $('#contactForm').addEventListener('submit',e=>{e.preventDefault();const x=Object.fromEntries(new FormData(e.target));x.id='EC-'+Date.now();x.notify=Boolean(e.target.notify.checked);N.write(N.KEYS.contacts,[...N.read(N.KEYS.contacts,[]),x]);e.target.reset();e.target.closest('dialog').close();render()});
 $('#documentForm').addEventListener('submit',e=>{e.preventDefault();const fd=new FormData(e.target),f=fd.get('file');const docs=N.read(N.KEYS.docs,[]);docs.push({id:'DOC-'+Date.now(),name:f?.name||'Document',type:fd.get('type'),updated:new Date().toISOString().slice(0,10)});N.write(N.KEYS.docs,docs);e.target.reset();e.target.closest('dialog').close();render();$('#portalNotice').textContent='Document metadata saved for this prototype.'});
 bindLiveRouteDetails();
 bindRideDisclosures();
 bindViewFocusDeck();
 bindTopAndFooterActions();
 bindHomeFocusDeck();
 render();
 loadPatientPreferences();
 window.clearInterval(routeRefreshTimer);
 routeRefreshTimer=window.setInterval(()=>{
  refreshLiveRoute();
 },15000);
})();
