const ACTIVE_TRIP_STATUSES=new Set(['EN_ROUTE','ARRIVED','ARRIVED_PICKUP','PATIENT_ON_BOARD','IN_TRANSIT','DEPARTED','ARRIVED_DESTINATION']);

function normalizedStatus(value){return String(value||'').trim().toUpperCase().replaceAll('-','_').replaceAll(' ','_')}
function scheduledTime(booking){
 const date=String(booking?.trip_date||booking?.tripDate||booking?.date||'').slice(0,10),time=String(booking?.trip_time||booking?.tripTime||booking?.time||'').slice(0,8);
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!/^\d{2}:\d{2}/.test(time))return NaN;
 return new Date(`${date}T${time}`).getTime();
}
function canPatientSeeDriverLocation(booking,now=Date.now()){
 if(!ACTIVE_TRIP_STATUSES.has(normalizedStatus(booking?.status)))return false;
 const tripAt=scheduledTime(booking),nowAt=Number(now instanceof Date?now.getTime():now);
 return Number.isFinite(tripAt)&&Number.isFinite(nowAt)&&tripAt-nowAt<=3600000&&tripAt-nowAt>=-43200000;
}
function distanceMiles(lat1,lng1,lat2,lng2){
 const values=[lat1,lng1,lat2,lng2].map(Number);if(!values.every(Number.isFinite))return null;
 const [a,b,c,d]=values,rad=value=>value*Math.PI/180,deltaLat=rad(c-a),deltaLng=rad(d-b);
 const h=Math.sin(deltaLat/2)**2+Math.cos(rad(a))*Math.cos(rad(c))*Math.sin(deltaLng/2)**2;
 return 3958.8*2*Math.atan2(Math.sqrt(h),Math.sqrt(1-h));
}
module.exports={ACTIVE_TRIP_STATUSES,canPatientSeeDriverLocation,distanceMiles,normalizedStatus};
