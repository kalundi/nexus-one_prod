const crypto=require('node:crypto');
const Routes=require('../../../nexus-route.js');
const Fare=require('../../../nexus-fare.js');
const cacheKey=(booking,yard)=>crypto.createHash('sha256').update(Routes.key({...booking,...Fare.resolveTripSchedule(booking)},yard)).digest('hex');
function currentBooking(booking,settings){
 const yard=settings.organization?.yardAddress;
 if(booking.routeFareInputs&&!Routes.matches(booking.routeFareInputs,{...booking,...Fare.resolveTripSchedule(booking)},yard))return {...booking,routeFareInputs:null};
 return booking;
}
async function hydrate(bookings,settings,query){
 const yard=settings.organization?.yardAddress;
 if(!yard)return bookings;
 bookings=bookings.map(booking=>{
  if(Routes.matches(booking.routeFareInputs,{...booking,...Fare.resolveTripSchedule(booking)},yard))return booking;
  const saved=Fare.resolveBookingInputs(booking,settings);
  return Routes.matches(saved,{...booking,...Fare.resolveTripSchedule(booking)},yard)?{...booking,routeFareInputs:saved}:booking;
 });
 const keys=[...new Set(bookings.filter(booking=>String(booking.bookingSource).toUpperCase()!=='MOCK'&&!Routes.matches(booking.routeFareInputs,{...booking,...Fare.resolveTripSchedule(booking)},yard)).map(booking=>cacheKey(booking,yard)))];
 if(!keys.length)return bookings;
 const result=await query('SELECT route_key,inputs FROM fare_route_cache WHERE route_key=ANY($1::text[])',[keys]);
 const cache=new Map(result.rows.map(row=>[row.route_key,row.inputs]));
 return bookings.map(booking=>{
  if(String(booking.bookingSource).toUpperCase()==='MOCK'||Routes.matches(booking.routeFareInputs,{...booking,...Fare.resolveTripSchedule(booking)},yard))return booking;
  const inputs=cache.get(cacheKey(booking,yard));
  return inputs?{...booking,routeFareInputs:inputs}:booking;
 });
}
module.exports={cacheKey,currentBooking,hydrate};
