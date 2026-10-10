const {test,expect}=require('@playwright/test');
const Fare=require('../nexus-fare.js');
const Routes=require('../nexus-route.js');
const settings={organization:{yardAddress:'Company yard'},pricing:{ambulatory:{base:75,includedMiles:5,perMile:3.55,waitPer15:12}},fareRules:{fuelSurchargePerMile:.24,cardProcessingFeePct:3}};
test('dispatch recalculates imported totals from both driving legs and shows empty miles',async({page})=>{
 let trip={reference:'NMT-ROUTE-TEST',name:'Christine Webster',pickup:'Patient home',destination:'Medical clinic',service:'ambulatory',date:'2026-09-30',time:'09:00',pickupTime:'09:00',appointmentTime:'09:45',tripType:'ROUND_TRIP',returnTripDate:'2026-09-30',returnTripTime:'11:30',createdAt:'2026-10-10T14:00:00Z',bookingSource:'BROKER',status:'COMPLETED',distanceMiles:27.46,ourEstimate:418.85};
 const saved=[];
 await page.addInitScript(()=>{
  sessionStorage.setItem('nexusAccessToken','route-test');
  window.routeRequests=[];
  window.google={maps:{TravelMode:{DRIVING:'DRIVING'},TrafficModel:{BEST_GUESS:'BEST_GUESS'},DirectionsService:class{route(request,callback){
   window.routeRequests.push({from:request.origin,to:request.destination});
   const values={'Company yard|Patient home':6.5138342082239715,'Patient home|Medical clinic':14.103261950210769,'Medical clinic|Patient home':13.57820329277022,'Patient home|Company yard':6.5188051777618705,'Patient home|New clinic':20,'New clinic|Patient home':18};
   const miles=values[request.origin+'|'+request.destination];
   callback({routes:[{legs:[{distance:{value:miles*1609.344},duration:{value:1500}}]}]},miles==null?'NOT_FOUND':'OK');
  }}}};
 });
 await page.route('**/api/**',route=>{
  const pathname=new URL(route.request().url()).pathname;
  let body={};
  if(pathname==='/api/auth/me')body={user:{role:'ADMIN',email:'staff@example.com'}};
  else if(pathname==='/api/settings/public')body=settings;
  else if(pathname==='/api/integrations/config')body={googleMapsEnabled:true,googleMapsBrowserKey:'mock-browser-key'};
  else if(pathname==='/api/portal/trips')body={trips:[trip]};
  else if(pathname.endsWith('/route-fare-inputs')){
   const inputs=route.request().postDataJSON().routeFareInputs;
   Routes.validate(inputs,trip,settings.organization.yardAddress);
   saved.push(inputs);
   const fare=Fare.calculateEstimate({...trip,routeFareInputs:inputs},settings);
   trip={...trip,routeFareInputs:inputs,fareCalculation:fare,ourEstimate:fare.discountedTotal,distanceMiles:inputs.miles};
   body={booking:trip};
  }else if(pathname==='/api/admin/bookings/'+trip.reference)body={booking:trip};
  return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
 });
 await page.goto('/dispatch.html',{waitUntil:'domcontentloaded'});
 await page.locator('[data-section-target="tripBoard"]').click();
 if(await page.locator('#tripBoardBody').evaluate(element=>element.hidden))await page.locator('#tripBoardToggle').click();
 await page.locator('#loadTrips').click();
 await expect(page.locator('.tripSummaryRow .tripColEstimate')).toHaveText('$318.06');
 expect(saved.length).toBeGreaterThan(0);
 expect(saved[0].passengerLegs.map(leg=>leg.miles)).toEqual([14.103261950210769,13.57820329277022]);
 await page.locator('.tripPatientButton').click();
 await expect(page.locator('#dispatchEditOurEstimate')).toHaveValue('$318.06');
 await expect(page.locator('#dispatchEditOperationalSummary')).toContainText('27.68 passenger mi total');
 await page.locator('#dispatchEditCalculation > summary').click();
 await expect(page.locator('#dispatchEditFareBreakdown')).toContainText('14.10 mi');
 await expect(page.locator('#dispatchEditFareBreakdown')).toContainText('13.58 mi');
 await expect(page.locator('#dispatchEditFareBreakdown')).toContainText('6.51 mi; 1.51');
 await expect(page.locator('#dispatchEditFareBreakdown')).toContainText('6.52 mi; 1.52');
 await page.locator('#dispatchEditDestination').fill('New clinic');
 await page.locator('#dispatchEditDestination').dispatchEvent('change');
 const expected=Fare.calculateEstimate({...trip,destination:'New clinic',routeFareInputs:{...trip.routeFareInputs,routeAddresses:{...trip.routeFareInputs.routeAddresses,destinations:['New clinic']},miles:20,passengerLegs:trip.routeFareInputs.passengerLegs.map((leg,index)=>({...leg,from:index?'New clinic':'Patient home',to:index?'Patient home':'New clinic',miles:index?18:20}))}},settings).discountedTotal;
 await expect(page.locator('#dispatchEditOurEstimate')).toHaveValue('$'+expected.toFixed(2));
 await expect(page.locator('#dispatchEditOperationalSummary')).toContainText('38.00 passenger mi total');
});
