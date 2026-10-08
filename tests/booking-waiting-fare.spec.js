const { test, expect } = require('@playwright/test');

for (const scenario of [
  { name:'one way hides waiting', minutes:0, charge:0, total:'103.00' },
  { name:'immediate return pickup', returnTime:'10:15', minutes:0, charge:0, total:'195.70' },
  { name:'first minute charges a block', returnTime:'10:16', minutes:1, charge:20, total:'215.27' },
  { name:'15 minutes charges one block', returnTime:'10:30', minutes:15, charge:20, total:'215.27' },
  { name:'16 minutes charges two blocks', returnTime:'10:31', minutes:16, charge:40, total:'234.84' },
  { name:'return pickup changes refresh fare', initialReturnTime:'10:15', returnTime:'11:00', minutes:45, charge:60, total:'254.41' },
  { name:'overnight return', returnDate:'2030-08-16', returnTime:'08:00', minutes:1305, charge:1740, total:'1898.29' },
  { name:'next appointment determines waiting', stopTime:'11:30', stopMinutes:30, minutes:0, charge:40, total:'144.20' },
  { name:'stop and final return waiting counted once', stopTime:'11:30', stopMinutes:30, returnTime:'11:45', minutes:30, charge:80, total:'273.98' },
  { name:'weekend premium', date:'2030-08-17', minutes:0, charge:0, total:'133.90' },
  { name:'holiday premium', date:'2030-07-04', minutes:0, charge:0, total:'133.90' },
  { name:'pickup basis crossing 7 PM', pickupTime:'18:50', minutes:0, charge:0, total:'133.90' },
  { name:'return premium and waiting', returnTime:'20:00', minutes:585, charge:780, total:'988.28' }
]) test(scenario.name, async ({ page }) => {
  let submitted;
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname;
    const body = path === '/api/integrations/config' ? { stripeEnabled:true, googleMapsEnabled:false }
      : path === '/api/settings/public' ? { pricing:{wheelchair:{base:100,includedMiles:99999,perMile:0,waitPer15:20}},fareRules:{freeWaitMinutes:120,minimumFare:0,fuelSurchargePerMile:0} }
      : path === '/api/locations/search' ? { locations:[{lat:39,lng:-76}] }
      : path === '/api/bookings' ? (() => {
        submitted = route.request().postDataJSON();
        return { booking:{reference:'WAIT-1',estimatedFare:submitted.estimatedFare}, requiresOnlinePayment:true, persisted:true };
      })() : {};
    return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
  });
  await page.goto('/booking-app.html');
  await page.locator('#name').fill('Waiting Fare Test');
  await page.locator('#phone').fill('(240) 555-0148');
  await page.locator('#confirmRiderBtn').click();
  if(scenario.stopTime){
    await page.locator('#multipleStopsToggle').check();
    await page.locator('#appointmentTime-2').fill(scenario.stopTime);
    await page.locator('[data-route-stop="true"]').fill('300 Clinic Road, Bethesda, MD');
  }
  if(scenario.returnTime){
    await page.locator('#tripType').selectOption('ROUND_TRIP');
    await page.locator('#returnTripDate').fill(scenario.returnDate || scenario.date || '2030-08-15');
    await page.locator('#returnTripTime').fill(scenario.initialReturnTime || scenario.returnTime);
  }
  if(scenario.initialReturnTime){
    for(const width of [320,390,1280]){
      await page.setViewportSize({width,height:1400});
      const {pickup,waiting}=await page.evaluate(()=>{
        const rectangle=id=>{
          const box=document.getElementById(id).getBoundingClientRect();
          return {x:box.x,y:box.y,width:box.width};
        };
        return {pickup:rectangle('tripTime'),waiting:rectangle('waitMinutes')};
      });
      expect(Math.abs(pickup.y-waiting.y)).toBeLessThan(2);
      expect(waiting.x).toBeGreaterThan(pickup.x+pickup.width);
      expect(waiting.x+waiting.width).toBeLessThanOrEqual(width);
    }
  }
  await page.locator('#pickup').fill('100 Main Street, Rockville, MD');
  await page.locator('#destination').fill('200 Medical Center Drive, Bethesda, MD');
  await page.locator('#tripDate').fill(scenario.date || '2030-08-15');
  if(scenario.pickupTime){
    await page.locator('#scheduleBasis').selectOption('PICKUP');
    await page.locator('#tripTime').fill(scenario.pickupTime);
  }else await page.locator('#appointmentTime').fill('10:30');
  await page.locator('#confirmPickupDropoffBtn').click();
  await page.locator('[data-service="wheelchair"]').click();
  if(scenario.initialReturnTime) await page.locator('#returnTripTime').evaluate((input,time)=>{
    input.value=time;input.dispatchEvent(new Event('change',{bubbles:true}));
  },scenario.returnTime);
  await expect(page.locator('#estFare')).toHaveText(`$${scenario.total}`);
  await expect(page.locator('[data-service="wheelchair"] .serviceCardFare')).toHaveText(`$${scenario.total}`);
  if(scenario.returnTime || scenario.stopTime){
    await expect(page.locator('#waitMinutes')).toHaveValue(String(scenario.minutes+(scenario.stopMinutes||0)));
    await expect(page.locator('#waitMinutes')).toHaveAttribute('readonly','');
  }else await expect(page.locator('#waitTimeField')).toBeHidden();
  if(scenario.stopTime){
    await expect(page.locator('#stopWaitMinutes-1')).toHaveValue(String(scenario.stopMinutes));
    await expect(page.locator('#stopPickupTime-1')).toHaveValue('10:45');
  }
  if(scenario.stopTime && !scenario.returnTime){
    const changeAppointment=async time=>page.locator('#appointmentTime-2').evaluate((input,value)=>{
      input.value=value;input.dispatchEvent(new Event('change',{bubbles:true}));
    },time);
    await changeAppointment('12:00');
    await expect(page.locator('#stopWaitMinutes-1')).toHaveValue('60');
    await expect(page.locator('#stopPickupTime-1')).toHaveValue('11:15');
    await expect(page.locator('#estFare')).toHaveText('$185.40');
    await changeAppointment(scenario.stopTime);
    await expect(page.locator('#estFare')).toHaveText(`$${scenario.total}`);
  }
  if(scenario.initialReturnTime){
    await page.locator('#tripType').evaluate(input=>{
      input.value='ONE_WAY';input.dispatchEvent(new Event('change',{bubbles:true}));
    });
    await expect(page.locator('#waitTimeField')).toBeHidden();
    await expect(page.locator('#waitMinutes')).toHaveValue('0');
    await expect(page.locator('#estFare')).toHaveText('$103.00');
    await page.evaluate(time=>{
      const type=document.getElementById('tripType');type.value='ROUND_TRIP';type.dispatchEvent(new Event('change',{bubbles:true}));
      const date=document.getElementById('returnTripDate');date.value='2030-08-15';date.dispatchEvent(new Event('change',{bubbles:true}));
      const pickup=document.getElementById('returnTripTime');pickup.value=time;pickup.dispatchEvent(new Event('change',{bubbles:true}));
    },scenario.returnTime);
    await expect(page.locator('#estFare')).toHaveText(`$${scenario.total}`);
  }
  if(scenario.charge) await expect(page.locator('#estWaitCharge')).toHaveText(`$${scenario.charge.toFixed(2)}`);
  else await expect(page.locator('#estWaitRow')).toBeHidden();
  await page.locator('#continueRideBtn').click();
  await expect(page.locator('#fareConfirmAmount')).toHaveText(`$${scenario.total}`);
  await page.locator('#fareConfirmAccept').click();
  await expect(page.locator('#paymentSummary')).toContainText('WAIT-1');
  expect(submitted.waitMinutes).toBe(scenario.minutes);
  expect(submitted.waitingCharge).toBe(scenario.charge);
  if(scenario.stopTime) expect(submitted.stopWaitMinutes).toEqual([scenario.stopMinutes]);
  expect(submitted.estimatedFare).toBeCloseTo(Number(scenario.total),2);
  await expect(page.locator('#fullAmountLabel')).toHaveText(`$${scenario.total}`);
});
