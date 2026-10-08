const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('booking-app.js','utf8');
const code=source.slice(source.indexOf('  function getCalculatedWaiting('),source.indexOf('  function syncCalculatedWaitingUi('));
function calculate({times=['10:30'],legs=[30],type='ROUND_TRIP',date='2030-08-15',returnDate=date,returnTime='11:00',pickupBasis=false,pickup='09:45',metrics={durationMinutes:30},service='wheelchair'}={}){
  const context=vm.createContext({
    getLegAppointments:()=>times.map(appointmentTime=>({appointmentTime})),
    estimateState:metrics,routeLegTravelMinutes:legs,tripType:{value:type},
    returnTripDate:{value:returnDate},returnTripTime:{value:returnTime},
    $:id=>({value:{tripDate:date,tripTime:pickup,service}[id]}),
    normalizeService:value=>value,isPickupTimeBasis:()=>pickupBasis,
    serviceTransitionBufferMinutes:svc=>svc==='wheelchair'?15:10,
    parseTimeToMinutes:value=>/^\d{2}:\d{2}$/.test(value||'')?Number(value.slice(0,2))*60+Number(value.slice(3)):null
  });
  vm.runInContext(code,context);
  return JSON.parse(JSON.stringify(context.getCalculatedWaiting()));
}
test('round trip waits from the early estimated arrival to return pickup',()=>{
  assert.deepEqual(calculate(),{stopWaitMinutes:[],returnWaitMinutes:45,waitMinutes:45});
});
test('pickup scheduling uses traffic arrival rather than an old appointment estimate',()=>{
  assert.equal(calculate({pickupBasis:true,pickup:'09:45',metrics:{durationMinutes:30,trafficDurationMinutes:40}}).waitMinutes,35);
});
test('overnight waiting is not truncated to 12 hours',()=>{
  assert.equal(calculate({returnDate:'2030-08-16',returnTime:'08:00'}).waitMinutes,1305);
});
test('one way has no final waiting interval',()=>{
  assert.equal(calculate({type:'ONE_WAY'}).waitMinutes,0);
});
test('each stop uses the following leg travel time and appointment',()=>{
  const result=calculate({times:['10:30','12:00','15:00'],legs:[20,30,50],returnTime:'16:00'});
  assert.deepEqual(result,{stopWaitMinutes:[45,115],returnWaitMinutes:75,waitMinutes:235});
});
test('service assistance time is reserved before departure',()=>{
  assert.equal(calculate({times:['10:30','12:00'],legs:[20,30],type:'ONE_WAY',service:'ambulatory'}).waitMinutes,50);
});
test('incomplete times or missing route never invent waiting',()=>{
  assert.equal(calculate({times:[''],metrics:{durationMinutes:0}}).waitMinutes,0);
  assert.equal(calculate({times:['10:30',''],type:'ONE_WAY'}).waitMinutes,0);
});
