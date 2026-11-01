(function(root,factory){
  const engine=factory();
  if(typeof module==='object'&&module.exports) module.exports=engine;
  else root.NexusFare=engine;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  // Interpret pickup times in the operating timezone, including DST on Node and browsers.
  function scheduledEpoch(date,time){
    const target=Date.parse(date+'T'+(time||'00:00')+':00Z');
    if(!Number.isFinite(target))return NaN;
    let guess=target;
    const fmt=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
    for(let i=0;i<3;i++){
      const p=Object.fromEntries(fmt.formatToParts(new Date(guess)).map(x=>[x.type,x.value]));
      const wall=Date.parse(p.year+'-'+p.month+'-'+p.day+'T'+p.hour+':'+p.minute+':'+p.second+'Z');
      guess+=target-wall;
    }
    return guess;
  }
  function getNthWeekdayOfMonth(year, monthIndex, weekday, nth){
    const first = new Date(year, monthIndex, 1);
    const offset = (weekday - first.getDay() + 7) % 7;
    return new Date(year, monthIndex, 1 + offset + ((nth - 1) * 7));
  }

  function getLastWeekdayOfMonth(year, monthIndex, weekday){
    const last = new Date(year, monthIndex + 1, 0);
    const offset = (last.getDay() - weekday + 7) % 7;
    return new Date(year, monthIndex, last.getDate() - offset);
  }

  function sameCalendarDate(a, b){
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  }

  function isFederalHoliday(dateInput){
    const d = new Date(dateInput || new Date());
    d.setHours(12, 0, 0, 0);
    const y = d.getFullYear();
    const holidays = [
      new Date(y, 0, 1),
      getNthWeekdayOfMonth(y, 0, 1, 3),
      getNthWeekdayOfMonth(y, 1, 1, 3),
      getLastWeekdayOfMonth(y, 4, 1),
      new Date(y, 5, 19),
      new Date(y, 6, 4),
      getNthWeekdayOfMonth(y, 8, 1, 1),
      getNthWeekdayOfMonth(y, 9, 1, 2),
      new Date(y, 10, 11),
      getNthWeekdayOfMonth(y, 10, 4, 4),
      new Date(y, 11, 25)
    ];
    // Include observed weekdays and next year's New Year when observed on Dec 31.
    holidays.push(new Date(y + 1, 0, 1));
    return holidays.some((holiday) => {
      const observed = new Date(holiday);
      if(observed.getDay() === 6) observed.setDate(observed.getDate() - 1);
      if(observed.getDay() === 0) observed.setDate(observed.getDate() + 1);
      return sameCalendarDate(holiday, d) || sameCalendarDate(observed, d);
    });
  }

  function getTripWindow(dateStr, timeStr, durationMinutes = 0){
    const dateParts = String(dateStr || '').split('-').map(Number);
    const timeParts = String(timeStr || '').split(':').map(Number);
    const validDate = dateParts.length === 3 && dateParts.every(Number.isFinite);
    const validTime = timeParts.length >= 2 && timeParts.slice(0,2).every(Number.isFinite);
    const start = validDate && validTime
      ? new Date(dateParts[0], dateParts[1] - 1, dateParts[2], timeParts[0], timeParts[1], 0, 0)
      : new Date(NaN);
    const end = new Date(start.getTime() + (Math.max(0, Number(durationMinutes) || 0) * 60000));
    return { start, end };
  }

  function getPremiumRateReason(dateStr, timeStr, durationMinutes = 0){
    const {start,end}=getTripWindow(dateStr,timeStr,durationMinutes);
    if(!Number.isFinite(start.getTime())) return 'after-hours';
    for(let cursor=new Date(start.getFullYear(),start.getMonth(),start.getDate());cursor<=end;cursor.setDate(cursor.getDate()+1)){
      if(cursor.getDay()===0||cursor.getDay()===6) return 'weekend';
      if(isFederalHoliday(cursor)) return 'holiday';
    }
    const opens=new Date(start.getFullYear(),start.getMonth(),start.getDate(),7,0,0,0);
    const closes=new Date(start.getFullYear(),start.getMonth(),start.getDate(),19,0,0,0);
    return start<opens||end>closes?'after-hours':'';
  }

  function travelPolicy(service,rules={}){
    const key=normalizeService(service),policy=rules.servicePolicies?.[key]||{};
    const bounded=(value,fallback,min,max)=>Number.isFinite(Number(value))&&value!=null&&value!==''?Math.min(max,Math.max(min,Number(value))):fallback;
    const ambulance=['bls','als1','als2','facility_transfer_critical'].includes(key);
    const defaultReduction=key==='wheelchair'?10:key==='stretcher'?20:ambulance?25:key==='bariatric'?35:0;
    // Replace the former zero defaults once; subsequent explicit settings remain editable.
    const migrateZero=Number(policy.speedReductionMph)===0&&((!(Number(rules.serviceTravelPolicyVersion)>=2)&&(key==='stretcher'||ambulance))||(!(Number(rules.serviceTravelPolicyVersion)>=3)&&key==='bariatric'));
    const speedReductionMph=bounded(migrateZero?null:policy.speedReductionMph,defaultReduction,0,key==='bariatric'?35:30);
    const minimumPlanningSpeedMph=bounded(rules.minimumPlanningSpeedMph,5,1,30),cruisingReferenceSpeedMph=bounded(rules.cruisingReferenceSpeedMph,65,40,85);
    return {speedReductionMph,minimumPlanningSpeedMph,cruisingReferenceSpeedMph,speedModel:rules.serviceSpeedModel==='CRUISING_CEILING'?'CRUISING_CEILING':'ROUTE_AVERAGE',cruisingCeilingMph:Math.max(minimumPlanningSpeedMph,cruisingReferenceSpeedMph-speedReductionMph),transitionBufferMinutes:bounded(policy.transitionBufferMinutes,key==='wheelchair'?15:['stretcher','bariatric'].includes(key)?25:10,0,120)};
  }
  function serviceTravel(route={},service,rules={}){
    const policy=travelPolicy(service,rules);
    const adjust=(miles,base,traffic)=>{
      miles=Math.max(0,Number(miles)||0);base=Math.max(0,Number(base)||0);traffic=Math.max(base,Number(traffic)||0);
      const routeAverageMph=base>0?miles*60/base:0;
      // The cruising ceiling applies only where the road baseline exceeds it.
      // Google city travel and traffic delays remain the minimum time estimate.
      const serviceAverageMph=routeAverageMph>0?Math.min(routeAverageMph,policy.speedModel==='CRUISING_CEILING'?policy.cruisingCeilingMph:Math.max(policy.minimumPlanningSpeedMph,routeAverageMph-policy.speedReductionMph)):0;
      const serviceDurationMinutes=serviceAverageMph>0&&serviceAverageMph<routeAverageMph?Math.max(base,miles*60/serviceAverageMph):base;
      const trafficDelayMinutes=Math.max(0,traffic-base);
      return {routeAverageMph,serviceAverageMph,serviceDurationMinutes,serviceTrafficDurationMinutes:serviceDurationMinutes+trafficDelayMinutes,trafficDelayMinutes};
    };
    const value=adjust(route.miles,route.durationMinutes,route.trafficDurationMinutes);
    const distances=route.stopDistancesMiles||[],durations=route.stopDurationMinutes||[],traffic=route.stopTrafficDurationMinutes||durations;
    const stops=distances.length&&distances.length===durations.length?distances.map((miles,index)=>adjust(miles,durations[index],traffic[index])):[];
    if(stops.length){value.serviceDurationMinutes=stops.reduce((sum,stop)=>sum+stop.serviceDurationMinutes,0);value.serviceTrafficDurationMinutes=stops.reduce((sum,stop)=>sum+stop.serviceTrafficDurationMinutes,0);value.trafficDelayMinutes=stops.reduce((sum,stop)=>sum+stop.trafficDelayMinutes,0);value.serviceAverageMph=value.serviceDurationMinutes>0?Number(route.miles)*60/value.serviceDurationMinutes:0;}
    return {...value,...policy,scheduledMinutes:value.serviceTrafficDurationMinutes,stopScheduledMinutes:stops.map(stop=>stop.serviceTrafficDurationMinutes)};
  }
  function formatTravelMinutes(value){
    const minutes=Math.ceil(Math.max(0,Number(value)||0)-1e-9);
    if(!minutes)return 'Time pending';
    if(minutes>=1440)return `${Math.floor(minutes/1440)}d${minutes%1440>=60?` ${Math.floor(minutes%1440/60)}h`:''}${minutes%60?` ${minutes%60}m`:''}`;
    return minutes<60?`${minutes} min`:`${Math.floor(minutes/60)}h${minutes%60?` ${minutes%60}m`:''}`;
  }
  const fuelProfiles={
    ambulance:{label:'Diesel ambulance',efficiency:'9 MPG',rate:0.7052},
    bus:{label:'Gasoline bus',efficiency:'7.5 MPG',rate:0.5595},
    land_rover:{label:'Land Rover / SUV',efficiency:'18 MPG',rate:0.2842},
    gasoline_sedan:{label:'Gasoline sedan',efficiency:'30 MPG',rate:0.1399},
    hybrid_sedan:{label:'Hybrid sedan',efficiency:'45 MPG',rate:0.0933},
    electric_public:{label:'Electric sedan — public fast charging',efficiency:'0.30 kWh/mile',rate:0.18},
    electric_home:{label:'Electric sedan — home charging',efficiency:'0.30 kWh/mile',rate:0.0642},
    electric_depot:{label:'Electric sedan — commercial depot',efficiency:'0.30 kWh/mile',rate:0.0525}
  };
  function fuelPolicy(service,rules={},vehicleUnit='',requestedProfile=''){
    const classes={ambulatory:'land_rover',wheelchair:'bus',stretcher:'bus',broda:'bus',bariatric:'bus',bls:'ambulance',als1:'ambulance',als2:'ambulance',facility_transfer:'ambulance',facility_transfer_critical:'ambulance'};
    const serviceKey=normalizeService(service);
    const assigned=rules.vehicleFuelProfiles?.[vehicleUnit];
    const chosen=serviceKey==='ambulatory'&&fuelProfiles[requestedProfile]&&!['ambulance','bus'].includes(requestedProfile)?requestedProfile:'';
    const defaultProfile=chosen||(serviceKey==='ambulatory'?(rules.ambulatoryFuelProfile||'land_rover'):classes[serviceKey]);
    const vehicleClass=chosen||(fuelProfiles[assigned]?assigned:fuelProfiles[defaultProfile]?defaultProfile:'');
    const configured=rules.vehicleFuelRatesPerMile?.[vehicleClass];
    const hasVehicleRate=configured!=null&&configured!==''&&Number.isFinite(Number(configured))&&Number(configured)>=0;
    return {fuelVehicleClass:hasVehicleRate?vehicleClass:'',fuelVehicleLabel:hasVehicleRate?fuelProfiles[vehicleClass].label:'Fleet',fuelRatePerMile:hasVehicleRate?Number(configured):Math.max(0,Number(rules.fuelSurchargePerMile)||0)};
  }
  function calculate(input){
    const {service,miles,date:dateStr,time:timeStr,rate,rules:fareRules={},metrics:routeMetrics={}}=input;
    const policy=fareRules.servicePolicies?.[service]||{};
    const fuel=fuelPolicy(service,fareRules,input.vehicleUnit,input.fuelProfile);
    const tripType={value:input.tripType||'ONE_WAY'};
    const returnTripDate={value:input.returnDate||''},returnTripTime={value:input.returnTime||''};
    const CARD_PROCESSING_FEE_PCT=Number(fareRules.cardProcessingFeePct??3);
    const timingPlan=input.timingPlan||null;
    const waitMinutes=Math.max(0,Number(timingPlan?.waitingMinutes??input.waitMinutes)||0);
    const waiting=getWaitingCharge(waitMinutes,rate,fareRules,service);
    const includedMiles = Number(rate.includedMiles || 0);
    const passengerLegCount = String(tripType?.value || 'ONE_WAY').toUpperCase() === 'ROUND_TRIP' ? 2 : 1;
    const measured=Array.isArray(routeMetrics.passengerLegs)&&routeMetrics.passengerLegs.length===passengerLegCount?routeMetrics.passengerLegs:null;
    const premiumRuleKeys={'after-hours':'afterHoursSurchargePct',weekend:'weekendSurchargePct',holiday:'holidaySurchargePct'};
    const passengerLegs=Array.from({length:passengerLegCount},(_,index)=>{
      const route=measured?.[index]||{};
      const distance=Math.max(0,Number(route.miles??miles)||0);
      const billableMiles=Math.max(0,distance-includedMiles);
      const durationMinutes=Math.max(0,Number(route.durationMinutes??routeMetrics.durationMinutes)||0);
      const trafficDurationMinutes=Math.max(0,Number(route.trafficDurationMinutes??routeMetrics.trafficDurationMinutes)||0);
      const travel=serviceTravel({...route,miles:distance,durationMinutes,trafficDurationMinutes},service,fareRules);
      const overageMinutes=Math.max(0,trafficDurationMinutes-durationMinutes-Number(fareRules.trafficOverageGraceMinutes||0));
      const mileageCharge=billableMiles*Number(rate.perMile||0);
      const fuelCharge=distance*fuel.fuelRatePerMile;
      const trafficCharge=overageMinutes/60*Math.max(0,Number(policy.trafficOverageFeePerHour??fareRules.trafficOverageFeePerHour??0));
      const rawSubtotal=Number(rate.base||0)+mileageCharge+fuelCharge+trafficCharge;
      const date=index?returnTripDate.value||dateStr:dateStr;
      const time=index?(routeMetrics.returnTimePending?'12:00':returnTripTime.value||timeStr):timeStr;
      const timingLegs=timingPlan?.legs.filter(leg=>leg.kind===(index?'RETURN':'OUTBOUND'))||[];
      const operationalMinutes=timingLegs.length?(timingLegs.at(-1).vehicleAvailableAt-timingLegs[0].crewArrivalAt)/60000:travel.scheduledMinutes;
      const premiumReason=getPremiumRateReason(date,time,index&&routeMetrics.returnTimePending?0:operationalMinutes);
      const premiumPct=premiumReason?Number(policy[premiumRuleKeys[premiumReason]]??fareRules[premiumRuleKeys[premiumReason]]??30):0;
      const subtotal=Math.max(Number(fareRules.minimumFare||0),rawSubtotal*(1+premiumPct/100));
      return {...route,...travel,kind:index?'RETURN':'OUTBOUND',miles:distance,durationMinutes,trafficDurationMinutes,billableMiles,mileageCharge,fuelCharge,trafficCharge,premiumReason,premiumPct,subtotal,premiumAmount:subtotal-Math.max(Number(fareRules.minimumFare||0),rawSubtotal)};
    });
    const outbound=passengerLegs[0],returning=passengerLegs[1];
    const drivingMinutes=passengerLegs.reduce((sum,leg)=>sum+leg.scheduledMinutes,0);
    const transitionMinutes=timingPlan?0:Math.max(0,(outbound.stopScheduledMinutes?.length||1)-1)*travelPolicy(service,fareRules).transitionBufferMinutes;
    const journeyMinutes=timingPlan?.totalMinutes??(drivingMinutes+waitMinutes+transitionMinutes);
    const premiumRateReason=outbound.premiumReason,returnPremiumRateReason=returning?.premiumReason||'';
    const outboundPremiumPct=outbound.premiumPct,returnPremiumPct=returning?.premiumPct||0;
    const premiumAmount=passengerLegs.reduce((sum,leg)=>sum+leg.premiumAmount,0);
    const deadheadSegments = routeMetrics.deadheadSegments || [0,0];
    const deadheadRate = Math.max(0, Number(rate.perMile || 0)) * Number(fareRules.deadheadRatePct??50)/100;
    // Deadhead allowance rule (owner directive, 2026-11-01, v2 — supersedes
    // the same-day return-to-yard rule for the covered services). For
    // Ambulatory, Wheelchair, Bariatric, Stretcher, Broda and both IFT
    // services, the trip's empty miles share one 25-mile allowance: the
    // first 25 deadhead miles of the trip are free and only the miles over
    // 25 are billed, at the standard deadhead rate, on one-way and round
    // trips alike. The allowance replaces the per-segment included-miles
    // deduction for these services and is consumed by the empty segments
    // in order (the drive to the pickup first), so the per-segment rows
    // still sum to the trip's billable deadhead miles. BLS / ALS services
    // keep the earlier rule unchanged: on ONE-WAY trips the
    // destination→yard leg (segment 1) is billed on half of its actual
    // miles instead of the standard miles-beyond-included formula, still
    // priced at the deadhead rate; for Ambulatory / Wheelchair trips
    // under 20 loaded miles that leg is not billed at all (unreachable
    // for those services now that the allowance covers them, kept so the
    // legacy branch stays byte-for-byte the earlier rule). The yard→pickup
    // leg (segment 0) and every round-trip leg of a non-covered service
    // keep the standard formula.
    const DEADHEAD_ALLOWANCE_MILES = 25;
    const deadheadAllowanceServices = ['ambulatory','wheelchair','bariatric','stretcher','broda','facility_transfer','facility_transfer_critical'];
    const deadheadAllowanceApplies = deadheadAllowanceServices.includes(normalizeService(service));
    const oneWayTrip = passengerLegCount === 1;
    const returnLegExempt = oneWayTrip && ['ambulatory','wheelchair'].includes(normalizeService(service)) && outbound.miles < 20;
    let deadheadAllowanceRemaining = deadheadAllowanceApplies ? DEADHEAD_ALLOWANCE_MILES : 0;
    const deadheadDetails=deadheadSegments.map((segment,index)=>{
      const segmentMiles=Number(segment)||0;
      let billableMiles;
      if(deadheadAllowanceApplies){
        const allowanceUsed=Math.min(deadheadAllowanceRemaining,segmentMiles);
        deadheadAllowanceRemaining-=allowanceUsed;
        billableMiles=segmentMiles-allowanceUsed;
      }else{
        billableMiles=index===1&&oneWayTrip?(returnLegExempt?0:segmentMiles*0.5):Math.max(0,segmentMiles-includedMiles);
      }
      return {...routeMetrics.deadheadRoutes?.[index],miles:segmentMiles,includedMiles,billableMiles,rate:deadheadRate,charge:billableMiles*deadheadRate};
    });
    const deadheadCharge=deadheadDetails.reduce((sum,segment)=>sum+segment.charge,0);
    const deadheadBillableMiles=deadheadDetails.reduce((sum,segment)=>sum+segment.billableMiles,0);
    // Eligibility follows the current estimate time, never saved booking or
    // mock timestamps supplied with the trip's route inputs.
    const currentTime = Date.now();
    const urgentBaseCharge = (date, time) => {
      const pickupTime = scheduledEpoch(date,time);
      const hours = (pickupTime - currentTime) / 3600000;
      return hours >= 0 && hours <= Number(fareRules.shortNoticeHours??24) ? Math.max(0, Number(rate.base || 0)) * Number(fareRules.shortNoticeSurchargePct??30)/100 : 0;
    };
    let outboundPickupTime = timeStr;
    const shortNoticeCharge = urgentBaseCharge(dateStr, outboundPickupTime) + (passengerLegCount === 2 && !routeMetrics.returnTimePending ? urgentBaseCharge(returnTripDate?.value || dateStr, returnTripTime?.value || timeStr) : 0);
    const normalizedSubtotal = passengerLegs.reduce((sum,leg)=>sum+leg.subtotal,0) + waiting.waitCharge + deadheadCharge + shortNoticeCharge;
    const taxRatePct = CARD_PROCESSING_FEE_PCT;
    const taxAmount = normalizedSubtotal * (taxRatePct / 100);
    return {
      ...waiting,...fuel,drivingMinutes,transitionMinutes,journeyMinutes,timingPlan,
      deadheadSegments, deadheadDetails, deadheadRate, deadheadCharge, deadheadBillableMiles, deadheadAllowanceMiles: deadheadAllowanceApplies ? DEADHEAD_ALLOWANCE_MILES : 0, shortNoticeCharge,
      includedMiles,
      passengerLegs,passengerLegCount,passengerMilesTotal:passengerLegs.reduce((sum,leg)=>sum+leg.miles,0),
      mileageCharge:passengerLegs.reduce((sum,leg)=>sum+leg.mileageCharge,0),
      fuelCharge:passengerLegs.reduce((sum,leg)=>sum+leg.fuelCharge,0),trafficCharge:passengerLegs.reduce((sum,leg)=>sum+leg.trafficCharge,0),
      fuelChargePerLeg:outbound.fuelCharge,trafficChargePerLeg:outbound.trafficCharge,
      billableMilesPerLeg:outbound.billableMiles,mileageChargePerLeg:outbound.mileageCharge,
      subtotal: normalizedSubtotal,
      taxAmount,
      total: normalizedSubtotal + taxAmount,
      taxRatePct,
      premiumRatePct: Math.max(outboundPremiumPct,returnPremiumPct),
      outboundPremiumPct,returnPremiumPct,
      premiumRateReason,
      returnPremiumRateReason,
      premiumAmount
    };
  }

  function getWaitingCharge(waitMinutes,rate,rules={},service=''){
    // Migrate the previous immediate-wait policy even when a client receives old settings.
    const freeWaitMinutes=Number(rules.waitingPolicyVersion)>=2?Math.max(0,Number(rules.servicePolicies?.[service]?.freeWaitMinutes??rules.freeWaitMinutes??15)):15;
    const minutes=Math.max(0,Number(waitMinutes)||0);
    const billableWaitMinutes=Math.max(0,minutes-freeWaitMinutes);
    const waitPer15=Math.max(0,Number(rate.waitPer15)||0);
    return {waitMinutes:minutes,freeWaitMinutes,billableWaitMinutes,waitPer15,waitCharge:Math.ceil(billableWaitMinutes/15)*waitPer15};
  }

  function roundMoney(value){return Math.round((Number(value)+1e-9)*100)/100;}
  function applySavings(value,discountPct){
    const fullFare=roundMoney(Math.max(0,Number(value)||0));
    const total=roundMoney(fullFare*(1-Number(discountPct)/100));
    return {fullFare,total,memberSavings:roundMoney(fullFare-total)};
  }
  function calculateBooking(booking,inputs,settings){
    if(inputs.fuelProfile&&(normalizeService(booking.service)!=='ambulatory'||!Object.prototype.hasOwnProperty.call(fuelProfiles,inputs.fuelProfile)||['ambulance','bus'].includes(inputs.fuelProfile)))throw Error('Invalid Ambulatory vehicle fuel profile');
    for(const key of ['miles','durationMinutes','trafficDurationMinutes','stopWaitMinutes','discountPct']){
      if(inputs[key]==null||inputs[key]===''||!Number.isFinite(Number(inputs[key]))||Number(inputs[key])<0)throw Error(`Missing or invalid fare input: ${key}`);
    }
    if(![0,5,10].includes(Number(inputs.discountPct)))throw Error('Booking savings must be 0%, 5% or 10%');
    if(!Array.isArray(inputs.deadheadSegments)||inputs.deadheadSegments.length<2||inputs.deadheadSegments.some(value=>value==null||value===''||!Number.isFinite(Number(value))||Number(value)<0))throw Error('Verified empty-mile segments are required');
    const service=String(booking.service||'').trim().toLowerCase();
    const rate=settings?.pricing?.[service];
    if(!rate)throw Error('Current service pricing is unavailable');
    // Normalize every date the fare math reads, once, up front. Bookings arrive
    // with dates in many shapes — ISO strings, US numeric forms, month names,
    // and JS Date objects from the database — and the math below needs ISO.
    // Normalizing here (instead of slice(0,10) on the raw value) keeps a
    // non-ISO date from blocking a save the editor cannot fix.
    const bookingDateISO=bookingDate(booking.date);
    const appointmentDateISO=bookingDate(booking.appointmentDate||booking.date);
    const returnDateISO=bookingDate(booking.returnTripDate);
    const pickup=scheduledEpoch(bookingDateISO,booking.time);
    if(!Number.isFinite(pickup))throw Error('Pickup date and time are required');
    const travel=serviceTravel(inputs.passengerLegs?.[0]||inputs,service,settings.fareRules||{});
    const appointments=inputs.stopAppointmentTimes||[];
    const stopWait=appointments.length>1&&travel.stopScheduledMinutes.length===appointments.length?appointments.slice(0,-1).reduce((sum,time,index)=>{
      const arrival=scheduledEpoch(appointmentDateISO,time);
      const departure=scheduledEpoch(bookingDateISO,appointments[index+1])-15*60000-Math.ceil(travel.stopScheduledMinutes[index+1])*60000-travel.transitionBufferMinutes*60000;
      return sum+Math.max(0,(departure-arrival)/60000);
    },0):Number(inputs.stopWaitMinutes);
    let returnWait=0;
    if(booking.tripType==='ROUND_TRIP'&&!booking.returnTimePending){
      const returnAt=scheduledEpoch(returnDateISO,booking.returnTripTime);
      if(!Number.isFinite(returnAt)||returnAt<pickup)throw Error('Verify the return date and pickup time');
      const finalAppointment=inputs.finalAppointmentTime||booking.appointmentTime;
      const isAppointment=inputs.scheduleBasis==='APPOINTMENT'||(!inputs.scheduleBasis&&finalAppointment&&!/Schedule basis:\s*PICKUP/i.test(String(booking.notes||'')));
      const transitionMinutes=Math.max(0,travel.stopScheduledMinutes.length-1)*travel.transitionBufferMinutes;
      const appointmentAt=scheduledEpoch(appointmentDateISO,finalAppointment);
      const arrival=isAppointment?appointmentAt:Math.max(pickup+Math.ceil(travel.scheduledMinutes+stopWait+transitionMinutes)*60000,Number.isFinite(appointmentAt)?appointmentAt:0);
      if(!Number.isFinite(arrival))throw Error('Final appointment time is required');
      returnWait=Math.max(0,Math.round((returnAt-arrival)/60000));
    }
    const timing=typeof module==='object'&&module.exports?require('./nexus-trip-timing.js'):globalThis.NexusTripTiming;
    const timingPlan=settings.fareRules?.smartTiming?.enabled&&timing?timing.plan(booking,inputs,settings):null;
    const plannedPickup=timingPlan?timing.localParts(timingPlan.crewArrivalAt):null;
    const result=calculate({service,vehicleUnit:booking.vehicleUnit,fuelProfile:inputs.fuelProfile,rate,rules:settings.fareRules||{},timingPlan,miles:Number(inputs.miles),date:plannedPickup?.date||bookingDateISO,time:plannedPickup?.time||booking.time,tripType:booking.tripType,
      returnDate:returnDateISO,returnTime:booking.returnTripTime,
      waitMinutes:stopWait+returnWait,
      metrics:{durationMinutes:Number(inputs.durationMinutes),trafficDurationMinutes:Number(inputs.trafficDurationMinutes),passengerLegs:inputs.passengerLegs,deadheadRoutes:inputs.deadheadRoutes,deadheadSegments:inputs.deadheadSegments.map(Number),returnTimePending:booking.returnTimePending}});
    const savings=applySavings(result.total,inputs.discountPct);
    return {...result,returnTimePending:!!booking.returnTimePending,discountPct:Number(inputs.discountPct),discountAmount:savings.memberSavings,discountedTotal:savings.total};
  }
  function durationMinutes(text){
    const value=String(text||'');
    let total=0;
    for(const match of value.matchAll(/(\d+(?:\.\d+)?)\s*(hours?|hrs?|h|minutes?|mins?|m)\b/gi))total+=Number(match[1])*(match[2].toLowerCase().startsWith('h')?60:1);
    return total||Math.max(0,Number(value)||0);
  }
  function normalizeService(value){
    const raw=String(value||'').trim().toLowerCase().replace(/[ -]+/g,'_');
    if(['suv','sedan','gasoline_sedan','hybrid_sedan','electric_sedan','land_rover','range_rover'].includes(raw))return 'ambulatory';
    if(raw==='wc'||raw.startsWith('wheelchair'))return 'wheelchair';
    if(raw==='amb'||raw.startsWith('ambulatory'))return 'ambulatory';
    if(raw.startsWith('stretcher'))return 'stretcher';
    if(raw.startsWith('bariatric')||raw==='additional_capacity')return 'bariatric';
    if(raw.startsWith('broda'))return 'broda';
    if(/(^|_)als(?:_?2|_ii)(?:_|$)/.test(raw))return 'als2';
    if(/(^|_)als(?:_?1|_i)?(?:_|$)/.test(raw))return 'als1';
    if(raw==='ambulance'||/(^|_)bls(?:_|$)/.test(raw))return 'bls';
    if(raw==='ift'||raw==='interfacility')return 'facility_transfer';
    if(raw==='cct'||raw.includes('critical'))return 'facility_transfer_critical';
    return raw;
  }
  // Read current and legacy bookings directly. Extra charges that were not entered
  // default to zero; they never prevent producing a fare from the available data.
  function resolveBookingInputs(booking,settings={}){
    const notes=String(booking.notes||'');
    let saved=booking.fareInputs&&typeof booking.fareInputs==='object'?booking.fareInputs:booking.fareCalculation?.inputs||{};
    if(!Object.keys(saved).length){try{saved=JSON.parse(notes.match(/Fare inputs: (\{[^\n|]*\})/)?.[1]||'{}');}catch{}}
    const matchesRoute=route=>routeMatchesBooking(route,booking)&&(!settings.organization?.yardAddress||String(route.routeAddresses?.yard||'').trim().toLowerCase()===String(settings.organization.yardAddress).trim().toLowerCase());
    if(saved.routeVerified&&!matchesRoute(saved)){
      const {routeVerified,routeAddresses,passengerLegs,deadheadRoutes,deadheadSegments,miles,durationMinutes,trafficDurationMinutes,mileageSource,...other}=saved;
      saved=other;
    }
    const route=booking.routeFareInputs;
    if(route?.routeVerified&&matchesRoute(route))saved={...saved,...route,...(saved.fuelProfile!=null?{fuelProfile:saved.fuelProfile}:{})};
    let legacy={};
    try{legacy=JSON.parse(notes.match(/Fare breakdown: (\{.*\})\. Member savings:/)?.[1]||'{}');}catch{}
    const intake=booking.intakePayload||{};
    const number=(...values)=>{
      for(const value of values)if(value!=null&&value!==''&&Number.isFinite(Number(value))&&Number(value)>=0)return Number(value);
      return 0;
    };
    const source=String(booking.bookingSource||booking.booking_source||'CUSTOMER').toUpperCase();
    const repeat=['ROUND_TRIP','RECURRING'].includes(resolveTripSchedule(booking).tripType);
    const member=['PATIENT','STAFF','DISPATCH','FACILITY','DRIVER_REFERRAL'].includes(source);
    const discountPct=number(saved.discountPct,booking.memberDiscountPct,intake.member_discount_pct,notes.match(/Member savings: (\d+)%/)?.[1],source==='BROKER'?0:repeat?(member?10:5):member?5:0);
    const emptyText=notes.match(/empty segments:\s*([^|\n]+)/i)?.[1]||'';
    const emptySegments=Array.from(emptyText.matchAll(/(\d+(?:\.\d+)?)\s*mi/g),match=>Number(match[1]));
    const segments=saved.deadheadSegments||booking.deadheadSegments||legacy.deadheadSegments||intake.deadhead_segments||emptySegments;
    const time=bookingTime;
    const pickupTime=time(booking.pickupTime||booking.time||booking.trip_time||intake.pickup_time||notes.match(/Pickup estimate: (\d{2}:\d{2})/)?.[1]);
    const appointmentTime=time(booking.appointmentTime||booking.submittedAppointmentTime||intake.appointment_time||intake.trip_time);
    const elapsed=(start,end)=>{const minutes=value=>Number(value.slice(0,2))*60+Number(value.slice(3,5));return start&&end?Math.max(0,minutes(end)-minutes(start)-15):0;};
    const durationText=String(booking.estimatedDuration||booking.estimated_duration||intake.estimated_duration||'');
    const appointments=Array.isArray(saved.stopAppointmentTimes)?saved.stopAppointmentTimes:Array.from(notes.matchAll(/Stop \d+ \([^)]*\): (\d{2}:\d{2})/g),match=>match[1]);
    const stops=Array.from(notes.matchAll(/Stop \d+: (\d+(?:\.\d+)?) min/g),match=>Number(match[1]));
    const explicitStopWait=Array.isArray(booking.stopWaitMinutes)?booking.stopWaitMinutes.reduce((sum,value)=>sum+number(value),0):booking.stopWaitMinutes;
    const oneWayWait=repeat?undefined:booking.waitMinutes??intake.wait_minutes??notes.match(/Additional driver waiting:\s*(\d+(?:\.\d+)?) min/)?.[1];
    const storedMiles=number(booking.distanceMiles,booking.distance_miles,saved.miles,intake.distance_miles,intake.miles);
    const brokerTotal=source==='BROKER'&&repeat&&intake.total_miles!=null&&Number(intake.total_miles)===storedMiles;
    return {
      miles:saved.routeVerified?number(saved.miles):brokerTotal?storedMiles/2:storedMiles,
      passengerLegs:saved.routeVerified?saved.passengerLegs:undefined,deadheadRoutes:saved.deadheadRoutes,
      routeVerified:!!saved.routeVerified,routeAddresses:saved.routeAddresses,measuredAt:saved.measuredAt,routeSchedule:saved.routeSchedule,mileageSource:saved.mileageSource||(brokerTotal?'BROKER_TOTAL':'SAVED_MILEAGE'),
      durationMinutes:number(saved.durationMinutes,booking.durationMinutes,intake.duration_minutes,durationText?durationMinutes(durationText.split(/traffic/i)[0]):undefined,elapsed(pickupTime,appointmentTime)),
      trafficDurationMinutes:number(saved.trafficDurationMinutes,booking.trafficDurationMinutes,intake.traffic_duration_minutes,durationText.match(/traffic[^\d]*([^)]*)/i)?.[1]?durationMinutes(durationText.match(/traffic[^\d]*([^)]*)/i)[1]):undefined),
      stopWaitMinutes:number(saved.stopWaitMinutes,explicitStopWait,oneWayWait,stops.length?stops.reduce((sum,value)=>sum+value,0):undefined,repeat?undefined:legacy.waitMinutes),
      stopAppointmentTimes:appointments,
      deadheadSegments:Array.isArray(segments)&&segments.length?segments.map(value=>number(value)):[number(booking.deadheadToPickupMiles,intake.deadhead_to_pickup_miles),number(booking.deadheadAfterTripMiles,intake.deadhead_after_trip_miles)],
      discountPct:[0,5,10].includes(discountPct)?discountPct:0,
      scheduleBasis:saved.scheduleBasis||booking.scheduleBasis||(/Schedule basis:\s*PICKUP/i.test(notes)?'PICKUP':'APPOINTMENT'),
      finalAppointmentTime:appointments.at(-1)||appointmentTime||saved.finalAppointmentTime||'',
      pickupTime,fuelProfile:normalizeService(booking.service)==='ambulatory'?saved.fuelProfile||'':''
      ,appointmentDate:bookingDate(saved.appointmentDate||booking.appointmentDate||booking.date),deadlineBasis:saved.deadlineBasis||'APPOINTMENT',facilityPlaces:saved.facilityPlaces||[]
    };
  }
  function routeMatchesBooking(route,booking){
    const address=value=>String(value||'').trim().toLowerCase().replace(/\s+/g,' ');
    const locations=route.routeAddresses;
    if(!locations)return false;
    const destinations=Array.isArray(booking.destinations)?booking.destinations:String(booking.destination||'').split(/\s*→\s*/);
    return address(locations.pickup)===address(booking.pickup)&&JSON.stringify((locations.destinations||[]).map(address))===JSON.stringify(destinations.map(address))&&(locations.tripType==='ROUND_TRIP')===(resolveTripSchedule(booking).tripType==='ROUND_TRIP');
  }
  function bookingDate(value){
    if(Object.prototype.toString.call(value)==='[object Date]'&&Number.isFinite(value.getTime()))return value.getFullYear()+'-'+String(value.getMonth()+1).padStart(2,'0')+'-'+String(value.getDate()).padStart(2,'0');
    const text=String(value||'').trim();
    const iso=text.match(/^\d{4}-\d{2}-\d{2}/);if(iso)return iso[0];
    // Accept a date only when its calendar components validate: reject impossible
    // dates (month 13, February 30) instead of silently coercing them.
    const valid=(y,m,d)=>{
      if(!Number.isFinite(y)||!Number.isFinite(m)||!Number.isFinite(d))return '';
      if(m<1||m>12||d<1||d>31)return '';
      const check=new Date(y,m-1,d);
      if(check.getFullYear()!==y||check.getMonth()!==m-1||check.getDate()!==d)return '';
      return y+'-'+String(m).padStart(2,'0')+'-'+String(d).padStart(2,'0');
    };
    const ymd=text.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);
    if(ymd)return valid(Number(ymd[1]),Number(ymd[2]),Number(ymd[3]));
    // Month-name forms: "Oct 30, 2026", "October 30 2026", "Thu Oct 30 2026 ...",
    // and Date.toString() output. The month name pins the field order, so these
    // are never read as day-first.
    const months={jan:1,january:1,feb:2,february:2,mar:3,march:3,apr:4,april:4,may:5,jun:6,june:6,jul:7,july:7,aug:8,august:8,sep:9,sept:9,september:9,oct:10,october:10,nov:11,november:11,dec:12,december:12};
    const named=text.match(/([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})/);
    if(named){
      const month=months[named[1].toLowerCase()];
      if(!month)return '';
      return valid(Number(named[3]),month,Number(named[2]));
    }
    // Numeric forms are month-first by convention (as before), except when the
    // first field cannot be a month — "30/10/2026" is day-first, not month 30.
    const slash=text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2}|\d{4})$/);
    if(slash){
      const first=Number(slash[1]),second=Number(slash[2]);
      const year=Number((slash[3].length===2?'20':'')+slash[3]);
      if(first>12&&second<=12)return valid(year,second,first);
      return valid(year,first,second);
    }
    // Last resort: a platform Date parse, accepted only when the parsed date
    // round-trips against the month name, day, and year written in the text,
    // so an ambiguous or partial string can never be silently reinterpreted.
    const parsed=new Date(text);
    if(Number.isFinite(parsed.getTime())){
      const monthToken=text.match(/[A-Za-z]{3,9}/);
      const dayToken=text.match(/\b(\d{1,2})(?:st|nd|rd|th)?\b/);
      const yearToken=text.match(/\b(\d{4})\b/);
      if(monthToken&&months[monthToken[0].toLowerCase()]===parsed.getMonth()+1&&dayToken&&Number(dayToken[1])===parsed.getDate()&&yearToken&&Number(yearToken[1])===parsed.getFullYear())return valid(parsed.getFullYear(),parsed.getMonth()+1,parsed.getDate());
    }
    return '';
  }
  function bookingTime(value){
    const match=String(value||'').trim().match(/(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?/i);
    if(!match)return '';
    let hour=Number(match[1]);const minute=Number(match[2]);const meridiem=String(match[3]||'').toUpperCase();
    if(meridiem){if(hour<1||hour>12)return '';hour=hour%12+(meridiem==='PM'?12:0);}
    return hour>=0&&hour<=23&&minute<=59?String(hour).padStart(2,'0')+':'+String(minute).padStart(2,'0'):'';
  }
  function resolveTripSchedule(booking){
    const intake=booking.intakePayload||{};
    const raw=intake.raw_fields||{};
    const note=String(booking.notes||'').match(/Round trip return:\s*(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})/);
    const type=value=>String(value||'').trim().toUpperCase().replace(/[ -]+/g,'_');
    const declared=type(booking.tripType||booking.trip_type);
    const intakeType=type(intake.trip_type||intake.tripType||raw.trip_type||raw.trip_schedule);
    const returning=intake.is_return_trip===true||['ROUND_TRIP','RETURN_TRIP','ROUNDTRIP','RT'].includes(intakeType);
    const tripType=booking.tripScheduleExplicit?declared||'ONE_WAY':declared==='ROUND_TRIP'||returning||note?'ROUND_TRIP':declared||'ONE_WAY';
    const date=bookingDate(booking.returnTripDate||booking.return_trip_date||(!booking.tripScheduleExplicit&&(intake.return_trip_date||raw.return_date||note?.[1]))||booking.date||booking.trip_date);
    const value=String(booking.returnTripTime||booking.return_trip_time||(!booking.tripScheduleExplicit&&(intake.return_trip_time||raw.return_pickup_time||raw.return_time||note?.[2]))||'').trim();
    const time=bookingTime(value)||null;
    return {tripType,returnTripDate:tripType==='ROUND_TRIP'?date:null,returnTripTime:tripType==='ROUND_TRIP'?time:null,returnTimePending:tripType==='ROUND_TRIP'&&!time};
  }
  function calculateEstimate(booking,settings){
    const inputs=resolveBookingInputs(booking,settings);
    if(inputs.deadheadSegments.length<2)inputs.deadheadSegments.push(0);
    const date=bookingDate(booking.date||booking.trip_date)||'2000-01-03';
    const normalized={...booking,service:normalizeService(booking.service),date,time:inputs.pickupTime||'12:00',createdAt:booking.createdAt||booking.created_at||booking.sourceReceivedAt||'1970-01-01T00:00:00Z',
      ...resolveTripSchedule({...booking,date})};
    if(!inputs.finalAppointmentTime)inputs.scheduleBasis='PICKUP';
    const fare=calculateBooking(normalized,inputs,settings);
    return {...fare,inputs};
  }
  return {calculate,calculateBooking,calculateEstimate,resolveTripSchedule,resolveBookingInputs,routeMatchesBooking,getWaitingCharge,applySavings,roundMoney,scheduledEpoch,getPremiumRateReason,travelPolicy,serviceTravel,formatTravelMinutes,fuelPolicy,fuelProfiles};
});
