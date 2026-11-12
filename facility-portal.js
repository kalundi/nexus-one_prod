(()=>{'use strict';
 const $=id=>document.getElementById(id),esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 let facility='',context=null,trips=[],summary=null,locations=[],page=0,hasMore=false,view='board',revision=0,loading=false,active=false,conversationVersion=0,conversationBusy=false,sending=false,selectedMessage='',selectedRoute='',mapsPromise=null,map=null,renderer=null,mapVersion=0,lastRoute='',lastMessageSignature='',pendingLocation='',request=null;
 const drafts=new Map();
 const token=()=>sessionStorage.getItem('nexusAccessToken')||'';
 const category=status=>{const s=String(status||'').toUpperCase();return ['COMPLETED','DELIVERED','BILLED','PAID'].includes(s)?'complete':['CANCELLED','NO_SHOW','MISSED','DENIED'].includes(s)?'cancelled':['EN_ROUTE','ARRIVED','ARRIVED_PICKUP','PATIENT_ON_BOARD','IN_TRANSIT','DEPARTED','ARRIVED_DESTINATION'].includes(s)?'active':'pending';};
 const label=value=>String(value||'Pending').replaceAll('_',' ').toLowerCase().replace(/\b\w/g,c=>c.toUpperCase());
 const date=value=>typeof value==='string'?value.slice(0,10):'';
 const time=value=>String(value||'').slice(0,5)||'Not set';
 const timestamp=value=>value?new Date(value).toLocaleString('en-US',{timeZone:'America/New_York',dateStyle:'medium',timeStyle:'short'})+' ET':'';
 function notice(text,error=false){$('notice').textContent=text;$('notice').classList.toggle('error',error);}
 let selected=[],timeframe='day',calendarMonth='',pickerYear=0,calendarOpen=false,selectionDirty=false,focusDay='';
 function todayRange(){const range=window.NexusFacilityRange,today=context?.today||'';if(!range||!today)return null;const resolved=range.rangeFor(today,timeframe);return resolved?{anchor:today,...resolved}:null;}
 function seedSelection(){const initial=todayRange();selected=initial?[initial]:[];focusDay=initial?initial.anchor:'';}
 function renderRange(){
  const range=window.NexusFacilityRange;
  if(!range){$('serviceDateButton').textContent='';$('serviceRange').textContent='';return;}
  // The Service Date control speaks in the chosen timeframe's own unit:
  // days list their dates; a week, month, quarter or year names its span.
  // Several picked periods keep the first span on the button and count
  // the rest; the line under the filter always words the whole union.
  if(timeframe==='day'||selected.length<=1)$('serviceDateButton').textContent=timeframe==='day'?range.describeDates(selected.map(entry=>entry.anchor)):range.selectionSummary(selected);
  else{const sorted=[...selected].sort((a,b)=>a.from<b.from?-1:1);$('serviceDateButton').textContent=range.selectionSummary([sorted[0]])+' +'+(sorted.length-1)+' more';}
  $('serviceRange').textContent=range.selectionSummary(selected);
 }
 function renderCalendar(){
  const range=window.NexusFacilityRange,grid=$('calGrid');if(!range||!grid)return;
  const today=context?.today||'';
  // Rebuilding the grid replaces the pick buttons, so remember which one
  // held focus and hand it back afterwards: a keyboard manager toggling
  // periods must not lose their place to the page body. Every pick
  // control carries data-anchor (its period's first day); day cells also
  // keep data-date.
  const active=document.activeElement,focusAnchor=active&&grid.contains(active)?(active.dataset?.anchor||active.dataset?.date||''):'';
  const weekdays=$('calWeekdays'),isPicked=resolved=>Boolean(resolved)&&selected.some(entry=>range.sameRange(entry,resolved));
  let head='';
  if(timeframe==='month'||timeframe==='quarter'){
   // The picker shows the timeframe's own unit: the months or the
   // quarters of one year, and the arrows page years.
   if(!pickerYear)pickerYear=Number((focusDay||selected[0]?.from||today).slice(0,4))||2026;
   head=String(pickerYear);if(weekdays)weekdays.hidden=true;
   const items=timeframe==='month'?range.monthsOfYear(pickerYear):range.quartersOfYear(pickerYear);
   if(!items)return;
   grid.innerHTML='<div class="calPeriods '+timeframe+'s">'+items.map(item=>{
    const resolved=range.rangeFor(item.anchor,timeframe),picked=isPicked(resolved);
    const aria=timeframe==='month'?item.name+' '+pickerYear:resolved.label;
    return '<button type="button" class="calPeriod'+(picked?' selected':'')+'" data-anchor="'+item.anchor+'" aria-pressed="'+picked+'" aria-label="'+aria+'"><strong>'+item.label+'</strong>'+(item.span?'<span>'+item.span+'</span>':'')+'</button>';
   }).join('')+'</div>';
  }else if(timeframe==='year'){
   if(!pickerYear)pickerYear=Number((focusDay||selected[0]?.from||today).slice(0,4))||2026;
   const win=range.yearWindow(pickerYear);if(!win)return;
   head=win.label;if(weekdays)weekdays.hidden=true;
   grid.innerHTML='<div class="calPeriods years">'+win.years.map(year=>{
    const anchor=year+'-01-01',resolved=range.rangeFor(anchor,'year'),picked=isPicked(resolved);
    return '<button type="button" class="calPeriod'+(picked?' selected':'')+'" data-anchor="'+anchor+'" aria-pressed="'+picked+'" aria-label="'+year+'"><strong>'+year+'</strong></button>';
   }).join('')+'</div>';
  }else{
   if(weekdays)weekdays.hidden=false;
   if(!calendarMonth)calendarMonth=(focusDay||today).slice(0,7);
   const parts=calendarMonth.split('-').map(Number),view=range.monthGrid(parts[0],parts[1]-1);
   if(!view)return;
   head=view.label;
   if(timeframe==='week'){
    // A week is picked as one unit: each row of the month grid is a
    // single toggle for its Sunday–Saturday span.
    grid.innerHTML=view.weeks.map(week=>{
     const first=week.find(Boolean);if(!first)return '<div class="calWeek">'+week.map(()=>'<span class="calBlank" aria-hidden="true"></span>').join('')+'</div>';
     const resolved=range.rangeFor(first.date,'week'),picked=isPicked(resolved);
     const cells=week.map(cell=>cell?'<span class="calDayNum'+(cell.date===today?' today':'')+'">'+cell.day+'</span>':'<span class="calDayNum blank" aria-hidden="true"></span>').join('');
     return '<button type="button" class="calWeekRow'+(picked?' selected':'')+'" data-anchor="'+resolved.from+'" aria-pressed="'+picked+'" aria-label="Week of '+resolved.label+'">'+cells+'</button>';
    }).join('');
   }else{
    grid.innerHTML=view.weeks.map(week=>'<div class="calWeek">'+week.map(cell=>{
     if(!cell)return '<span class="calBlank" aria-hidden="true"></span>';
     const isSelected=range.dateInRanges(selected,cell.date),isToday=cell.date===today;
     const aria=range.fullDateLabel(cell.date)+(isToday?', today':'');
     return '<button type="button" class="calDay'+(isSelected?' selected':'')+(isToday?' today':'')+'" data-date="'+cell.date+'" data-anchor="'+cell.date+'" aria-pressed="'+isSelected+'" aria-label="'+aria+'">'+cell.day+'</button>';
    }).join('')+'</div>').join('');
   }
  }
  $('calMonth').textContent=head;
  const step=timeframe==='day'||timeframe==='week'?'month':timeframe==='year'?'years':'year';
  $('calPrev').setAttribute('aria-label','Previous '+step);$('calNext').setAttribute('aria-label','Next '+step);
  if(focusAnchor)grid.querySelector('[data-anchor="'+focusAnchor+'"]')?.focus();
 }
 // The calendar is a pop-up: hidden (and taking no layout space) until the
 // Service Date control opens it. Days are toggles, so the pop-up stays
 // open while the manager picks; it closes on Done, the control being
 // clicked again, Escape, or a click anywhere outside it, and closing
 // applies the picked ranges and reloads the board.
 function setCalendarOpen(open){
  calendarOpen=open;$('serviceCalendarPop').hidden=!open;$('serviceDateButton').setAttribute('aria-expanded',String(open));
  if(open){const anchor=focusDay||selected[0]?.from||context?.today||'';calendarMonth=anchor.slice(0,7);pickerYear=Number(anchor.slice(0,4))||pickerYear;renderCalendar();}
 }
 function closeCalendar(refocus=false){
  if(!calendarOpen)return;
  setCalendarOpen(false);if(refocus)$('serviceDateButton').focus();
  if(selectionDirty){selectionDirty=false;rangeChanged();}
 }
 function rangeChanged(){revision++;page=0;trips=[];summary=null;renderRange();renderTrips();clearMap();refresh();}
 function toggleDate(day){
  const range=window.NexusFacilityRange;if(!range||!day)return;
  const resolved=range.rangeFor(day,timeframe);if(!resolved)return;
  selected=range.toggleRange(selected,{anchor:day,...resolved});
  // The board always carries a filter: toggling the last range off
  // reseeds today's range for the current timeframe instead of emptying.
  if(!selected.length)seedSelection();else focusDay=day;
  selectionDirty=true;calendarMonth=day.slice(0,7);
  renderRange();renderCalendar();
 }
 function shiftMonth(delta){
  const parts=calendarMonth.split('-').map(Number);if(parts.length!==2||!parts[0])return;
  calendarMonth=new Date(Date.UTC(parts[0],parts[1]-1+delta,1)).toISOString().slice(0,7);renderCalendar();
 }
 // The pop-up's arrows page by the unit on show: months for the day and
 // week grids, years for the month and quarter grids, twelve years for
 // the year grid.
 function shiftPicker(delta){
  if(timeframe==='month'||timeframe==='quarter'){pickerYear+=delta;renderCalendar();return;}
  if(timeframe==='year'){pickerYear+=delta*12;renderCalendar();return;}
  shiftMonth(delta);
 }
 function clearMap(){mapVersion++;lastRoute='';if(renderer)renderer.setMap(null);renderer=null;map=null;$('routeMap').replaceChildren();$('mapAttribution').textContent='';}
 function clearPrivate(){revision++;conversationVersion++;trips=[];summary=null;locations=[];drafts.clear();request=null;selectedMessage='';selectedRoute='';pendingLocation='';if($('bookingDialog').open)$('bookingDialog').close();clearMap();['tripRows','locationList','messages','tripActivity','routeTrip','messageTrip'].forEach(id=>$(id).replaceChildren());$('messageText').value='';$('routeDetails').textContent='';$('directionsLink').hidden=true;$('facilityBookingFrame').src='about:blank';$('facilityBookingFrame').hidden=true;}
 async function api(path,options={}){
  const session=token();if(!session)throw Error('Sign in to continue.');
  const url=new URL('/api/facility-portal/'+path,location.origin);if(facility)url.searchParams.set('facility',facility);
  const response=await fetch(url,{...options,headers:{authorization:'Bearer '+session,'content-type':'application/json'},cache:'no-store',signal:AbortSignal.timeout(20000)});
  const data=await response.json();if(!response.ok){if(response.status===401||response.status===403){active=false;clearPrivate();notice('Your access has expired or changed. Sign in again.',true);}throw Error(data.error||'The facility service is unavailable.');}if(session!==token())throw Error('Your session changed. Refresh the portal.');return data;
 }
 function filtered(){const search=$('tripSearch').value.trim().toLowerCase(),status=$('statusFilter').value;return trips.filter(t=>(!status||category(t.status)===status)&&(!search||[t.name,t.reference,t.pickup,t.destination].some(v=>String(v||'').toLowerCase().includes(search))));}
 function renderTrips(){
  const rows=filtered(),counts=summary||{total:trips.length,pending:trips.filter(t=>category(t.status)==='pending').length,active:trips.filter(t=>category(t.status)==='active').length,complete:trips.filter(t=>category(t.status)==='complete').length};$('tripCount').textContent=counts.total;for(const kind of ['pending','active','complete'])$(kind+'Count').textContent=counts[kind];
  $('unreadCount').textContent=trips.reduce((sum,t)=>sum+Number(t.unread||0),0)||'';
  $('tripSummary').textContent=rows.length+' matching trips on this page. Outbound and return schedules are shown together. Status reflects the shared dispatch record.';
  $('tripRows').innerHTML=rows.length?rows.map(t=>`<tr><td><strong>${esc(t.name||'Passenger')}</strong><small>${esc(t.reference)}</small><small>${esc(label(t.service))}</small></td><td>${esc(date(t.trip_date))} · ${esc(time(t.trip_time))}<small>Appointment: ${esc(time(t.appointment_time))}</small>${t.return_trip_time?`<small>Return: ${esc(date(t.return_trip_date)||date(t.trip_date))} · ${esc(time(t.return_trip_time))}</small>`:''}</td><td>${esc(t.pickup)}<br>→ ${esc(t.destination)}</td><td><span class="badge ${category(t.status)}">${esc(label(t.status))}</span><small>${esc(label(t.payment_status))}</small></td><td>${esc(t.driver_name||'Awaiting assignment')}<small>${esc(t.vehicle_unit||'Vehicle not assigned')}</small></td><td><button data-route="${esc(t.reference)}">Route</button><button data-message="${esc(t.reference)}">Messages${t.unread?' ('+Number(t.unread)+')':''}</button></td></tr>`).join(''):'<tr><td colspan="6">No trips match the selected dates or filter. Book a Ride to arrange transportation.</td></tr>';
  $('previousPage').disabled=page===0;$('nextPage').disabled=!hasMore;$('pageLabel').textContent='Page '+(page+1)+(hasMore?' · more trips available':'');
  for(const id of ['routeTrip','messageTrip']){const selected=id==='routeTrip'?selectedRoute:selectedMessage,select=$(id),value=trips.some(t=>t.reference===selected)?selected:trips[0]?.reference||'';select.innerHTML=trips.length?trips.map(t=>`<option value="${esc(t.reference)}">${esc(t.name||'Passenger')} · ${esc(t.reference)}</option>`).join(''):'<option value="">No trips for these dates</option>';select.value=value;if(id==='routeTrip')selectedRoute=value;else if(selectedMessage!==value)setConversation(value);}
 }
 function setConversation(reference){if(selectedMessage)drafts.set(selectedMessage,$('messageText').value);selectedMessage=reference;conversationVersion++;lastMessageSignature='';$('messages').replaceChildren();$('tripActivity').replaceChildren();$('messageText').value=drafts.get(reference)||'';$('messageStatus').textContent='';request=null;}
 function configureBooking(){
  const frame=$('facilityBookingFrame'),url=new URL('/booking-app.html',location.origin);url.searchParams.set('facility',facility);url.searchParams.set('facilityPortal','1');url.searchParams.set('productionFacilityPortal','1');
  const returned=new URLSearchParams(location.search);if(['success','cancelled'].includes(returned.get('payment'))&&returned.get('bookingReference')){url.searchParams.set('payment',returned.get('payment'));url.searchParams.set('bookingReference',returned.get('bookingReference'));}
  if(frame.dataset.facility!==facility){frame.dataset.facility=facility;frame.src=url.pathname+url.search;frame.hidden=false;$('facilityBookingStatus').textContent='';}
 }
 async function refresh(){
  if(!active||loading||!facility)return;loading=true;const version=revision,session=token(),currentFacility=facility;
  $('refresh').disabled=true;
  try{const range=window.NexusFacilityRange;const query={ranges:range?range.rangesParam(selected):'',page:String(page)};const data=await api('trips?'+new URLSearchParams(query));if(version!==revision||session!==token()||currentFacility!==facility)return;trips=data.trips;hasMore=data.hasMore;summary=data.summary||null;renderTrips();notice('Updated '+timestamp(data.updatedAt)+'. Refreshes automatically while this portal is open.');if(view==='routes')renderRoute();if(view==='communications')loadConversation();if(view==='locations')loadLocations();}
  catch(error){if(version===revision)notice('Refresh failed: '+error.message+' Previously loaded information may be out of date.',true);}
  finally{loading=false;$('refresh').disabled=false;if(version!==revision&&active)refresh();}
 }
 function openBooking(){if(!active||!facility){notice('Sign in with your assigned facility before booking.',true);return;}$('bookingFacilityName').textContent=context.facilities.find(f=>f.id===facility)?.name||'';configureBooking();if(!$('bookingDialog').open)$('bookingDialog').showModal();}
 function openView(next){if(next==='booking'){openBooking();return;}if(view==='routes'&&next!=='routes')clearMap();view=next;['board','routes','communications','locations'].forEach(v=>$(v+'View').hidden=v!==view);document.querySelectorAll('.portal nav [data-view]').forEach(button=>button.setAttribute('aria-current',button.dataset.view===view?'page':'false'));$('viewTitle').textContent={board:'Trip board',routes:'Routes',communications:'Communications',locations:'Locations'}[view];['searchLabel','statusLabel'].forEach(id=>$(id).hidden=view!=='board');if(view==='routes')renderRoute();if(view==='communications')loadConversation();if(view==='locations')loadLocations();}
 async function loadLocations(){const version=revision;try{const data=await api('locations');if(version!==revision||!active)return;locations=data.locations;$('locationBasis').textContent=data.basis;renderLocations();$('locationStatus').textContent=locations.length?'Top '+locations.length+' locations, ranked by completed bookings.':'No completed transportation history yet. Frequent locations will appear as trips are completed.';}catch(error){if(version===revision)$('locationStatus').textContent=error.message;}}
 function renderLocations(){const search=$('locationSearch').value.trim().toLowerCase(),rows=locations.filter(l=>l.address.toLowerCase().includes(search));$('locationList').innerHTML=rows.map((l,index)=>`<article class="location"><div><strong>${esc(l.address)}</strong><p>${Number(l.visits)} completed booking${Number(l.visits)===1?'':'s'} · last visit ${esc(date(l.last_visit))}</p></div><button data-book-ride data-location="${locations.indexOf(l)}">Book to this location</button></article>`).join('');if(locations.length&&!rows.length)$('locationList').textContent='No locations match your search.';}
 async function loadConversation(){
  if(!selectedMessage||!active){$('messageStatus').textContent='Choose a service date with a trip to view communications.';return;}if(conversationBusy)return;conversationBusy=true;const version=conversationVersion,scope=revision,reference=selectedMessage;
  try{const data=await api('communications/'+encodeURIComponent(reference));if(version!==conversationVersion||scope!==revision||!active)return;
   const signature=JSON.stringify([data.messages,data.activity]);if(signature!==lastMessageSignature){lastMessageSignature=signature;$('messages').innerHTML=data.messages.length?[...data.messages].reverse().map(m=>`<article class="message"><strong>${esc(m.author_name)} · ${esc(label(m.author_role))}</strong><small> · ${esc(timestamp(m.created_at))}</small><p>${esc(m.body)}</p></article>`).join(''):'<p>No messages yet. Start a conversation with dispatch about this trip.</p>';$('tripActivity').innerHTML=data.activity.map(a=>`<li><strong>${esc(label(a.status_label||a.status))}</strong> · ${esc(timestamp(a.created_at))}</li>`).join('')||'<li>No status history is available yet.</li>';}
   $('messageStatus').textContent='Shared inbox updated. Latest 100 messages and 100 activity entries shown.';
   await api('read/'+encodeURIComponent(reference),{method:'POST',body:JSON.stringify({through:data.through})});if(version===conversationVersion&&scope===revision){const trip=trips.find(t=>t.reference===reference);if(trip){trip.unread=0;$('unreadCount').textContent=trips.reduce((sum,t)=>sum+Number(t.unread||0),0)||'';}}
  }catch(error){if(version===conversationVersion&&scope===revision)$('messageStatus').textContent=error.message;}finally{conversationBusy=false;if(version!==conversationVersion&&active&&view==='communications')loadConversation();}
 }
 async function loadMaps(){
  if(window.google?.maps?.Map)return window.google.maps;
  if(!mapsPromise)mapsPromise=(async()=>{const response=await fetch('/api/integrations/config',{cache:'no-store'}),config=await response.json();if(!response.ok||!config.googleMapsEnabled||!config.googleMapsBrowserKey)throw Error('The road map is unavailable. Use the driving directions link above.');await new Promise((resolve,reject)=>{const script=document.createElement('script'),timer=setTimeout(()=>reject(Error('The map took too long to load. Use driving directions.')),15000);window.gm_authFailure=()=>{clearTimeout(timer);clearMap();$('mapStatus').textContent='Map access is unavailable on this domain. Use driving directions.';reject(Error('Map access is unavailable on this domain.'));};script.src='https://maps.googleapis.com/maps/api/js?key='+encodeURIComponent(config.googleMapsBrowserKey)+'&v=weekly';script.onload=()=>{clearTimeout(timer);resolve();};script.onerror=()=>{clearTimeout(timer);reject(Error('Map could not load. Use driving directions.'));};document.head.append(script);});return window.google.maps;})().catch(error=>{mapsPromise=null;throw error;});return mapsPromise;
 }
 async function renderRoute(){
  const trip=trips.find(t=>t.reference===selectedRoute);if(!trip){clearMap();$('routeDetails').textContent='No trips are available for the selected dates.';$('directionsLink').hidden=true;$('mapStatus').textContent='';return;}
  const hasReturn=!!trip.return_trip_time&&trip.trip_type!=='ONE_WAY';$('routeLeg').options[1].disabled=!hasReturn;if(!hasReturn)$('routeLeg').value='outbound';const returning=$('routeLeg').value==='return',origin=returning?trip.destination:trip.pickup,destination=returning?trip.pickup:trip.destination;
  $('routeDetails').textContent=[(trip.name||'Passenger')+' · '+trip.reference,(returning?'Return':'Outbound')+' pickup: '+date(returning?trip.return_trip_date||trip.trip_date:trip.trip_date)+' '+time(returning?trip.return_trip_time:trip.trip_time)+' ET','From: '+(origin||'Not set'),'To: '+(destination||'Not set'),'Driver: '+(trip.driver_name||'Awaiting assignment')+' · Vehicle: '+(trip.vehicle_unit||'Not assigned'),'Trip status: '+label(trip.status),'Road routes show planned driving directions. Vehicle position and arrival estimates are not available in this view.'].join('\n');
  const link=$('directionsLink');link.hidden=!origin||!destination;link.href='https://www.google.com/maps/dir/?'+new URLSearchParams({api:'1',origin:origin||'',destination:destination||'',travelmode:'driving'});
  const key=[facility,trip.reference,origin,destination].join('|');if(key===lastRoute)return;clearMap();lastRoute=key;const version=mapVersion;$('mapStatus').textContent='Loading road route…';if(!origin||!destination){$('mapStatus').textContent='Both route addresses are required.';return;}
  try{const maps=await loadMaps();if(version!==mapVersion||!active||view!=='routes')return;map=new maps.Map($('routeMap'),{center:{lat:38.98,lng:-76.49},zoom:10,mapTypeControl:false,streetViewControl:false});renderer=new maps.DirectionsRenderer({map});const result=await new Promise((resolve,reject)=>new maps.DirectionsService().route({origin,destination,travelMode:maps.TravelMode.DRIVING},(result,status)=>status==='OK'?resolve(result):reject(Error('Road directions could not be calculated. Use the driving directions link.'))));if(version!==mapVersion||!active)return;renderer.setDirections(result);$('mapAttribution').textContent=[result.routes[0]?.copyrights,...(result.routes[0]?.warnings||[])].filter(Boolean).join(' · ');$('mapStatus').textContent='Planned '+(returning?'return':'outbound')+' road route.';}
  catch(error){if(version===mapVersion){lastRoute='';$('mapStatus').textContent=error.message;}}
 }
 async function changeScope(){clearPrivate();facility=context.manager?context.facilities[0]?.id||'':$('facilitySelect').value;page=0;$('facilityBookingFrame').dataset.facility='';const f=context.facilities.find(f=>f.id===facility);$('facilityName').textContent=f?.name||'Select a facility';$('facilityAddress').textContent=f?.address||'';if(facility)await refresh();}
 document.addEventListener('click',event=>{const trigger=event.target.closest('[data-view],.bookRideSign,a[href^="/booking-app.html"]');if(!trigger||$('bookingDialog').contains(trigger))return;event.preventDefault();openView(trigger.dataset.view||'booking');});
 $('closeBookingDialog').addEventListener('click',()=>$('bookingDialog').close());
 $('refresh').addEventListener('click',()=>{lastRoute='';refresh();});$('serviceDateButton').addEventListener('click',()=>{if(calendarOpen)closeCalendar();else setCalendarOpen(true);});$('serviceTimeframe').addEventListener('change',()=>{
 timeframe=$('serviceTimeframe').value;
 // Selecting a timeframe re-points the Service Date control at that
 // timeframe: the current anchor (the last day picked, else the first
 // selected range, else today) re-resolves to the new period, so Week
 // shows this week, Quarter this quarter, and the board refilters at
 // once instead of waiting for the next calendar tap.
 const anchor=focusDay||selected[0]?.from||context?.today||'',range=window.NexusFacilityRange,resolved=range&&anchor?range.rangeFor(anchor,timeframe):null;
 selected=resolved?[{anchor,...resolved}]:[];if(!selected.length)seedSelection();else focusDay=anchor;
 pickerYear=Number(anchor.slice(0,4))||pickerYear;calendarMonth=anchor.slice(0,7);selectionDirty=false;
 rangeChanged();if(calendarOpen)renderCalendar();
});
$('calGrid').addEventListener('click',event=>{const day=event.target.closest('[data-date]');if(day&&timeframe==='day'){toggleDate(day.dataset.date);return;}const pick=event.target.closest('[data-anchor]');if(pick)toggleDate(pick.dataset.anchor);});$('calDone').addEventListener('click',()=>closeCalendar(true));$('clearRanges').addEventListener('click',()=>{seedSelection();selectionDirty=false;rangeChanged();});$('calPrev').addEventListener('click',()=>shiftPicker(-1));$('calNext').addEventListener('click',()=>shiftPicker(1));document.addEventListener('click',event=>{if(!calendarOpen)return;const path=event.composedPath?event.composedPath():[];const inside=path.some(node=>node&&node.classList&&node.classList.contains('serviceDateWrap'))||Boolean(event.target.closest&&event.target.closest('.serviceDateWrap'));if(!inside)closeCalendar();});document.addEventListener('keydown',event=>{if(event.key==='Escape'&&calendarOpen){event.preventDefault();closeCalendar(true);}});$('tripSearch').addEventListener('input',renderTrips);$('statusFilter').addEventListener('change',renderTrips);$('facilitySelect').addEventListener('change',changeScope);
 $('previousPage').addEventListener('click',()=>{if(page){page--;revision++;refresh();}});$('nextPage').addEventListener('click',()=>{if(hasMore){page++;revision++;refresh();}});
 $('tripRows').addEventListener('click',event=>{const route=event.target.closest('[data-route]'),message=event.target.closest('[data-message]');if(route){selectedRoute=route.dataset.route;$('routeTrip').value=selectedRoute;openView('routes');}if(message){setConversation(message.dataset.message);$('messageTrip').value=selectedMessage;openView('communications');}});
 $('routeTrip').addEventListener('change',()=>{selectedRoute=$('routeTrip').value;renderRoute();});$('routeLeg').addEventListener('change',renderRoute);$('messageTrip').addEventListener('change',()=>{setConversation($('messageTrip').value);loadConversation();});
 $('messageForm').addEventListener('submit',async event=>{event.preventDefault();if(sending||!selectedMessage||!active)return;const text=$('messageText').value.trim();if(!text)return;const scope=revision,reference=selectedMessage;if(!request||request.text!==text||request.reference!==reference)request={text,reference,id:crypto.randomUUID()};const current=request;sending=true;$('sendMessage').disabled=true;$('messageStatus').textContent='Saving message…';try{await api('communications/'+encodeURIComponent(reference),{method:'POST',body:JSON.stringify({message:text,requestId:current.id})});if(scope!==revision)return;drafts.delete(reference);if(reference===selectedMessage){$('messageText').value='';request=null;await loadConversation();$('messageStatus').textContent='Message saved to the shared inbox.';}}catch(error){if(scope===revision)$('messageStatus').textContent='Message not confirmed: '+error.message+' Retry to check and save it without duplicates.';}finally{sending=false;$('sendMessage').disabled=false;}});
 $('locationSearch').addEventListener('input',renderLocations);$('locationList').addEventListener('click',event=>{const button=event.target.closest('[data-location]');if(!button)return;pendingLocation=locations[Number(button.dataset.location)]?.address||'';openView('booking');applyLocation();});
 function applyLocation(){if(!pendingLocation)return;$('facilityBookingFrame').contentWindow?.postMessage({type:'nexus:facility-location',destination:pendingLocation},location.origin);}
 $('facilityBookingFrame').addEventListener('load',applyLocation);
 window.addEventListener('message',event=>{const frame=$('facilityBookingFrame');if(!active||event.origin!==location.origin||event.source!==frame.contentWindow)return;if(event.data?.type==='nexus:facility-booking-saved')refresh();if(event.data?.type==='nexus:facility-checkout'){let url;try{url=new URL(event.data.url);}catch{return;}if(url.protocol==='https:')location.assign(url.href);}});
 async function start(){if(active)return;active=true;try{const params=new URLSearchParams(location.search),requested=params.get('facility');context=await api('context'+(requested?'?'+new URLSearchParams({facility:requested}):''));if(!active)return;timeframe='day';$('serviceTimeframe').value='day';seedSelection();calendarMonth=context.today.slice(0,7);renderRange();$('facilitySelectLabel').hidden=context.manager;$('messageRecipient').textContent=context.manager?'dispatch':'the facility manager';$('facilitySelect').innerHTML=(context.manager?'':'<option value="">Select a facility</option>')+context.facilities.map(f=>`<option value="${esc(f.id)}">${esc(f.name)}</option>`).join('');if(!context.manager&&context.facilities.some(f=>f.id===requested))$('facilitySelect').value=requested;else if(!context.manager&&context.facilities.length===1)$('facilitySelect').value=context.facilities[0].id;await changeScope();if(!facility)notice('Select a facility to open its operations workspace.');else if(['success','cancelled'].includes(params.get('payment'))&&params.get('bookingReference'))openBooking();}catch(error){notice(error.message,true);}}
 window.addEventListener('nexus:authorized',start);if(window.NexusAuthorizedUser)start();
 setInterval(()=>{if(active&&!document.hidden){if(!token()){active=false;clearPrivate();notice('Your session ended. Sign in again.',true);return;}refresh();}},20000);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden&&active)refresh();});
 window.addEventListener('pagehide',()=>{active=false;clearPrivate();});
 window.addEventListener('pageshow',event=>{if(event.persisted&&window.NexusAuthorizedUser)start();});
})();
