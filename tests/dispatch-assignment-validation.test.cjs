const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require.resolve('../netlify/functions/api.cjs'),'utf8');
const start=source.indexOf('   const statusValue=',source.indexOf("method==='PATCH'",source.indexOf("p[1]==='bookings'&&p[2]")));
const end=source.indexOf('  const hasNotes=',start);
async function validate(body,overrides={}){
 const row={reference:'VALIDATE',trip_date:'2030-08-15',trip_time:'08:15:00',pickup_time:'07:34:00',service:'stretcher',pickup:'Home',destination:'Clinic',trip_type:'ONE_WAY',status:'ASSIGNED',driver_name:'Fletcher',vehicle_unit:'ST-254-01',...overrides};
 let checks=0;
 const context=vm.createContext({b:body,ref:row.reference,before:{rows:[row]},editingMock:false,hasTripSchedule:false,clean:v=>String(v??'').trim(),normalizeTripDate:v=>String(v??'').slice(0,10),normalizeOptionalTripTime:v=>String(v??'').slice(0,5),resolveServicePolicyKey:v=>String(v).toLowerCase(),mapBooking:r=>({reference:r.reference,date:r.trip_date,time:r.trip_time,pickupTime:r.pickup_time,service:r.service,status:r.status}),SERVICE_VEHICLE_PREFS:{stretcher:['ST-254-01']},readPlatformSettings:async()=>({}),query:async()=>{throw Error('Unexpected database query');},TimingAvailability:{resources:async()=>{checks++;return {plan:{routingPending:false},drivers:[{display_name:'Fletcher'}],vehicles:[{unit_number:'ST-254-01'}]};}},json:(status,body)=>({status,...body})});
 const result=await vm.runInContext(`(async()=>{${source.slice(start,end)};return {timingChanged};})()`,context);
 return {result,checks};
}
test('unchanged saved pickup and case-equivalent service do not trigger availability checks on a notes edit',async()=>{
 const {result,checks}=await validate({date:'2030-08-15',time:'07:34',service:'Stretcher',driverName:'Fletcher',vehicleUnit:'ST-254-01',notes:'Call on arrival.'});
 assert.equal(result.timingChanged,false);assert.equal(checks,0);
});
test('ineligible vehicle gets a service-specific correction rather than a false overlap error',async()=>{
 const {result,checks}=await validate({vehicleUnit:'SH-254-01'});
 assert.equal(result.status,409);assert.equal(result.code,'VEHICLE_SERVICE_MISMATCH');assert.match(result.error,/SH-254-01.*not eligible.*stretcher.*ST-254-01/);assert.equal(checks,0);
});
test('an eligible vehicle change validates the full care window',async()=>{
 const {result,checks}=await validate({vehicleUnit:'ST-254-01',driverName:'Fletcher'},{vehicle_unit:'SH-254-01'});
 assert.equal(result.status,undefined);assert.equal(checks,1);
});
test('route address changes trigger validation even when pickup time stays the same',async()=>{
 const {result,checks}=await validate({pickup:'New home',time:'07:34',driverName:'Fletcher',vehicleUnit:'ST-254-01'});
 assert.equal(result.timingChanged,true);assert.equal(checks,1);
});
