const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require.resolve('../netlify/functions/api.cjs'),'utf8');
const patchAnchor=source.indexOf("p[1]==='bookings'&&p[2]&&method==='PATCH'");
const updateStart=source.indexOf('const r=await query(',patchAnchor);
const updateEnd=source.indexOf(']);',updateStart)+3;
const updateSlice=source.slice(updateStart,updateEnd);

// Run the admin bookings PATCH UPDATE construction with a stubbed query and
// return the SQL + params it would send to Postgres.
async function buildUpdate(body){
 const beforeRow={reference:'UNASSIGN-TEST',driver_name:'Fletcher Kalundi',vehicle_unit:'SUV-254-01',service:'ambulatory',pickup:'Home',pickup_location:'',destination:'Clinic',dropoff_location:'',trip_date:'2030-08-15',trip_time:'08:15',notes:null,name:'Pat',phone:'555-0100',email:'',booking_source:'DIRECT',submitter_entity:'',broker_company_name:''};
 let captured=null;
 const context=vm.createContext({
  b:body,ref:beforeRow.reference,statusValue:null,
  clean:v=>String(v??'').trim(),
  before:{rows:[beforeRow]},
  hasEstimatedFare:false,estimatedFareRaw:null,
  hasService:false,hasPickup:false,hasPickupLocation:false,hasDestination:false,hasDestinationLocation:false,
  hasDate:false,hasTime:false,hasNotes:false,hasAppointmentTime:false,hasCheckInTime:false,hasCalculatedFare:false,
  hasTripSchedule:false,notesValue:null,
  hasName:false,hasPhone:false,hasEmail:false,
  hasBookingSource:false,bookingSourceValue:null,
  hasSubmitterEntity:false,submitterEntityInput:'',
  hasBrokerCompanyName:false,brokerCompanyNameInput:'',
  hasBrokerAcceptedRate:false,brokerAcceptedRateValue:null,
  tripTypeValue:'ONE_WAY',returnDateValue:null,returnTimeValue:null,
  // Mirrors the handler's own presence checks for these two fields.
  hasDriverName:Object.prototype.hasOwnProperty.call(body,'driverName'),
  hasVehicleUnit:Object.prototype.hasOwnProperty.call(body,'vehicleUnit'),
  query:async(sql,params)=>{captured={sql,params};return {rows:[beforeRow]};}
 });
 await vm.runInContext(`(async()=>{${updateSlice}})()`,context);
 assert.ok(captured,'UPDATE statement was not constructed');
 return {captured,beforeRow};
}

// Evaluate one `col=CASE WHEN $g THEN $v ELSE col END` assignment the way
// Postgres would, against the before row.
function evaluateAssignment(sql,params,beforeRow,column){
 const match=sql.match(new RegExp(`${column}=CASE WHEN \\$(\\d+) THEN \\$(\\d+) ELSE ${column} END`));
 assert.ok(match,`${column} is not presence-gated in the UPDATE`);
 return params[Number(match[1])-1]?params[Number(match[2])-1]:beforeRow[column];
}

test('PATCH update presence-gates driver and vehicle instead of COALESCE',()=>{
 assert.ok(!updateSlice.includes('driver_name=COALESCE'),'driver_name must not use COALESCE (empty string becomes null and the old value survives)');
 assert.ok(!updateSlice.includes('vehicle_unit=COALESCE'),'vehicle_unit must not use COALESCE');
 assert.match(updateSlice,/driver_name=CASE WHEN \$\d+ THEN \$3 ELSE driver_name END/);
 assert.match(updateSlice,/vehicle_unit=CASE WHEN \$\d+ THEN \$4 ELSE vehicle_unit END/);
});

test('clearing driver and vehicle unassigns them',async()=>{
 const {captured,beforeRow}=await buildUpdate({driverName:'',vehicleUnit:''});
 assert.equal(evaluateAssignment(captured.sql,captured.params,beforeRow,'driver_name'),null);
 assert.equal(evaluateAssignment(captured.sql,captured.params,beforeRow,'vehicle_unit'),null);
});

test('omitting driver and vehicle from a partial update leaves them unchanged',async()=>{
 const {captured,beforeRow}=await buildUpdate({notes:'Call on arrival.'});
 assert.equal(evaluateAssignment(captured.sql,captured.params,beforeRow,'driver_name'),'Fletcher Kalundi');
 assert.equal(evaluateAssignment(captured.sql,captured.params,beforeRow,'vehicle_unit'),'SUV-254-01');
});

test('setting new driver and vehicle values reassigns them',async()=>{
 const {captured,beforeRow}=await buildUpdate({driverName:'Kene Emelife',vehicleUnit:'SE-254-01'});
 assert.equal(evaluateAssignment(captured.sql,captured.params,beforeRow,'driver_name'),'Kene Emelife');
 assert.equal(evaluateAssignment(captured.sql,captured.params,beforeRow,'vehicle_unit'),'SE-254-01');
});

test('clearing only the vehicle leaves the driver assigned',async()=>{
 const {captured,beforeRow}=await buildUpdate({vehicleUnit:''});
 assert.equal(evaluateAssignment(captured.sql,captured.params,beforeRow,'driver_name'),'Fletcher Kalundi');
 assert.equal(evaluateAssignment(captured.sql,captured.params,beforeRow,'vehicle_unit'),null);
});
