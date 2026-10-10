const {test,expect}=require('@playwright/test');
for(const role of ['ADMIN','DISPATCHER','PATIENT'])test(`${role} sees the appropriate trip creation options`,async({page})=>{
 await page.addInitScript(()=>sessionStorage.setItem('nexusAccessToken','mock-trip-ui-test'));
 await page.route('**/api/**',route=>{
  const path=new URL(route.request().url()).pathname;
  const body=path==='/api/auth/me'?{user:{role,email:'staff@example.com',displayName:'Staff Test'}}:path==='/api/integrations/config'?{googleMapsEnabled:false,stripeEnabled:true}:{};
  return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
 });
 await page.goto('/booking-app.html');
 await page.waitForFunction(()=>Boolean(window.NexusBookingApp));
 expect(await page.locator('#staffTripModeField').evaluate(element=>element.hidden)).toBe(role==='PATIENT');
 if(role!=='PATIENT'){
  await page.locator('#name').fill('Staff Mock Test');await page.locator('#phone').fill('(240) 555-0199');await page.locator('#confirmRiderBtn').click();
  await page.locator('#staffTripMode').selectOption('MOCK');
  await expect(page.locator('#staffTripMode')).toHaveValue('MOCK');
 }
});
test('Trip Management includes seeded mocks and filters them separately',async({page})=>{
 test.setTimeout(20000);
 await page.addInitScript(()=>sessionStorage.setItem('nexusAccessToken','mock-trip-ui-test'));
 await page.route('**/api/**',route=>{
  const path=new URL(route.request().url()).pathname;
  const trips=[{reference:'MOCK-20261010-01',name:'MOCK TRIP',status:'MOCK',bookingSource:'MOCK',date:'2026-11-01',time:'09:00',service:'wheelchair'},{reference:'REAL-1',name:'Real Rider',status:'SUBMITTED',bookingSource:'CUSTOMER',date:'2026-11-02',time:'10:00',service:'ambulatory'}];
  const body=path==='/api/portal/trips'?{trips}:path==='/api/auth/me'?{user:{role:'ADMIN',email:'staff@example.com'}}:{};
  return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
 });
 await page.goto('/dispatch.html',{waitUntil:'domcontentloaded'});
 await page.locator('[data-section-target="tripBoard"]').click();
 if(await page.locator('#tripBoardBody').evaluate(element=>element.hidden))await page.locator('#tripBoardToggle').click();
 await page.locator('#loadTrips').click();
 await page.locator('#tripSourceFilter').selectOption('MOCK');
 await expect(page.locator('#tripRows')).toContainText('MOCK-20261010-01');
 await expect(page.locator('#tripRows')).not.toContainText('REAL-1');
 await page.locator('#tripSourceFilter').selectOption('REAL');
 await expect(page.locator('#tripRows')).toContainText('REAL-1');
 await expect(page.locator('#tripRows')).not.toContainText('MOCK-20261010-01');
});
