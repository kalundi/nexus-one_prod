const {test,expect}=require('@playwright/test');

const settings={organization:{yardAddress:'Company yard'},pricing:{ambulatory:{base:75,includedMiles:5,perMile:3.55,waitPer15:12.5}},fareRules:{smartTiming:{enabled:true},waitingPolicyVersion:2,freeWaitMinutes:15}};

async function mockBookingApi(page,user=null){
 const captured={drafts:[],booking:null};
 await page.addInitScript(()=>{window.google={maps:{TravelMode:{DRIVING:'DRIVING'},TrafficModel:{BEST_GUESS:'bestguess',PESSIMISTIC:'pessimistic'},UnitSystem:{IMPERIAL:1},DirectionsService:class{route(request,callback){callback({routes:[{legs:[{distance:{value:16093.44},duration:{value:1800,text:'30 min'},duration_in_traffic:{value:1800}}]}]},'OK');}}}};});
 await page.route('**/api/**',route=>{
  const path=new URL(route.request().url()).pathname;
  let json=path==='/api/settings/public'?settings:path==='/api/integrations/config'?{googleMapsEnabled:false,stripeEnabled:true}:path==='/api/auth/me'?{user}:path==='/api/auth/login'?{token:'passenger-name-token',user}:{};
  if(path==='/api/booking-drafts')captured.drafts.push(route.request().postDataJSON());
  if(path==='/api/bookings'){captured.booking=route.request().postDataJSON();json={booking:{reference:'PASSENGER-NAME-TEST',estimatedFare:captured.booking.estimatedFare},requiresOnlinePayment:true,depositRequired:true};}
  return route.fulfill({json});
 });
 return captured;
}

for(const width of [1280,390])test(`required passenger names retain punctuation and submit one full name at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:1100});
 const captured=await mockBookingApi(page);
 await page.goto('/booking-app.html');
 await expect(page.locator('label[for="firstName"]')).toHaveText('Passenger First Name *');
 await expect(page.locator('label[for="lastName"]')).toHaveText('Passenger Last Name *');
 await expect(page.locator('#firstName')).toHaveAttribute('required','');
 await expect(page.locator('#lastName')).toHaveAttribute('required','');
 await expect(page.locator('#firstName')).toHaveAttribute('autocomplete','given-name');
 await expect(page.locator('#lastName')).toHaveAttribute('autocomplete','family-name');
 await page.locator('#serviceTypeSelect').selectOption('ambulatory');
 await page.locator('#phone').fill('(240) 555-0101');
 await page.locator('#email').fill('passenger@example.com');
 await page.locator('#confirmRiderBtn').click();
 await expect(page.locator('#statusMsg')).toContainText('passenger first name');
 await expect(page.locator('#firstName')).toBeFocused();
 await page.locator('#firstName').fill('  Anne-Marie  ');
 await page.locator('#confirmRiderBtn').click();
 await expect(page.locator('#statusMsg')).toContainText('passenger last name');
 await expect(page.locator('#lastName')).toBeFocused();
 await page.locator('#lastName').fill("  O'Neill de la Cruz  ");
 await expect(page.locator('#name')).toHaveValue("Anne-Marie O'Neill de la Cruz");
 const first=await page.locator('#firstName').boundingBox(),last=await page.locator('#lastName').boundingBox();
 if(width>620)expect(Math.abs(first.y-last.y)).toBeLessThan(2);else expect(last.y).toBeGreaterThan(first.y);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 await expect.poll(()=>captured.drafts.at(-1)?.name).toBe("Anne-Marie O'Neill de la Cruz");
 await page.locator('#confirmRiderBtn').click();
 await expect(page.locator('#journeyCurrent')).toHaveText('Route & schedule');
 await page.locator('#journeySegments .journeyStep').first().click();
 await page.locator('#lastName').fill('');
 await expect(page.locator('#journeyCurrent')).toHaveText('Passenger details');
 await page.locator('#confirmRiderBtn').click();
 await expect(page.locator('#statusMsg')).toContainText('passenger last name');
 await page.locator('#lastName').fill("O'Neill de la Cruz");
 await page.locator('#confirmRiderBtn').click();
 await page.locator('#tripDate').fill('2030-10-15');
 await page.locator('#appointmentTime').fill('13:15');
 await page.locator('#pickup').fill('100 Main Street, Annapolis, MD');
 await page.locator('#destination').fill('2001 Medical Parkway, Annapolis, MD');
 await page.locator('#confirmPickupDropoffBtn').click();
 await page.locator('#continueRideBtn').click();
 await page.locator('#fareConfirmAccept').click();
 await expect.poll(()=>captured.booking?.name).toBe("Anne-Marie O'Neill de la Cruz");
 await expect(page.locator('#payDepositBtn')).toBeEnabled();
});

for(const fullName of ['Maria Elena de la Cruz','Cher'])test(`legacy account name is restored without losing parts: ${fullName}`,async({page})=>{
 const user={id:'passenger-name-account',displayName:fullName,name:fullName,email:'passenger@example.com',phone:'+12405550101',role:'PATIENT'};
 await page.addInitScript(user=>{sessionStorage.setItem('nexusAccessToken','passenger-name-token');sessionStorage.setItem('nexusUser',JSON.stringify(user));},user);
 await mockBookingApi(page,user);
 await page.goto('/booking-app.html');
 await expect(page.locator('#firstName')).toHaveValue(fullName.split(' ')[0]);
 await expect(page.locator('#lastName')).toHaveValue(fullName.split(' ').slice(1).join(' '));
 await expect(page.locator('#name')).toHaveValue(fullName);
 if(!fullName.includes(' ')){
  await expect(page.locator('#journeyCurrent')).toHaveText('Passenger details');
  await page.locator('#serviceTypeSelect').selectOption('ambulatory');
  await page.locator('#confirmRiderBtn').click();
  await expect(page.locator('#statusMsg')).toContainText('passenger last name');
 }
});

test('caretaker plans restore the passenger name instead of the signed-in caretaker name',async({page})=>{
 const user={id:'caretaker-name-account',displayName:'Casey Caretaker',name:'Casey Caretaker',email:'caretaker@example.com',phone:'+12405550101',role:'CARETAKER'};
 await page.addInitScript(user=>{
  sessionStorage.setItem('nexusAccessToken','caretaker-name-token');sessionStorage.setItem('nexusUser',JSON.stringify(user));
  sessionStorage.setItem('nexusCaretakerPlan',JSON.stringify({ownerId:user.id,name:"María-José O'Neill de la Cruz",phone:'2405550123',email:'passenger@example.com',pickup:'100 Main Street',destination:'200 Hospital Way',date:'2030-10-15',trip_time:'12:15',appointment_time:'13:15',service:'ambulatory'}));
 },user);
 await mockBookingApi(page,user);
 await page.goto('/booking-app.html');
 await expect(page.locator('#firstName')).toHaveValue('María-José');
 await expect(page.locator('#lastName')).toHaveValue("O'Neill de la Cruz");
 await expect(page.locator('#name')).toHaveValue("María-José O'Neill de la Cruz");
 await expect(page.locator('#journeyCurrent')).toHaveText('Passenger details');
});

test('signing in preserves separately entered compound names and signing out clears both',async({page})=>{
 const user={id:'compound-name-account',displayName:'Mary Jane de la Cruz',name:'Mary Jane de la Cruz',email:'passenger@example.com',phone:'+12405550101',role:'RIDER'};
 await mockBookingApi(page,user);
 await page.goto('/booking-app.html');
 await page.locator('#firstName').fill('Mary Jane');
 await page.locator('#lastName').fill('de la Cruz');
 await page.locator('#toggleAuthPanelBtn').click();
 await page.locator('#loginEmail').fill(user.email);
 await page.locator('#loginPassword').fill('test-fixture-password');
 await page.locator('#authActionBtn').click();
 await expect(page.locator('#authActionBtn')).toHaveAttribute('aria-label','Sign out');
 await expect(page.locator('#firstName')).toHaveValue('Mary Jane');
 await expect(page.locator('#lastName')).toHaveValue('de la Cruz');
 await expect(page.locator('#name')).toHaveValue('Mary Jane de la Cruz');
 await expect(page.locator('#authRoleBadge')).toHaveText('PASSENGER');
 await page.locator('#authActionBtn').click();
 await expect(page.locator('#firstName')).toHaveValue('');
 await expect(page.locator('#lastName')).toHaveValue('');
 await expect(page.locator('#name')).toHaveValue('');
});

test('browser-restored name fields are synchronized when confirming without input events',async({page})=>{
 await mockBookingApi(page);
 await page.goto('/booking-app.html');
 await page.locator('#serviceTypeSelect').selectOption('ambulatory');
 await page.locator('#phone').fill('(240) 555-0101');
 await page.locator('#email').fill('passenger@example.com');
 await page.evaluate(()=>{document.getElementById('firstName').value='Alex';document.getElementById('lastName').value="O'Brien";});
 await page.locator('#confirmRiderBtn').click();
 await expect(page.locator('#name')).toHaveValue("Alex O'Brien");
 await expect(page.locator('#journeyCurrent')).toHaveText('Route & schedule');
});
