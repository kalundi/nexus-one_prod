(function(){
 'use strict';
 const N=window.NexusPatient,$=id=>document.getElementById(id);
 if(!N)return;
 const sharedReference=new URLSearchParams(location.search).get('reference')||'';
 let currentUser=null,sharedRide=null,sharedPhone='',activeView='home',mapReference='',returnView='home',mapRevision=0,lastActivity=Date.now();
 let mapsPromise=null,map=null,renderer=null,driverMarker=null,routeSignature='',routeBounds=null,fitFrame=null;
 const savedTrips=N.trips;
 N.trips=()=>sharedRide?[sharedRide]:savedTrips();
 const phone=$('appShell').querySelector('.phone'),nav=phone.querySelector('.bottomNav');
 const mapPage=document.createElement('section');
 mapPage.id='mapPage';mapPage.className='viewportStack';mapPage.hidden=true;
 mapPage.innerHTML='<div class="patientScreenHead"><button type="button" class="button secondary compact" data-patient-back>‹ Back</button><h2>Full trip route</h2><button type="button" class="button secondary compact" id="mapShareBtn">Share</button></div><div class="patientMapToolbar"><p id="mapRouteSummary"></p><button type="button" class="button secondary compact" id="mapFitBtn" hidden>Fit full route</button></div><div id="patientMap" class="patientMap" role="region" aria-label="Your full trip route map"></div><p id="patientMapStatus" class="patientMapStatus" role="status"></p><button type="button" class="button secondary compact" id="mapRetryBtn" hidden>Retry map</button><div id="mapItinerary" class="patientMapAddresses"></div><dl id="mapRideDetails" class="detailList"></dl>';
 phone.insertBefore(mapPage,nav);
 const bookingPage=document.createElement('section');
 bookingPage.id='bookingPage';bookingPage.className='viewportStack';bookingPage.hidden=true;
 bookingPage.innerHTML='<div class="patientScreenHead"><button type="button" class="button secondary compact" data-patient-back>‹ Back</button><h2>Book transportation</h2></div><iframe id="bookingFrame" title="Book your Nexus ride" allow="payment"></iframe>';
 phone.insertBefore(bookingPage,nav);
 const shareDialog=document.createElement('dialog');shareDialog.id='rideShareDialog';shareDialog.className='portalDialog';shareDialog.setAttribute('aria-labelledby','rideShareTitle');
 shareDialog.innerHTML='<button class="dialogClose" type="button" data-close aria-label="Close sharing">×</button><h2 id="rideShareTitle">Share this ride</h2><p id="shareRideReference" class="muted"></p><p>Family or caregivers can open this link in the patient app. They must enter the phone number used for the booking to see the ride.</p><label for="rideShareLink">Private tracking link</label><input id="rideShareLink" class="shareLink" readonly><div class="toolbar"><button class="button" type="button" id="nativeShareBtn">Share ride</button><button class="button secondary" type="button" id="copyRideLinkBtn">Copy link</button></div><p id="rideShareStatus" class="shareStatus" role="status"></p>';
 $('appShell').appendChild(shareDialog);

 // Keep the full ride list together in My rides instead of the profile editor.
 $('historyPage').replaceChildren();
 ['rideCenterSummary','rideCenterActiveList','rideCenterCompletedList','rideCenterActiveOverflowList','rideCenterCompletedOverflowList'].forEach(id=>{
  const card=$(id)?.closest('section.card');if(card)$('historyPage').appendChild(card);
 });
 const paymentCard=[...$('profilePage').querySelectorAll('section')].find(card=>card.textContent.includes('Secure private-pay checkout'));
 if(paymentCard)paymentCard.innerHTML='<div class="cardHead"><div><h2>Booking and payments</h2><p>Manage your ride and payment together.</p></div></div><div class="cardBody"><button class="button secondary" type="button" data-patient-book>Open booking</button></div>';

 function notice(message){$('portalNotice').textContent=message;}
 function identity(user){
  window.NexusExperiences?.mountNative(sharedRide?null:user);
  const name=sharedRide?'Shared ride':String(user?.displayName||user?.name||'Patient');
  $('patientName').textContent=name;
  $('patientAvatar').textContent=name.split(/\s+/).filter(Boolean).slice(0,2).map(part=>part[0]).join('').toUpperCase();
  $('patientIdentityRole').textContent=sharedRide?'Verified ride access':'Patient account';
 }
 function navigate(view,writeHistory=true){
  if(!['home','profile','history','support','map','booking'].includes(view))view='home';
  if(sharedReference&&!['home','support','map'].includes(view))view='home';
  activeView=view;N.navigate(view);
  if(writeHistory){const hash=view==='map'?`#map/${encodeURIComponent(mapReference)}`:`#${view}`;if(location.hash!==hash)history.pushState({patientView:view},'',hash);}
  if(view==='home')countdown();
 }
 function tripByReference(reference){return N.trips().find(trip=>String(trip.id||trip.reference)===String(reference));}
 function openMap(reference){
  const trip=tripByReference(reference);if(!trip){notice('Select a ride from My rides to view its map.');return;}
  if(activeView!=='map')returnView=activeView;
  mapReference=reference;navigate('map');mapPage.scrollTop=0;renderMap(trip,true);
 }
 function openBooking(){
  if(activeView!=='booking')returnView=activeView;
  if(!$('bookingFrame').getAttribute('src')){const url=new URL('/booking-app.html',location.origin);url.searchParams.set('patientApp','1');const params=new URLSearchParams(location.search);['payment','bookingReference','provider'].forEach(key=>{if(params.get(key))url.searchParams.set(key,params.get(key));});$('bookingFrame').src=url.href;}
  navigate('booking');
 }
 function coordinates(location){
  if(location?.latitude==null||location?.longitude==null)return null;
  const lat=Number(location.latitude),lng=Number(location.longitude);
  return Number.isFinite(lat)&&Number.isFinite(lng)&&Math.abs(lat)<=90&&Math.abs(lng)<=180?{lat,lng}:null;
 }
 function resetRoute(){cancelAnimationFrame(fitFrame);renderer?.setDirections({routes:[]});driverMarker?.setMap(null);driverMarker=null;routeSignature='';routeBounds=null;$('mapFitBtn').hidden=true;$('mapRouteSummary').textContent='';}
 function clearMap(){mapRevision++;resetRoute();renderer?.setMap(null);renderer=null;map=null;$('patientMap').replaceChildren();}
 function fitFullRoute(){
  cancelAnimationFrame(fitFrame);
  fitFrame=requestAnimationFrame(()=>{
   if(!map||!routeBounds||activeView!=='map')return;
   window.google.maps.event?.trigger(map,'resize');
   map.fitBounds(routeBounds,{top:48,right:40,bottom:40,left:40});
  });
 }
 if(window.ResizeObserver)new ResizeObserver(entries=>{if(entries[0].contentRect.width&&entries[0].contentRect.height)fitFullRoute();}).observe($('patientMap'));
 function routeLocations(trip){
  const pickup=String(trip.pickup||'').trim();
  const stops=(Array.isArray(trip.destinations)&&trip.destinations.length?trip.destinations:String(trip.destination||'').split(/\s*→\s*/)).map(address=>String(address||'').trim()).filter(Boolean);
  const roundTrip=/round/i.test(trip.tripType||trip.trip_type||'');
  const mock=trip.isMock===true||[trip.tripMode,trip.bookingSource,trip.id,trip.reference,pickup,...stops].some(value=>/^mock(?:\b|[-_])/i.test(String(value||'')));
  // Sample bookings use city names prefixed with a MOCK TRIP label. Keep the
  // label in the itinerary, and send only the actual location to Directions.
  const address=value=>mock?value.replace(/^MOCK TRIP\s+(?:pickup|destination|stop(?:\s+\d+)?)\s*[—–:-]\s*/i,'').trim():value;
  return {pickup,stops,roundTrip,mock,origin:address(pickup),destinations:stops.map(address)};
 }
 async function loadMaps(){
  if(window.google?.maps?.Map)return window.google.maps;
  if(!mapsPromise)mapsPromise=(async()=>{
   const response=await fetch('/api/integrations/config',{cache:'no-store'});
   const config=await response.json();
   if(!response.ok||!config.googleMapsEnabled||!config.googleMapsBrowserKey)throw new Error('The map is temporarily unavailable. Your ride details are shown below.');
   await new Promise((resolve,reject)=>{
    const script=document.createElement('script'),timer=setTimeout(()=>{script.remove();reject(new Error('The map could not load. Check your connection and retry.'));},15000);
    script.src=`https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(config.googleMapsBrowserKey)}&v=weekly`;
    script.onload=()=>{clearTimeout(timer);resolve();};script.onerror=()=>{clearTimeout(timer);script.remove();reject(new Error('The map could not load. Check your connection and retry.'));};document.head.appendChild(script);
   });
   if(!window.google?.maps?.Map)throw new Error('The map could not load. Please retry.');
   return window.google.maps;
  })().catch(error=>{mapsPromise=null;throw error;});
  return mapsPromise;
 }
 function rideDetails(trip,places){
  const itinerary=[['Pickup',places.pickup||'Pickup pending','mapPickup'],...places.stops.map((address,index)=>[places.stops.length>1?`Stop ${index+1}`:'Destination',address,index===places.stops.length-1?'mapDestination':`mapStop${index+1}`]),...(places.roundTrip?[['Return to pickup',places.pickup,'mapReturn']]:[])];
  if(!places.stops.length)itinerary.push(['Destination','Destination pending','mapDestination']);
  $('mapItinerary').replaceChildren();
  itinerary.forEach(([label,address,id],index)=>{const card=document.createElement('div'),title=document.createElement('small'),text=document.createElement('p');card.className='patientMapAddress';title.textContent=`${String.fromCharCode(65+index)} · ${label}`;text.id=id;text.textContent=address;card.append(title,text);$('mapItinerary').appendChild(card);});
  $('mapRideDetails').replaceChildren();
  const fields=[['Pickup',`${trip.date||''} ${trip.time||''}`],['Status',trip.statusLabel||trip.status||'Scheduled'],['Driver',trip.driver||trip.driverName||'Pending assignment'],['Vehicle',trip.vehicle||trip.vehicleUnit||'Pending assignment'],['Reference',trip.id||trip.reference]];
  if(places.roundTrip)fields.push(['Return pickup',[trip.returnTripDate,trip.returnTripTime||trip.returnPickupTime].filter(Boolean).join(' ')||'To be confirmed']);
  fields.forEach(([label,value])=>{const wrap=document.createElement('div'),dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=label;dd.textContent=value;wrap.append(dt,dd);$('mapRideDetails').appendChild(wrap);});
 }
 async function renderMap(trip,refit=false){
  const revision=++mapRevision;
  const places=routeLocations(trip);
  rideDetails(trip,places);$('mapRetryBtn').hidden=true;
  $('patientMap').hidden=false;
  const driver=!places.mock&&trip.driverLocationVisible===true?coordinates(trip.driverLocation):null;
  // Remove an existing marker immediately when the server stops authorizing GPS.
  if(!driver&&driverMarker){driverMarker.setMap(null);driverMarker=null;}
  $('patientMapStatus').textContent=driver?'Loading your route and assigned driver…':'Loading your route…';
  try{
   if(!places.origin||!places.destinations.length){resetRoute();throw new Error('Pickup and destination are needed to show the full route.');}
   const maps=await loadMaps();if(revision!==mapRevision||activeView!=='map')return;
   if(!map){map=new maps.Map($('patientMap'),{center:driver||{lat:39.05,lng:-77.12},zoom:11,mapTypeControl:false,streetViewControl:false,fullscreenControl:false,gestureHandling:'greedy'});renderer=new maps.DirectionsRenderer({map,preserveViewport:true});}
   const {origin,destinations,roundTrip}=places;
   const signature=JSON.stringify([trip.id||trip.reference,origin,destinations,roundTrip]);
   if(signature!==routeSignature){
    resetRoute();
    const result=await new maps.DirectionsService().route({origin,destination:roundTrip?origin:destinations[destinations.length-1],waypoints:(roundTrip?destinations:destinations.slice(0,-1)).map(address=>({location:address,stopover:true})),travelMode:'DRIVING'});
    if(revision!==mapRevision||activeView!=='map')return;
    const route=result.routes?.[0];if(!route)throw new Error('We could not find a driving route for these addresses.');
    routeBounds=new maps.LatLngBounds();if(route.bounds)routeBounds.union(route.bounds);
    (route.overview_path||[]).forEach(point=>routeBounds.extend(point));
    (route.legs||[]).forEach(leg=>{if(leg.start_location)routeBounds.extend(leg.start_location);if(leg.end_location)routeBounds.extend(leg.end_location);});
    renderer.setDirections(result);routeSignature=signature;$('mapFitBtn').hidden=false;
    const miles=(route.legs||[]).reduce((sum,leg)=>sum+Number(leg.distance?.value||0)/1609.344,0);
    $('mapRouteSummary').textContent=`${roundTrip?'Round trip':'One way'}${destinations.length>1?` · ${destinations.length} stops`:''}${miles>0?` · ${miles.toFixed(1)} mi total`:''}`;
    refit=true;
   }
   if(driver){if(!driverMarker)driverMarker=new maps.Marker({map,title:'Your assigned driver',label:'N'});driverMarker.setPosition(driver);}
   if(refit)fitFullRoute();
   $('patientMapStatus').textContent=places.mock?'MOCK TRIP — route preview between the listed locations. No live driver tracking.':driver?'Your booked route and assigned driver’s latest location. Updates refresh automatically.':'Your booked route. Live driver location appears when your trip is active and pickup is within one hour.';
  }catch(error){if(revision!==mapRevision)return;if(!map)$('patientMap').hidden=true;$('patientMapStatus').textContent=error.message||'The route could not be displayed. Your ride details are shown below.';$('mapRetryBtn').hidden=false;}
 }
 function shareTrip(reference){
  if(!tripByReference(reference))return;
  const url=new URL('/patient.html',location.origin);url.searchParams.set('reference',reference);
  $('rideShareLink').value=url.href;$('shareRideReference').textContent=`Ride ${reference}`;
  $('rideShareStatus').textContent='Share the link only with people you want to follow this ride.';
  $('nativeShareBtn').hidden=typeof navigator.share!=='function';shareDialog.showModal();
 }
 $('copyRideLinkBtn').addEventListener('click',async()=>{
  try{if(!navigator.clipboard?.writeText)throw new Error('unavailable');await navigator.clipboard.writeText($('rideShareLink').value);$('rideShareStatus').textContent='Link copied. You can paste it into a message.';}
  catch{$('rideShareLink').focus();$('rideShareLink').select();$('rideShareStatus').textContent='Copy is unavailable here. Select and copy the link above.';}
 });
 $('nativeShareBtn').addEventListener('click',async()=>{
  try{await navigator.share({title:'Nexus ride tracking',text:'Follow this Nexus ride. Verify with the phone number used for the booking.',url:$('rideShareLink').value});$('rideShareStatus').textContent='Ride link shared.';}
  catch(error){$('rideShareStatus').textContent=error.name==='AbortError'?'Sharing cancelled. You can still copy the link.':'Sharing is unavailable. Use Copy link or select the link above.';}
 });
 function countdown(){
  const today=new Date().toLocaleDateString('en-CA');
  const trip=N.trips().filter(t=>!/complete|cancel|no.show|delivered/i.test(t.status)&&String(t.date||'').slice(0,10)>=today).sort((a,b)=>`${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`))[0];
  if(!trip){$('countdownLabel').textContent='Your next pickup';$('countdownValue').textContent='No ride';$('countdownMeta').textContent='Book a ride when you’re ready.';return;}
  const when=new Date(`${String(trip.date).slice(0,10)}T${String(trip.time||'00:00').slice(0,5)}:00`),minutes=Math.ceil((when-Date.now())/60000);
  $('countdownLabel').textContent=Number.isFinite(when.getTime())?when.toLocaleDateString([],{weekday:'short',month:'short',day:'numeric'}):'Scheduled pickup';
  const days=Math.floor(minutes/1440);
  $('countdownValue').textContent=!Number.isFinite(minutes)?'Scheduled':minutes<=0?'Today':minutes>=1440?`${days} ${days===1?'day':'days'}`:minutes>=60?`${Math.floor(minutes/60)}h ${minutes%60}m`:`${minutes} min`;
  $('countdownMeta').textContent=Number.isFinite(when.getTime())?`Pickup at ${when.toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})}`:'Pickup time will be confirmed by dispatch.';
 }
 function updated(){countdown();document.querySelectorAll('a[href^="#map/"]').forEach(link=>{if(link.textContent==='Open LiveCare')link.textContent='View map';});if(activeView==='map'){const trip=tripByReference(mapReference);if(trip)renderMap(trip);else{clearMap();$('patientMapStatus').textContent='This ride is no longer available.';}}}
 async function signedIn(user){
  currentUser=user;const owner=String(user.id||user.email||'');
  if(localStorage.getItem('nexusPatientOwner')!==owner){Object.values(N.KEYS).forEach(key=>localStorage.removeItem(key));localStorage.removeItem('nexusTrips');N.seed();localStorage.setItem('nexusPatientOwner',owner);}
  const profile=N.read(N.KEYS.profile,{});N.write(N.KEYS.profile,{...profile,name:user.displayName||user.name||'',phone:user.phone||'',email:user.email||''});
  identity(user);await N.reload();updated();if(new URLSearchParams(location.search).has('payment'))openBooking();else routeFromHash();
 }
 function signedOut(){currentUser=null;sharedRide=null;sharedPhone='';clearMap();$('bookingFrame').removeAttribute('src');shareDialog.close();navigate('home',false);Object.values(N.KEYS).forEach(key=>localStorage.removeItem(key));localStorage.removeItem('nexusTrips');localStorage.removeItem('nexusPatientOwner');N.seed();N.render();identity(null);}
 function sessionExpired(){sessionStorage.removeItem('nexusAccessToken');sessionStorage.removeItem('nexusUser');signedOut();$('appShell').hidden=true;$('loginView').hidden=false;$('loginNotice').hidden=false;$('loginNotice').textContent='Your session expired. Please sign in again.';}
 function showSharedAccess(){
  $('appShell').hidden=true;$('loginView').hidden=false;
  const card=$('loginView').querySelector('.loginCard');
  card.replaceChildren();const title=document.createElement('h1');title.textContent='Follow a Nexus ride';const info=document.createElement('p');info.textContent='Enter the phone number used for this booking to verify access.';
  const form=document.createElement('form');form.className='sharedAccess';form.innerHTML='<label>Booking phone number<input name="phone" type="tel" autocomplete="tel" placeholder="Include country code, e.g. +1" required></label><button type="submit" class="loginBtn">View shared ride</button><p id="sharedAccessNotice" role="status"></p>';
  const back=document.createElement('a');back.href='/patient.html';back.textContent='Sign in to my patient app';back.style.display='block';back.style.marginTop='16px';
  card.append(title,info,form,back);
  form.addEventListener('submit',async event=>{event.preventDefault();const button=form.querySelector('button');button.disabled=true;
   try{sharedPhone=form.elements.phone.value.trim();await loadSharedRide();$('loginView').hidden=true;$('appShell').hidden=false;$('appShell').dataset.shared='true';identity(null);$('patientLogoutBtn').textContent='Close ride';N.render();openMap(sharedReference);}
   catch{$('sharedAccessNotice').textContent='We could not verify this ride. Check the booking phone number and try again.';sharedPhone='';}
   finally{button.disabled=false;}
  });
 }
 async function loadSharedRide(){
  const requestedPhone=sharedPhone;if(!requestedPhone)return;
  const response=await fetch(`/api/bookings/${encodeURIComponent(sharedReference)}?phone=${encodeURIComponent(requestedPhone)}`,{cache:'no-store'});
  const data=await response.json();if(!response.ok||!data.booking)throw new Error('Ride verification failed');if(requestedPhone!==sharedPhone)return;
  const trip=data.booking;sharedRide={...trip,id:trip.reference,date:String(trip.date||'').slice(0,10),time:String(trip.time||'').slice(0,5)};updated();
 }
 function routeFromHash(){
  const [view,reference]=location.hash.slice(1).split('/');
  if(view==='map'&&reference)openMap(decodeURIComponent(reference));else if(view==='booking')openBooking();else navigate(view==='transportation-preferences'?'profile':view||'home',false);
 }
 document.addEventListener('click',event=>{
  if(event.target.closest('[data-patient-home]'))navigate('home');
  if(event.target.closest('[data-patient-profile]'))navigate(sharedReference?'map':'profile');
  if(event.target.closest('[data-patient-history]'))navigate('history');
  if(event.target.closest('[data-patient-book]'))openBooking();
  if(event.target.closest('[data-patient-back]')){navigate(returnView==='map'||returnView==='booking'?'home':returnView);N.reload();}
  const link=event.target.closest('a[href]');if(!link)return;
  if(link.hash.startsWith('#map/')){event.preventDefault();openMap(decodeURIComponent(link.hash.slice(5)));}
  else if(link.getAttribute('href').startsWith('/booking-app')){event.preventDefault();openBooking();}
 });
 $('liveRouteOpenBtn').addEventListener('click',event=>openMap(event.currentTarget.dataset.mapTrip));
 $('mapShareBtn').addEventListener('click',()=>shareTrip(mapReference));
 $('mapRetryBtn').addEventListener('click',()=>{const trip=tripByReference(mapReference);if(trip)renderMap(trip);});
 $('mapFitBtn').addEventListener('click',fitFullRoute);
 window.addEventListener('popstate',routeFromHash);
 window.addEventListener('message',event=>{
  if(event.origin!==location.origin||event.source!==$('bookingFrame').contentWindow)return;
  if(event.data?.type==='nexus:patient-view')navigate(event.data.view);
  if(event.data?.type==='nexus:patient-activity')lastActivity=Date.now();
  if(event.data?.type==='nexus:patient-checkout'){try{const url=new URL(event.data.url);if(url.protocol!=='https:'||!['checkout.stripe.com','square.link','checkout.square.site','connect.squareup.com'].includes(url.hostname))throw new Error('Invalid checkout URL');location.assign(url.href);}catch{notice('Checkout could not open. Please try again.');}}
  if(event.data?.type==='nexus:booking-saved'){N.reload();notice('Your ride request was saved. Track its status in My rides.');}
 });
 window.NexusPatientApp={sharedReference,navigate,shareTrip,updated,signedIn,signedOut,sessionExpired,showSharedAccess};
 setInterval(countdown,60000);
 ['click','keydown','touchstart','scroll'].forEach(type=>document.addEventListener(type,()=>{lastActivity=Date.now();},{passive:true}));
 setInterval(()=>{if(currentUser&&Date.now()-lastActivity>60*60*1000)sessionExpired();},60000);
 setInterval(()=>{if(sharedPhone)loadSharedRide().catch(()=>{sharedPhone='';clearMap();$('patientMapStatus').textContent='Ride access could not be refreshed. Reopen the shared link to verify access.';});},15000);
})();
