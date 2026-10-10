const { test, expect } = require('@playwright/test');

test('dispatch page exposes a broker call-in intake form', async ({ page }) => {
  let brokerRequestCalled = false;

  await page.route('**/api/auth/me', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ user: { id: 1, role: 'DISPATCHER', displayName: 'Test Dispatcher' } })
    });
  });

  await page.route('**/api/portal/trips', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ trips: [] })
    });
  });

  await page.route('**/api/broker-requests', async route => {
    brokerRequestCalled = true;
    await new Promise(resolve => setTimeout(resolve, 150));
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ clientMessage: 'Broker request received', request: { id: 42 } })
    });
  });

  await page.addInitScript(() => {
    sessionStorage.setItem('nexusAccessToken', 'test-token');
  });

  await page.goto('/dispatch.html');
  await page.waitForSelector('#brokerIntakeForm', { state: 'attached' });
  await page.evaluate(() => {
    for (let element = document.querySelector('#brokerIntakeForm'); element; element = element.parentElement) {
      element.hidden = false;
      element.style.display = element.id === 'brokerIntakeForm' ? 'grid' : 'block';
    }
    document.querySelector('#pickerCardName').textContent = 'Test Broker';
  });

  await page.fill('#brokerPickup', '123 Main St');
  await page.fill('#brokerDestination', '456 Oak Ave');
  const tripDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  await page.fill('#brokerTripDate', tripDate);
  await page.fill('#brokerTripTime', '14:30');
  await page.selectOption('#brokerService', 'facility_transfer');
  await page.fill('#brokerSubmitterEmail', 'dispatcher@example.com');

  await page.click('#submitBrokerRequest');

  await expect(page.locator('#brokerIntakeMessage')).toContainText('Broker request received');
  expect(brokerRequestCalled).toBe(true);
});

test('dispatch intake tabs auto-populate references and calculate platform rates', async ({ page }) => {
  await page.route('**/api/auth/me', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ user: { id: 2, role: 'DISPATCHER', displayName: 'Test Dispatcher' } })
    });
  });

  await page.route('**/api/portal/trips', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ trips: [] })
    });
  });

  await page.addInitScript(() => {
    sessionStorage.setItem('nexusAccessToken', 'test-token');
  });

  await page.goto('/dispatch.html');
  await page.waitForSelector('[data-intake-tab="customer"]', { state: 'attached' });
  await page.evaluate(() => {
    for (let element = document.querySelector('#dispatchIntakeBody'); element; element = element.parentElement) {
      element.hidden = false;
      element.style.display = 'block';
    }
  });

  await page.click('[data-intake-tab="customer"]');
  await page.fill('#customerPickup', '100 Main St');
  await page.fill('#customerDestination', '200 Oak Ave');
  await page.selectOption('#customerService', 'wheelchair');
  await page.check('#customerReturnTrip');
  await page.fill('#customerWaitMinutes', '30');

  const referenceValue = await page.locator('#customerReference').inputValue();
  await expect(page.locator('#customerReference')).not.toHaveValue('');
  await expect(page.locator('#customerReference')).toHaveValue(referenceValue);

  const rateValue = await page.locator('#customerCalculatedRate').inputValue();
  expect(Number(rateValue)).toBeGreaterThan(0);
});

test('broker intake sends return schedule and keeps the broker quote independent',async({page})=>{
 const Fare=require('../nexus-fare.js');
 const settings={pricing:{wheelchair:{base:98,includedMiles:8,perMile:4.1,waitPer15:18.75}},fareRules:{}};
 let request;
 await page.addInitScript(()=>sessionStorage.setItem('nexusAccessToken','broker-return-test'));
 await page.route('**/api/**',route=>{
  const path=new URL(route.request().url()).pathname;
  if(path==='/api/broker-requests')request=route.request().postDataJSON();
  const body=path==='/api/auth/me'?{user:{role:'DISPATCHER',email:'staff@example.com'}}:path==='/api/settings/public'?settings:path==='/api/portal/trips'?{trips:[]}:{clientMessage:'Broker request received'};
  return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
 });
 await page.goto('/dispatch.html');
 await page.evaluate(()=>{
  for(let el=document.querySelector('#brokerIntakeForm');el;el=el.parentElement){el.hidden=false;el.style.display=el.id==='brokerIntakeForm'?'grid':'block';}
  document.querySelector('#pickerCardName').textContent='Test Broker';
 });
 await page.fill('#brokerPickup','100 Main St');await page.fill('#brokerDestination','200 Oak Ave');
 await page.fill('#brokerTripDate','2030-08-15');await page.fill('#brokerTripTime','10:45');await page.fill('#brokerPickupTime','10:00');
 await page.check('#brokerReturnTrip');
 await expect(page.locator('#brokerReturnFields')).toBeVisible();
 await expect(page.locator('#brokerReturnDate')).toHaveValue('2030-08-15');
 await expect(page.locator('#brokerReturnTime')).toHaveAttribute('required','');
 await page.fill('#brokerReturnTime','12:00');await page.fill('#brokerQuotedRate','180');
 const expected=Fare.calculateEstimate({service:'wheelchair',bookingSource:'BROKER',date:'2030-08-15',time:'10:00',appointmentTime:'10:45',createdAt:new Date().toISOString(),tripType:'ROUND_TRIP',returnTripDate:'2030-08-15',returnTripTime:'12:00',distanceMiles:0},settings).discountedTotal;
 await expect(page.locator('#brokerCalculatedRate')).toHaveValue(expected.toFixed(2));
 await page.locator('#submitBrokerRequest').click();
 await expect.poll(()=>request?.trip_type).toBe('ROUND_TRIP');
 expect(request.return_trip_date).toBe('2030-08-15');expect(request.return_trip_time).toBe('12:00');
 expect(request.pickup_time).toBe('10:00');expect(request.broker_quoted_rate).toBe(180);expect(request.platform_calculated_rate).toBe(expected);
});
