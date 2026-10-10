const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const {createRequire}=require('node:module');
const Fare=require('../nexus-fare.js');
const {buildBrokerBookingPayload}=require('../netlify/functions/_shared/broker-auto-book.cjs');
const settings={pricing:{wheelchair:{base:98,includedMiles:8,perMile:4.1,waitPer15:18.75}},fareRules:{}};
const trip={service:'wheelchair',bookingSource:'BROKER',date:'2030-08-15',time:'10:00',appointmentTime:'10:45',createdAt:'2030-08-12T14:00:00Z',distanceMiles:25.28};
const webhookPath=path.resolve('netlify/functions/broker-email-webhook.cjs');
const webhook=vm.createContext({require:createRequire(webhookPath),process,Buffer,console,exports:{},fetch:()=>{throw Error('Unexpected network request');}});
vm.runInContext(fs.readFileSync(webhookPath,'utf8'),webhook);

test('broker-provided round trip doubles passenger legs and calculates return waiting',()=>{
 const result=Fare.calculateEstimate({...trip,tripType:'ONE_WAY',intakePayload:{trip_type:'ROUND_TRIP',return_trip_date:trip.date,return_trip_time:'12:00 PM'}},settings);
 assert.equal(result.passengerLegCount,2);
 assert.equal(result.waitMinutes,90);
 assert.equal(result.waitCharge,93.75);
 assert.equal(result.discountedTotal,444.39);
});
test('pending return still prices both legs without inventing waiting or a return short-notice charge',()=>{
 const result=Fare.calculateEstimate({...trip,tripType:'ROUND_TRIP',returnTripDate:trip.date,createdAt:'2030-08-14T20:00:00Z'},settings);
 assert.equal(result.passengerLegCount,2);
 assert.equal(result.returnTimePending,true);
 assert.equal(result.waitCharge,0);
 assert.equal(result.shortNoticeCharge,29.4);
 assert.equal(result.discountedTotal,378.11);
});
test('dispatch can explicitly correct a previous round trip to one way',()=>{
 const result=Fare.calculateEstimate({...trip,tripScheduleExplicit:true,tripType:'ONE_WAY',notes:'Round trip return: 2030-08-15 12:00'},settings);
 assert.equal(result.passengerLegCount,1);
 assert.equal(result.discountedTotal,173.91);
});
test('explicit pending return does not recover a discarded time from old notes',()=>{
 const result=Fare.calculateEstimate({...trip,tripScheduleExplicit:true,tripType:'ROUND_TRIP',returnTripTime:null,notes:'Round trip return: 2030-08-15 12:00'},settings);
 assert.equal(result.returnTimePending,true);
 assert.equal(result.waitMinutes,0);
});
test('Postgres date objects calculate current fares instead of falling back to saved amounts',()=>{
 const result=Fare.calculateEstimate({...trip,date:new Date(2030,7,15),tripType:'ROUND_TRIP',returnTripDate:new Date(2030,7,15),returnTripTime:'12:00'},settings);
 assert.equal(result.discountedTotal,444.39);
});
test('broker materialization carries return schedule and source from saved intake data',()=>{
 const result=buildBrokerBookingPayload({trip_date:trip.date,parsed_payload:{trip_type:'ROUND_TRIP',return_trip_date:trip.date,return_trip_time:'12:00'}},{});
 assert.equal(result.trip_type,'ROUND_TRIP');
 assert.equal(result.return_trip_time,'12:00');
 assert.equal(result.return_trip_date,trip.date);
 assert.equal(result.booking_source,'BROKER');
});
test('broker afternoon pickup and appointment retain their PM times',()=>{
 const result=Fare.calculateEstimate({...trip,time:'1:00 PM',appointmentTime:'1:45 PM',tripType:'ROUND_TRIP',returnTripDate:trip.date,returnTripTime:'3:00 PM'},settings);
 assert.equal(result.inputs.pickupTime,'13:00');
 assert.equal(result.waitMinutes,90);
 assert.equal(result.discountedTotal,444.39);
});
test('broker email parser distinguishes return pickup from outbound appointment and pickup',()=>{
 const parsed=webhook.parseBrokerIntakeText('Patient: Test Rider\nPickup: 100 Main St, Bethesda MD 20817\nDestination: 200 Oak Ave, Rockville MD 20850\nAppointment date: 08/15/2030\nAppointment time: 10:45 AM\nPickup time: 10:00 AM\nService: Wheelchair\nTrip type: Round trip\nReturn date: 08/15/2030\nReturn pickup time: 12:00 PM\nWait Time: $25.00\nRate: $180');
 assert.equal(parsed.trip_type,'ROUND_TRIP');
 assert.equal(parsed.return_trip_time,'12:00:00');
 assert.equal(parsed.trip_time,'10:45:00');
 assert.equal(parsed.return_trip_date,trip.date);
 assert.equal(parsed.wait_minutes,0,'broker wait rate is not a number of waiting minutes');
});
test('will-call is retained as a round trip without a fabricated pickup time',()=>{
 const parsed=webhook.parseBrokerIntakeText('Pickup: 100 Main St, Bethesda MD 20817\nDestination: 200 Oak Ave, Rockville MD 20850\nDate: 08/15/2030\nTime: 10:45 AM\nReturn pickup: Will call');
 assert.equal(parsed.trip_type,'ROUND_TRIP');
 assert.equal(parsed.return_trip_time,null);
 assert.equal(parsed.return_timing,'WILL_CALL');
});
test('email platform estimate uses current fare rules with scheduled waiting instead of a fixed two hours',()=>{
 const result=webhook.computePlatformRate({service:'wheelchair',trip_date:trip.date,pickup_time:trip.time,trip_time:trip.appointmentTime,created_at:trip.createdAt,distance_miles:trip.distanceMiles,trip_type:'ROUND_TRIP',return_trip_date:trip.date,return_trip_time:'12:00'},settings);
 assert.equal(result.platformRate,444.39);
 assert.equal(result.fareCalculation.waitMinutes,90);
 const oneWay=webhook.computePlatformRate({service:'wheelchair',trip_date:trip.date,pickup_time:trip.time,trip_time:trip.appointmentTime,created_at:trip.createdAt,distance_miles:trip.distanceMiles,trip_type:'ONE_WAY'},settings);
 assert.equal(oneWay.platformRate,173.91);
 assert.equal(oneWay.fareCalculation.waitMinutes,0);
});
test('replaying an already materialized broker email cannot overwrite dispatch corrections',async()=>{
 const existing={id:123,booking_reference:'CORRECTED-TRIP',source_message_id:'same-email',parsed_payload:{trip_type:'ROUND_TRIP',return_trip_time:'12:00'}};
 const reads=[];
 const context=vm.createContext({query:async(sql)=>{reads.push(sql);if(sql.startsWith('SELECT * FROM broker_requests'))return {rows:[existing]};return {rows:[]};},clean:value=>String(value||''),ensureBrokerEmailReplayColumns:async()=>{}});
 const source=fs.readFileSync(webhookPath,'utf8');
 const start=source.indexOf('async function insertBrokerRequest('),end=source.indexOf('function buildBrokerBookingNotes',start);
 vm.runInContext(source.slice(start,end),context);
 const request=await context.insertBrokerRequest({sourceMessageId:'same-email',parsedPayload:{trip_type:'ONE_WAY'}});
 assert.equal(request.isReplay,true);
 assert.equal(request.booking_reference,'CORRECTED-TRIP');
 assert.equal(reads.length,1);
 assert.equal(request.parsed_payload.trip_type,'ROUND_TRIP');
});
