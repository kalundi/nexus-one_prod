const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const Fare=require('../nexus-fare.js');
const rates={ambulance:0.7052,bus:0.5595,land_rover:0.2842,gasoline_sedan:0.1399,hybrid_sedan:0.0933,electric_public:0.18,electric_home:0.0642,electric_depot:0.0525};
const rate={base:100,includedMiles:8,perMile:4,waitPer15:20};
const rules={vehicleFuelRatesPerMile:rates,fuelSurchargePerMile:9,cardProcessingFeePct:0,afterHoursSurchargePct:0};
function estimate(service,overrides={}){
 return Fare.calculate({service,miles:10,date:'2030-08-15',time:'10:00',rate,rules,...overrides});
}
for(const [service,vehicleClass] of Object.entries({ambulatory:'land_rover',wheelchair:'bus',stretcher:'bus',broda:'bus',bariatric:'bus',bls:'ambulance',als1:'ambulance',als2:'ambulance',facility_transfer:'ambulance',facility_transfer_critical:'ambulance'})){
 test(service+' uses the confirmed vehicle fuel rate without adding the fleet surcharge',()=>{
  const fare=estimate(service);
  assert.equal(fare.fuelVehicleClass,vehicleClass);
  assert.equal(fare.fuelRatePerMile,rates[vehicleClass]);
  assert.equal(Fare.roundMoney(fare.fuelCharge),Fare.roundMoney(10*rates[vehicleClass]));
  assert.equal(Fare.roundMoney(fare.subtotal),Fare.roundMoney(100+2*4+10*rates[vehicleClass]));
 });
}
test('both independently measured passenger legs include fuel, with no fuel added to empty miles',()=>{
 const fare=estimate('bls',{tripType:'ROUND_TRIP',returnDate:'2030-08-15',returnTime:'14:00',metrics:{passengerLegs:[{miles:10},{miles:20}],deadheadSegments:[50,40]}});
 assert.equal(fare.passengerMilesTotal,30);
 assert.equal(Fare.roundMoney(fare.fuelCharge),21.16);
 assert.equal(Fare.roundMoney(fare.passengerLegs[0].fuelCharge),7.05);
 assert.equal(Fare.roundMoney(fare.passengerLegs[1].fuelCharge),14.10);
});
test('an explicit zero vehicle rate remains zero, and legacy settings still work',()=>{
 assert.equal(estimate('bls',{rules:{...rules,vehicleFuelRatesPerMile:{...rates,ambulance:0}}}).fuelCharge,0);
 assert.equal(estimate('bls',{rules:{fuelSurchargePerMile:0.22}}).fuelCharge,2.2);
});
test('server settings supply defaults, preserve overrides and reject invalid rate ranges',()=>{
 const source=fs.readFileSync(require.resolve('../netlify/functions/api.cjs'),'utf8');
 const context=vm.createContext({NexusFare:Fare,NexusTripTiming:require('../nexus-trip-timing.js'),clean:value=>String(value??'').trim(),n:(value,fallback=0)=>value==null||value===''?fallback:Number.isFinite(Number(value))?Number(value):fallback,clamp:(value,min,max)=>Math.min(max,Math.max(min,value))});
 vm.runInContext(source.slice(source.indexOf('const DEFAULT_PRICING='),source.indexOf('async function ensureSettingsTable('))+source.slice(source.indexOf('function mergePricing('),source.indexOf('async function readPlatformSettings(')),context);
 const migrated=context.mergePlatformSettings({fareRules:{fuelPricingMode:'AUTO',fuelSurchargePerMile:0.22}});
 assert.deepEqual(JSON.parse(JSON.stringify(migrated.fareRules.vehicleFuelRatesPerMile)),rates);
 const saved=context.mergePlatformSettings({...migrated,fareRules:{...migrated.fareRules,vehicleFuelRatesPerMile:{ambulance:0,bus:0.6,land_rover:0.3}}});
 assert.deepEqual(JSON.parse(JSON.stringify(saved.fareRules.vehicleFuelRatesPerMile)),{...rates,ambulance:0,bus:0.6,land_rover:0.3});
 const invalid=context.mergePlatformSettings({fareRules:{vehicleFuelRatesPerMile:{ambulance:-1,bus:99,land_rover:'bad'}}});
 assert.deepEqual(JSON.parse(JSON.stringify(invalid.fareRules.vehicleFuelRatesPerMile)),{...rates,ambulance:0,bus:25,land_rover:0.2842});
 const profiles=context.mergePlatformSettings({fareRules:{ambulatoryFuelProfile:'hybrid_sedan',vehicleFuelProfiles:{'SE-254-01':'gasoline_sedan','SUV-254-01':'land_rover','BAD-01':'unknown'}}});
 assert.equal(profiles.fareRules.ambulatoryFuelProfile,'hybrid_sedan');
 assert.deepEqual(JSON.parse(JSON.stringify(profiles.fareRules.vehicleFuelProfiles)),{'SE-254-01':'gasoline_sedan','SUV-254-01':'land_rover'});
});
test('booking and editor match with vehicle fuel, premiums, processing, and savings',()=>{
 const settings={pricing:{bls:rate},fareRules:{...rules,weekendSurchargePct:30,cardProcessingFeePct:3}};
 const inputs={miles:10,durationMinutes:30,trafficDurationMinutes:30,stopWaitMinutes:0,discountPct:5,deadheadSegments:[0,0],scheduleBasis:'PICKUP'};
 const booking={service:'bls',date:'2030-08-17',time:'10:00',tripType:'ROUND_TRIP',returnTripDate:'2030-08-17',returnTripTime:'14:00',fareInputs:inputs};
 const original=Fare.calculateBooking(booking,inputs,settings);
 const editor=Fare.calculateEstimate(booking,settings);
 assert.equal(editor.discountedTotal,original.discountedTotal);
 assert.equal(Fare.roundMoney(original.fuelCharge),14.1);
 assert.equal(editor.fuelVehicleLabel,'Diesel ambulance');
});
for(const profile of ['land_rover','gasoline_sedan','hybrid_sedan','electric_public','electric_home','electric_depot']){
 test(profile+' uses Ambulatory pricing and the assigned fuel rate in booking and editor',()=>{
  const settings={pricing:{ambulatory:rate},fareRules:{...rules,vehicleFuelProfiles:{'SE-TEST-01':profile}}};
  const inputs={miles:100,durationMinutes:120,trafficDurationMinutes:120,stopWaitMinutes:0,discountPct:0,deadheadSegments:[0,0],scheduleBasis:'PICKUP'};
  const booking={service:'ambulatory',date:'2030-08-15',time:'10:00',vehicleUnit:'SE-TEST-01',fareInputs:inputs};
  const fare=Fare.calculateBooking(booking,inputs,settings);
  assert.equal(fare.fuelVehicleClass,profile);
  assert.equal(fare.fuelCharge,rates[profile]*100);
  assert.equal(Fare.calculateEstimate(booking,settings).discountedTotal,fare.discountedTotal);
 });
}
test('all SUV and sedan service aliases normalize to Ambulatory',()=>{
 const settings={pricing:{ambulatory:rate},fareRules:rules};
 for(const service of ['SUV','sedan','gasoline sedan','hybrid sedan','electric sedan','Land Rover','Range Rover']){
  const fare=Fare.calculateEstimate({service,date:'2030-08-15',time:'10:00',distanceMiles:10},settings);
  assert.equal(fare.fuelVehicleClass,'land_rover');
  assert.equal(Fare.roundMoney(fare.fuelCharge),2.84);
 }
});
test('unassigned Ambulatory uses its configured default, not a client-supplied vehicle',async()=>{
 const source=fs.readFileSync(require.resolve('../netlify/functions/api.cjs'),'utf8');
 const start=source.indexOf('   if(!b.fareInputs)return json(400'),end=source.indexOf('   const codeHash=',start);
 const booking={service:'ambulatory',date:'2030-08-15',time:'10:00',vehicleUnit:'CHEAP-01',fareInputs:{miles:10,durationMinutes:30,trafficDurationMinutes:30,stopWaitMinutes:0,discountPct:0,deadheadSegments:[0,0],scheduleBasis:'PICKUP'}};
 const settings={pricing:{ambulatory:rate},fareRules:{...rules,ambulatoryFuelProfile:'gasoline_sedan',vehicleFuelProfiles:{'CHEAP-01':'electric_depot'}}};
 const context={b:booking,readPlatformSettings:async()=>settings,TripTiming:{hydrate:async rows=>rows},query:()=>{},NexusFare:Fare,pickupTimeEstimate:booking.time,appointmentTime:null,tripType:'ONE_WAY',returnTripDate:null,returnTripTime:null,bookingSource:'CUSTOMER',json:(status,body)=>({status,body})};
 const saved=await vm.runInNewContext(`(async()=>{${source.slice(start,end)};return submittedFare;})()`,context);
 const expected=Fare.calculateBooking({...booking,vehicleUnit:null},booking.fareInputs,settings);
 assert.equal(saved,expected.discountedTotal);
 assert.equal(expected.fuelVehicleClass,'gasoline_sedan');
 assert.equal(Fare.roundMoney(expected.fuelCharge),1.4);
});
test('weekly fuel index refresh preserves the manual vehicle rates',async()=>{
 const source=fs.readFileSync(require.resolve('../netlify/functions/fuel-index-refresh.cjs'),'utf8');
 let saved;
 const settings={fareRules:{...rules,fuelPricingMode:'AUTO'}};
 const context=vm.createContext({exports:{},process:{env:{}},URLSearchParams,console,fetch:async()=>({ok:true,json:async()=>({response:{data:[{value:4}]}})}),require:()=>({query:async(sql,args)=>{if(sql.startsWith('SELECT'))return {rows:[{value:settings}]};saved=JSON.parse(args[1]);return {rows:[]};}})});
 vm.runInContext(source,context);
 const response=await context.exports.handler();
 assert.equal(response.statusCode,200);
 assert.deepEqual(saved.fareRules.vehicleFuelRatesPerMile,rates);
});
test('precise fuel rates reproduce every supplied 100-mile cost',()=>{
 const expected={ambulance:70.52,bus:55.95,land_rover:28.42,gasoline_sedan:13.99,hybrid_sedan:9.33,electric_public:18,electric_home:6.42,electric_depot:5.25};
 for(const [profile,hundredMiles] of Object.entries(expected)){
  assert.equal(Fare.roundMoney(Fare.fuelProfiles[profile].rate*100),hundredMiles);
 }
});
for(const profile of ['land_rover','gasoline_sedan','hybrid_sedan','electric_public','electric_home','electric_depot']){
 test('optional '+profile+' preference changes the quote and survives saving in the editor',()=>{
  const settings={pricing:{ambulatory:rate},fareRules:{...rules,vehicleFuelProfiles:{'SUV-TEST':'land_rover'}}};
  const inputs={fuelProfile:profile,miles:100,durationMinutes:120,trafficDurationMinutes:120,stopWaitMinutes:0,discountPct:0,deadheadSegments:[0,0],scheduleBasis:'PICKUP'};
  const booking={service:'ambulatory',date:'2030-08-15',time:'10:00',vehicleUnit:'SUV-TEST',fareInputs:inputs};
  const quote=Fare.calculateBooking(booking,inputs,settings);
  const saved={...booking,fareInputs:undefined,notes:'Fare inputs: '+JSON.stringify(inputs)};
  const editor=Fare.calculateEstimate(saved,settings);
  assert.equal(quote.fuelVehicleClass,profile);
  assert.equal(Fare.roundMoney(quote.fuelCharge),Fare.roundMoney(rates[profile]*100));
  assert.equal(editor.inputs.fuelProfile,profile);
  assert.equal(editor.discountedTotal,quote.discountedTotal);
 });
}
test('ambulance services cannot switch to a cheaper sedan fuel preference',()=>{
 const inputs={fuelProfile:'electric_depot',miles:10,durationMinutes:30,trafficDurationMinutes:30,stopWaitMinutes:0,discountPct:0,deadheadSegments:[0,0]};
 assert.throws(()=>Fare.calculateBooking({service:'bls',date:'2030-08-15',time:'10:00'},inputs,{pricing:{bls:rate},fareRules:rules}),/Invalid Ambulatory/);
});
test('changing or clearing a preference takes priority over an older verified route snapshot',()=>{
 const settings={pricing:{ambulatory:rate},fareRules:rules};
 const inputs={fuelProfile:'land_rover',miles:10,durationMinutes:30,trafficDurationMinutes:30,stopWaitMinutes:0,discountPct:0,deadheadSegments:[0,0],scheduleBasis:'PICKUP'};
 const route={...inputs,routeVerified:true,routeAddresses:{pickup:'Home',destinations:['Clinic'],tripType:'ONE_WAY'}};
 const booking={service:'ambulatory',date:'2030-08-15',time:'10:00',pickup:'Home',destination:'Clinic',routeFareInputs:route};
 for(const fuelProfile of ['hybrid_sedan','']){
  const fare=Fare.calculateEstimate({...booking,fareInputs:{...inputs,fuelProfile}},settings);
  assert.equal(fare.inputs.fuelProfile,fuelProfile);
  assert.equal(fare.fuelVehicleClass,fuelProfile||'land_rover');
 }
});
test('automatic assignment respects rider service eligibility and optional vehicle preferences',()=>{
 const source=fs.readFileSync(require.resolve('../netlify/functions/api.cjs'),'utf8');
 const start=source.indexOf('function fuelPreferenceUnits('),end=source.indexOf('async function autoAssign(',start);
 const context=vm.createContext({NexusFare:Fare,mapBooking:booking=>booking});
 vm.runInContext(source.slice(start,end),context);
 const prefs=['SE-254-01','SUV-254-01','SH-254-01'];
 const settings={fareRules:{...rules,vehicleFuelProfiles:{'SE-254-01':'electric_public'}}};
 assert.deepEqual(Array.from(context.fuelPreferenceUnits({service:'ambulatory'},settings,prefs)),prefs);
 assert.deepEqual(Array.from(context.fuelPreferenceUnits({service:'ambulatory',fareInputs:{fuelProfile:'land_rover'}},settings,prefs)),['SUV-254-01']);
 assert.deepEqual(Array.from(context.fuelPreferenceUnits({service:'ambulatory',fareInputs:{fuelProfile:'electric_public'}},settings,prefs)),['SE-254-01']);
 assert.deepEqual(Array.from(context.fuelPreferenceUnits({service:'ambulatory',fareInputs:{fuelProfile:'hybrid_sedan'}},settings,prefs)),[]);
});
