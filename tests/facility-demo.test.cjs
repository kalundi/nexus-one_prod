const test=require('node:test'),assert=require('node:assert/strict');
const D=require('../netlify/functions/_shared/facility-demo.cjs');
const at=minute=>({...D.initialState(1000),baseMinute:minute,paused:true});
test('five fictional patients have morning pickups and 1, 2 or 3 hour appointment waits',()=>{
 const data=D.project(at(435),1000);assert.equal(data.patients.length,5);assert.equal(data.metrics.legs,10);assert.equal(new Set(data.patients.map(p=>p.destination.address)).size,5);
 assert.deepEqual(data.patients.map(p=>p.returnPickup),[550,660,765,690,810]);
 for(const patient of data.patients){assert.equal(patient.fictional,true);assert.ok(patient.pickup<720);assert.ok(patient.pickup+patient.travel<=patient.appointmentAt);assert.ok([60,120,180].includes(patient.returnPickup-patient.appointmentAt));assert.ok(patient.pickupLabel);assert.ok(patient.driver);assert.ok(patient.destination.source.startsWith('https://'));}
 assert.equal(data.facility.address,'2700 Southaven Road, Annapolis, MD 21401');
});
test('driver approach, outbound pickup, appointment, return pickup and completed handoff all appear on the facility timeline',()=>{
 const phase=minute=>D.project(at(minute),1000).patients[0].phase;
 assert.equal(phase(435),'scheduled');assert.equal(phase(445),'approach');assert.equal(phase(460),'outbound');assert.equal(phase(500),'appointment');assert.equal(phase(540),'return-approach');assert.equal(phase(555),'return');assert.equal(phase(580),'complete');
 const last=D.project(at(930),1000);assert.equal(last.metrics.returned,5);assert.equal(last.metrics.away,0);assert.equal(last.metrics.alerts,0);assert.equal(last.messages.filter(m=>m.title==='Patient returned — handoff complete').length,5);
});
test('automatic delay revises ETA, pauses simulated road progress, and communicates to facility manager plus monitoring contacts',()=>{
 const early=D.project(at(504),1000),delayed=D.project(at(506),1000),later=D.project(at(512),1000);
 assert.equal(delayed.severity,'delay');assert.equal(delayed.patients[1].outboundArrival-early.patients[1].outboundArrival,15);assert.equal(delayed.patients[1].progress,later.patients[1].progress);
 const message=delayed.messages.find(m=>m.title==='Delay detected — ETA revised');assert.equal(message.eta,'8:50 AM');assert.ok(message.recipients.includes('Facility manager (demo inbox)'));assert.match(message.delivery,/simulated, not sent/);
 const beforeDeparture=early.messages.find(m=>m.patientId==='FC-DEMO-02'&&m.title==='Patient departed facility'),afterDeparture=delayed.messages.find(m=>m.id.endsWith('FC-DEMO-02-departed'));assert.equal(beforeDeparture.text,afterDeparture.text);
});
test('reported issue colors screen red; acknowledgment preserves active risk and resolution clears it without duplicating automatic events',()=>{
 let state=at(547);assert.equal(D.project(state,1000).severity,'issue');state=D.control(state,{action:'ack'},1000);assert.equal(D.project(state,1000).severity,'issue');assert.equal(D.project(state,1000).metrics.unread,0);
 state=D.control(state,{action:'resolve',patientId:'FC-DEMO-03'},1000);const data=D.project(state,1000);assert.equal(data.severity,'normal');assert.equal(data.messages.filter(m=>m.id.endsWith('auto-entrance-issue')).length,1);assert.equal(data.patients[2].outboundDelay,8);
});
test('manual patient issues and return delays synchronize through shared state and remain isolated to the selected patient',()=>{
 let state=at(560);state=D.control(state,{action:'issue',patientId:'FC-DEMO-01'},1000);let data=D.project(state,1000);assert.equal(data.patients[0].risk,'issue');assert.equal(data.patients[1].risk,'normal');state=D.control(state,{action:'resolve',patientId:'FC-DEMO-01'},1000);assert.equal(D.project(state,1000).patients[0].risk,'normal');
 state=D.control(state,{action:'delay',patientId:'FC-DEMO-01'},1000);data=D.project(state,1000);assert.equal(data.patients[0].returnArrivalLabel,'9:45 AM');assert.equal(data.patients[0].returnDelay,15);
 const reset=D.control(state,{action:'restart'},1000);assert.equal(reset.overrides.length,0);assert.notEqual(reset.runId,state.runId);
});
test('clock controls clamp safely and reject unsupported or invalid actions',()=>{
 const state={...at(435),paused:false,speed:120,anchorAt:1000};assert.equal(D.minuteAt(state,11000),455);assert.equal(D.minuteAt(state,9999999),930);
 for(const body of [{action:'seek',minute:-1},{action:'seek',minute:'oops'},{action:'speed',speed:0},{action:'issue',patientId:'real-patient'},{action:'delete'}])assert.throws(()=>D.control(state,body,1000));
});
test('late return changes extend the presentation clock so no patient is left outside the scenario',()=>{
 let state=at(890);state=D.control(state,{action:'returnSchedule',patientId:'FC-DEMO-05',returnTime:'14:40',vehicleWaiting:true},1000);state=D.control(state,{action:'delay',patientId:'FC-DEMO-05'},1000);const data=D.project(state,1000);assert.equal(data.endMinute,945);assert.equal(data.patients[4].returnArrival,940);assert.equal(D.project({...state,baseMinute:945},1000).metrics.returned,5);
});
test('demo-only authentication tokens expire and reject tampering or different signing keys',()=>{
 const token=D.encodeToken('test-secret',1000);assert.equal(D.validToken(token,'test-secret',1001),true);assert.equal(D.validToken(token,'different-secret',1001),false);assert.equal(D.validToken(`${token}x`,'test-secret',1001),false);assert.equal(D.validToken(token,'test-secret',1000+8*3600000),false);assert.equal(D.validToken('a.b','test-secret'),false);
});
test('demo state is protected and setup requires Admin before any write',async()=>{
 const config={secret:'test-secret',state:at(500)};let writes=0;
 const handler=D.createHandler({query:async sql=>{if(!sql.startsWith('SELECT'))writes++;return {rows:[{value:config}]};},requireUser:async()=>{throw Error('Forbidden');},bearer:event=>event.headers?.authorization?.slice(7)||'',json:(statusCode,body)=>({statusCode,body}),parseBody:()=>({}),getPool:()=>{throw Error('Unexpected transaction');}});
 const result=await handler({headers:{}},['facility-demo','state'],'GET');assert.equal(result.statusCode,401);assert.equal(JSON.stringify(result.body).includes('Evelyn'),false);
 await assert.rejects(handler({headers:{}},['facility-demo','setup'],'POST'),/Forbidden/);assert.equal(writes,0);
 // Legacy standalone tokens cannot bypass the managed account check. Managed login and admin access are covered by the PostgreSQL API suite.
 const legacy=await handler({headers:{authorization:`Bearer ${D.encodeToken('test-secret')}`}},['facility-demo','state'],'GET');assert.equal(legacy.statusCode,401);assert.equal(legacy.body.dashboard,undefined);assert.equal(legacy.body.secret,undefined);
});
