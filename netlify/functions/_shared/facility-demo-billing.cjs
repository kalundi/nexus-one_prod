const Fare=require('../../../nexus-fare.js');
const DATE='2026-10-26';
const LABELS={base:'Service / base fare',mileage:'Loaded mileage',fuel:'Fuel surcharge',traffic:'Traffic overage',premium:'Time premiums / minimum fare',waiting:'Waiting',positioning:'Empty-mile positioning',notice:'Short-notice surcharge',fee:'Configured processing fee'};
const cents=value=>Math.round((Number(value)+1e-9)*100);
const clock=minute=>`${String(Math.floor(minute/60)).padStart(2,'0')}:${String(minute%60).padStart(2,'0')}`;
function signature(patients,date=DATE){return JSON.stringify({date,patients:patients.map(p=>[p.id,p.name,p.service,p.destination.address,p.distanceMiles??null,p.pickup,p.appointmentAt,p.returnPickup,p.waitMinutes||0,!!p.vehicleWaiting,p.tripType,p.serviceKey,p.stopWaitMinutes,p.fuelProfile,p.origin,p.stops,p.notes,p.patientContact,p.caregiverContact,p.destinationContact,p.flight,p.scheduleBasis])});}
function create(patients,settings,date=DATE,previous=null){
 const distances=[8,7.5,7.2,23,26];
 const rows=patients.flatMap((patient,index)=>(patient.tripType==='ONE_WAY'?['outbound']:['outbound','return']).map(leg=>{
  const service=patient.serviceKey||patient.service.toLowerCase(),rate=settings.pricing?.[service];
  if(!rate)throw Error(`Current ${service} pricing is unavailable.`);
  // Appointment holding is charged exactly once, on the return leg, only when selected.
  const waitMinutes=leg==='return'?(patient.vehicleWaiting?Number(patient.waitMinutes||0):0):Number(patient.stopWaitMinutes||0);
  const miles=patient.distanceMiles??distances[index];
  const fare=Fare.calculate({service,rate,rules:{...(settings.fareRules||{}),cardProcessingFeePct:0},vehicleUnit:patient.unit,fuelProfile:patient.fuelProfile,miles,date,time:clock(leg==='outbound'?patient.pickup:patient.returnPickup),tripType:'ONE_WAY',waitMinutes,metrics:{durationMinutes:patient.travel,trafficDurationMinutes:patient.travel,deadheadSegments:[0,0]}});
  const total=cents(fare.total),base=cents(rate.base||0),mileage=cents(fare.mileageCharge),fuel=cents(fare.fuelCharge),traffic=cents(fare.trafficCharge),waiting=cents(fare.waitCharge),positioning=cents(fare.deadheadCharge),notice=cents(fare.shortNoticeCharge),fee=cents(fare.taxAmount);
  const premium=Math.max(0,cents(fare.passengerLegs[0].subtotal)-base-mileage-fuel-traffic);
  const reconciledFee=total-base-mileage-fuel-traffic-premium-waiting-positioning-notice;
  return {id:`${date}-${patient.id}-${leg}`,patientId:patient.id,patient:patient.name,service:patient.service,leg,pickup:clock(leg==='outbound'?patient.pickup:patient.returnPickup),destination:leg==='outbound'?patient.destination.name:(patient.origin?.name||'FutureCare Annapolis'),miles,waitMinutes,freeWaitMinutes:fare.freeWaitMinutes,billableWaitMinutes:fare.billableWaitMinutes,waitPer15:fare.waitPer15,categories:{base,mileage,fuel,traffic,premium,waiting,positioning,notice,fee:reconciledFee},total};
 }));
 const revision=Number(previous?.revision||0)+1,history=[...(previous?.history||[])];
 if(previous){const {history:oldHistory,...archived}=previous;history.push(archived);}
 return {id:`DEMO-FC-${date.replaceAll('-','')}-R${revision}`,revision,history,signature:signature(patients,date),date,currency:'USD',status:'draft',rows,total:rows.reduce((sum,row)=>sum+row.total,0),pricingCapturedAt:new Date().toISOString(),pricingSource:'Nexus configured platform rates / shared NexusFare calculator',distanceSource:'Illustrative one-way demo miles; not measured road mileage',assumptions:'Appointment wait is measured from appointment time to return pickup. When the vehicle stays, waiting is charged once on the return leg using configured free minutes and 15-minute blocks. Intermediate-stop waiting is charged on the outbound leg. No empty-mile positioning, billable traffic overage or discounts. Driver-delay alerts alone do not add a charge. Facility invoicing excludes card-processing fees; no payment is collected.',delivery:null};
}
function finalize(invoice,dashboard){
 if(invoice.status==='issued'||!(dashboard.metrics.patients??5)||dashboard.metrics.returned!==(dashboard.metrics.patients??5))return invoice;
 return {...invoice,status:'issued',delivery:{id:`${invoice.id}-delivery`,time:dashboard.time,at:dashboard.minute,recipient:'annapolis.demo@nexusmt.com',channel:'Simulated manager inbox delivery',sentAt:new Date().toISOString()}};
}
function view(invoice,period,mode='day'){
 const valid=mode==='month'?/^\d{4}-(0[1-9]|1[0-2])$/:/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
 if(!['day','month'].includes(mode)||!valid.test(period)||mode==='day'&&new Date(`${period}T12:00:00Z`).toISOString().slice(0,10)!==period)throw Object.assign(Error('Choose a valid billing day or month.'),{statusCode:400});
 const all=Array.isArray(invoice)?invoice:[invoice];
 const invoices=all.filter(item=>mode==='month'?item.date.startsWith(period):item.date===period).sort((a,b)=>a.date.localeCompare(b.date));
 const categories=Object.keys(LABELS).map(key=>({key,label:LABELS[key],total:invoices.reduce((sum,item)=>sum+item.rows.reduce((n,row)=>n+row.categories[key],0),0)}));
 return {mode,period,invoices,categories,total:invoices.reduce((sum,item)=>sum+item.total,0),units:'All amounts are integer USD cents',availableDates:all.map(item=>item.date),automation:'October 26–30: up to five patient bookings per day, with one-way or round-trip transport legs. Each daily invoice finalizes after its return handoffs. Schedule changes recalculate that day and preserve prior invoice revisions. Manager inbox delivery is simulated; no external email is sent.'};
}
module.exports={DATE,LABELS,signature,create,finalize,view};
