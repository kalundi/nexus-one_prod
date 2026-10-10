const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const api=fs.readFileSync('netlify/functions/api.cjs','utf8');
const html=fs.readFileSync('dispatch.html','utf8');
const clean=value=>String(value||'').trim();
const classify=html.slice(html.indexOf('  function classifyTrip('),html.indexOf('  function ',html.indexOf('  function classifyTrip(')+10));
test('seeded mocks are identified separately from real and legacy demo trips',()=>{
 const context=vm.createContext({refOf:trip=>trip.reference||''});vm.runInContext(classify,context);
 for(const trip of [{bookingSource:'MOCK'},{status:'MOCK'},{reference:'MOCK-20261010-01'},{notes:'MOCK TRIP — pricing test only'}])assert.equal(context.classifyTrip(trip),'MOCK');
 assert.equal(context.classifyTrip({bookingSource:'CUSTOMER'}),'REAL');
 assert.equal(context.classifyTrip({bookingSource:'DEMO'}),'DEMO');
});
test('server only permits Admin and Dispatch to create mock trips',()=>{
 const start=api.indexOf("  const actorRole=String(bookingActor?.role||'CUSTOMER').toUpperCase();",api.indexOf("if(p[0]==='bookings'&&method==='POST'",api.indexOf("if(p[0]==='bookings'&&method==='POST'")+1));
 const code=api.slice(start,api.indexOf('  const caretakerSubject=',start));
 for(const role of ['ADMIN','DISPATCHER','PATIENT','FACILITY','BILLING','CUSTOMER']){
  const context=vm.createContext({bookingActor:{role},b:{tripMode:'MOCK'},clean,json:(status,body)=>({status,body})});
  const result=vm.runInContext(`(()=>{${code};return {status:200};})()`,context);
  assert.equal(result.status,['ADMIN','DISPATCHER'].includes(role)?200:403);
 }
});
test('mock creation saves its label and disables reminders and payments before returning',async()=>{
 const start=api.indexOf('   if(isMockTrip){',api.indexOf('const insertParams='));
 const end=api.indexOf('   }',start)+4;
 const calls=[];
 const context=vm.createContext({isMockTrip:true,ref:'MOCK-1',r:{rows:[{reference:'MOCK-1',estimated_fare:100}]},bookingActor:{email:'admin@example.com'},query:async sql=>calls.push(sql),audit:async()=>{},mapBooking:row=>row,json:(status,body)=>({status,body})});
 const result=await vm.runInContext(`(async()=>{${api.slice(start,end)};throw Error('Mock save failed to return');})()`,context);
 assert.equal(result.status,201);assert.equal(result.body.isMockTrip,true);assert.equal(result.body.requiresOnlinePayment,false);
 assert.equal(result.body.booking.bookingSource,'MOCK');assert.equal(result.body.booking.balanceDue,0);
 assert.match(calls[0],/reminder_sent=true,payment_status='MOCK',balance_due=0/);
});
test('mock payment attempts return conflict before payment provider calls',async()=>{
 const start=api.indexOf("  if(p[0]==='payments'&&method==='POST'){");
 const end=api.indexOf("  if(p.join('/')==='payments/stripe/checkout'",start);
 for(const property of ['status','booking_source','payment_status']){
  const context=vm.createContext({p:['payments','stripe','checkout'],method:'POST',event:{},parseBody:()=>({bookingReference:'MOCK-1'}),query:async()=>({rows:[{[property]:'MOCK'}]}),clean,json:(status,body)=>({status,body})});
  const result=await vm.runInContext(`(async()=>{${api.slice(start,end)};return {status:200};})()`,context);
  assert.equal(result.status,409);
 }
});
