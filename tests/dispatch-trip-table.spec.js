const {test,expect}=require('@playwright/test');
const trips=[
  {reference:'NMT-20261006-9123',name:'Christine Webster',service:'ambulatory',date:'2030-10-28',time:'09:10',pickupTime:'09:10',appointmentTime:'10:00',status:'SCHEDULED',statusLabel:'Pending Dispatch Confirmation',ourEstimate:166.16,brokerQuotedRate:1050,brokerAcceptedRate:1085,bookingSource:'BROKER',intakeParseSource:'ATTACHMENT_PARSED',sourceAttachmentCount:1,tripType:'ROUND_TRIP',returnTripMode:'PENDING',pickup:'100 Very Long Medical Center Drive, Building A, Accessible Entrance, Bethesda MD 20817',destination:'200 Specialty Rehabilitation Parkway, Baltimore MD 21201',distanceMiles:65},
  {reference:'NMT-SECOND-TRIP',name:'Alexandra Catherine Montgomery-Smith with an unusually long patient name',service:'stretcher',date:'2030-10-29',time:'16:00',appointmentTime:'16:45',status:'ASSIGNED',ourEstimate:1273.32,brokerQuotedRate:1400,bookingSource:'BROKER',driverName:'Pat Driver',vehicleUnit:'NEX-01',pickup:'Home',destination:'Clinic',notes:'Call the care coordinator at the accessible entrance. '+('Additional transport instructions. '.repeat(15))},
  {reference:'MOCK-20301030-01',name:'MOCK TRIP — Pricing Test',service:'wheelchair',date:'2030-10-30',time:'20:00',status:'MOCK',ourEstimate:483.01,bookingSource:'MOCK',pickup:'Mock pickup',destination:'Mock destination'}
];
const tripRow=(page,index)=>page.locator(`.tripSummaryRow[data-reference="${trips[index].reference}"]`);
const tripDetails=(page,index)=>page.locator(`.tripDetailsRow[data-trip-details="${trips[index].reference}"]`);
async function openTrips(page){
  await page.addInitScript(()=>sessionStorage.setItem('nexusAccessToken','table-test'));
  await page.route('**/api/**',route=>{
    const path=new URL(route.request().url()).pathname;
    const booking=trips.find(trip=>path===`/api/admin/bookings/${trip.reference}`);
    const body=path==='/api/auth/me'?{user:{role:'ADMIN',email:'staff@example.com'}}:path==='/api/portal/trips'?{trips}:booking?{booking}:{};
    return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
  });
  await page.goto('/dispatch.html',{waitUntil:'domcontentloaded'});
  await page.locator('[data-section-target="tripBoard"]').click();
  if(await page.locator('#tripBoardBody').evaluate(element=>element.hidden))await page.locator('#tripBoardToggle').click();
  await page.locator('#loadTrips').click();
  await expect(page.locator('#tripRows .tripSummaryRow')).toHaveCount(3);
}
async function expectTableFits(page){
  const dimensions=await page.locator('#tripTableWrap').evaluate(wrap=>{
    const box=wrap.getBoundingClientRect();
    return {left:box.left,right:box.right,viewport:innerWidth,client:wrap.clientWidth,scroll:wrap.scrollWidth,overflowing:Array.from(wrap.querySelectorAll('.tripSummaryRow>td,.tripMoreButton,.tripDetailsPanel')).filter(el=>el.getClientRects().length&&el.getBoundingClientRect().right>box.right+1).map(el=>el.className)};
  });
  expect(dimensions.left).toBeGreaterThanOrEqual(0);
  expect(dimensions.right).toBeLessThanOrEqual(dimensions.viewport);
  expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.client+1);
  expect(dimensions.overflowing).toEqual([]);
}
test('desktop table keeps amounts intact and moves long detail and actions into More',async({page})=>{
  await openTrips(page);
  const first=tripRow(page,0);
  await expect(first.locator('.tripColEstimate')).toHaveText('$166.16');
  await expect(first.locator('.tripColBroker')).toHaveText('$1,050.00');
  await expect(first.locator('.tripColStatus')).toHaveText('Needs dispatch');
  await expect(first.locator('.tripColRisk')).toBeVisible();
  await expect(first).not.toContainText('morning demand window');
  await expect(first).not.toContainText('Attachment Parsed');
  await expect(first.locator('[data-delete],[data-trip-docs]')).toHaveCount(0);
  const money=await first.locator('.tripMoney').evaluateAll(elements=>elements.map(el=>({whiteSpace:getComputedStyle(el).whiteSpace,client:el.clientWidth,scroll:el.scrollWidth})));
  for(const amount of money){expect(amount.whiteSpace).toBe('nowrap');expect(amount.scroll).toBeLessThanOrEqual(amount.client);}
  await first.locator('[data-trip-more]').click();
  const details=tripDetails(page,0);
  await expect(details).toBeVisible();
  await expect(details).toContainText(trips[0].pickup);
  await expect(details).toContainText('Pending Dispatch Confirmation');
  await expect(details).toContainText('Attachment Parsed');
  await expect(details).toContainText('morning demand window');
  await expect(details).toContainText('Round Trip');
  await expect(details).toContainText('Pickup pending');
  await expect(details.locator('[data-delete],[data-trip-docs],[data-trip-edit]')).toHaveCount(3);
  await expectTableFits(page);
  await page.locator('#tripTableWrap').screenshot({path:'output/dispatch-trip-table-desktop.png'});
  await first.locator('[data-trip-more]').click();
  await expect(details).not.toBeVisible();
  await expect(first.locator('[data-trip-more]')).toHaveAttribute('aria-expanded','false');
});
test('expansion preserves trip identity, selection, filtering, and document/delete actions',async({page})=>{
  await openTrips(page);
  await tripRow(page,0).locator('[data-trip-more]').click();
  const second=tripRow(page,1);
  await expect(second.locator('.dispatch-bulk-select')).toHaveAttribute('data-ref',trips[1].reference);
  await second.locator('.dispatch-bulk-select').check();
  expect(await page.evaluate(()=>Array.from(window.__dispatchSelectedRefs))).toEqual([trips[1].reference]);
  await expect(tripRow(page,2).locator('.dispatch-bulk-select')).toBeDisabled();
  await page.evaluate(()=>{window.tableActions=[];window.showBookingDocuments=ref=>window.tableActions.push(['documents',ref]);window.deleteTrip=ref=>window.tableActions.push(['delete',ref]);});
  await tripDetails(page,0).locator('[data-trip-docs]').click();
  await tripDetails(page,0).locator('[data-delete]').click();
  expect(await page.evaluate(()=>window.tableActions)).toEqual([['documents',trips[0].reference],['delete',trips[0].reference]]);
  await page.locator('#tripSourceFilter').selectOption('MOCK');
  await expect(page.locator('.tripSummaryRow')).toHaveCount(1);
  await expect(page.locator('.tripSummaryRow .tripSourceBadge')).toHaveText('MOCK TRIP');
  await page.locator('#tripSourceFilter').selectOption('REAL');
  await expect(page.locator('.tripSummaryRow')).toHaveCount(2);
  await expect(tripDetails(page,0)).toBeVisible();
  await expect(tripRow(page,1).locator('.dispatch-bulk-select')).toBeChecked();
  await tripRow(page,1).locator('.tripPatientButton').click();
  await expect(page.locator('#dispatchEditName')).toHaveValue(trips[1].name);
});
for(const width of [1100,960,768,390,320])test(`table fits ${width}px and More reveals every hidden column`,async({page})=>{
  await page.setViewportSize({width,height:1000});
  await openTrips(page);
  const first=tripRow(page,0);
  await first.locator('[data-trip-more]').click();
  const details=tripDetails(page,0);
  await expect(details).toContainText('Ambulatory');
  await expect(details).toContainText('$1,050.00');
  await expect(details).toContainText('AI delay risk');
  await expect(first.locator('.tripColEstimate')).toBeVisible();
  await expectTableFits(page);
  if(width===390)await page.locator('#tripTableWrap').screenshot({path:'output/dispatch-trip-table-mobile.png'});
});
