const {test}=require('node:test');
const assert=require('node:assert/strict');
const Routes=require('../nexus-route.js');
const Fare=require('../nexus-fare.js');
const Cache=require('../netlify/functions/_shared/route-fares.cjs');
const booking={pickup:'Patient home',destination:'Medical clinic',tripType:'ROUND_TRIP',service:'ambulatory',date:'2026-09-30',time:'09:00',appointmentTime:'09:45',returnTripDate:'2026-09-30',returnTripTime:'11:30',bookingSource:'BROKER',createdAt:'2026-10-10T14:00:00Z',distanceMiles:27.46};
const settings={organization:{yardAddress:'Company yard'},pricing:{ambulatory:{base:75,includedMiles:5,perMile:3.55,waitPer15:12}},fareRules:{fuelSurchargePerMile:.24,cardProcessingFeePct:3}};
const distances=[6.5138342082239715,14.103261950210769,13.57820329277022,6.5188051777618705];
const directions=miles=>({routes:[{legs:[{distance:{value:miles*1609.344},duration:{value:1500}}]}]});
test('asymmetric driving routes include outbound, reverse return and yard empty miles separately',async()=>{
 const requests=[];
 const inputs=await Routes.measure(booking,settings.organization.yardAddress,async segment=>{requests.push(segment);return directions(distances[['DEADHEAD_TO_PICKUP','OUTBOUND','RETURN','DEADHEAD_AFTER_TRIP'].indexOf(segment.kind)]);});
 assert.deepEqual(requests.map(route=>[route.from,route.to]),[['Company yard','Patient home'],['Patient home','Medical clinic'],['Medical clinic','Patient home'],['Patient home','Company yard']]);
 const fare=Fare.calculateEstimate({...booking,routeFareInputs:inputs},settings);
 assert.equal(fare.discountedTotal,318.06);
 assert.equal(fare.waitMinutes,120);
 assert.equal(fare.waitCharge,84);
 assert.ok(Math.abs(fare.passengerMilesTotal-27.68146524298099)<1e-10);
 assert.ok(Math.abs(fare.mileageCharge-(distances[1]+distances[2]-10)*3.55)<1e-10);
 assert.ok(Math.abs(fare.deadheadCharge-((distances[0]-5)+(distances[3]-5))*1.775)<1e-10);
 assert.equal(fare.deadheadDetails.length,2);
 assert.equal(fare.passengerLegs[1].miles,distances[2]);
 assert.equal(fare.inputs.miles,distances[1]);
});
test('one-way ends at the destination; the next assigned pickup can replace yard deadhead',()=>{
 const plan=Routes.plan({...booking,tripType:'ONE_WAY',nextPickupAddress:'Next patient'},'Yard');
 assert.deepEqual(plan.map(route=>[route.kind,route.from,route.to]),[['DEADHEAD_TO_PICKUP','Yard','Patient home'],['OUTBOUND','Patient home','Medical clinic'],['DEADHEAD_AFTER_TRIP','Medical clinic','Next patient']]);
});
test('multiple stops route through each destination before returning from the last one',()=>{
 const plan=Routes.plan({...booking,destinations:['First clinic','Last clinic']},'Yard');
 assert.deepEqual(plan[1].waypoints,['First clinic']);
 assert.equal(plan[1].to,'Last clinic');
 assert.equal(plan[2].from,'Last clinic');
});
test('stale route measurements cannot follow edited addresses, trip type or yard',async()=>{
 const inputs=await Routes.measure(booking,'Company yard',async()=>directions(10));
 assert.equal(Routes.matches(inputs,{...booking,pickup:' patient HOME '},'Company yard'),true);
 for(const edited of [{...booking,pickup:'Other home'},{...booking,tripType:'ONE_WAY'}]){
  assert.equal(Routes.matches(inputs,edited,'Company yard'),false);
  assert.equal(Fare.calculateEstimate({...edited,notes:'Fare inputs: '+JSON.stringify(inputs)},settings).inputs.routeVerified,false);
 }
 assert.equal(Cache.currentBooking({...booking,routeFareInputs:inputs},{...settings,organization:{yardAddress:'New yard'}}).routeFareInputs,null);
 assert.throws(()=>Routes.validate({...inputs,deadheadSegments:[0,0]},booking,'Company yard'),/totals/);
});
test('cached address routes refresh legacy and newly imported trips with current rates',async()=>{
 const inputs=await Routes.measure(booking,'Company yard',async()=>directions(10));
 const [routed]=await Cache.hydrate([booking],settings,async(sql,params)=>({rows:[{route_key:params[0][0],inputs}]}));
 assert.equal(routed.routeFareInputs,inputs);
 const updated={...settings,pricing:{ambulatory:{...settings.pricing.ambulatory,perMile:4}}};
 assert.equal(Fare.roundMoney(Fare.calculateEstimate(routed,updated).discountedTotal-Fare.calculateEstimate(routed,settings).discountedTotal),6.95);
});
test('a broker total is never doubled again before verified routes are available',()=>{
 const result=Fare.calculateEstimate({...booking,intakePayload:{total_miles:27.46}},settings);
 assert.equal(result.passengerMilesTotal,27.46);
 assert.equal(result.inputs.mileageSource,'BROKER_TOTAL');
});
