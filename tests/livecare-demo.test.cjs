const test=require('node:test'),assert=require('node:assert/strict');
const D=require('../netlify/functions/_shared/livecare-demo.cjs');
const started=Date.parse('2026-10-25T11:00:00Z');
const booking={reference:D.REFERENCE,bookingSource:'MOCK',notes:D.NOTE,createdAt:new Date(started).toISOString(),status:'mock'};
test('simulated approach moves and reduces ETA without changing stored mock state',()=>{
 const first=D.project(booking,started),later=D.project(booking,started+120000);
 assert.equal(first.status,'en-route');assert.equal(first.demo.etaMinutes,5);assert.equal(later.demo.etaMinutes,3);
 assert.notDeepEqual(first.driverLocation,later.driverLocation);assert.equal(first.driverLocation.simulated,true);
 assert.equal(booking.status,'mock');
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
