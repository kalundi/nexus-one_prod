const {test}=require('node:test'),assert=require('node:assert/strict');
const db=require('../netlify/functions/_shared/db.cjs');
const calls=[],queries=[],optedOut=new Set();
const driver={email:'driver@example.com',phone:'+12025550124'};
db.query=async(sql,params=[])=>{queries.push({sql,params});if(/SELECT email, phone\s+FROM users/.test(sql))return {rows:[driver]};if(sql.startsWith('SELECT status FROM sms_consent_registry'))return {rows:optedOut.has(params[0])?[{status:'OPTED_OUT'}]:[]};return {rows:[]};};
const api=require('../netlify/functions/api.cjs');
function setup(t){
 const fetchBefore=global.fetch,keys=['POSTMARK_SERVER_TOKEN','EMAIL_FROM','POSTMARK_FROM_EMAIL','TWILIO_ACCOUNT_SID','TWILIO_AUTH_TOKEN','TWILIO_PHONE_NUMBER','TEAMS_WEBHOOK_URL'],saved=Object.fromEntries(keys.map(key=>[key,process.env[key]]));
 Object.assign(process.env,{POSTMARK_SERVER_TOKEN:'fixture-token',EMAIL_FROM:'dispatch@example.com',POSTMARK_FROM_EMAIL:'',TWILIO_ACCOUNT_SID:'AC-fixture',TWILIO_AUTH_TOKEN:'fixture-token',TWILIO_PHONE_NUMBER:'+12025550100',TEAMS_WEBHOOK_URL:''});calls.length=0;queries.length=0;optedOut.clear();
 global.fetch=async(url,options)=>{
  if(url==='https://api.postmarkapp.com/email'){calls.push({channel:'email',body:JSON.parse(options.body)});return Response.json({ErrorCode:0,MessageID:'fixture-message'});}
  if(url.includes('api.twilio.com')&&url.endsWith('/Messages.json')){calls.push({channel:'sms',body:Object.fromEntries(new URLSearchParams(options.body))});return Response.json({sid:'SM'+'a'.repeat(32),status:'queued'},{status:201});}
  throw Error('Unexpected fixture request');
 };
 t.after(()=>{global.fetch=fetchBefore;for(const key of keys){if(saved[key]===undefined)delete process.env[key];else process.env[key]=saved[key];}});
}
const booking={reference:'NMT-FIXTURE',name:'Patient Example',email:'patient@example.com',phone:'+12025550123',date:'2026-10-26',time:'10:00',service:'wheelchair',pickup:'100 First Street',destination:'200 Second Street'};
test('booking confirmation targets the patient and assignment targets the driver on both channels',async t=>{
 setup(t);await api.notifyBooking(booking);await api.notifyAssignedDriver({...booking,driver_name:'Driver Example',driver_user_id:'driver-id'},{driverPhone:driver.phone});
 assert.ok(calls.some(call=>call.channel==='sms'&&call.body.To===booking.phone));assert.ok(calls.some(call=>call.channel==='email'&&call.body.To.split(',').includes(booking.email)));
 assert.ok(calls.some(call=>call.channel==='sms'&&call.body.To===driver.phone));const driverMail=calls.find(call=>call.channel==='email'&&call.body.To===driver.email);assert.ok(driverMail);assert.match(driverMail.body.Subject,/Trip assigned/);assert.match(driverMail.body.HtmlBody,/100 First Street/);assert.ok(queries.some(q=>q.params[3]==='driver-id'));
});
test('a supplied driver email still resolves the missing phone by immutable driver identity',async t=>{
 setup(t);const result=await api.notifyAssignedDriver({...booking,driver_name:'Driver Example',driver_user_id:'driver-id'},{driverEmail:driver.email});assert.equal(result.sms.status,'sent');assert.equal(result.email.status,'sent');assert.equal(calls.find(call=>call.channel==='sms').body.To,driver.phone);
});
test('an assignment identified by driver ID can notify without a stored display name',async t=>{
 setup(t);const result=await api.notifyAssignedDriver({...booking,driver_user_id:'driver-id'});assert.equal(result.sms.status,'sent');assert.equal(result.email.status,'sent');assert.equal(calls.length,2);
});
test('a driver SMS opt-out is honored while the assignment email still goes out',async t=>{
 setup(t);optedOut.add(driver.phone);const result=await api.notifyAssignedDriver({...booking,driver_name:'Driver Example',driver_user_id:'driver-id'});assert.equal(result.sms.status,'blocked-opt-out');assert.equal(result.email.status,'sent');assert.equal(calls.filter(call=>call.channel==='sms').length,0);
});
test('an email provider rejection does not prevent the driver SMS attempt',async t=>{
 setup(t);const successful=global.fetch;global.fetch=async(url,options)=>url==='https://api.postmarkapp.com/email'?Response.json({ErrorCode:10},{status:401}):successful(url,options);
 const result=await api.notifyAssignedDriver({...booking,driver_name:'Driver Example',driver_email:driver.email,driver_phone:driver.phone});assert.equal(result.sms.status,'sent');assert.equal(result.email.status,'failed');
});
