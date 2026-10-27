(()=>{'use strict';
 const $=id=>document.getElementById(id),TOKEN_KEY='nexusFacilityDemoToken';
 let recoveryToken=new URLSearchParams(location.search).get('action')==='reset'?new URLSearchParams(location.search).get('token')||'':'';
 if(recoveryToken)history.replaceState(null,'',location.pathname);
 let dashboard=null,selectedId='FC-DEMO-01',selectedLeg='outbound',automaticLeg=true,admin=false,platformAccess=false,busy=false,polling=false,lastRun='',knownMessages=new Set(),toastTimer;
 let mapsPromise=null,mapsAuthFailed=false,mapMode='all',mapExpanded=false,mapReturnFocus=null,mapInert=[];
 const mapController=NexusFacilityMap.create({loadMaps,element:$('routeMap'),onSelect:id=>selectPatient(id),isActive:()=>!!dashboard&&!$('dashboard').hidden,onStatus:status=>{$('routeMapStatus').textContent=status.message;$('routeAttribution').textContent=[status.attribution,...status.warnings].filter(Boolean).join(' · ');}});
 const presentationGuide=NexusFacilityGuide.create({showTarget:id=>{if(id==='routePanel'&&selected())selectPatient(selected().id);else openWorkspace(id);},isExpanded:()=>mapExpanded});
 const presentationMusic=NexusDemoMusic.create({button:$('demoMusicToggle'),volume:$('demoMusicVolume'),status:$('demoMusicStatus')});
 const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
 let billingBusy=false,billingLoadedAt=0,billingRevision=0;
 let returnEditKey='',returnEditDirty=false,workspace='overview',lastActionError='';
 const localTime=minute=>`${String(Math.floor(minute/60)).padStart(2,'0')}:${String(minute%60).padStart(2,'0')}`;
 function renderReturnEditor(patient){
  $('demoDay').value=dashboard.scenarioDate;$('demoDay').disabled=busy;
  const key=`${dashboard.scenarioDate}:${patient.id}`;
  if(key!==returnEditKey){returnEditDirty=false;returnEditKey=key;$('returnScheduleNotice').textContent='';}
  if(!returnEditDirty){$('returnPickupTime').value=localTime(patient.returnPickup??patient.appointmentAt);$('returnWaitHours').value=[60,120,180].includes(patient.waitMinutes)?String(patient.waitMinutes/60):'custom';$('vehicleWaiting').checked=patient.vehicleWaiting;}
  ['saveReturnSchedule','returnWaitHours','returnPickupTime','vehicleWaiting'].forEach(id=>$(id).disabled=busy||patient.tripType==='ONE_WAY');
  const firstReturn=document.querySelector('[data-jump="firstReturn"]'),returnDelay=document.querySelector('[data-jump="returnDelay"]');
  if(firstReturn){firstReturn.disabled=!dashboard.patients.some(p=>p.tripType!=='ONE_WAY');}if(firstReturn)firstReturn.dataset.minute=String(Math.min(...dashboard.patients.filter(p=>p.tripType!=='ONE_WAY').map(p=>p.returnPickup)));
  const delayedPatient=dashboard.patients.find(patient=>patient.slotIndex===3&&patient.tripType!=='ONE_WAY');if(returnDelay){returnDelay.disabled=!delayedPatient;if(delayedPatient)returnDelay.dataset.minute=String(delayedPatient.returnPickup+7);}
  const morningDelay=document.querySelector('[data-jump="morningDelay"]'),appointmentIssue=document.querySelector('[data-jump="appointmentIssue"]');
  const morningPatient=dashboard.patients.find(patient=>patient.slotIndex===1),issuePatient=dashboard.patients.find(patient=>patient.slotIndex===2);if(morningDelay){morningDelay.disabled=!morningPatient;if(morningPatient)morningDelay.dataset.minute=String(morningPatient.pickup+10);}if(appointmentIssue){appointmentIssue.disabled=!issuePatient;if(issuePatient)appointmentIssue.dataset.minute=String(issuePatient.pickup+5);}
 }
 const money=value=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(value/100);
 async function loadBilling(force=false){
  if(!dashboard||billingBusy||(!force&&Date.now()-billingLoadedAt<4000))return;
  const revision=billingRevision,token=demoToken(),mode=$('billingMode').value,period=$(mode==='day'?'billingDay':'billingMonth').value;
  billingBusy=true;
  try{const data=await api(`billing?mode=${encodeURIComponent(mode)}&period=${encodeURIComponent(period)}`);if(!dashboard||token!==demoToken()||revision!==billingRevision)return;
   billingLoadedAt=Date.now();$('billingAutomation').textContent=data.automation;
   $('billingContent').innerHTML=data.invoices.length?`<div class="billingCategories">${data.categories.map(category=>`<div><small>${esc(category.label)}</small><strong>${money(category.total)}</strong></div>`).join('')}<div><small>Period total</small><strong>${money(data.total)}</strong></div></div>`+data.invoices.map(invoice=>`<article><div class="invoiceBrand"><img src="/nexus-logo.png" width="252" height="70" alt="Nexus Medical Transit"><span>Prepared for<br><strong>FutureCare Annapolis</strong><small>Proposed collaboration · demo invoice</small></span></div><h3>${esc(invoice.id)} · ${esc(invoice.date)} · ${invoice.status==='issued'?'FINALIZED / DEMO DELIVERED':'DRAFT / ESTIMATED'}</h3><p>Bill to: FutureCare Annapolis · 2700 Southaven Road, Annapolis, MD 21401</p><p>${esc(invoice.delivery?`${invoice.delivery.channel} to ${invoice.delivery.recipient} at ${invoice.delivery.time}.`:'Automatic delivery pending all five return handoffs. Draft includes all scheduled legs; it is not a completed-service bill.')}</p><div class="tableScroll"><table><thead><tr><th>Patient / service</th><th>Transport leg</th><th>Pickup</th><th>Sample miles</th><th>Trip total</th><th>Fare detail</th></tr></thead><tbody>${invoice.rows.map(row=>`<tr><td><strong>${esc(row.patient)}</strong><small>${esc(row.service)}</small></td><td>${row.leg==='outbound'?'FutureCare → appointment':'Appointment → FutureCare'}<small>${esc(row.destination)}</small></td><td>${esc(row.pickup)}</td><td>${row.miles.toFixed(1)}</td><td><strong>${money(row.total)}</strong></td><td><details><summary>Itemized charges</summary><p>Vehicle wait: ${row.waitMinutes||0} min · free: ${row.freeWaitMinutes||0} min · billable: ${row.billableWaitMinutes||0} min · ${money((row.waitPer15||0)*100)}/15 min</p>${data.categories.map(category=>`<p>${esc(category.label)}: ${money(row.categories[category.key])}</p>`).join('')}</details></td></tr>`).join('')}</tbody><tfoot><tr><th colspan="4">${invoice.rows.length} transport legs · Daily total</th><th colspan="2">${money(invoice.total)}</th></tr></tfoot></table></div><p>${esc(invoice.pricingSource)}. Pricing snapshot: ${esc(invoice.pricingCapturedAt)}.</p><p>${esc(invoice.distanceSource)}. ${esc(invoice.assumptions)}</p>${invoice.history?.length?`<details><summary>Previous invoice revisions (${invoice.history.length})</summary>${invoice.history.map(previous=>`<p>${esc(previous.id)} · ${esc(previous.status)} · ${money(previous.total)} · retained for audit, excluded from current totals</p>`).join('')}</details>`:''}<p>Finalized invoices remain archived when the presentation restarts. Invoice delivery is simulated; no email was sent and no payment is due.</p></article>`).join(''):'<p class="emptyState">No demo trips or invoices for this period. Select any day from October 26–30, 2026, or October 2026 to view demonstration invoices.</p>';
  }catch(error){if(revision===billingRevision)$('billingContent').textContent=error.message;}finally{billingBusy=false;if(revision!==billingRevision&&dashboard)loadBilling(true);}
 }
 ['billingMode','billingDay','billingMonth'].forEach(id=>$(id).addEventListener('change',()=>{billingRevision++;$('billingDayLabel').hidden=$('billingMode').value!=='day';$('billingMonthLabel').hidden=$('billingMode').value!=='month';loadBilling(true);}));
 $('billingRefresh').addEventListener('click',()=>loadBilling(true));
 $('billingPrint').addEventListener('click',()=>window.print());
 const selected=()=>dashboard?.patients.find(patient=>patient.id===selectedId)||dashboard?.patients[0];
 const demoToken=()=>sessionStorage.getItem(TOKEN_KEY)||'';
 async function api(path,options={}){const token=(platformAccess?sessionStorage.getItem('nexusAccessToken'):demoToken())||sessionStorage.getItem('nexusAccessToken')||'';const response=await fetch(`/api/facility-demo/${path}`,{...options,headers:{...(token?{authorization:`Bearer ${token}`} :{}),'content-type':'application/json',...options.headers},cache:'no-store'});let data;try{data=await response.json();}catch{throw Error('The demo service could not be reached. Please retry.');}if(!response.ok){const error=Error(data.error||'Demo request failed.');error.status=response.status;throw error;}return data;}
 function toast(message,severity='info'){clearTimeout(toastTimer);$('toast').textContent=message;$('toast').className=`toast ${severity}`;$('toast').hidden=false;toastTimer=setTimeout(()=>$('toast').hidden=true,6500);}
 function showLogin(message=''){presentationGuide.stop();presentationMusic.stop();setPasswordVisible(false);$('loginScreen').hidden=false;$('dashboard').hidden=true;$('loginNotice').textContent=message;mapController.clear();if(mapExpanded)setMapExpanded(false);}
 function showDashboard(data){const dayChanged=dashboard?.scenarioDate!==data.dashboard.scenarioDate,changed=JSON.stringify(dashboard?.patients.map(p=>[p.returnPickup,p.vehicleWaiting]))!==JSON.stringify(data.dashboard.patients.map(p=>[p.returnPickup,p.vehicleWaiting]));dashboard=data.dashboard;admin=!!data.admin;platformAccess=admin||!!data.presenter;$('logout').textContent='Log out';if(dayChanged){mapMode='all';$('billingDay').value=dashboard.scenarioDate;$('billingMonth').value=dashboard.scenarioDate.slice(0,7);invalidateRoute();}if(dayChanged||changed){billingRevision++;billingLoadedAt=0;}$('loginScreen').hidden=true;$('dashboard').hidden=false;render();loadBilling();}
 function legFor(patient){return patient.tripType!=='ONE_WAY'&&['return-approach','return','complete'].includes(patient.phase)?'return':'outbound';}
 function invalidateRoute(){mapController.clear();$('routeMapStatus').textContent='Loading road routes…';}
 function selectPatient(id){if(!dashboard?.patients.some(patient=>patient.id===id)){toast('That booking is no longer active. Select a current trip.');if(!mapExpanded)openWorkspace('boardSection');return;}mapMode='selected';selectedId=id;automaticLeg=true;selectedLeg=legFor(selected());invalidateRoute();render(false);if(mapExpanded)$('selectedRoute').focus();else openWorkspace('detailsSection');}
 function renderCommon(){
  presentationGuide.update(dashboard,selected());
  document.body.dataset.severity=dashboard.severity;
  $('clock').textContent=dashboard.time;$('scenarioDate').textContent=dashboard.scenarioLabel;$('playPause').textContent=dashboard.paused?'Play':'Pause';$('speed').value=String(dashboard.speed);
  $('timeSlider').max=String(dashboard.endMinute||930);$('endClockLabel').textContent=dashboard.endLabel||'3:30 PM';if(document.activeElement!==$('timeSlider'))$('timeSlider').value=String(Math.round(dashboard.minute));
  $('connection').textContent='Demo connected · live updates';$('notice').textContent=dashboard.metrics.patients===0?'No active trips for this day. Book a demo trip or restore a cancelled booking.':dashboard.metrics.returned===dashboard.metrics.patients?'All scheduled transport handoffs are complete. Restart to replay this day.':'Database-backed demo trips · simulated vehicles, invoices and notifications · no real dispatch or outbound messages.';
  $('metricActive').textContent=dashboard.metrics.active;$('metricAway').textContent=dashboard.metrics.away;$('metricReturned').innerHTML=`${dashboard.metrics.returned}<span>/${dashboard.metrics.patients}</span>`;$('metricAlerts').textContent=dashboard.metrics.alerts;$('metricUnread').textContent=dashboard.metrics.unread?`${dashboard.metrics.unread} awaiting acknowledgment`:'No unacknowledged active alerts';$('inboxCount').textContent=dashboard.messages.length;
  $('alertBanner').hidden=!dashboard.alerts.length;
  $('alertHeading').textContent=dashboard.severity==='issue'?'Action required: reported trip issue':'Transport delay: revised ETA available';
  $('alertSummary').textContent=dashboard.alerts.map(alert=>`${alert.patient}: ${alert.title} · ETA ${alert.eta}${alert.acknowledged?' · acknowledged':''}`).join(' | ');
  $('acknowledge').disabled=busy||!dashboard.metrics.unread;
  $('metricPatients').textContent=dashboard.metrics.patients;$('metricMorning').textContent=dashboard.metrics.patients;$('summaryClock').textContent=dashboard.time;renderBookingChrome();
 }
 function render(notify=true){
  if(!dashboard)return;renderCommon();
  const patient=selected();if(!patient){renderEmptyManifest();return;}['selectedRoute','outboundRoute','returnRoute'].forEach(id=>$(id).disabled=false);if(selectedId!==patient.id){selectedId=patient.id;automaticLeg=true;}renderReturnEditor(patient);
  if(automaticLeg||patient.tripType==='ONE_WAY')selectedLeg=legFor(patient);$('returnRoute').disabled=patient.tripType==='ONE_WAY';
  const reset=lastRun!==dashboard.runId;
  if(reset){lastRun=dashboard.runId;knownMessages=new Set();}
  const newMessages=dashboard.messages.filter(message=>!knownMessages.has(message.id));
  if(notify&&!reset&&newMessages.length){const latest=newMessages[0];toast(`${latest.patient}: ${latest.title}`,latest.severity);}
  knownMessages=new Set(dashboard.messages.map(message=>message.id));
  $('patientRows').innerHTML=dashboard.patients.map(row=>`<tr data-patient="${esc(row.id)}" class="risk-${row.risk}${(mapMode==='selected'&&row.id===selectedId)?' selected':''}" aria-selected="${(mapMode==='selected'&&row.id===selectedId)}"><td><div class="patientCell"><span class="patientInitials">${row.initials}</span><div><strong>${esc(row.name)}</strong><small>${esc(row.service)} · FICTIONAL</small></div></div></td><td class="rowDestination"><strong>${esc(row.destination.name)}</strong><small>${esc(row.appointment)}</small></td><td class="rowTime">${row.pickupLabel}<small>Facility pickup</small></td><td class="rowTime">${row.appointmentLabel}</td><td class="rowTime">${row.returnLabel}<small>Back: ${row.returnArrivalLabel}</small></td><td><span class="statusPill ${row.risk}">${row.risk==='issue'?'ISSUE REPORTED':row.risk==='delay'?'DELAY / ETA UPDATED':esc(row.stage)}</span><small>${esc(row.phase==='complete'?'Handoff complete':`Next: ${row.etaLabel}`)}</small></td><td><button class="viewPatient" data-select="${esc(row.id)}" aria-label="View ${esc(row.name)} details and route">${(mapMode==='selected'&&row.id===selectedId)?'Viewing':'View trip'} →</button></td></tr>`).join('');
  $('selectedName').textContent=patient.name;$('selectedRisk').className=`statusPill ${patient.risk}`;$('selectedRisk').textContent=patient.risk==='issue'?'ISSUE REPORTED':patient.risk==='delay'?'DELAY · ETA REVISED':'ON PLAN';$('selectedStatus').textContent=`${patient.stage} · ${patient.phase==='complete'?patient.tripType==='ONE_WAY'?'Destination handoff complete':'Received at pickup location':`Next update / ETA: ${patient.etaLabel}`}`;
  $('patientFacts').innerHTML=[['Demo driver',patient.driver],['Demo vehicle',patient.unit],['Transport',patient.service],['Trip reference',patient.bookingRef||patient.id],['Itinerary',patient.tripType==='ONE_WAY'?'One way':'Round trip'],['Schedule basis',patient.scheduleBasis||'APPOINTMENT'],...(patient.stops?.length?[['Intermediate stops',patient.stops.map(stop=>stop.name+' — '+stop.address+' ('+stop.waitMinutes+' min wait)').join('; ')]]:[]),...(patient.notes?[['Transport notes',patient.notes]]:[]),...['patientContact','caregiverContact','destinationContact'].filter(key=>Object.values(patient[key]||{}).some(Boolean)).map(key=>[({patientContact:'Patient contact',caregiverContact:'Caregiver / family',destinationContact:'Destination contact'})[key],Object.values(patient[key]).filter(Boolean).join(' · ')]),...(patient.flight?.number?[['Flight coordination',[patient.flight.number,patient.flight.airportStop,patient.flight.terminal].filter(Boolean).join(' · ')]]:[])].map(([label,value])=>`<div class="fact"><small>${esc(label)}</small><strong>${esc(value)}</strong></div>`).join('');
  $('outboundPickup').textContent=patient.pickupLabel;$('appointmentTime').textContent=patient.appointmentLabel;$('appointmentType').textContent=patient.appointment;$('returnPickup').textContent=patient.returnLabel;$('backAtFacility').textContent=patient.returnArrivalLabel;
  $('patientAlerts').replaceChildren();dashboard.alerts.filter(alert=>alert.patientId===patient.id).forEach(alert=>{const card=document.createElement('div');card.className=`patientAlert ${alert.severity}`;card.textContent=`${alert.title}: ${alert.note} ETA ${alert.eta}.${alert.acknowledged?' Acknowledged by demo manager.':''}`;$('patientAlerts').append(card);});
  $('reportDelay').disabled=busy||patient.phase==='complete';$('reportIssue').disabled=busy||patient.phase==='complete';$('resolveIssue').disabled=busy||!dashboard.alerts.some(alert=>alert.patientId===patient.id);
  $('editBooking').disabled=busy;$('cancelBooking').disabled=busy;renderMessages();renderSources();if(!$('detailsSection').hidden&&$('routePanel').getClientRects().length)renderRoute(patient).catch(error=>{$('routeMapStatus').textContent=error.message;});
 }
 function renderMessages(){const messages=dashboard.messages.filter(message=>$('messageFilter').value==='all'||message.patientId===selectedId);const host=$('messages');const signature=messages.map(message=>message.id).join('|');if(host.dataset.signature===signature)return;host.dataset.signature=signature;host.innerHTML=messages.length?messages.map(message=>`<article class="message ${esc(message.severity)}"><span class="messageIcon">${message.severity==='issue'?'!':message.severity==='delay'?'↻':message.severity==='success'?'✓':'↗'}</span><div><div class="messageHead"><strong>${esc(message.patient)} · ${esc(message.title)}</strong><time>${esc(message.time)}</time></div><p>${esc(message.text)}</p><p class="recipients">To: ${message.recipients.map(esc).join(' · ')}</p><small>${esc(message.delivery)}</small></div></article>`).join(''):'<p class="emptyState">No trip events yet. Start the demo or move the presentation clock to watch manager notifications appear.</p>';}
 function renderSources(){if($('sourceList').children.length)return;[dashboard.facility,...(dashboard.bookingTargets||dashboard.patients.map(patient=>patient.destination))].forEach(location=>{const item=document.createElement('div'),name=document.createElement('strong'),address=document.createElement('p'),link=document.createElement('a');item.className='sourceItem';name.textContent=location.name;address.textContent=location.address;link.href=location.source;link.target='_blank';link.rel='noopener noreferrer';link.textContent='Official location reference ↗';item.append(name,address,link);$('sourceList').append(item);});}
 async function loadMaps(){if(mapsAuthFailed)throw Error('Road map unavailable. Select a patient to view full pickup and destination addresses.');if(window.google?.maps?.Map)return window.google.maps;if(!mapsPromise)mapsPromise=(async()=>{const response=await fetch('/api/integrations/config',{cache:'no-store'}),config=await response.json();if(!response.ok||!config.googleMapsEnabled||!config.googleMapsBrowserKey)throw Error('Road map unavailable. Select a patient to view full pickup and destination addresses.');await new Promise((resolve,reject)=>{const script=document.createElement('script');window.gm_authFailure=()=>{mapsAuthFailed=true;mapController.clear();$('routeMapStatus').textContent='Road map unavailable on this address. Select a patient to view full pickup and destination addresses.';reject(Error('Road map unavailable on this address.'));};const timer=setTimeout(()=>reject(Error('Road map could not load. Select a patient to view full pickup and destination addresses.')),15000);script.src=`https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(config.googleMapsBrowserKey)}&v=weekly`;script.onload=()=>{clearTimeout(timer);resolve();};script.onerror=()=>{clearTimeout(timer);reject(Error('Road map unavailable. Check your connection.'));};document.head.append(script);});return window.google.maps;})().catch(error=>{mapsPromise=null;throw error;});return mapsPromise;}
 function renderRoute(patient){
  const all=mapMode==='all',outbound=selectedLeg==='outbound',origin=outbound?(patient.origin||dashboard.facility):patient.destination,destination=outbound?patient.destination:(patient.origin||dashboard.facility);
  $('routeTitle').textContent=all?'All scheduled routes':patient.name+' · '+(outbound?'Outbound appointment leg':'Return to '+(patient.origin||dashboard.facility).name);
  $('allRoutes').setAttribute('aria-pressed',String(all));$('selectedRoute').setAttribute('aria-pressed',String(!all));
  $('routeLegControls').hidden=all;$('routeAddresses').hidden=all;$('routePatientList').hidden=!all;
  $('outboundRoute').setAttribute('aria-pressed',String(outbound));$('returnRoute').setAttribute('aria-pressed',String(!outbound));
  $('routeAName').textContent='A · '+(outbound?'Pickup':'Return pickup')+' — '+origin.name;$('routeAAddress').textContent=origin.address+(origin.suite?' · '+origin.suite:'');$('routeBName').textContent='B · '+(outbound?'Appointment destination':'Return destination')+' — '+destination.name;$('routeBAddress').textContent=destination.address+(destination.suite?' · '+destination.suite:'');
  $('routeLiveStatus').textContent=all?dashboard.scenarioLabel+' · '+dashboard.patients.length+' patients · dotted outbound and return routes · active alerts: '+dashboard.alerts.length:patient.driver+' · '+patient.unit+' · '+patient.stage+' · ETA '+patient.etaLabel+' · '+(patient.risk==='normal'?'On plan':patient.risk==='issue'?'Issue reported':'Delay reported');
  const host=$('routePatientList'),signature=JSON.stringify(dashboard.patients.map(row=>[row.id,row.name,row.stage,row.risk,row.pickupLabel,row.returnLabel]));if(host.dataset.signature!==signature){const focusId=host.contains(document.activeElement)?document.activeElement.closest('[data-map-patient]')?.dataset.mapPatient:null;host.dataset.signature=signature;host.innerHTML=dashboard.patients.map((row,index)=>'<button class="routePatientChoice" data-map-patient="'+esc(row.id)+'" aria-label="Show only '+esc(row.name)+' on map"><span class="routeColor" style="--route-color:'+NexusFacilityMap.COLORS[index]+'">'+(index+1)+'</span><span><strong>'+esc(row.name)+'</strong><small>'+esc((row.risk==='normal'?'':row.risk.toUpperCase()+' · ')+row.stage)+' · pickup '+row.pickupLabel+' / return '+row.returnLabel+'</small></span></button>').join('');if(focusId)[...host.querySelectorAll('[data-map-patient]')].find(button=>button.dataset.mapPatient===focusId)?.focus();}
  return mapController.show({date:dashboard.scenarioDate,facility:dashboard.facility,patients:dashboard.patients,mode:mapMode,selectedId,leg:selectedLeg});
 }
 function setMapExpanded(expanded){
  const panel=$('routePanel');if(expanded===mapExpanded)return;mapExpanded=expanded;
  if(expanded){mapReturnFocus=document.activeElement;panel.classList.add('mapExpanded');panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');panel.setAttribute('aria-label','Facility route map');document.body.classList.add('mapIsExpanded');mapInert=[...document.querySelectorAll('.facilitySiteHeader,.facilitySiteFooter,.sidebar,main>header,main>section:not(#detailsSection),main>details,main>p,main>footer,#workspaceCanvas>#boardSection,#workspaceCanvas>#cancelledBookingsSection,#workspaceCanvas>#inboxSection,#workspaceCanvas>#billingSection,#detailsSection>.patientPanel')].map(element=>({element,inert:element.inert}));mapInert.forEach(({element})=>element.inert=true);}
  else{panel.classList.remove('mapExpanded');panel.removeAttribute('role');panel.removeAttribute('aria-modal');panel.removeAttribute('aria-label');document.body.classList.remove('mapIsExpanded');mapInert.forEach(({element,inert})=>element.inert=inert);mapInert=[];}
  $('expandRouteMap').textContent=expanded?'Close full-page map':'Expand map';$('expandRouteMap').setAttribute('aria-expanded',String(expanded));
  if(expanded)$('expandRouteMap').focus();else mapReturnFocus?.focus();requestAnimationFrame(()=>mapController.resize());
 }
 $('allRoutes').addEventListener('click',()=>{mapMode='all';invalidateRoute();render(false);});
 $('selectedRoute').addEventListener('click',()=>{mapMode='selected';invalidateRoute();render(false);});
 $('routePatientList').addEventListener('click',event=>{const button=event.target.closest('[data-map-patient]');if(button)selectPatient(button.dataset.mapPatient);});
 $('refreshRoutes').addEventListener('click',()=>{mapController.retry();render(false);});
 $('expandRouteMap').addEventListener('click',()=>setMapExpanded(!mapExpanded));
 document.addEventListener('keydown',event=>{if(!mapExpanded)return;if(event.key==='Escape'){event.preventDefault();setMapExpanded(false);}if(event.key==='Tab'){const items=[...$('routePanel').querySelectorAll('button,a,input,select,[tabindex]')].filter(item=>!item.disabled&&item.getAttribute('tabindex')!=='-1'&&item.getClientRects().length),first=items[0],last=items.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}}});
 async function action(action,extra={}){if(busy)return false;const requestToken=demoToken();busy=true;lastActionError='';if(dashboard)render(false);try{const data=await api('control',{method:'POST',body:JSON.stringify({action,date:dashboard?.scenarioDate,...extra})});if(requestToken===demoToken()&&dashboard){if(action==='returnSchedule')returnEditDirty=false;if(['book','editBooking'].includes(action))selectedId=data.dashboard.lastBookingId||selectedId;if(['book','editBooking','cancelBooking','restoreBooking'].includes(action)){billingRevision++;billingLoadedAt=0;}showDashboard(data);return true;}return false;}catch(error){lastActionError=error.message;toast(error.message,'issue');if(error.status===401){sessionStorage.removeItem(TOKEN_KEY);showLogin(error.message);}return false;}finally{busy=false;if(dashboard)render(false);}}
 $('demoDay').addEventListener('change',event=>action('date',{date:event.target.value}));
 $('returnWaitHours').addEventListener('change',()=>{returnEditDirty=true;const hours=Number($('returnWaitHours').value);if([1,2,3].includes(hours))$('returnPickupTime').value=localTime(selected().appointmentAt+hours*60);});
 $('returnPickupTime').addEventListener('input',()=>{returnEditDirty=true;$('returnWaitHours').value='custom';});
 $('vehicleWaiting').addEventListener('change',()=>{returnEditDirty=true;});
 $('returnScheduleForm').addEventListener('submit',async event=>{event.preventDefault();const saved=await action('returnSchedule',{patientId:selectedId,returnTime:$('returnPickupTime').value,vehicleWaiting:$('vehicleWaiting').checked});if(saved){$('returnScheduleNotice').textContent='Return pickup saved. Timeline, notifications and daily invoice updated.';toast('Return pickup saved and invoice recalculated.','success');}});
 $('downloadCredentials').addEventListener('click',()=>{const content='NEXUS — FUTURECARE ANNAPOLIS PRESENTATION DEMO\n\nURL: '+location.origin+'/facility-demo.html\nDemo manager email: '+$('issuedEmail').value+'\nDemo password: '+$('issuedPassword').value+'\n\nThis access is restricted to fictional demo data. No real patient records or outbound messages.\n';const url=URL.createObjectURL(new Blob([content],{type:'text/plain'}));const link=document.createElement('a');link.href=url;link.download='FutureCare-Annapolis-Demo-Login.txt';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
 function setPasswordVisible(visible){$('loginPassword').type=visible?'text':'password';$('toggleLoginPassword').textContent=visible?'Hide password':'Show password';$('toggleLoginPassword').setAttribute('aria-pressed',String(visible));}
 $('toggleLoginPassword').addEventListener('click',()=>setPasswordVisible($('loginPassword').type==='password'));

 $('forgotDemoPassword').addEventListener('click',async()=>{
  if(!$('loginEmail').reportValidity())return;
  const button=$('forgotDemoPassword');button.disabled=true;$('loginNotice').textContent='Requesting a reset link…';
  try{const response=await fetch('/api/auth/forgot-password',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:$('loginEmail').value.trim()})}),data=await response.json();if(!response.ok)throw Error(data.error||'Unable to request a reset link.');$('loginNotice').textContent=data.message;}
  catch(error){$('loginNotice').textContent=error.message;}finally{button.disabled=false;}
 });
 function closeRecovery(message=''){recoveryToken='';$('demoResetPassword').value='';$('demoConfirmPassword').value='';$('demoResetForm').hidden=true;$('loginForm').hidden=false;showLogin(message);}
 $('cancelDemoReset').addEventListener('click',()=>closeRecovery());
 $('toggleResetPassword').addEventListener('click',()=>{const visible=$('demoResetPassword').type==='password';['demoResetPassword','demoConfirmPassword'].forEach(id=>$(id).type=visible?'text':'password');$('toggleResetPassword').textContent=visible?'Hide passwords':'Show passwords';$('toggleResetPassword').setAttribute('aria-pressed',String(visible));});
 $('demoResetForm').addEventListener('submit',async event=>{
  event.preventDefault();const button=$('saveDemoReset'),password=$('demoResetPassword').value;
  if(password!==$('demoConfirmPassword').value){$('demoResetNotice').textContent='The passwords do not match.';return;}
  button.disabled=true;$('demoResetNotice').textContent='Updating password…';
  try{const response=await fetch('/api/auth/reset-password',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({token:recoveryToken,newPassword:password})}),data=await response.json();if(!response.ok)throw Error(data.error||'Unable to reset the password.');sessionStorage.removeItem(TOKEN_KEY);closeRecovery(data.message+' Use your new password below.');}
  catch(error){$('demoResetNotice').textContent=error.message;}finally{button.disabled=false;}
 });
 $('loginForm').addEventListener('submit',async event=>{event.preventDefault();$('loginButton').disabled=true;$('loginNotice').textContent='Signing in…';try{let data;
   const email=$('loginEmail').value.trim().toLowerCase(),password=$('loginPassword').value;
   if(email==='annapolis.demo@nexusmt.com'){
    data=await api('login',{method:'POST',body:JSON.stringify({email,password})});sessionStorage.setItem(TOKEN_KEY,data.token);
   }else{
    const response=await fetch('/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email,password})}),login=await response.json();
    if(!response.ok||!login.token)throw Error(login.error||'Sign-in failed.');
    if(login.user?.mustChangePassword)throw Error('Use Staff / administrator sign-in to complete your required password change first.');
    const state=await fetch('/api/facility-demo/state',{headers:{authorization:`Bearer ${login.token}`},cache:'no-store'});data=await state.json();
    if(!state.ok)throw Error('This account does not have facility demo access.');
    sessionStorage.setItem('nexusAccessToken',login.token);sessionStorage.setItem('nexusUser',JSON.stringify(login.user));sessionStorage.removeItem(TOKEN_KEY);platformAccess=true;
   }setPasswordVisible(false);$('loginPassword').value='';showDashboard(data);}catch(error){$('loginNotice').textContent=error.message;}finally{$('loginButton').disabled=false;}});
 $('prepareDemo').addEventListener('click',async()=>{$('prepareDemo').disabled=true;try{const data=await api('setup',{method:'POST',body:'{}'});$('loginNotice').textContent=data.message;if(data.password){$('issuedEmail').value=data.username;$('issuedPassword').value=data.password;$('credentials').hidden=false;$('loginEmail').value=data.username;$('loginPassword').value=data.password;}}catch(error){$('loginNotice').textContent=error.message;}finally{$('prepareDemo').disabled=false;}});
 $('restart').addEventListener('click',()=>action('restart'));$('playPause').addEventListener('click',()=>action(dashboard?.paused?'play':'pause'));$('speed').addEventListener('change',()=>action('speed',{speed:Number($('speed').value)}));$('timeSlider').addEventListener('change',()=>action('seek',{minute:Number($('timeSlider').value)}));
 document.querySelectorAll('[data-minute]').forEach(button=>button.addEventListener('click',()=>action('seek',{minute:Number(button.dataset.minute)})));
 $('patientRows').addEventListener('click',event=>{const row=event.target.closest('[data-patient]');if(row)selectPatient(row.dataset.patient);});
 $('reportDelay').addEventListener('click',()=>action('delay',{patientId:selectedId}));$('reportIssue').addEventListener('click',()=>action('issue',{patientId:selectedId}));$('resolveIssue').addEventListener('click',()=>action('resolve',{patientId:selectedId}));$('acknowledge').addEventListener('click',()=>action('ack'));
 $('messageFilter').addEventListener('change',renderMessages);
 $('outboundRoute').addEventListener('click',()=>{mapMode='selected';selectedLeg='outbound';automaticLeg=false;invalidateRoute();render(false);});$('returnRoute').addEventListener('click',()=>{mapMode='selected';selectedLeg='return';automaticLeg=false;invalidateRoute();render(false);});
 document.querySelectorAll('[data-scroll]').forEach(button=>button.addEventListener('click',()=>$(button.dataset.scroll).scrollIntoView({behavior:'smooth'})));
 $('sourcesButton').addEventListener('click',()=>$('sourcesDialog').showModal());$('closeSources').addEventListener('click',()=>$('sourcesDialog').close());
 $('fullscreen').addEventListener('click',async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch{toast('Full-screen mode is unavailable in this browser.');}});
 $('logout').addEventListener('click',async()=>{
  const token=sessionStorage.getItem('nexusAccessToken');
  sessionStorage.removeItem(TOKEN_KEY);sessionStorage.removeItem('nexusAccessToken');sessionStorage.removeItem('nexusUser');
  dashboard=null;admin=false;platformAccess=false;$('prepareDemo').hidden=true;$('credentials').hidden=true;$('loginPassword').value='';
  showLogin('Logged out.');
  if(token){try{const response=await fetch('/api/auth/logout',{method:'POST',headers:{authorization:`Bearer ${token}`},signal:AbortSignal.timeout(10000)});if(!response.ok)throw Error('Logout request failed');}catch{if(!dashboard)$('loginNotice').textContent='Logged out on this device.';}}
 });
 setInterval(async()=>{if(polling||busy||$('dashboard').hidden)return;const requestToken=demoToken();polling=true;try{const data=await api('state');if(requestToken===demoToken()&&dashboard)showDashboard(data);}catch(error){$('connection').textContent='Connection interrupted · retrying';if(error.status===401){sessionStorage.removeItem(TOKEN_KEY);showLogin(error.message);}}finally{polling=false;}},2000);

 function openWorkspace(id){
  workspace=['overview','boardSection','routePanel','detailsSection','inboxSection','billingSection'].includes(id)?id:'overview';$('workspaceCanvas').classList.toggle('overviewGrid',workspace==='overview');
  $('boardSection').hidden=!['overview','boardSection'].includes(workspace);$('cancelledBookingsSection').hidden=!['overview','boardSection'].includes(workspace);$('detailsSection').hidden=!['overview','routePanel','detailsSection'].includes(workspace);$('selectedPatientPanel').hidden=['overview','routePanel'].includes(workspace);$('detailsSection').classList.toggle('routesOnly',['overview','routePanel'].includes(workspace));$('inboxSection').hidden=workspace!=='inboxSection';$('billingSection').hidden=workspace!=='billingSection';
  document.querySelectorAll('#facilityWorkspaceNav [data-workspace]').forEach(button=>button.setAttribute('aria-current',button.dataset.workspace===(workspace==='detailsSection'?'boardSection':workspace)?'page':'false'));
  $('facilityWorkspaceNav').classList.remove('navOpen');$('workspaceNavToggle').setAttribute('aria-expanded','false');if(['overview','routePanel'].includes(workspace)){mapMode='all';invalidateRoute();}if(dashboard)render(false);if(workspace==='billingSection')loadBilling(true);requestAnimationFrame(()=>mapController.resize());
 }
 function renderBookingChrome(){
  const count=dashboard.patients.length,capacity=count+'/5 daily bookings. '+(count===5?'Edit or cancel a booking to free a slot.':'An open slot is available for a demo booking.');$('capacityNotice').textContent=capacity;
  const cancelled=dashboard.cancelledBookings||[],host=$('cancelledBookingRows'),signature=JSON.stringify([cancelled,busy]);$('cancelledCount').textContent=cancelled.length;
  if(host.dataset.signature!==signature){host.dataset.signature=signature;host.innerHTML=cancelled.length?cancelled.map(row=>'<div class="cancelledBooking"><div><strong>'+esc(row.name)+'</strong><small>'+esc(row.service)+' · '+esc(row.destination)+' · original pickup '+esc(row.pickup)+'</small></div><button class="secondary" data-restore="'+esc(row.id)+'" '+(busy||count>=5?'disabled':'')+'>Restore trip</button></div>').join(''):'<p class="emptyState">No cancelled trips for this day.</p>';}
  if($('bookingDialog').open){const editing=!!$('bookingPatientId').value,stale=$('bookingDate').value!==dashboard.scenarioDate;$('bookingCapacity').textContent=stale?'The selected service day changed. Close this form and reopen it.':capacity;$('saveBooking').disabled=busy||stale||(!editing&&count>=5);}
 }
 function renderEmptyManifest(){
  selectedId='';$('patientRows').innerHTML='<tr><td colspan="7" class="emptyState">No active trips. Use Book demo trip to schedule a resident, or restore a cancelled booking below.</td></tr>';
  $('selectedName').textContent='No patient selected';$('selectedStatus').textContent='Book or restore a trip to view patient details.';['patientFacts','patientAlerts'].forEach(id=>$(id).replaceChildren());['reportDelay','reportIssue','resolveIssue','editBooking','cancelBooking','saveReturnSchedule','selectedRoute','outboundRoute','returnRoute'].forEach(id=>$(id).disabled=true);
  $('routePatientList').replaceChildren();$('routePatientList').hidden=true;$('routeAddresses').hidden=true;$('routeLegControls').hidden=true;$('routeAttribution').textContent='';['outboundPickup','appointmentTime','appointmentType','returnPickup','backAtFacility','routeAName','routeAAddress','routeBName','routeBAddress'].forEach(id=>$(id).textContent='—');$('routeTitle').textContent='No active scheduled routes';$('routeMapStatus').textContent='No active routes for this day. Book or restore a demo trip.';$('routeLiveStatus').textContent=dashboard.scenarioLabel;mapController.clear();renderMessages();renderSources();
 }
 const bookingEditor=NexusFacilityBooking.create({api,action,getDashboard:()=>dashboard,selected,selectPatient,toast,esc,localTime,getError:()=>lastActionError,renderBookingChrome});
 function openBooking(patient=null){return bookingEditor.open(patient);}
 document.querySelectorAll('[data-workspace]').forEach(button=>button.addEventListener('click',()=>openWorkspace(button.dataset.workspace)));
 $('workspaceNavToggle').addEventListener('click',()=>{const open=$('facilityWorkspaceNav').classList.toggle('navOpen');$('workspaceNavToggle').setAttribute('aria-expanded',String(open));});
 $('newBooking').addEventListener('click',()=>openBooking());$('bookFromBoard').addEventListener('click',()=>openBooking());$('editBooking').addEventListener('click',()=>openBooking(selected()));
 $('cancelBooking').addEventListener('click',async()=>{const patient=selected();if(patient&&await action('cancelBooking',{patientId:patient.id})){openWorkspace('boardSection');toast('Demo trip cancelled. A booking slot is available; the invoice and simulated alerts are updated.','success');}});
 $('cancelledBookingRows').addEventListener('click',async event=>{const button=event.target.closest('[data-restore]');if(button&&await action('restoreBooking',{patientId:button.dataset.restore}))toast('Demo trip restored; invoice and simulated alerts updated.','success');});
 openWorkspace('overview');

 (async()=>{
  if(recoveryToken){$('loginForm').hidden=true;$('demoResetForm').hidden=false;$('demoResetPassword').focus();return;}
  const token=demoToken(),nexusToken=sessionStorage.getItem('nexusAccessToken');
  if(nexusToken){try{
   const headers={authorization:`Bearer ${nexusToken}`,'content-type':'application/json'};
   let response=await fetch('/api/auth/me',{headers,cache:'no-store'}),data=await response.json();
   if(response.ok&&(data.user?.role==='ADMIN'||data.user?.roles?.includes('ADMIN'))){
    if(data.user.role!=='ADMIN'){
     response=await fetch('/api/auth/switch-role',{method:'POST',headers,body:JSON.stringify({role:'ADMIN'})});data=await response.json();
     if(!response.ok||data.user?.role!=='ADMIN')throw Error('Unable to open administrator experience.');
    }
    sessionStorage.setItem('nexusUser',JSON.stringify(data.user));admin=true;platformAccess=true;sessionStorage.removeItem(TOKEN_KEY);$('prepareDemo').hidden=false;
    try{showDashboard(await api('state'));}catch(error){showLogin(error.message);}return;
   }
   if(response.ok&&data.user){
    const email=String(data.user.email||'').toLowerCase();
    if((email==='facility@nexusmt.com'&&data.user.role==='FACILITY')||(email==='dispatch@nexusmt.com'&&data.user.role==='DISPATCHER')){
     platformAccess=true;sessionStorage.setItem('nexusUser',JSON.stringify(data.user));sessionStorage.removeItem(TOKEN_KEY);
     try{showDashboard(await api('state'));}catch(error){platformAccess=false;showLogin(error.message);}return;
    }
   }
  }catch{}}

  if(token){try{showDashboard(await api('state'));}catch(error){sessionStorage.removeItem(TOKEN_KEY);showLogin(error.message);}}
 })();
})();
