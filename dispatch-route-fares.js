(function(){
 'use strict';
 let configPromise,mapsPromise;
 const measured=new Map();
 function config(){
  return configPromise||(configPromise=Promise.all([fetch('/api/settings/public').then(r=>r.json()),fetch('/api/integrations/config').then(r=>r.json())]).then(([settings,integrations])=>({settings,integrations})));
 }
 async function maps(integrations){
  if(window.google?.maps?.DirectionsService)return google.maps;
  if(!integrations.googleMapsEnabled||!integrations.googleMapsBrowserKey)return null;
  if(!mapsPromise)mapsPromise=new Promise((resolve,reject)=>{
   const existing=document.querySelector('script[src*="maps.googleapis.com/maps/api/js"]');
   const script=existing||document.createElement('script');
   const timer=setTimeout(()=>reject(Error('Maps timed out.')),15000);
   script.addEventListener('load',()=>{clearTimeout(timer);resolve(google.maps);},{once:true});
   script.addEventListener('error',()=>{clearTimeout(timer);reject(Error('Maps could not load.'));},{once:true});
   if(!existing){script.src='https://maps.googleapis.com/maps/api/js?key='+encodeURIComponent(integrations.googleMapsBrowserKey)+'&libraries=places';document.head.appendChild(script);}
  });
  return mapsPromise;
 }
 async function refresh(booking,{persist=false}={}){
  if(String(booking.bookingSource||'').toUpperCase()==='MOCK'||booking.duplicateOf)return booking;
  const {settings,integrations}=await config(),yard=settings.organization?.yardAddress;
  if(!yard)return booking;
  const trip={...booking,...NexusFare.resolveTripSchedule(booking)};
  let inputs=trip.routeFareInputs||trip.fareCalculation?.inputs;
  if(!NexusRoute.matches(inputs,trip,yard)){
   const providerMaps=await maps(integrations);
   if(!providerMaps)return booking;
   const key=NexusRoute.key(trip,yard);
   if(!measured.has(key))measured.set(key,NexusRoute.measure(trip,yard,NexusRoute.googleProvider(providerMaps,trip)).catch(error=>{measured.delete(key);throw error;}));
   inputs=await measured.get(key);
  }else return booking;
  const routed={...booking,routeFareInputs:inputs,distanceMiles:inputs.miles,estimatedDuration:Math.ceil(inputs.durationMinutes)+' min'};
  const fare=NexusFare.calculateEstimate(routed,settings);
  const updated={...trip,...routed,routeFareInputs:inputs,fareCalculation:fare,ourEstimate:fare.discountedTotal,distanceMiles:inputs.miles};
  if(persist&&booking.reference){
   const token=sessionStorage.getItem('nexusAccessToken')||'';
   const response=await fetch('/api/admin/bookings/'+encodeURIComponent(booking.reference)+'/route-fare-inputs',{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify({routeFareInputs:inputs})});
   const result=await response.json();
   if(!response.ok)throw Error(result.error||'Route estimate could not be saved.');
   return {...updated,...result.booking};
  }
  return updated;
 }
 async function refreshAll(bookings,onUpdate){
  // Limit Directions requests and saves while leaving the table available.
  for(const booking of bookings){
   try{const updated=await refresh(booking,{persist:true});if(updated!==booking)onUpdate(updated);}catch{}
  }
 }
 window.NexusDispatchRoutes={refresh,refreshAll};
})();
