const { test, expect } = require('@playwright/test');

test('capture the Uber booking flow with dummy data', async ({ page }) => {
  const stepDelay=process.env.NEXUS_VISUAL_WALKTHROUGH==='1'?2500:400;
  await page.setViewportSize({ width: 820, height: 1180 });
  await page.route('**/api/integrations/config', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ stripeEnabled:true, squareEnabled:true, googleMapsEnabled:false, googleMapsBrowserKey:'' })
  }));
  await page.route('**/api/settings/public', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ pricing:{}, fareRules:{ taxRatePct:0 } })
  }));
  await page.route('**/api/locations/search**', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ locations:[{ lat:39.0458, lng:-76.6413 }] })
  }));
  await page.route('**/api/fleet/live**', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ vehicles:[] })
  }));
  await page.route('**/api/booking-drafts**', route => route.fulfill({ status:200, contentType:'application/json', body:'{}' }));
  await page.route('**/api/bookings', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      booking:{ reference:'DEMO-2048', estimatedFare:309.41, status:'PENDING_PAYMENT' },
      clientMessage:'Dummy booking created for visual review.',
      persisted:true,
      requiresOnlinePayment:true,
      depositRequired:true
    })
  }));
  let updatedBookingPayload=null;
  await page.route('**/api/bookings/DEMO-2048/update', async route => {
    updatedBookingPayload=route.request().postDataJSON();
    await route.fulfill({
      status:200,
      contentType:'application/json',
      body:JSON.stringify({
        booking:{reference:'DEMO-2048',estimatedFare:Number(updatedBookingPayload.estimatedFare||309.41),status:'PENDING_PAYMENT'},
        clientMessage:'Dummy booking updated for visual review.',
        persisted:true,
        requiresOnlinePayment:true,
        depositRequired:true
      })
    });
  });

  await page.goto('/booking-app.html', { waitUntil:'domcontentloaded' });
  await expect(page.locator('#riderDetailsSection')).toBeVisible();
  await expect(page.locator('#distanceEtaSection')).toBeHidden();
  await expect(page.locator('#fareSummarySection')).toBeHidden();
  await page.waitForTimeout(stepDelay);
  await page.screenshot({ path:'output/visual-review-01-rider.png' });

  await page.locator('#name').fill('Jordan Sample');
  await page.locator('#phone').fill('(240) 555-0148');
  await page.locator('#email').fill('jordan.sample@example.com');
  await page.locator('#confirmRiderBtn').click();
  await expect(page.locator('#pickupDropoffSection')).toBeVisible();
  await page.waitForTimeout(stepDelay);
  await page.screenshot({ path:'output/visual-review-02-route.png' });

  await page.locator('#pickup').fill('100 Main Street, Rockville, MD');
  await page.locator('#destination').fill('200 Medical Center Drive, Bethesda, MD');
  await page.locator('#tripDate').fill('2030-08-15');
  await page.locator('#appointmentTime').fill('10:30');
  await page.locator('#confirmPickupDropoffBtn').click();
  await expect(page.locator('#rideTypeSection')).toBeVisible({ timeout:30000 });
  await page.locator('[data-service="wheelchair"]').click();
  await expect(page.locator('#continueRideBtn')).toHaveAttribute('aria-label', 'Book My Ride: Wheelchair');
  await page.waitForTimeout(stepDelay);
  await page.screenshot({ path:'output/visual-review-03-ride.png' });

  await page.locator('#continueRideBtn').click();
  await expect(page.locator('#continueRideBtn')).toBeHidden();
  await expect(page.locator('#fareConfirmDialog')).toBeVisible();
  await expect(page.locator('.journeyStep').nth(3)).toHaveClass(/current/);
  await page.locator('#fareConfirmAccept').click();
  await expect(page.locator('#paymentSection')).toBeVisible({ timeout:30000 });
  await expect(page.locator('#paymentSummary')).toContainText('DEMO-2048');
  await page.screenshot({ path:'output/visual-review-04-confirmation.png' });
  const popupClose=page.locator('#nexusGlobalTripPopup [data-close-popup]');
  if(await popupClose.count())await popupClose.click();
  else if(await page.locator('#nexusGlobalTripPopup').count())await page.locator('#nexusGlobalTripPopup').evaluate(node=>node.remove());
  await page.waitForTimeout(stepDelay);
  console.log('VISUAL_STATE',await page.evaluate(()=>({
    scrollY:window.scrollY,
    popup:Boolean(document.querySelector('#nexusGlobalTripPopup')),
    openDialogs:Array.from(document.querySelectorAll('dialog[open]')).map(node=>node.id),
    bodyClasses:document.body.className,
    paymentRect:(()=>{const rect=document.querySelector('#paymentSection')?.getBoundingClientRect();return rect?{x:rect.x,y:rect.y,width:rect.width,height:rect.height}:null})()
  })));
  await page.screenshot({ path:'output/visual-review-05-payment.png' });
  await page.locator('.journeyStep').nth(0).click();
  await expect(page.locator('#riderDetailsSection')).toBeVisible();
  await expect(page.locator('#name')).toHaveValue('Jordan Sample');
  await expect(page.locator('.journeyStep').nth(0)).toHaveClass(/current/);
  await page.locator('#name').fill('Jordan Sample Updated');
  await page.locator('#confirmRiderBtn').click();
  await page.locator('#confirmPickupDropoffBtn').click();
  await expect(page.locator('#rideTypeSection')).toBeVisible();
  await page.locator('#continueRideBtn').click();
  await expect(page.locator('#fareConfirmDialog')).toBeVisible();
  await page.locator('#fareConfirmAccept').click();
  await expect(page.locator('#paymentSection')).toBeVisible({timeout:30000});
  await expect.poll(()=>updatedBookingPayload?.name).toBe('Jordan Sample Updated');
  await expect(page.locator('#paymentSummary')).toContainText('DEMO-2048');
  if(process.env.NEXUS_VISUAL_WALKTHROUGH==='1')await page.waitForTimeout(5000);
});
