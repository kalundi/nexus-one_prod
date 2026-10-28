const {test,expect}=require('@playwright/test');
const facility={id:'FC-A',name:'Care Facility A',address:'100 Facility Lane, Annapolis, MD'};
const trip={reference:'PROD-1001',name:'Alex Passenger',service:'wheelchair',pickup:facility.address,destination:'200 Hospital Road, Annapolis, MD',trip_date:'2026-10-28',trip_time:'08:00:00',appointment_time:'09:00:00',status:'SCHEDULED',payment_status:'DEPOSIT_PAID',driver_name:'Assigned Driver',vehicle_unit:'N100',trip_type:'ROUND_TRIP',return_trip_date:'2026-10-28',return_trip_time:'12:00:00',unread:1};
async function fixture(page,{staff=false,empty=false}={}){
 const captured={messages:[],locations:[],scope:[]};let messages=[];
 await page.addInitScript(()=>sessionStorage.setItem('nexusAccessToken','production-manager-session'));
 await page.route('https://**',r=>r.abort());
 await page.route('**/api/**',async route=>{const url=new URL(route.request().url()),path=url.pathname;let json={};
  if(path==='/api/auth/me')json={user:{id:'manager',role:staff?'DISPATCHER':'FACILITY',scopeId:facility.id,displayName:'Facility Manager',email:'manager@example.com',phone:'2405550100'}};
  if(path==='/api/facility-portal/context')json={facilities:staff?[facility,{id:'FC-B',name:'Care B',address:'Other address'}]:[facility],manager:!staff,today:'2026-10-28'};
  if(path==='/api/facility-portal/trips'){captured.scope.push(url.searchParams.get('facility'));json={facility,trips:empty?[]:[trip],page:0,hasMore:false,updatedAt:new Date().toISOString()};}
  if(path==='/api/facility-portal/locations')json={locations:empty?[]:[{address:trip.destination,visits:4,last_visit:'2026-10-27'}],basis:'Completed bookings, all time.'};
  if(path.startsWith('/api/facility-portal/communications/')){
   if(route.request().method()==='POST'){const body=route.request().postDataJSON();captured.messages.push(body);messages.push({id:'message',body:body.message,author_name:'Facility Manager',author_role:'FACILITY',created_at:new Date().toISOString()});json={message:'Saved'};}
   else json={messages,activity:[{id:'history',status:'SCHEDULED',created_at:new Date().toISOString()}],through:new Date().toISOString()};
  }
  if(path==='/api/integrations/config')json={googleMapsEnabled:false};
  if(path==='/api/settings/public')json={organization:{yardAddress:'Company yard'},pricing:{ambulatory:{base:75,includedMiles:5,perMile:3.55,waitPer15:12.5}},fareRules:{smartTiming:{enabled:true},waitingPolicyVersion:2,freeWaitMinutes:15}};
  if(path==='/api/booking/facilities')json={facilities:[facility]};
  return route.fulfill({json});
 });
 return captured;
}
for(const width of [1440,390])test(`production manager works across board, routes, inbox and evolving locations at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:1000});const errors=[];page.on('pageerror',e=>errors.push(e.message));const captured=await fixture(page);
 await page.goto('/facility.html');await expect(page.locator('#tripRows')).toContainText('Alex Passenger');await expect(page.locator('#facilityName')).toHaveText(facility.name);await expect(page.locator('#facilitySelectLabel')).toBeHidden();
 await expect(page.locator('#tripRows')).toContainText('Deposit Paid');await expect(page.locator('#tripRows')).toContainText('Assigned Driver');
 await page.screenshot({path:`output/facility-production-board-${width}.png`,fullPage:true});
 await page.locator('#tripSearch').fill('no match');await expect(page.locator('#tripRows')).toContainText('No trips match');await page.locator('#tripSearch').fill('');
 await page.locator('[data-route]').click();await expect(page.locator('#routesView')).toBeVisible();await expect(page.locator('#routeDetails')).toContainText(trip.destination);await expect(page.locator('#mapStatus')).toContainText('unavailable');
 await page.locator('#routeLeg').selectOption('return');await expect(page.locator('#directionsLink')).toHaveAttribute('href',/origin=200\+Hospital/);await expect(page.locator('#routeDetails')).toContainText('Return pickup: 2026-10-28 12:00 ET');
 await page.locator('nav [data-view="communications"]').click();await expect(page.locator('#messages')).toContainText('No messages yet');await page.locator('#messageText').fill('Please use entrance B.');await page.locator('#sendMessage').click();await expect(page.locator('#messages')).toContainText('Please use entrance B.');expect(captured.messages).toHaveLength(1);expect(captured.messages[0].requestId).toMatch(/^[a-f0-9-]{36}$/);await expect(page.locator('#tripActivity')).toContainText('Scheduled');
 await page.locator('nav [data-view="locations"]').click();await expect(page.locator('#locationList')).toContainText('4 completed bookings');await page.locator('[data-location]').click();await expect(page.locator('#bookingView')).toBeVisible();await expect(page.locator('#facilityBookingFrame')).toHaveAttribute('src',/productionFacilityPortal=1/);
 await expect(page.frameLocator('#facilityBookingFrame').locator('#destination')).toHaveValue(trip.destination);
 await expect(page.frameLocator('#facilityBookingFrame').locator('#bookingFacilityId')).toHaveValue(facility.id);
 await page.screenshot({path:`output/facility-production-${width}.png`,fullPage:true});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);expect(captured.scope.every(id=>id==='FC-A')).toBe(true);expect(errors).toEqual([]);
});
test('empty production accounts show empty operations and no fictional locations',async({page})=>{
 await fixture(page,{empty:true});await page.goto('/facility.html');await expect(page.locator('#tripRows')).toContainText('No trips match');await page.locator('nav [data-view="locations"]').click();await expect(page.locator('#locationStatus')).toContainText('No completed transportation history');await expect(page.locator('#locationList')).toBeEmpty();await page.locator('nav [data-view="communications"]').click();await expect(page.locator('#messageStatus')).toContainText('Choose a service day');
});
test('dispatch must select a facility and can use the same shared inbox',async({page})=>{
 const captured=await fixture(page,{staff:true});await page.goto('/facility.html');await expect(page.locator('#facilitySelectLabel')).toBeVisible();await expect(page.locator('#notice')).toContainText('Select a facility');expect(captured.scope).toHaveLength(0);await page.locator('#facilitySelect').selectOption('FC-A');await expect(page.locator('#tripRows')).toContainText(trip.reference);await page.locator('nav [data-view="communications"]').click();await expect(page.locator('#messageRecipient')).toHaveText('the facility manager');
});
test('expired access clears loaded passenger data',async({page})=>{
 await fixture(page);await page.goto('/facility.html');await expect(page.locator('#tripRows')).toContainText(trip.name);await page.route('**/api/facility-portal/trips?**',r=>r.fulfill({status:401,json:{error:'Session expired'}}));await page.locator('#refresh').click();await expect(page.locator('#tripRows')).toBeEmpty();await expect(page.locator('#facilityBookingFrame')).toHaveAttribute('src','about:blank');await expect(page.locator('#notice')).toContainText('Your access has expired');
});
test('route map calculates real booking addresses and reverses the return leg',async({page})=>{
 await fixture(page);
 await page.addInitScript(()=>{window.routeRequests=[];window.google={maps:{TravelMode:{DRIVING:'DRIVING'},Map:class{},DirectionsRenderer:class{setMap(){}setDirections(result){window.displayedRoute=result;}},DirectionsService:class{route(input,callback){window.routeRequests.push(input);callback({routes:[{copyrights:'Map provider attribution',warnings:['Road warning']}]},'OK');}}}};});
 await page.goto('/facility.html');await expect(page.locator('#tripRows')).toContainText(trip.reference);await page.locator('[data-route]').click();await expect(page.locator('#mapStatus')).toHaveText('Planned outbound road route.');
 expect(await page.evaluate(()=>window.routeRequests[0])).toEqual({origin:trip.pickup,destination:trip.destination,travelMode:'DRIVING'});await expect(page.locator('#mapAttribution')).toContainText('Road warning');
 await page.locator('#routeLeg').selectOption('return');await expect(page.locator('#mapStatus')).toHaveText('Planned return road route.');expect(await page.evaluate(()=>window.routeRequests.at(-1).origin)).toBe(trip.destination);
 await page.locator('nav [data-view="board"]').click();await page.locator('[data-route]').click();await expect(page.locator('#mapStatus')).toContainText('Planned return');
});
