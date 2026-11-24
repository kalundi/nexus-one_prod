const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createHandler}=require('../netlify/functions/_shared/patient-return-pickups.cjs');
const patientPath=['patient','trips','NMT-TEST','return-pickup'];
const dispatchPath=['dispatch','return-pickups'];
function fixture({role='PATIENT',owned=true,eligible=true,alertFails=false}={}){
 let request=null;const auditEvents=[],alerts=[],calls=[];
 const handler=createHandler({
  bearer:e=>e.token,
  requireUser:async(token,roles)=>{if(!token||!roles.includes(role))throw Object.assign(Error('Forbidden'),{statusCode:token?403:401});return {id:'test-user'};},
  json:(status,body)=>({status,body}),
  audit:async(...args)=>auditEvents.push(args),
  notifyDispatch:async data=>{alerts.push(data);if(alertFails)throw Error('offline');return {status:'sent'};},
  query:async(sql,params)=>{
   calls.push({sql,params});
   if(sql.startsWith('SELECT reference FROM bookings'))return {rows:owned?[{reference:'NMT-TEST'}]:[]};
   if(sql.startsWith('INSERT INTO patient_return_pickups')){
    assert.match(sql,/patient_user_id=\$2::uuid/);
    assert.match(sql,/return_trip_time IS NULL/);
    assert.match(sql,/ON CONFLICT\(booking_reference\) DO NOTHING/);
    if(!eligible||request)return {rows:[]};
    request={booking_reference:'NMT-TEST',requested_at:'2026-11-24T12:00:00Z'};return {rows:[request]};
   }
   if(sql.startsWith('UPDATE patient_return_pickups')){
    if(!request||request.acknowledged_at)return {rows:[]};
    request={...request,acknowledged_at:'2026-11-24T12:01:00Z'};return {rows:[request]};
   }
   if(sql.includes('ORDER BY r.requested_at'))return {rows:request&&!request.acknowledged_at?[request]:[]};
   if(sql.startsWith('SELECT r.*')||sql.startsWith('SELECT * FROM patient_return_pickups'))return {rows:request?[request]:[]};
   throw Error('Unexpected SQL');
  }
 });
 return {handler,alerts,auditEvents,calls,setRole:r=>role=r};
}
test('unauthenticated and wrong-role requests cannot query bookings',async()=>{
 const f=fixture();await assert.rejects(f.handler({},patientPath,'POST'),{statusCode:401});
 f.setRole('DRIVER');await assert.rejects(f.handler({token:'x'},patientPath,'POST'),{statusCode:403});
 assert.equal(f.calls.length,0);
});
test('non-owner cannot submit or read return pickup',async()=>{
 const f=fixture({owned:false});
 for(const method of ['GET','POST'])assert.equal((await f.handler({token:'x'},patientPath,method)).status,404);
 assert.equal(f.alerts.length,0);
});
test('ineligible ride cannot create a request',async()=>{
 const f=fixture({eligible:false});assert.equal((await f.handler({token:'x'},patientPath,'POST')).status,409);
 assert.equal(f.alerts.length,0);
});
test('repeat request is idempotent and alerts dispatch once',async()=>{
 const f=fixture();const first=await f.handler({token:'x'},patientPath,'POST');
 const second=await f.handler({token:'x'},patientPath,'POST');
 assert.equal(first.status,201);assert.equal(second.status,200);assert.deepEqual(first.body,second.body);
 assert.equal(f.alerts.length,1);assert.deepEqual(Object.keys(f.alerts[0]).sort(),['reference','requestedAt']);
});
test('notification outage does not undo a persisted request',async()=>{
 const f=fixture({alertFails:true});assert.equal((await f.handler({token:'x'},patientPath,'POST')).status,201);
 assert.equal((await f.handler({token:'x'},patientPath,'GET')).body.request.status,'REQUESTED');
});
test('dispatch acknowledgment is restricted, repeatable and visible to patient',async()=>{
 const f=fixture();await f.handler({token:'x'},patientPath,'POST');
 await assert.rejects(f.handler({token:'x'},[...dispatchPath,'NMT-TEST'],'PATCH'),{statusCode:403});
 f.setRole('DISPATCHER');assert.equal((await f.handler({token:'x'},dispatchPath,'GET')).body.requests.length,1);
 const ack=await f.handler({token:'x'},[...dispatchPath,'NMT-TEST'],'PATCH');
 assert.equal(ack.body.request.status,'ACKNOWLEDGED');
 assert.deepEqual((await f.handler({token:'x'},[...dispatchPath,'NMT-TEST'],'PATCH')).body,ack.body);
 assert.equal((await f.handler({token:'x'},dispatchPath,'GET')).body.requests.length,0);
 f.setRole('PATIENT');assert.equal((await f.handler({token:'x'},patientPath,'GET')).body.request.status,'ACKNOWLEDGED');
});
