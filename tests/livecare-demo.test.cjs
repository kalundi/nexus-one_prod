const test=require('node:test'),assert=require('node:assert/strict');
const D=require('../netlify/functions/_shared/livecare-demo.cjs');
const started=Date.parse('2026-10-25T11:00:00Z');
const booking={reference:D.REFERENCE,bookingSource:'MOCK',notes:D.NOTE,createdAt:new Date(started).toISOString(),status:'mock'};
test('simulated approach moves and reduces ETA without changing stored mock state',()=>{
 const first=D.project(booking,started),later=D.project(booking,started+10000);
 assert.equal(first.status,'en-route');assert.equal(first.demo.etaSeconds,20);assert.equal(later.demo.etaSeconds,10);
 assert.notDeepEqual(first.driverLocation,later.driverLocation);assert.equal(first.driverLocation.simulated,true);
 assert.equal(booking.status,'mock');
});
test('named demo driver announces departure to every monitoring party without claiming delivery',()=>{
 const trip=D.project(booking,started);
 assert.equal(trip.driverName,D.DRIVER);assert.equal(trip.driver,D.DRIVER);
 const message=trip.demo.communications[0];assert.match(message.text,/James Carter.*on his way/);
 assert.equal(message.recipients.length,5);assert.ok(message.recipients.some(r=>r.startsWith('Destination contact')));
 assert.equal(message.deliveryStatus,'SIMULATED — not sent');
});
test('delay freezes the vehicle, revises arrival ETA and alerts destination plus all monitors once',()=>{
 const before=D.project(booking,started+54000),paused=D.project(booking,started+55000),still=D.project(booking,started+69000),moving=D.project(booking,started+74000);
 assert.equal(paused.demo.delayed,true);assert.equal(still.demo.routeProgress,paused.demo.routeProgress);assert.ok(moving.demo.routeProgress>still.demo.routeProgress);
 assert.equal(Date.parse(paused.demo.etaAt)-Date.parse(before.demo.etaAt),15000);
 assert.equal(paused.demo.communications.filter(m=>m.delay).length,1);assert.equal(moving.demo.communications.filter(m=>m.delay).length,1);
 assert.equal(paused.demo.communications.find(m=>m.delay).etaAt,new Date(started+125000).toISOString());
 assert.equal(D.project(booking,started+135000).demo.completed,true);
});
test('all journey stages are synchronized by the server clock and tracking stops at completion',()=>{
 for(const stage of D.STAGES){const result=D.project(booking,started+stage.at*1000);assert.equal(result.status,stage.status.toLowerCase().replaceAll('_','-'));assert.equal(result.demo.timeline.filter(s=>s.reached).length,D.STAGES.indexOf(stage)+1);}
 const completed=D.project(booking,started+24*3600000);assert.equal(completed.demo.completed,true);assert.equal(completed.driverLocationVisible,false);assert.equal(completed.driverLocation,null);
});
test('ordinary mocks, real rides and malformed demo clocks cannot acquire simulated tracking',()=>{
 for(const patch of [{reference:'MOCK-OTHER'},{bookingSource:'CUSTOMER'},{notes:'user supplied'},{createdAt:'invalid'}])assert.equal(D.project({...booking,...patch},started),null);
});
test('creator denies patient access before opening database and rolls back on failure',async()=>{
 const fs=require('node:fs'),vm=require('node:vm'),api=fs.readFileSync('netlify/functions/api.cjs','utf8');
 const start=api.indexOf("  if(p.join('/')==='livecare/demo'"),end=api.indexOf("  if(p[0]==='timing'",start),route=api.slice(start,end);
 let opened=false;
 const context={p:['livecare','demo'],method:'POST',event:{},bearer:()=>'',requireUser:async(_token,roles)=>{assert.deepEqual(Array.from(roles),['ADMIN','DISPATCHER']);throw Error('Forbidden');},getPool:()=>{opened=true;throw Error('Unexpected database access');}};
 await assert.rejects(vm.runInNewContext(`(async()=>{${route}})()`,context),/Forbidden/);assert.equal(opened,false);
 const calls=[];let released=false;
 context.requireUser=async()=>({email:'admin@example.com'});context.getPool=()=>({connect:async()=>({query:async sql=>{calls.push(sql);if(sql.startsWith('SELECT'))throw Error('database failed');return {rows:[]};},release:()=>{released=true;}})});
 await assert.rejects(vm.runInNewContext(`(async()=>{${route}})()`,context),/database failed/);assert.deepEqual(calls.map(sql=>sql.split(' ')[0]),['BEGIN','SELECT','ROLLBACK']);assert.equal(released,true);
});
