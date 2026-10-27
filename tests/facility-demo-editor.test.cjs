const test=require('node:test'),assert=require('node:assert/strict'),{PGlite}=require('@electric-sql/pglite');
const Demo=require('../netlify/functions/_shared/facility-demo.cjs'),Booking=require('../netlify/functions/_shared/facility-demo-booking.cjs');
test('Trip Editor lists database-backed demo trips and updates the correct day, invoice and simulated alerts only',async()=>{
 const db=new PGlite(),sql=[];
 try{
  await db.exec("CREATE TABLE system_settings(key text PRIMARY KEY,value jsonb NOT NULL,updated_at timestamptz DEFAULT now()); CREATE TABLE users(id text,email text);");
  const settings={pricing:Object.fromEntries(Booking.SERVICES.map(([key])=>[key,{base:70,perMile:4,waitPer15:20}])),fareRules:{shortNoticeSurchargePct:0}},config={state:Demo.initialState(),days:{},secret:'isolated-editor-test'};Demo.syncBilling(config,settings);await db.query('INSERT INTO system_settings(key,value) VALUES($1,$2)',[Demo.KEY,JSON.stringify(config)]);
  const query=(...args)=>{sql.push(args[0]);return db.query(...args);};
  const handler=Demo.createHandler({query,getPool:()=>({connect:async()=>({query,release(){}})}),requireUser:async token=>{if(token==='admin')return {role:'ADMIN'};if(token==='dispatch')return {role:'DISPATCHER',email:'dispatch@nexusmt.com'};throw Error('Forbidden');},bearer:event=>event.headers.authorization,json:(statusCode,body)=>({statusCode,body}),parseBody:event=>event.body||{},readPlatformSettings:async()=>settings});
  const request=(path='',method='GET',body={},token='admin')=>handler({headers:{authorization:token},body},['facility-demo','editor','trips',...path.split('/').filter(Boolean)],method);
  assert.equal((await request('','GET',{},'')).statusCode,401);const list=await request();assert.equal(list.statusCode,200);assert.equal(list.body.trips.length,25);assert.ok(list.body.trips.every(trip=>trip.bookingSource==='DEMO'&&trip.demoOnly&&trip.statusLabel.startsWith('DEMO TRIP')));
  const first=list.body.trips.find(trip=>trip.date==='2026-10-27'),originalActive=config.state,ref=first.reference;
  const details=await request(ref);assert.equal(details.body.booking.reference,ref);assert.equal(details.body.services.length,10);assert.equal((await request(ref,'GET',{},'dispatch')).statusCode,200);
  const payload={requestId:'demo-editor-request-0001',bookingSource:'DEMO',date:first.date,name:'Trip Editor Demo Resident',pickupTime:'08:00',appointmentTime:'09:00',returnTime:'12:00',vehicleWaiting:true,notes:'Fictional demo update',phone:'+13015550100',email:'demo@example.test'};
  const saved=await request(ref,'PATCH',payload);assert.equal(saved.body.persisted,true);assert.equal(saved.body.booking.name,payload.name);assert.equal(saved.body.booking.returnTripTime,'12:00');assert.equal(saved.body.notifications.status,'simulated');
  const persisted=(await db.query('SELECT value FROM system_settings WHERE key=$1',[Demo.KEY])).rows[0].value;assert.deepEqual(persisted.state,originalActive);assert.equal(Demo.patientsFor(persisted.days[first.date])[0].name,payload.name);assert.ok(persisted.invoices[first.date].rows.some(row=>row.patient===payload.name&&row.categories.waiting>0));assert.ok(Demo.project(persisted.days[first.date]).messages.some(message=>message.title==='Demo booking updated'));
  const retried=await request(ref,'PATCH',payload);assert.equal(retried.body.booking.reference,ref);assert.equal((await db.query('SELECT value FROM system_settings WHERE key=$1',[Demo.KEY])).rows[0].value.days[first.date].bookingEvents.length,1);
  await assert.rejects(request(ref,'PATCH',{...payload,bookingSource:'CUSTOMER'}),/cannot be converted/);await assert.rejects(request(ref,'PATCH',{...payload,date:'2026-10-28'}),/original demo/);await assert.rejects(request('REAL-BOOKING','PATCH',payload),/not found/);
  const cancelled=await request(ref+'/cancel','POST');assert.equal(cancelled.body.booking.status,'CANCELLED');assert.equal(cancelled.body.booking.ourEstimate,0);const restored=await request(ref+'/restore','POST');assert.equal(restored.body.booking.status,'DEMO');assert.equal((await request('','GET')).body.trips.length,25);
  assert.equal(sql.some(statement=>/\b(bookings|trip_status_history|driver_assignments|notifications|email|sms)\b/i.test(statement)&&!statement.startsWith('SELECT * FROM users')),false);
 }finally{await db.close();}
});
