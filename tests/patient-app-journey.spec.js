const {test,expect}=require('@playwright/test');
test.use({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce'});
function ride(overrides={}){
 const date=new Date(Date.now()+2*86400000).toISOString().slice(0,10);
 return {reference:'NMT-PATIENT-1',date,time:'09:30',status:'CONFIRMED',pickup:'9955 Forest View Place, Gaithersburg, MD',destination:'10215 Fernwood Road, Bethesda, MD',service:'AMBULATORY',tripType:'ROUND_TRIP',driverLocationVisible:false,...overrides};
}
const user={id:'patient-app-test',displayName:'Anthony Muthoka',email:'patient@example.com',phone:'+12405550101',role:'PATIENT'};
async function setup(page,trips=[ride()],signedIn=true){
 await page.addInitScript(({user,signedIn})=>{
  if(signedIn){sessionStorage.setItem('nexusAccessToken','patient-test-token');sessionStorage.setItem('nexusUser',JSON.stringify(user));}
  window.__mapCalls=[];window.__markers=[];
  class Map{constructor(element,options){element.textContent='Interactive route map';window.__mapCalls.push({kind:'map',options});}fitBounds(){}setCenter(){}}
  class DirectionsService{async route(request){window.__mapCalls.push({kind:'route',request});return {routes:[{bounds:{}}]};}}
  class DirectionsRenderer{setMap(){}setDirections(){}}
  class Marker{constructor(options){this.map=options.map;window.__markers.push(this);}setPosition(position){this.position=position;}setMap(map){this.map=map;}}
  class LatLngBounds{union(){}extend(){}}
  window.google={maps:{Map,DirectionsService,DirectionsRenderer,Marker,LatLngBounds}};
 },{user,signedIn});
 await page.route('**/api/auth/me',route=>route.fulfill({json:{user}}));
 await page.route('**/api/auth/login',route=>route.fulfill({json:{token:'patient-test-token',user}}));
 await page.route('**/api/auth/logout',route=>route.fulfill({json:{ok:true}}));
 await page.route('**/api/patient/dashboard',route=>route.fulfill({json:{user,nextRide:trips[0]||null,recentRides:trips}}));
 await page.route('**/api/patient/preferences',route=>route.fulfill({json:{preferences:{mobilityType:'AMBULATORY',defaultPickup:'9955 Forest View Place, Gaithersburg, MD'}}}));
 await page.route('**/api/portal/trips',route=>route.fulfill({json:{trips}}));
 await page.route('**/api/pricing',route=>route.fulfill({json:{}}));
 await page.route('**/api/integrations/config',route=>route.fulfill({json:{googleMapsEnabled:false}}));
}

test('identity, full ride list and countdown work; map and booking stay inside the app',async({page})=>{
 const trips=Array.from({length:20},(_,index)=>ride({reference:`NMT-PATIENT-${index+1}`}));
 await setup(page,trips);await page.goto('/patient.html');
 await expect(page.locator('#appShell')).toBeVisible();
 await expect(page.locator('#patientName')).toHaveText('Anthony Muthoka');
 await expect(page.locator('#patientAvatar')).toHaveText('AM');
 await expect(page.locator('#nexusAccountMount')).toHaveCount(0);
 await expect(page.locator('#upcomingCount')).toHaveText('20');
 await expect(page.locator('#countdownValue')).not.toHaveText('--');
 const nameBox=await page.locator('.patientIdentity').boundingBox(),heroBox=await page.locator('#homePage .hero').boundingBox();expect(heroBox.y).toBeGreaterThanOrEqual(nameBox.y+nameBox.height);
 await page.screenshot({path:'output/patient-app-home-final.png'});
 const identity=await page.locator('.patientIdentity').boundingBox();expect(identity.x+identity.width).toBeLessThanOrEqual(390);
 await page.getByRole('button',{name:'Full map',exact:true}).click();
 await expect(page).toHaveURL(/patient\.html#map\/NMT-PATIENT-1$/);
 await expect(page.locator('#mapPage')).toBeVisible();
 await expect(page.locator('#patientMap')).toContainText('Interactive route map');
 await page.screenshot({path:'output/patient-app-map-mobile.png'});
 const request=await page.evaluate(()=>window.__mapCalls.find(call=>call.kind==='route').request);
 expect(request.origin).toBe(trips[0].pickup);expect(request.destination).toBe(trips[0].pickup);expect(request.waypoints[0].location).toBe(trips[0].destination);
 expect(await page.evaluate(()=>window.__markers.length)).toBe(0);
 await page.goBack();await expect(page.locator('#homePage')).toBeVisible();
 await page.getByRole('button',{name:'Book a ride',exact:true}).click();
 await expect(page).toHaveURL(/patient\.html#booking$/);
 const frame=page.frameLocator('#bookingFrame');
 await expect(frame.locator('#pickup')).toHaveValue('9955 Forest View Place, Gaithersburg, MD');
 await expect(frame.locator('html')).toHaveClass(/patientEmbeddedBooking/);
 await frame.getByRole('link',{name:'Manage saved preferences'}).click();
 await expect(page.locator('#profilePage')).toBeVisible();
 await expect(page).toHaveURL(/patient\.html#profile$/);
 await page.locator('[data-footer-action="history"]').click();
 await expect(page.locator('#rideCenterActiveOverflowList [data-active-route]')).toHaveCount(17);
 expect((await page.locator('#rideCenterActiveList').boundingBox()).height).toBeGreaterThan(150);
 await page.screenshot({path:'output/patient-app-mobile.png'});
});

test('share dialog handles denied clipboard access honestly and generates an app link',async({page})=>{
 await setup(page);await page.addInitScript(()=>Object.defineProperty(navigator,'clipboard',{value:{writeText:async()=>{throw new Error('denied');}},configurable:true}));
 await page.goto('/patient.html');await page.getByRole('button',{name:'Share tracking'}).click();
 await expect(page.locator('#rideShareDialog')).toBeVisible();
 await expect(page.locator('#rideShareLink')).toHaveValue(/\/patient\.html\?reference=NMT-PATIENT-1$/);
 await page.getByRole('button',{name:'Copy link',exact:true}).click();
 await expect(page.locator('#rideShareStatus')).toContainText('Copy is unavailable');
 expect(await page.locator('#rideShareStatus').textContent()).not.toContain('copied');
 await page.screenshot({path:'output/patient-app-share-mobile.png'});
});

test('recipient verifies a shared ride inside the app; GPS marker disappears when access closes',async({page})=>{
 const trip=ride({status:'EN_ROUTE',driverLocationVisible:true,driverLocation:{latitude:39.083,longitude:-77.152,distanceToPickupMiles:1.7}});
 await setup(page,[trip],false);
 await page.route('**/api/bookings/NMT-PATIENT-1?*',route=>{
  const verified=new URL(route.request().url()).searchParams.get('phone')===user.phone;
  return route.fulfill({status:verified?200:404,json:verified?{booking:trip}:{error:'Request not found'}});
 });
 await page.goto('/patient.html?reference=NMT-PATIENT-1');
 await expect(page.locator('#mapPage')).toBeHidden();
 await page.getByRole('textbox',{name:'Booking phone number'}).fill('wrong');
 await page.getByRole('button',{name:'View shared ride'}).click();
 await expect(page.locator('#sharedAccessNotice')).toContainText('could not verify');
 await page.getByRole('textbox',{name:'Booking phone number'}).fill(user.phone);
 await page.getByRole('button',{name:'View shared ride'}).click();
 await expect(page.locator('#mapPage')).toBeVisible();
 await expect(page.locator('#patientMapStatus')).toContainText('assigned driver’s latest location');
 expect(await page.evaluate(()=>window.__markers.filter(marker=>marker.map).length)).toBe(1);
 await page.evaluate(()=>{const trip=window.NexusPatient.trips()[0];trip.driverLocationVisible=false;window.NexusPatientApp.updated();});
 await expect(page.locator('#patientMapStatus')).toContainText('pickup is within one hour');
 expect(await page.evaluate(()=>window.__markers.filter(marker=>marker.map).length)).toBe(0);
 await expect(page.locator('[data-footer-action="profile"]')).toBeHidden();
 await page.getByRole('button',{name:'Close ride',exact:true}).click();
 await expect(page.locator('#appShell')).toBeHidden();
});

test('mock routes are clearly labeled and never draw a driver or invented geography',async({page})=>{
 await setup(page,[ride({pickup:'MOCK TRIP pickup — Clarksburg, MD',destination:'MOCK TRIP destination — Hershey, PA',bookingSource:'MOCK'})]);
 await page.goto('/patient.html');await page.getByRole('button',{name:'Full map',exact:true}).click();
 await expect(page.locator('#patientMapStatus')).toContainText('MOCK TRIP');
 await expect(page.locator('#patientMap')).toBeHidden();
 expect(await page.evaluate(()=>window.__mapCalls.length)).toBe(0);
});

test('unavailable maps offer retry and keep ride details inside the app',async({page})=>{
 await setup(page);await page.addInitScript(()=>delete window.google);await page.goto('/patient.html');
 await page.getByRole('button',{name:'Full map',exact:true}).click();
 await expect(page.locator('#patientMapStatus')).toContainText('temporarily unavailable');
 await expect(page.locator('#mapRetryBtn')).toBeVisible();
 await expect(page.locator('#mapPickup')).toHaveText(ride().pickup);await expect(page).toHaveURL(/patient\.html#map\//);
});

test('new login immediately loads the patient data and signing out clears cached identity and trips',async({page})=>{
 await setup(page,[ride()],false);await page.goto('/patient.html');
 await page.locator('#loginEmail').fill(user.email);await page.locator('#loginPassword').fill('test-password');await page.locator('#loginBtn').click();
 await expect(page.locator('#appShell')).toBeVisible();await expect(page.locator('#patientName')).toHaveText(user.displayName);await expect(page.locator('#upcomingCount')).toHaveText('1');
 await page.locator('#patientLogoutBtn').click();await expect(page.locator('#loginView')).toBeVisible();
 expect(await page.evaluate(()=>window.NexusPatient.trips())).toEqual([]);
 expect(await page.evaluate(()=>window.NexusPatient.read(window.NexusPatient.KEYS.profile,{}).name)).toBe('');
});

test('payment return restores booking within the patient app and verifies the saved receipt',async({page})=>{
 await setup(page,[ride()]);
 await page.addInitScript(()=>sessionStorage.setItem('nexusCheckoutBooking',JSON.stringify({reference:'NMT-PATIENT-1',fare:100,phone:'+12405550101'})));
 await page.route('**/api/bookings/NMT-PATIENT-1?*',route=>route.fulfill({json:{booking:{...ride(),paymentStatus:'DEPOSIT_PAID',estimatedFare:100,depositAmount:25,balanceDue:75}}}));
 await page.goto('/patient.html?payment=success&bookingReference=NMT-PATIENT-1');
 await expect(page.locator('#bookingPage')).toBeVisible();
 const frame=page.frameLocator('#bookingFrame');
 await expect(frame.locator('#paymentStatusMsg')).toContainText('Payment verified with Nexus');
 await expect(frame.locator('#paymentSummary')).toContainText('Your deposit has been received');
 await expect(page).toHaveURL(/patient\.html\?payment=success&bookingReference=NMT-PATIENT-1#booking$/);
});

test('main website links directly to the patient app and patient login opens it',async({page})=>{
 await setup(page,[],false);await page.goto('/__deploy_temp/index.html');
 await page.locator('.menuBtn,.mobileNavToggle').first().click();
 const entry=page.locator('header').getByRole('link',{name:'Patient App',exact:true});await expect(entry).toBeVisible();await entry.click();
 await expect(page).toHaveURL(/\/patient\.html$/);await expect(page.locator('#loginView')).toBeVisible();
 await page.goto('/__deploy_temp/index.html');await page.locator('header .nexusAccountButton').click();
 await page.locator('#nexusLoginDialog input[name="email"]').fill(user.email);await page.locator('#nexusLoginDialog input[name="password"]').fill('test-password');await page.locator('#nexusLoginDialog button[type="submit"]').click();
 await expect(page).toHaveURL(/\/patient\.html$/);await expect(page.locator('#patientName')).toHaveText(user.displayName);
});
