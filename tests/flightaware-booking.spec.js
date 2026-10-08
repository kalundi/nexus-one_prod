const {test,expect}=require('@playwright/test');

test('booking flight lookup displays the correct airport terminal and resets when the trip date changes',async({page})=>{
 let lookupRequest=null,lookupCalls=0;
 await page.route('**/api/**',async route=>{
  const url=route.request().url();
  if(url.includes('/api/flights/lookup')){
    lookupCalls++;
   lookupRequest=route.request().postDataJSON();
   return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({flight:{flightNumber:'UA123',movement:'DEPARTURE',airportStop:'DESTINATION',airport:{name:'Washington Dulles International Airport',code:'IAD'},terminal:'C',gate:'C12',scheduledTime:'2030-08-15T13:00:00Z',status:'Scheduled',origin:{name:'Washington Dulles International Airport',code:'IAD'},destination:{name:'Chicago O Hare International Airport',code:'ORD'}}})});
  }
  if(url.includes('/api/locations/search'))return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({locations:[]})});
  if(url.includes('/api/fleet/live'))return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({vehicles:[]})});
  return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({googleMapsEnabled:false,stripeEnabled:true})});
 });
 await page.setViewportSize({width:390,height:844});
 await page.goto('/booking-app.html');
 await page.locator('#name').fill('Flight Lookup Test');
 await page.locator('#phone').fill('(240) 555-0148');
 await page.locator('#confirmRiderBtn').click();
 await page.locator('#flightLookupPanel summary').click();
 await page.locator('#pickup').fill('100 Main Street, Rockville, MD');
 await page.locator('#destination').fill('Washington Dulles International Airport');
 await page.locator('#tripDate').fill('2030-08-15');
 await page.locator('#flightNumber').fill('UA123');
 await page.locator('#flightAirportStop').selectOption('DESTINATION');
 await page.locator('#lookupFlightBtn').click();
 await expect(page.locator('#flightTerminalResult')).toContainText('Terminal C');
 await expect(page.locator('#flightTerminalResult')).toContainText('IAD');
 await expect(page.locator('#flightAirportConfirmRow')).toBeVisible();
 expect(lookupCalls).toBe(1);
 expect(lookupRequest).toEqual({flightNumber:'UA123',date:'2030-08-15',airportStop:'DESTINATION'});
 await page.locator('#flightAirportConfirmed').check();
 await page.locator('#tripDate').fill('2030-08-16');
 await expect(page.locator('#flightTerminalResult')).toBeHidden();
 await expect(page.locator('#flightAirportConfirmed')).not.toBeChecked();
});
