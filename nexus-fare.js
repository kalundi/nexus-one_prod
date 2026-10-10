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

  function calculate(input){
    const {service,miles,date:dateStr,time:timeStr,rate,rules:fareRules={},metrics:routeMetrics={}}=input;
    const policy=fareRules.servicePolicies?.[service]||{};
    const tripType={value:input.tripType||'ONE_WAY'};
    const returnTripDate={value:input.returnDate||''},returnTripTime={value:input.returnTime||''};
    const CARD_PROCESSING_FEE_PCT=3;
    const deadheadRouteMiles={toPickup:0,fromDestination:0,fromReturn:0};
    const waitMinutes=Math.max(0,Number(input.waitMinutes)||0);
    const waitPer15=Math.max(0,Number(rate.waitPer15)||0);
    const getWaitingCharge=()=>({waitMinutes,freeWaitMinutes:0,billableWaitMinutes:waitMinutes,waitPer15,waitCharge:Math.ceil(waitMinutes/15)*waitPer15});
    const distance = Math.max(0, Number(miles) || 0);
    const includedMiles = Number(rate.includedMiles || 0);
    const billable = Math.max(0, distance - includedMiles);

    const fuelChargePerLeg=distance * Number(fareRules.fuelSurchargePerMile || 0);
    let trafficChargePerLeg=0;
    let subtotal = Number(rate.base || 0) + billable * Number(rate.perMile || 0) + fuelChargePerLeg;

    const scheduledMinutes = Math.max(0, Number(routeMetrics.durationMinutes || 0));
    const trafficMinutes = Math.max(0, Number(routeMetrics.trafficDurationMinutes || 0));
    const graceMinutes = Math.max(0, Number(fareRules.trafficOverageGraceMinutes || 0));
    const overageMinutes = Math.max(0, trafficMinutes - scheduledMinutes - graceMinutes);
    if(overageMinutes > 0){
      const trafficRate = Math.max(0, Number((policy.trafficOverageFeePerHour ?? fareRules.trafficOverageFeePerHour) ?? 0));
      trafficChargePerLeg=(overageMinutes / 60) * trafficRate;
      subtotal += trafficChargePerLeg;
    }

    const routeDurationMinutes=Math.max(scheduledMinutes,trafficMinutes);
    const premiumRateReason=getPremiumRateReason(dateStr,timeStr,routeDurationMinutes);
    const outboundSubtotal=Math.max(Number(fareRules.minimumFare || 0),subtotal*(premiumRateReason?1.30:1));
    // Price each passenger leg at its own scheduled date and pickup time.
    const passengerLegCount = String(tripType?.value || 'ONE_WAY').toUpperCase() === 'ROUND_TRIP' ? 2 : 1;
    const returnPremiumRateReason=passengerLegCount===2?getPremiumRateReason(returnTripDate?.value||dateStr,returnTripTime?.value||timeStr,routeDurationMinutes):'';
    const returnSubtotal=passengerLegCount===2?Math.max(Number(fareRules.minimumFare || 0),subtotal*(returnPremiumRateReason?1.30:1)):0;
    const premiumAmount=(outboundSubtotal-Math.max(Number(fareRules.minimumFare || 0),subtotal))+(returnSubtotal-(passengerLegCount===2?Math.max(Number(fareRules.minimumFare || 0),subtotal):0));
    const waiting = getWaitingCharge(service, routeMetrics);
    const deadheadSegments = routeMetrics.deadheadSegments || [deadheadRouteMiles.toPickup, passengerLegCount === 2 ? deadheadRouteMiles.fromReturn : deadheadRouteMiles.fromDestination];
    const deadheadRate = Math.max(0, Number(rate.perMile || 0)) / 2;
    const deadheadCharge = deadheadSegments.reduce((sum, segment) => sum + Math.max(0, Number(segment || 0) - includedMiles) * deadheadRate, 0);
    const bookingTime = Number(routeMetrics.bookingTime ?? Date.now());
    const urgentBaseCharge = (date, time) => {
      const pickupTime = scheduledEpoch(date,time);
      const hours = (pickupTime - bookingTime) / 3600000;
      return hours >= 0 && hours <= 24 ? Math.max(0, Number(rate.base || 0)) * .30 : 0;
    };
    let outboundPickupTime = timeStr;
    const shortNoticeCharge = urgentBaseCharge(dateStr, outboundPickupTime) + (passengerLegCount === 2 ? urgentBaseCharge(returnTripDate?.value || dateStr, returnTripTime?.value || timeStr) : 0);
    const normalizedSubtotal = outboundSubtotal + returnSubtotal + waiting.waitCharge + deadheadCharge + shortNoticeCharge;
    const taxRatePct = CARD_PROCESSING_FEE_PCT;
    const taxAmount = normalizedSubtotal * (taxRatePct / 100);
    return {
      ...waiting,
      deadheadSegments, deadheadRate, deadheadCharge, shortNoticeCharge,
      includedMiles,
      fuelChargePerLeg,trafficChargePerLeg,passengerLegCount,
      billableMilesPerLeg:billable,
      mileageChargePerLeg:billable * Number(rate.perMile || 0),
      subtotal: normalizedSubtotal,
      taxAmount,
      total: normalizedSubtotal + taxAmount,
      taxRatePct,
      premiumRatePct: premiumRateReason || returnPremiumRateReason ? 30 : 0,
      premiumRateReason,
      returnPremiumRateReason,
      premiumAmount
    };
  }


  function roundMoney(value){return Math.round((Number(value)+1e-9)*100)/100;}
  function applySavings(value,discountPct){
    const fullFare=roundMoney(Math.max(0,Number(value)||0));
    const total=roundMoney(fullFare*(1-Number(discountPct)/100));
    return {fullFare,total,memberSavings:roundMoney(fullFare-total)};
  }
  function calculateBooking(booking,inputs,settings){
    for(const key of ['miles','durationMinutes','trafficDurationMinutes','stopWaitMinutes','discountPct']){
      if(inputs[key]==null||inputs[key]===''||!Number.isFinite(Number(inputs[key]))||Number(inputs[key])<0)throw Error(`Missing or invalid fare input: ${key}`);
    }
    if(![0,5,10].includes(Number(inputs.discountPct)))throw Error('Booking savings must be 0%, 5% or 10%');
    if(!Array.isArray(inputs.deadheadSegments)||inputs.deadheadSegments.length<2||inputs.deadheadSegments.some(value=>value==null||value===''||!Number.isFinite(Number(value))||Number(value)<0))throw Error('Verified empty-mile segments are required');
    const service=String(booking.service||'').trim().toLowerCase();
    const rate=settings?.pricing?.[service];
    if(!rate)throw Error('Current service pricing is unavailable');
    const mockClock=String(booking.bookingSource||'').toUpperCase()==='MOCK'?String(booking.notes||'').match(/Pricing booking timestamp: ([^\s]+)/)?.[1]:null;
    const bookingTime=Date.parse(mockClock||booking.createdAt);
    const pickup=scheduledEpoch(String(booking.date||'').slice(0,10),booking.time);
    if(!Number.isFinite(bookingTime)||!Number.isFinite(pickup))throw Error('Booking creation and pickup times are required');
    const stopWait=Number(inputs.stopWaitMinutes);
    let returnWait=0;
    if(booking.tripType==='ROUND_TRIP'){
      const returnAt=scheduledEpoch(String(booking.returnTripDate||'').slice(0,10),booking.returnTripTime);
      if(!Number.isFinite(returnAt)||returnAt<pickup)throw Error('Verify the return date and pickup time');
      const finalAppointment=inputs.finalAppointmentTime||booking.appointmentTime;
      const isAppointment=inputs.scheduleBasis==='APPOINTMENT'||(!inputs.scheduleBasis&&finalAppointment&&!/Schedule basis:\s*PICKUP/i.test(String(booking.notes||'')));
      const arrival=isAppointment?scheduledEpoch(String(booking.date).slice(0,10),finalAppointment)-15*60000:pickup+Math.ceil(Math.max(Number(inputs.durationMinutes),Number(inputs.trafficDurationMinutes)))*60000;
      if(!Number.isFinite(arrival))throw Error('Final appointment time is required');
      returnWait=Math.max(0,Math.round((returnAt-arrival)/60000));
    }
    const result=calculate({service,rate,rules:settings.fareRules||{},miles:Number(inputs.miles),date:String(booking.date).slice(0,10),time:booking.time,tripType:booking.tripType,
      returnDate:String(booking.returnTripDate||'').slice(0,10),returnTime:booking.returnTripTime,
      waitMinutes:stopWait+returnWait,
      metrics:{durationMinutes:Number(inputs.durationMinutes),trafficDurationMinutes:Number(inputs.trafficDurationMinutes),deadheadSegments:inputs.deadheadSegments.map(Number),bookingTime}});
    const savings=applySavings(result.total,inputs.discountPct);
    return {...result,discountPct:Number(inputs.discountPct),discountAmount:savings.memberSavings,discountedTotal:savings.total};
  }
  return {calculate,calculateBooking,applySavings,roundMoney,scheduledEpoch,getPremiumRateReason};
});
