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
    const CARD_PROCESSING_FEE_PCT=Number(fareRules.cardProcessingFeePct??3);
    const deadheadRouteMiles={toPickup:0,fromDestination:0,fromReturn:0};
    const waitMinutes=Math.max(0,Number(input.waitMinutes)||0);
    const waiting=getWaitingCharge(waitMinutes,rate,fareRules,service);
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
    const premiumRuleKeys={'after-hours':'afterHoursSurchargePct',weekend:'weekendSurchargePct',holiday:'holidaySurchargePct'};
    const premiumPct=reason=>Number(policy[premiumRuleKeys[reason]]??fareRules[premiumRuleKeys[reason]]??30);
    const outboundPremiumPct=premiumRateReason?premiumPct(premiumRateReason):0;
    const outboundSubtotal=Math.max(Number(fareRules.minimumFare || 0),subtotal*(1+outboundPremiumPct/100));
    // Price each passenger leg at its own scheduled date and pickup time.
    const passengerLegCount = String(tripType?.value || 'ONE_WAY').toUpperCase() === 'ROUND_TRIP' ? 2 : 1;
    const returnPremiumRateReason=passengerLegCount===2?getPremiumRateReason(returnTripDate?.value||dateStr,routeMetrics.returnTimePending?'12:00':returnTripTime?.value||timeStr,routeMetrics.returnTimePending?0:routeDurationMinutes):'';
    const returnPremiumPct=returnPremiumRateReason?premiumPct(returnPremiumRateReason):0;
    const returnSubtotal=passengerLegCount===2?Math.max(Number(fareRules.minimumFare || 0),subtotal*(1+returnPremiumPct/100)):0;
    const premiumAmount=(outboundSubtotal-Math.max(Number(fareRules.minimumFare || 0),subtotal))+(returnSubtotal-(passengerLegCount===2?Math.max(Number(fareRules.minimumFare || 0),subtotal):0));
    const deadheadSegments = routeMetrics.deadheadSegments || [deadheadRouteMiles.toPickup, passengerLegCount === 2 ? deadheadRouteMiles.fromReturn : deadheadRouteMiles.fromDestination];
    const deadheadRate = Math.max(0, Number(rate.perMile || 0)) * Number(fareRules.deadheadRatePct??50)/100;
    const deadheadCharge = deadheadSegments.reduce((sum, segment) => sum + Math.max(0, Number(segment || 0) - includedMiles) * deadheadRate, 0);
    const bookingTime = Number(routeMetrics.bookingTime ?? Date.now());
    const urgentBaseCharge = (date, time) => {
      const pickupTime = scheduledEpoch(date,time);
      const hours = (pickupTime - bookingTime) / 3600000;
      return hours >= 0 && hours <= Number(fareRules.shortNoticeHours??24) ? Math.max(0, Number(rate.base || 0)) * Number(fareRules.shortNoticeSurchargePct??30)/100 : 0;
    };
    let outboundPickupTime = timeStr;
    const shortNoticeCharge = urgentBaseCharge(dateStr, outboundPickupTime) + (passengerLegCount === 2 && !routeMetrics.returnTimePending ? urgentBaseCharge(returnTripDate?.value || dateStr, returnTripTime?.value || timeStr) : 0);
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
    if(booking.tripType==='ROUND_TRIP'&&!booking.returnTimePending){
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
      metrics:{durationMinutes:Number(inputs.durationMinutes),trafficDurationMinutes:Number(inputs.trafficDurationMinutes),deadheadSegments:inputs.deadheadSegments.map(Number),bookingTime,returnTimePending:booking.returnTimePending}});
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
    if(raw==='wc'||raw.startsWith('wheelchair'))return 'wheelchair';
    if(raw==='amb'||raw.startsWith('ambulatory'))return 'ambulatory';
    if(raw.startsWith('stretcher'))return 'stretcher';
    if(raw.startsWith('bariatric'))return 'bariatric';
    if(raw.startsWith('broda'))return 'broda';
    if(raw==='als_1'||raw==='als')return 'als1';
    if(raw==='als_2')return 'als2';
    if(raw==='ift'||raw==='interfacility')return 'facility_transfer';
    if(raw==='cct'||raw.includes('critical'))return 'facility_transfer_critical';
    return raw;
  }
  // Read current and legacy bookings directly. Extra charges that were not entered
  // default to zero; they never prevent producing a fare from the available data.
  function resolveBookingInputs(booking){
    const notes=String(booking.notes||'');
    let saved=booking.fareInputs&&typeof booking.fareInputs==='object'?booking.fareInputs:booking.fareCalculation?.inputs||{};
    if(!Object.keys(saved).length){try{saved=JSON.parse(notes.match(/Fare inputs: (\{[^\n|]*\})/)?.[1]||'{}');}catch{}}
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
    const appointments=Array.from(notes.matchAll(/Stop \d+ \([^)]*\): (\d{2}:\d{2})/g),match=>match[1]);
    const stops=Array.from(notes.matchAll(/Stop \d+: (\d+(?:\.\d+)?) min/g),match=>Number(match[1]));
    const explicitStopWait=Array.isArray(booking.stopWaitMinutes)?booking.stopWaitMinutes.reduce((sum,value)=>sum+number(value),0):booking.stopWaitMinutes;
    const oneWayWait=repeat?undefined:booking.waitMinutes??intake.wait_minutes??notes.match(/Additional driver waiting:\s*(\d+(?:\.\d+)?) min/)?.[1];
    return {
      miles:number(booking.distanceMiles,booking.distance_miles,saved.miles,intake.distance_miles,intake.miles),
      durationMinutes:number(saved.durationMinutes,booking.durationMinutes,intake.duration_minutes,durationText?durationMinutes(durationText.split(/traffic/i)[0]):undefined,elapsed(pickupTime,appointmentTime)),
      trafficDurationMinutes:number(saved.trafficDurationMinutes,booking.trafficDurationMinutes,intake.traffic_duration_minutes,durationText.match(/traffic[^\d]*([^)]*)/i)?.[1]?durationMinutes(durationText.match(/traffic[^\d]*([^)]*)/i)[1]):undefined),
      stopWaitMinutes:number(saved.stopWaitMinutes,explicitStopWait,oneWayWait,stops.length?stops.reduce((sum,value)=>sum+value,0):undefined,repeat?undefined:legacy.waitMinutes),
      deadheadSegments:Array.isArray(segments)&&segments.length?segments.map(value=>number(value)):[number(booking.deadheadToPickupMiles,intake.deadhead_to_pickup_miles),number(booking.deadheadAfterTripMiles,intake.deadhead_after_trip_miles)],
      discountPct:[0,5,10].includes(discountPct)?discountPct:0,
      scheduleBasis:saved.scheduleBasis||booking.scheduleBasis||(/Schedule basis:\s*PICKUP/i.test(notes)?'PICKUP':'APPOINTMENT'),
      finalAppointmentTime:appointments.at(-1)||appointmentTime||saved.finalAppointmentTime||'',
      pickupTime
    };
  }
  function bookingDate(value){
    if(Object.prototype.toString.call(value)==='[object Date]'&&Number.isFinite(value.getTime()))return value.getFullYear()+'-'+String(value.getMonth()+1).padStart(2,'0')+'-'+String(value.getDate()).padStart(2,'0');
    const text=String(value||'').trim();
    const iso=text.match(/^\d{4}-\d{2}-\d{2}/);if(iso)return iso[0];
    const slash=text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2}|\d{4})$/);if(slash)return (slash[3].length===2?'20':'')+slash[3]+'-'+slash[1].padStart(2,'0')+'-'+slash[2].padStart(2,'0');
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
    const inputs=resolveBookingInputs(booking);
    if(inputs.deadheadSegments.length<2)inputs.deadheadSegments.push(0);
    const date=bookingDate(booking.date||booking.trip_date)||'2000-01-03';
    const normalized={...booking,service:normalizeService(booking.service),date,time:inputs.pickupTime||'12:00',createdAt:booking.createdAt||booking.created_at||booking.sourceReceivedAt||'1970-01-01T00:00:00Z',
      ...resolveTripSchedule({...booking,date})};
    if(!inputs.finalAppointmentTime)inputs.scheduleBasis='PICKUP';
    const fare=calculateBooking(normalized,inputs,settings);
    return {...fare,inputs};
  }
  return {calculate,calculateBooking,calculateEstimate,resolveTripSchedule,resolveBookingInputs,getWaitingCharge,applySavings,roundMoney,scheduledEpoch,getPremiumRateReason};
});
