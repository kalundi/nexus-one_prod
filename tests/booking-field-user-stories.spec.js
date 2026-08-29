const { test, expect } = require('@playwright/test');

const patientFields = [
  { id:'name', label:'Passenger name', intent:'identify the person riding' },
  { id:'phone', label:'Phone', intent:'send booking and ride updates' },
  { id:'email', label:'Email (optional)', intent:'provide an optional written receipt channel' },
  { id:'payerType', label:'How will this ride be paid?', intent:'show only relevant payment requirements' },
  { id:'notes', label:'Notes (optional)', intent:'capture only necessary pickup or mobility instructions' },
  { id:'multipleStopsToggle', label:'Multiple Stops', intent:'reveal extra destinations only when requested' },
  { id:'stopCountSelect', label:'Stops', intent:'choose a stop count without wrapping or crowding' },
  { id:'pickup', label:'Pickup', intent:'capture the starting address' },
  { id:'destination', label:'Destination', intent:'capture the appointment destination' },
  { id:'pickupSuite', label:'Pickup suite/unit', intent:'add optional pickup detail' },
  { id:'destinationSuite', label:'Destination suite/unit', intent:'add optional destination detail' },
  { id:'tripType', label:'Trip schedule', intent:'reveal return or recurring details only when needed' },
  { id:'tripDate', label:'Date', intent:'choose the appointment date' },
  { id:'appointmentTime', label:'Appointment Time', intent:'choose the appointment time' },
  { id:'tripTime', label:'Pickup Time Estimate', intent:'show the automatically calculated pickup time' }
];

test('every patient booking field has a readable label and stays inside its card', async ({ page }) => {
  await page.setViewportSize({ width:390, height:844 });
  await page.goto('/booking-app.html', { waitUntil:'domcontentloaded' });
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    document.body.classList.add('showCompletedSections');
    document.querySelectorAll('#bookingForm .section').forEach((section) => section.classList.add('unlocked', 'currentBookingCard'));
    document.querySelectorAll('#bookingForm .sectionCollapsed').forEach((section) => section.classList.remove('sectionCollapsed'));
  });

  for(const story of patientFields){
    const control = page.locator(`#${story.id}`);
    await expect(control, story.intent).toHaveCount(1);
    const result = await control.evaluate((element) => {
      const label = document.querySelector(`label[for="${element.id}"]`);
      const card = element.closest('.section');
      const box = element.getBoundingClientRect();
      const cardBox = card?.getBoundingClientRect();
      return {
        label: label?.textContent.replace(/\s+/g,' ').trim() || '',
        left: box.left,
        right: box.right,
        width: box.width,
        cardLeft: cardBox?.left,
        cardRight: cardBox?.right
      };
    });
    expect(result.label, `${story.id}: ${story.intent}`).toContain(story.label);
    expect(result.width, `${story.id}: ${story.intent}`).toBeGreaterThanOrEqual(story.id === 'multipleStopsToggle' ? 18 : 44);
    expect(result.left, `${story.id}: ${story.intent}`).toBeGreaterThanOrEqual(result.cardLeft - 1);
    expect(result.right, `${story.id}: ${story.intent}`).toBeLessThanOrEqual(result.cardRight + 1);
  }
});

test('compact booking labels stay on one readable line when space is available', async ({ page }) => {
  await page.setViewportSize({ width:390, height:844 });
  await page.goto('/booking-app.html', { waitUntil:'domcontentloaded' });
  await page.locator('#pickupDropoffSection').evaluate((section) => {
    document.querySelectorAll('.currentBookingCard').forEach((card) => card.classList.remove('currentBookingCard'));
    section.classList.add('unlocked', 'currentBookingCard');
  });

  for(const id of ['multipleStopsToggle','stopCountSelect']){
    const metrics = await page.locator(`label[for="${id}"] span`).evaluate((label) => {
      const style = getComputedStyle(label);
      return { height:label.getBoundingClientRect().height, whiteSpace:style.whiteSpace, lineCount:label.getClientRects().length };
    });
    expect(metrics.whiteSpace).toBe('nowrap');
    expect(metrics.lineCount).toBe(1);
    expect(metrics.height).toBeLessThanOrEqual(24);
  }
});

test('conditional fields appear only after the patient makes the matching choice', async ({ page }) => {
  await page.setViewportSize({ width:390, height:844 });
  await page.goto('/booking-app.html', { waitUntil:'domcontentloaded' });

  await page.locator('#riderDetailsSection').evaluate((section) => {
    document.querySelectorAll('.currentBookingCard').forEach((card) => card.classList.remove('currentBookingCard'));
    section.classList.add('unlocked', 'currentBookingCard');
  });

  await expect(page.locator('#insuranceCarrierField')).toBeHidden();
  await page.locator('#payerType').selectOption('INSURANCE');
  await expect(page.locator('#insuranceCarrierField')).not.toHaveAttribute('hidden', '');

  await page.locator('#pickupDropoffSection').evaluate((section) => {
    document.querySelectorAll('.currentBookingCard').forEach((card) => card.classList.remove('currentBookingCard'));
    section.classList.add('unlocked', 'currentBookingCard');
  });

  await expect(page.locator('#roundTripFields')).toBeHidden();
  await page.locator('#tripType').selectOption('ROUND_TRIP');
  await expect(page.locator('#roundTripFields')).not.toHaveAttribute('hidden', '');

  await expect(page.locator('#recurringRideFields')).toBeHidden();
  await page.locator('#tripType').evaluate((select) => {
    select.value = 'RECURRING';
    select.dispatchEvent(new Event('change', { bubbles:true }));
  });
  await expect(page.locator('#roundTripFields')).toHaveAttribute('hidden', '');
  await expect(page.locator('#recurringRideFields')).not.toHaveAttribute('hidden', '');
});
