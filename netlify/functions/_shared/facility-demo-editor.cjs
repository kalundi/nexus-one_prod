const crypto=require('node:crypto'),Booking=require('./facility-demo-booking.cjs');
const clock=minute=>`${String(Math.floor(minute/60)).padStart(2,'0')}:${String(minute%60).padStart(2,'0')}`;
const fail=(message,statusCode=400)=>{throw Object.assign(Error(message),{statusCode});};
function reference(date,patient){return `DEMO-FC-${date.replaceAll('-','')}-${patient.id}`;}
function dayFor(config,date,ctx){return date===(config.state.date||ctx.DATES[0])?config.state:config.days?.[date]||ctx.initialState(Date.now(),date);}
function rows(config,ctx){return ctx.DATES.flatMap(date=>{
 const state=dayFor(config,date,ctx),cancelled=new Set(state.cancelledIds||[]),snapshots=new Map(ctx.project(state).patients.map(patient=>[patient.id,patient]));
 return ctx.patientsFor({...state,cancelledIds:[]}).map(patient=>{
  const snapshot=snapshots.get(patient.id),isCancelled=cancelled.has(patient.id),invoiceRows=config.invoices?.[date]?.rows.filter(row=>row.patientId===patient.id)||[];
  return {reference:reference(date,patient),facilityDemo:true,demoOnly:true,bookingSource:'DEMO',source:'DEMO',demoDate:date,demoPatientId:patient.id,name:patient.name,phone:patient.patientContact?.phone||'',email:patient.patientContact?.email||'',service:patient.serviceKey||patient.service.toLowerCase(),date,time:clock(patient.pickup),pickupTime:clock(patient.pickup),appointmentTime:clock(patient.appointmentAt),tripType:patient.tripType||'ROUND_TRIP',returnTripDate:patient.tripType==='ONE_WAY'?null:date,returnTripTime:patient.tripType==='ONE_WAY'?null:clock(patient.returnPickup),pickup:(patient.origin||ctx.FACILITY).address,destination:patient.destination.address,driverName:patient.driver,vehicleUnit:patient.unit,distanceMiles:patient.distanceMiles,ourEstimate:isCancelled?0:invoiceRows.reduce((sum,row)=>sum+row.total,0)/100,status:isCancelled?'CANCELLED':'DEMO',statusLabel:isCancelled?'DEMO TRIP · Cancelled':'DEMO TRIP · '+(snapshot?.stage||'Scheduled'),notes:patient.notes||'',submitterEntity:'FutureCare Annapolis · facility demo',vehicleWaiting:!!patient.vehicleWaiting,waitMinutes:patient.waitMinutes||0,stops:patient.stops||[],fictional:true};
 });
 });}
function locate(config,ref,ctx){const trip=rows(config,ctx).find(trip=>trip.reference===ref);if(!trip)fail('Demo trip not found.',404);const state=dayFor(config,trip.date,ctx),patient=ctx.patientsFor({...state,cancelledIds:[]}).find(patient=>patient.id===trip.demoPatientId);return {trip,state,patient};}
function bookingForm(patient,trip,body){
 const index=patient.destinationIndex??0,template=body.templates[index],origin=patient.origin||body.facility;
 const contact=value=>({name:value?.name||'',email:value?.email||'',phone:value?.phone||''});
 return {action:'editBooking',date:trip.date,patientId:patient.id,requestId:body.requestId,name:body.name??patient.name,service:body.service??patient.service,tripType:body.tripType??patient.tripType??'ROUND_TRIP',scheduleBasis:patient.scheduleBasis||'APPOINTMENT',destinationIndex:index,origin:{name:origin.name,address:origin.address,suite:origin.suite||''},customDestination:patient.destination.address!==template.destination.address?patient.destination:undefined,destinationSuite:patient.destination.suite||'',stops:patient.stops||[],distanceMiles:patient.distanceMiles,travelMinutes:patient.travel,pickupTime:body.pickupTime??clock(patient.pickup),appointmentTime:body.appointmentTime??clock(patient.appointmentAt),returnTime:body.returnTime??(patient.returnPickup==null?'':clock(patient.returnPickup)),vehicleWaiting:body.vehicleWaiting??!!patient.vehicleWaiting,appointment:patient.appointment,notify:['destination','caregiver'].filter(value=>!patient.recipients||patient.recipients.some(recipient=>recipient.startsWith(value==='destination'?'Destination':'Patient'))),patientContact:{...contact(patient.patientContact),phone:body.phone??patient.patientContact?.phone??'',email:body.email??patient.patientContact?.email??''},caregiverContact:contact(patient.caregiverContact),destinationContact:contact(patient.destinationContact),notes:body.notes??patient.notes??'',fuelProfile:body.service&&body.service!=='Ambulatory'&&body.service!=='ambulatory'?'':patient.fuelProfile||'',flight:{number:patient.flight?.number||'',airportStop:patient.flight?.airportStop||'pickup',terminal:patient.flight?.terminal||''}};
}
async function handle(event,p,method,ctx){
 const {config,json}=ctx;if(p[2]!=='trips')return json(404,{error:'Demo editor action not found.'});
 if(!p[3]&&method==='GET')return json(200,{trips:rows(config,ctx),demoOnly:true});
 const ref=decodeURIComponent(p[3]||'');
 if(method==='GET'&&!p[4]){const {trip,patient}=locate(config,ref,ctx),settings=ctx.readPlatformSettings?await ctx.readPlatformSettings():null;return json(200,{booking:trip,patient,services:Booking.catalog(settings),demoOnly:true});}
 if(!(method==='PATCH'&&!p[4]||method==='POST'&&['cancel','restore'].includes(p[4])))return json(405,{error:'Use the demo editor to update, cancel or restore this trip.'});
 const body=ctx.parseBody(event);if(body.bookingSource&&body.bookingSource!=='DEMO')fail('A demo trip cannot be converted into a real booking.');
 const settings=ctx.readPlatformSettings?await ctx.readPlatformSettings():null;if(!settings)fail('Configured demo invoicing is unavailable.',409);
 const client=await ctx.getPool().connect();
 try{
  await client.query('BEGIN');const locked=(await client.query('SELECT value FROM system_settings WHERE key=$1 FOR UPDATE',[ctx.KEY])).rows[0]?.value;if(!locked)fail('Facility demo is unavailable.',409);
  const {trip,state,patient}=locate(locked,ref,ctx);if(body.date&&body.date!==trip.date)fail('Edit this occurrence on its original demo service day.');
  let command;
  if(method==='POST')command={action:p[4]==='cancel'?'cancelBooking':'restoreBooking',date:trip.date,patientId:patient.id};
  else{if(trip.status==='CANCELLED')fail('Restore this demo trip before editing it.',409);command=bookingForm(patient,trip,{...body,requestId:body.requestId||crypto.randomUUID(),templates:ctx.PATIENTS,facility:ctx.FACILITY});}
  const updated=ctx.control(state,command,Date.now(),settings);if(trip.date===(locked.state.date||ctx.DATES[0]))locked.state=updated;else locked.days={...(locked.days||{}),[trip.date]:updated};
  ctx.syncBilling(locked,settings);await client.query('UPDATE system_settings SET value=$2::jsonb,updated_at=now() WHERE key=$1',[ctx.KEY,JSON.stringify(locked)]);await client.query('COMMIT');
  const saved=locate(locked,ref,ctx);return json(200,{booking:saved.trip,patient:saved.patient,services:Booking.catalog(settings),persisted:true,demoOnly:true,notifications:{status:'simulated'}});
 }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}finally{client.release();}
}
module.exports={handle,rows,reference};
