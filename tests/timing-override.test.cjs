const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const source=fs.readFileSync(require.resolve('../netlify/functions/api.cjs'),'utf8');
const start=source.indexOf('   const timingOverrideRequested='),end=source.indexOf("   const before=",start);
async function validate(role,body){return vm.runInNewContext(`(async()=>{${source.slice(start,end)};return {reason:timingOverrideReason};})()`,{u:{role},b:body,clean:v=>String(v??'').trim(),json:(status,body)=>({status,...body})});}
test('only staff can override and each override requires a confirmed reason',async()=>{
 const timingOverride={acknowledged:true,reason:'Facility confirmed revised arrival.'};
 for(const role of ['ADMIN','DISPATCHER'])assert.equal((await validate(role,{timingOverride})).reason,timingOverride.reason);
 for(const role of ['DRIVER','CUSTOMER'])assert.equal((await validate(role,{timingOverride})).status,403);
 for(const value of [null,{},false,{reason:'Approved'}, {acknowledged:true,reason:' '},{acknowledged:true,reason:'x'.repeat(501)}])assert.equal((await validate('ADMIN',{timingOverride:value})).status,400);
 assert.equal((await validate('ADMIN',{})).reason,'');
});
test('elapsed pickup override still checks shift coverage, conflicts and active fleet',async(t)=>{
 const Trips=require('../netlify/functions/_shared/trip-timing.cjs'),Availability=require('../netlify/functions/_shared/timing-availability.cjs'),Fare=require('../nexus-fare.js');
 const start=Fare.scheduledEpoch('2026-10-14','08:00'),end=start+3600000;
 t.mock.method(Date,'now',()=>end+3600000);
 t.mock.method(Trips,'occupancy',async()=>({plan:{crewArrivalAt:start,vehicleAvailableAt:end,alerts:[]},trips:[]}));
 t.mock.method(Trips,'conflicts',(_plan,_trips,driver,vehicle)=>driver?.display_name==='Busy'||vehicle==='BUSY'?[{}]:[]);
 const shifts=['Free','Busy','Off shift'].map(display_name=>({id:display_name,display_name,weekday_iso:3,start_time:display_name==='Off shift'?'10:00':'07:00',end_time:'17:00',effective_start_date:'2026-01-01'}));
 const query=async sql=>{if(sql.includes('FROM employees')){assert.match(sql,/e.active=true AND u.active=true/);return {rows:shifts};}assert.match(sql,/active=true AND status='AVAILABLE'/);return {rows:[{unit_number:'FREE'},{unit_number:'BUSY'}]};};
 const blocked=await Availability.resources({}, {},query);
 assert.equal(blocked.reviewCode,'PICKUP_WINDOW_PASSED');assert.equal(blocked.drivers.length,0);
 const allowed=await Availability.resources({}, {},query,null,{allowPastPickup:true});
 assert.deepEqual(allowed.drivers.map(d=>d.display_name),['Free']);assert.deepEqual(allowed.vehicles.map(v=>v.unit_number),['FREE']);
});
test('override records the reason and authenticated actor in history and audit',async()=>{
 const history=[],audits=[],start=source.indexOf('  if(timingOverrideReason){'),end=source.indexOf('  await TripTiming.persist',start);
 await vm.runInNewContext(`(async()=>{${source.slice(start,end)}})()`,{timingOverrideReason:'Facility confirmed arrival.',ref:'TEST',afterRow:{status:'ASSIGNED',trip_date:'2026-10-14',pickup_time:'08:25'},u:{id:'staff-id',email:'staff@example.test',role:'ADMIN',display_name:'Dispatcher'},b:{appointmentTime:'09:10'},statusLabel:v=>v,query:async(sql,args)=>history.push({sql,args}),audit:async(...args)=>audits.push(args)});
 assert.equal(history[0].args[3],'Timing override: Facility confirmed arrival.');assert.equal(history[0].args[4],'Dispatcher');
 assert.equal(audits[0][2],'TIMING_OVERRIDE');assert.equal(audits[0][3].by,'staff-id');assert.equal(audits[0][3].pickupTime,'08:25');
});
