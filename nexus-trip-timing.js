(function(root,factory){
  const engine=factory(()=>typeof module==='object'&&module.exports?require('./nexus-fare.js'):root.NexusFare);
  if(typeof module==='object'&&module.exports)module.exports=engine;else root.NexusTripTiming=engine;
})(typeof globalThis!=='undefined'?globalThis:this,function(getFare){
  'use strict';
  const MINUTE=60000;
  const defaults={ambulatory:[10,10],wheelchair:[30,20],stretcher:[40,30],bariatric:[45,35],broda:[35,25],hospital_discharge:[20,20],facility_transfer:[30,20],bls:[45,35],als1:[45,35],als2:[45,35],facility_transfer_critical:[45,35]};
  const bounded=(v,d,max=180)=>v!=null&&v!==''&&Number.isFinite(Number(v))?Math.max(0,Math.min(max,Number(v))):d;
  const addressKey=value=>String(value||'').normalize('NFKC').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  const dateOnly=value=>value instanceof Date?value.toISOString().slice(0,10):String(value||'').slice(0,10);
  function serviceKey(value){const v=String(value||'').toLowerCase().replace(/[ -]+/g,'_');return v==='ambulance'?'bls':v==='additional_capacity'?'bariatric':v;}
  function policy(service,rules={}){
    const key=serviceKey(service),p=rules.servicePolicies?.[key]||{},d=defaults[key]||defaults.ambulatory,c=rules.smartTiming||{};
    return {pickupMinutes:bounded(p.pickupPreparationMinutes,d[0]),handoffMinutes:bounded(p.dropoffHandoffMinutes,d[1]),bufferMinutes:bounded(c.reliabilityBufferMinutes,5,60),checkInLeadMinutes:bounded(c.checkInLeadMinutes,15,120),minimumSamples:Math.max(5,bounded(c.minimumHistorySamples,10,100)),percentile:Math.round(Math.max(80,Math.min(90,Number(c.historyPercentile)||85)))};
  }
  function localParts(epoch){
    if(!Number.isFinite(epoch))return {date:'',time:''};
    const p=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(epoch)).map(p=>[p.type,p.value]));
    return {date:`${p.year}-${p.month}-${p.day}`,time:`${p.hour}:${p.minute}`};
  }
  function bucket(epoch){const p=localParts(epoch),h=Number(p.time.slice(0,2));return `${new Date(p.date+'T12:00:00Z').getUTCDay()}:${Math.floor(h/4)}`;}
  function percentile(values,pct){const a=values.filter(v=>Number.isFinite(v)&&v>=1&&v<=180).sort((a,b)=>a-b);return a.length?a[Math.max(0,Math.ceil(a.length*pct/100)-1)]:null;}
  function facilityType(location){
    const text=String(location?.name||location?.address||location||'').toLowerCase();
    return /rehab|rehabilitation/.test(text)?'REHAB':/dialysis/.test(text)?'DIALYSIS':/nursing|skilled|assisted living/.test(text)?'NURSING':/hospital|medical center/.test(text)?'HOSPITAL':'UNKNOWN';
  }
  function handling(address,service,role,epoch,context={},rules={}){
    const p=policy(service,rules),profile=context.locations?.[addressKey(address)]||{},base=role==='PICKUP'?p.pickupMinutes:p.handoffMinutes;
    const rows=(profile.observations||[]).filter(r=>serviceKey(r.service)===serviceKey(service)&&r.role===role);
    const matched=rows.filter(r=>r.bucket===bucket(epoch));
    const observations=matched.length>=p.minimumSamples?matched:rows;
    const stats=(profile.historyEstimates||[]).filter(r=>serviceKey(r.service)===serviceKey(service)&&r.role===role),matchedStat=stats.find(r=>r.bucket===bucket(epoch));
    const stat=matchedStat?.sampleCount>=p.minimumSamples?matchedStat:stats.find(r=>r.bucket==='*');
    const sampleCount=stat?.sampleCount??observations.length;
    const learned=stat?(sampleCount>=p.minimumSamples?stat.percentiles?.[p.percentile]??null:null):observations.length>=p.minimumSamples?percentile(observations.map(r=>Number(r.minutes)),p.percentile):null;
    const override=profile.serviceOverrides?.[serviceKey(service)]?.[role==='PICKUP'?'pickupMinutes':'handoffMinutes'];
    const extra=bounded(profile[role==='PICKUP'?'pickupExtraMinutes':'handoffExtraMinutes'],0,120);
    const peak=(profile.peakWindows||[]).filter(w=>{
      const {date,time}=localParts(epoch),day=new Date(date+'T12:00:00Z').getUTCDay();
      return (!w.weekdays?.length||w.weekdays.includes(day))&&time>=w.start&&time<w.end;
    }).reduce((max,w)=>Math.max(max,bounded(w.extraMinutes,0,120)),0);
    const minutes=Math.ceil((learned??bounded(override,base))+extra+peak);
    return {minutes,source:learned!=null?'HISTORICAL_P'+p.percentile:override!=null||extra||peak?'FACILITY_PROFILE':'SERVICE_DEFAULT',sampleCount,confidence:learned!=null?(matchedStat?.sampleCount>=p.minimumSamples||matched.length>=p.minimumSamples?'HIGH':'MEDIUM'):'LOW',facilityType:profile.facilityType||facilityType(address),facilityName:profile.name||'',identificationSource:profile.identificationSource||'UNCLASSIFIED',peakMinutes:peak};
  }
  function plan(booking,inputs={},settings={},context=booking.timingContext||{}){
    const fare=getFare(),rules=settings.fareRules||{},p=policy(booking.service,rules);
    const date=dateOnly(inputs.appointmentDate||booking.appointmentDate||booking.date);
    const pickupDate=dateOnly(booking.date||date),pickupTime=booking.pickupTime||booking.time||inputs.pickupTime;
    const suppliedPickup=fare.scheduledEpoch(pickupDate,pickupTime);
    const destinations=Array.isArray(booking.destinations)?booking.destinations:String(booking.destination||'').split(/\s*→\s*/).filter(Boolean);
    const outbound=inputs.passengerLegs?.[0]||inputs;
    const travel=fare.serviceTravel(outbound,booking.service,rules);
    const drives=travel.stopScheduledMinutes.length===destinations.length?travel.stopScheduledMinutes:[travel.scheduledMinutes];
    const stops=drives.length===destinations.length?destinations:[destinations.at(-1)||''];
    const appointments=inputs.stopAppointmentTimes?.length?inputs.stopAppointmentTimes:[inputs.finalAppointmentTime||booking.appointmentTime||booking.submittedAppointmentTime||''];
    const basis=String(inputs.scheduleBasis||booking.scheduleBasis||'PICKUP').toUpperCase();
    const legs=[],alerts=[];let cursor=suppliedPickup,waitingMinutes=0;
    function makeLeg(from,to,drive,start,deadline,kind){
      const loading=handling(from,booking.service,'PICKUP',start,context,rules);
      const receiving=handling(to,booking.service,'DROPOFF',deadline||start+drive*MINUTE,context,rules);
      const totalMinutes=loading.minutes+Math.ceil(drive)+receiving.minutes+p.bufferMinutes;
      let recommended=Number.isFinite(deadline)?deadline-totalMinutes*MINUTE:null;
      // Work backward repeatedly around peak-window boundaries, keeping the earliest safe result.
      for(let attempt=0;recommended!=null&&attempt<4;attempt++){
        const prep=handling(from,booking.service,'PICKUP',recommended,context,rules);
        const arrival= recommended+(prep.minutes+Math.ceil(drive))*MINUTE;
        const drop=handling(to,booking.service,'DROPOFF',arrival,context,rules);
        const candidate=deadline-(prep.minutes+Math.ceil(drive)+drop.minutes+p.bufferMinutes)*MINUTE;
        if(candidate>=recommended)break;recommended=candidate;
      }
      if(!Number.isFinite(start))start=recommended;
      if(!Number.isFinite(start))return null;
      const actualLoading=handling(from,booking.service,'PICKUP',start,context,rules);
      const departure=start+actualLoading.minutes*MINUTE,arrival=departure+Math.ceil(drive)*MINUTE;
      const actualReceiving=handling(to,booking.service,'DROPOFF',arrival,context,rules);
      const handoff=arrival+actualReceiving.minutes*MINUTE,available=handoff+p.bufferMinutes*MINUTE;
      const receivingHours=context.locations?.[addressKey(to)]?.receivingHours||[];
      const parts=localParts(arrival),day=new Date(parts.date+'T12:00:00Z').getUTCDay();
      if(receivingHours.length&&!receivingHours.some(w=>(!w.weekdays?.length||w.weekdays.includes(day))&&parts.time>=w.start&&localParts(handoff).date===parts.date&&localParts(handoff).time<=w.end))alerts.push({code:'RECEIVING_CLOSED',leg:legs.length,message:'Confirm receiving-facility hours before accepting this trip.'});
      if(Number.isFinite(deadline)&&available>deadline)alerts.push({code:'APPOINTMENT_AT_RISK',leg:legs.length,minutes:Math.ceil((available-deadline)/MINUTE),message:'Preparation, driving and handoff exceed the appointment check-in deadline.'});
      return {kind,from,to,crewArrivalAt:start,patientDepartureAt:departure,patientArrivalAt:arrival,handoffCompleteAt:handoff,vehicleAvailableAt:available,recommendedPickupAt:recommended,deadlineAt:Number.isFinite(deadline)?deadline:null,drivingMinutes:Math.ceil(drive),pickupMinutes:actualLoading.minutes,handoffMinutes:actualReceiving.minutes,bufferMinutes:p.bufferMinutes,pickupHandling:actualLoading,destinationHandling:actualReceiving};
    }
    for(let i=0;i<stops.length;i++){
      const appointment=fare.scheduledEpoch(date,appointments[i]);
      const deadline=Number.isFinite(appointment)?appointment-(inputs.deadlineBasis==='HANDOFF'?0:p.checkInLeadMinutes)*MINUTE:NaN;
      const from=i?stops[i-1]:booking.pickup;
      let start=cursor;
      if(basis==='APPOINTMENT'||i){
        const alertCount=alerts.length,provisional=makeLeg(from,stops[i],drives[i],NaN,deadline,'OUTBOUND');
        if(provisional){start=provisional.crewArrivalAt;alerts.length=alertCount;}
        if(i&&Number.isFinite(cursor)){
          if(start<cursor){alerts.push({code:'TIGHT_CONNECTION',leg:i,message:'The next stop cannot be reached with the required preparation and handoff time.'});start=cursor;}
          else waitingMinutes+=(start-cursor)/MINUTE;
        }
      }
      const leg=makeLeg(from,stops[i],drives[i],start,deadline,'OUTBOUND');
      if(leg){legs.push(leg);cursor=leg.vehicleAvailableAt;}
    }
    const round=String(booking.tripType||'').toUpperCase()==='ROUND_TRIP';
    if(round&&legs.length){
      const ret=fare.serviceTravel(inputs.passengerLegs?.[1]||{...inputs,miles:inputs.miles},booking.service,rules);
      const returnAt=fare.scheduledEpoch(dateOnly(booking.returnTripDate||date),booking.returnTripTime);
      if(Number.isFinite(returnAt)){
        if(returnAt<cursor)alerts.push({code:'TIGHT_RETURN',message:'Return pickup overlaps outbound handoff and preparation.'});
        waitingMinutes+=Math.max(0,(returnAt-cursor)/MINUTE);
      }else alerts.push({code:'RETURN_TIME_PENDING',message:'Return pickup time is needed to confirm vehicle availability.'});
      const leg=makeLeg(stops.at(-1),booking.pickup,ret.scheduledMinutes,Math.max(cursor,Number.isFinite(returnAt)?returnAt:cursor),NaN,'RETURN');
      legs.push(leg);cursor=leg.vehicleAvailableAt;
    }
    if(!legs.length)return null;
    if(!booking.reference&&legs[0].crewArrivalAt<Date.now()&&legs[0].deadlineAt>Date.now())alerts.push({code:'PICKUP_WINDOW_PASSED',message:'The recommended pickup time has passed. Choose a later deadline or contact dispatch.'});
    const drivingMinutes=legs.reduce((n,l)=>n+l.drivingMinutes,0),preparationMinutes=legs.reduce((n,l)=>n+l.pickupMinutes+l.handoffMinutes,0),bufferMinutes=legs.length*p.bufferMinutes;
    const routingPending=!(travel.scheduledMinutes>0);
    if(routingPending)alerts.push({code:'ROUTE_PENDING',message:'Driving time needs a route estimate.'});
    const confidence=routingPending||legs.some(l=>l.pickupHandling.confidence==='LOW'||l.destinationHandling.confidence==='LOW')?'LOW':legs.every(l=>l.pickupHandling.confidence==='HIGH'&&l.destinationHandling.confidence==='HIGH')?'HIGH':'MEDIUM';
    return {version:1,timezone:'America/New_York',confidence,source:confidence==='LOW'?'Planning allowances; limited facility history':'Completed-trip facility history',legs,alerts,routingPending,returnTimePending:round&&!booking.returnTripTime,recommendedPickupAt:legs[0].recommendedPickupAt||legs[0].crewArrivalAt,crewArrivalAt:legs[0].crewArrivalAt,patientArrivalAt:legs[0].patientArrivalAt,vehicleAvailableAt:cursor,drivingMinutes,preparationMinutes,bufferMinutes,waitingMinutes:Math.round(waitingMinutes),totalMinutes:Math.ceil((cursor-legs[0].crewArrivalAt)/MINUTE)};
  }
  function predict(planValue,milestones=[],now=Date.now()){
    if(!planValue?.legs?.length)return null;
    const events=milestones.filter(e=>Number.isFinite(Date.parse(e.createdAt||e.created_at))).sort((a,b)=>Date.parse(a.createdAt||a.created_at)-Date.parse(b.createdAt||b.created_at));
    const latest=events.at(-1);if(!latest)return {...planValue,predicted:false};
    const at=Date.parse(latest.createdAt||latest.created_at),status=latest.status;
    const completed=events.filter(e=>e.status==='DELIVERED').length;
    const index=Math.min(planValue.legs.length-1,Math.max(0,completed-(status==='DELIVERED'?1:0))),leg=planValue.legs[index];
    let arrival=leg.patientArrivalAt,available=leg.vehicleAvailableAt;
    if(['ARRIVED_PICKUP','PATIENT_READY','PATIENT_ON_BOARD','PATIENT_SECURED'].includes(status)){
      const remaining=['PATIENT_ON_BOARD','PATIENT_SECURED'].includes(status)?0:Math.max(0,leg.pickupMinutes-(now-at)/MINUTE);
      arrival=Math.max(now,at)+remaining*MINUTE+leg.drivingMinutes*MINUTE;available=arrival+(leg.handoffMinutes+leg.bufferMinutes)*MINUTE;
    }else if(status==='DEPARTED'){arrival=Math.max(now,at+leg.drivingMinutes*MINUTE);available=arrival+(leg.handoffMinutes+leg.bufferMinutes)*MINUTE;}
    else if(status==='ARRIVED_DESTINATION'){arrival=at;available=Math.max(now,at+leg.handoffMinutes*MINUTE)+leg.bufferMinutes*MINUTE;}
    else if(['DELIVERED','COMPLETED'].includes(status)){arrival=leg.patientArrivalAt;available=at+(status==='COMPLETED'?0:leg.bufferMinutes*MINUTE);}
    const late=status==='COMPLETED'?0:Math.max(0,Math.ceil((available-(leg.deadlineAt||leg.vehicleAvailableAt))/MINUTE));
    let finalAvailability=available;
    if(status!=='COMPLETED')for(const next of planValue.legs.slice(index+1))finalAvailability=Math.max(finalAvailability,next.crewArrivalAt)+(next.pickupMinutes+next.drivingMinutes+next.handoffMinutes+next.bufferMinutes)*MINUTE;
    return {...planValue,predicted:true,predictionSource:'DRIVER_MILESTONES_AND_PLANNED_TRAVEL',activeLegIndex:index,predictedPatientArrivalAt:arrival,predictedVehicleAvailableAt:finalAvailability,delayMinutes:late,alerts:late?[...planValue.alerts,{code:'LIVE_DELAY',minutes:late,message:`Current trip progress puts handoff ${late} minutes behind plan; review the next assignment.`}]:planValue.alerts};
  }
  const overlaps=(a,b)=>a.start<b.end&&b.start<a.end;
  return {policy,plan,predict,addressKey,facilityType,localParts,bucket,percentile,overlaps};
});
