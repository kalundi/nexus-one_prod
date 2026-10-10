(function(root,factory){
 const engine=factory();
 if(typeof module==='object'&&module.exports)module.exports=engine;
 else root.NexusRoute=engine;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const address=value=>String(value||'').trim();
 const normalized=value=>address(value).toLowerCase().replace(/\s+/g,' ');
 function locations(booking,yard){
  const destinations=(Array.isArray(booking.destinations)?booking.destinations:String(booking.destination||'').split(/\s*→\s*/)).map(address).filter(Boolean);
  return {pickup:address(booking.pickup),destinations,tripType:String(booking.tripType||booking.trip_type||'ONE_WAY').toUpperCase()==='ROUND_TRIP'?'ROUND_TRIP':'ONE_WAY',yard:address(yard),nextPickup:address(booking.nextPickupAddress)};
 }
 function key(booking,yard){
  const places=locations(booking,yard);
  return JSON.stringify([normalized(places.pickup),places.destinations.map(normalized),places.tripType,normalized(places.yard),normalized(places.nextPickup)]);
 }
 function matches(inputs,booking,yard){
  const places=inputs?.routeAddresses;
  return !!inputs?.routeVerified&&!!places&&key({pickup:places.pickup,destinations:places.destinations,tripType:places.tripType,nextPickupAddress:places.nextPickup},places.yard)===key(booking,yard);
 }
 function plan(booking,yard){
  const places=locations(booking,yard),last=places.destinations.at(-1);
  if(!places.pickup||!last||!places.yard)throw Error('Pickup, destination and company yard addresses are required.');
  return [
   {kind:'DEADHEAD_TO_PICKUP',from:places.yard,to:places.pickup},
   {kind:'OUTBOUND',from:places.pickup,to:last,waypoints:places.destinations.slice(0,-1)},
   ...(places.tripType==='ROUND_TRIP'?[{kind:'RETURN',from:last,to:places.pickup}]:[]),
   {kind:'DEADHEAD_AFTER_TRIP',from:places.tripType==='ROUND_TRIP'?places.pickup:last,to:places.nextPickup||places.yard}
  ];
 }
 function fromDirections(result,segment){
  const legs=result?.routes?.[0]?.legs;
  if(!Array.isArray(legs)||!legs.length||legs.some(leg=>!Number.isFinite(Number(leg.distance?.value))||!Number.isFinite(Number(leg.duration?.value))))throw Error('Driving route has no valid distance or travel time.');
  return {...segment,miles:legs.reduce((sum,leg)=>sum+Number(leg.distance.value)/1609.344,0),durationMinutes:legs.reduce((sum,leg)=>sum+Number(leg.duration.value)/60,0),trafficDurationMinutes:legs.reduce((sum,leg)=>sum+Number(leg.duration_in_traffic?.value??leg.duration.value)/60,0),stopTravelMinutes:legs.map(leg=>Number(leg.duration_in_traffic?.value??leg.duration.value)/60)};
 }
 function inputs(booking,yard,routes){
  const passengerLegs=routes.filter(route=>['OUTBOUND','RETURN'].includes(route.kind));
  const deadheadRoutes=routes.filter(route=>route.kind.startsWith('DEADHEAD'));
  const outbound=passengerLegs[0];
  const value={routeVerified:true,mileageSource:'GOOGLE_DIRECTIONS',routeAddresses:locations(booking,yard),miles:outbound?.miles,durationMinutes:outbound?.durationMinutes,trafficDurationMinutes:outbound?.trafficDurationMinutes,passengerLegs,deadheadRoutes,deadheadSegments:deadheadRoutes.map(route=>route.miles)};
  validate(value,booking,yard);
  return value;
 }
 function validate(value,booking,yard){
  if(!matches(value,booking,yard))throw Error('Route addresses do not match this booking and company yard.');
  const expected=plan(booking,yard),routes=[value.deadheadRoutes?.[0],...(value.passengerLegs||[]),value.deadheadRoutes?.[1]];
  if(routes.length!==expected.length||value.deadheadSegments?.length!==2)throw Error('Both empty routes and every passenger leg are required.');
  routes.forEach((route,index)=>{
   const segment=expected[index];
   if(!route||route.kind!==segment.kind||normalized(route.from)!==normalized(segment.from)||normalized(route.to)!==normalized(segment.to)||JSON.stringify((route.waypoints||[]).map(normalized))!==JSON.stringify((segment.waypoints||[]).map(normalized)))throw Error('Route segments do not match the trip itinerary.');
   for(const field of ['miles','durationMinutes','trafficDurationMinutes'])if(route[field]==null||!Number.isFinite(Number(route[field]))||Number(route[field])<0)throw Error('Route distances and travel times must be valid numbers.');
  });
  if(value.miles!==value.passengerLegs[0].miles||value.durationMinutes!==value.passengerLegs[0].durationMinutes||value.trafficDurationMinutes!==value.passengerLegs[0].trafficDurationMinutes||value.deadheadSegments.some((miles,index)=>miles!==value.deadheadRoutes[index].miles))throw Error('Route totals do not match the measured segments.');
  return value;
 }
 async function measure(booking,yard,provider){
  const routes=await Promise.all(plan(booking,yard).map(async segment=>fromDirections(await provider(segment),segment)));
  return inputs(booking,yard,routes);
 }
 function googleProvider(maps,booking={}){
  const service=new maps.DirectionsService();
  return segment=>new Promise((resolve,reject)=>{
   const returning=segment.kind==='RETURN';
   const day=returning?booking.returnTripDate||booking.date:booking.date;
   const time=returning?booking.returnTripTime:booking.pickupTime||booking.time;
   const departure=day&&time?new Date(String(day).slice(0,10)+'T'+String(time).slice(0,5)+':00'):null;
   const request={origin:segment.from,destination:segment.to,waypoints:(segment.waypoints||[]).map(location=>({location,stopover:true})),travelMode:maps.TravelMode.DRIVING};
   // Historic trips use driving distance without an invalid past traffic request.
   if(departure&&departure.getTime()>=Date.now())request.drivingOptions={departureTime:departure,trafficModel:maps.TrafficModel.BEST_GUESS};
   const timer=setTimeout(()=>reject(Error('Driving route timed out.')),25000);
   service.route(request,(result,status)=>{clearTimeout(timer);status==='OK'?resolve(result):reject(Error('Driving route unavailable: '+status));});
  });
 }
 return {locations,key,matches,plan,fromDirections,inputs,validate,measure,googleProvider};
});
