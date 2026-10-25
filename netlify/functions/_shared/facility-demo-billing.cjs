const Fare=require('../../../nexus-fare.js');
const DATE='2026-10-26';
const LABELS={base:'Service / base fare',mileage:'Loaded mileage',fuel:'Fuel surcharge',traffic:'Traffic overage',premium:'Time premiums / minimum fare',waiting:'Waiting',positioning:'Empty-mile positioning',notice:'Short-notice surcharge',fee:'Configured processing fee'};
const cents=value=>Math.round((Number(value)+1e-9)*100);
const clock=minute=>`${String(Math.floor(minute/60)).padStart(2,'0')}:${String(minute%60).padStart(2,'0')}`;
function create(patients,settings){
 const distances=[8,7.5,7.2,23,26];
 const rows=patients.flatMap((patient,index)=>['outbound','return'].map(leg=>{
  const service=patient.service.toLowerCase(),rate=settings.pricing?.[service];
  if(!rate)throw Error(`Current ${service} pricing is unavailable.`);
  // Separate one-way transports: the vehicle does not wait through the appointment.
  const fare=Fare.calculate({service,rate,rules:settings.fareRules||{},vehicleUnit:patient.unit,miles:distances[index],date:DATE,time:clock(leg==='outbound'?patient.pickup:patient.returnPickup),tripType:'ONE_WAY',waitMinutes:0,metrics:{durationMinutes:patient.travel,trafficDurationMinutes:patient.travel,deadheadSegments:[0,0]}});
  const total=cents(fare.total),base=cents(rate.base||0),mileage=cents(fare.mileageCharge),fuel=cents(fare.fuelCharge),traffic=cents(fare.trafficCharge),waiting=cents(fare.waitCharge),positioning=cents(fare.deadheadCharge),notice=cents(fare.shortNoticeCharge),fee=cents(fare.taxAmount);
  const premium=Math.max(0,cents(fare.passengerLegs[0].subtotal)-base-mileage-fuel-traffic);
  const reconciledFee=total-base-mileage-fuel-traffic-premium-waiting-positioning-notice;
  return {id:`${patient.id}-${leg}`,patientId:patient.id,patient:patient.name,service:patient.service,leg,pickup:clock(leg==='outbound'?patient.pickup:patient.returnPickup),destination:patient.destination.name,miles:distances[index],categories:{base,mileage,fuel,traffic,premium,waiting,positioning,notice,fee:reconciledFee},total};
 }));
 return {id:'DEMO-FC-20261026',date:DATE,currency:'USD',status:'draft',rows,total:rows.reduce((sum,row)=>sum+row.total,0),pricingCapturedAt:new Date().toISOString(),pricingSource:'Nexus configured platform rates / shared NexusFare calculator',distanceSource:'Illustrative one-way demo miles; not measured road mileage',assumptions:'Separate outbound and return bookings. No appointment waiting, empty-mile positioning, billable traffic overage or discounts. Driver-delay alerts alone do not add a charge.',delivery:null};
}
function finalize(invoice,dashboard){
 if(invoice.status==='issued'||dashboard.metrics.returned!==5)return invoice;
 return {...invoice,status:'issued',delivery:{id:`${invoice.id}-delivery`,time:dashboard.time,at:dashboard.minute,recipient:'annapolis.demo@nexusmt.com',channel:'Simulated manager inbox delivery',sentAt:new Date().toISOString()}};
}
function view(invoice,period,mode='day'){
 const valid=mode==='month'?/^\d{4}-(0[1-9]|1[0-2])$/:/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
 if(!['day','month'].includes(mode)||!valid.test(period)||mode==='day'&&new Date(`${period}T12:00:00Z`).toISOString().slice(0,10)!==period)throw Object.assign(Error('Choose a valid billing day or month.'),{statusCode:400});
 const invoices=(mode==='month'?invoice.date.startsWith(period):invoice.date===period)?[invoice]:[];
 const categories=Object.keys(LABELS).map(key=>({key,label:LABELS[key],total:invoices.reduce((sum,item)=>sum+item.rows.reduce((n,row)=>n+row.categories[key],0),0)}));
 return {mode,period,invoices,categories,total:invoices.reduce((sum,item)=>sum+item.total,0),units:'All amounts are integer USD cents',availableDates:[DATE],automation:'Daily close: invoice automatically finalizes after all five return handoffs. Delivery is simulated in the manager inbox; no external email is sent.'};
}
module.exports={DATE,LABELS,create,finalize,view};
