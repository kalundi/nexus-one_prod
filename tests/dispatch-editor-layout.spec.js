const {test,expect}=require('@playwright/test');
const Fare=require('../nexus-fare.js');
const settings={pricing:{wheelchair:{base:98,includedMiles:8,perMile:4.1,waitPer15:18.75}},fareRules:{}};
async function openEditor(page,source='BROKER'){
 await page.addInitScript(()=>sessionStorage.setItem('nexusAccessToken','editor-test'));
 const booking={reference:'EDITOR-TEST',name:'Test Rider',phone:'2025550101',email:'rider@example.com',status:source==='MOCK'?'MOCK':'SCHEDULED',bookingSource:source,service:'wheelchair',pickup:'100 Main St, Bethesda MD 20817',destination:'200 Oak Ave, Rockville MD 20850',date:'2030-08-15',time:'10:00',pickupTime:'10:00',appointmentTime:'10:45',createdAt:'2030-08-12T20:00:00Z',tripType:'ROUND_TRIP',returnTripDate:'2030-08-15',returnTripTime:'12:00',distanceMiles:25.28,brokerQuotedRate:1085,brokerAcceptedRate:1085,notes:'Use the accessible entrance.'};
 await page.route('**/api/**',route=>{
  const path=new URL(route.request().url()).pathname;
  const enriched={...booking,ourEstimate:Fare.calculateEstimate(booking,settings).discountedTotal};
  const body=path==='/api/auth/me'?{user:{role:'ADMIN',email:'staff@example.com'}}:path==='/api/settings/public'?settings:path==='/api/admin/bookings/EDITOR-TEST'?{booking:enriched}:path==='/api/portal/trips'?{trips:[enriched]}:{};
  return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
 });
 await page.goto('/dispatch.html',{waitUntil:'domcontentloaded'});
 await page.locator('[data-section-target="tripBoard"]').click();
 if(await page.locator('#tripBoardBody').evaluate(e=>e.hidden))await page.locator('#tripBoardToggle').click();
 await page.locator('#loadTrips').click();
 await expect(page.locator('#tripRows')).toContainText('EDITOR-TEST');
 await page.evaluate(()=>window.openTripEditor('EDITOR-TEST'));
 await expect(page.locator('#dispatchEditOurEstimate')).toHaveValue(source==='MOCK'?'$422.17':'$444.39');
}
test('desktop editor keeps rates on one row and supporting records collapsed',async({page})=>{
 await openEditor(page);
 const ids=['dispatchEditOurEstimate','dispatchEditBrokerQuotedRate','dispatchEditBrokerAcceptedRate'];
 const boxes=await Promise.all(ids.map(id=>page.locator('#'+id).boundingBox()));
 expect(Math.max(...boxes.map(b=>b.y))-Math.min(...boxes.map(b=>b.y))).toBeLessThan(2);
 for(const id of ['dispatchEditName','dispatchEditPhone','dispatchEditPickup','dispatchEditDestination','dispatchEditDate','dispatchEditTime','dispatchEditDriver','dispatchEditVehicle','dispatchEditReturnTime','dispatchEditSave'])await expect(page.locator('#'+id)).toBeVisible();
 await expect(page.locator('#dispatchEditOperationalSummary')).toContainText('Round trip');
 await expect(page.locator('#dispatchEditOperationalSummary')).toContainText('90 min waiting');
 await expect(page.locator('#dispatchEditRecords')).not.toHaveAttribute('open','');
 await expect(page.locator('#dispatchEditDetails')).not.toContainText('N/A');
 await expect(page.locator('#dispatchEditDetails')).not.toContainText('Import diagnostics');
 await expect(page.locator('#dispatchEditEmail')).not.toBeVisible();
 expect((await page.locator('#dispatchTripEditorPanel').boundingBox()).height).toBeLessThan(980);
 await page.locator('#dispatchTripEditorPanel').screenshot({path:'output/dispatch-editor-desktop.png'});
 await page.locator('#dispatchEditCalculation > summary').click();
 await expect(page.locator('#dispatchEditFareBreakdown')).toContainText('2 legs');
 await expect(page.locator('#dispatchEditFareBreakdown')).toContainText('$93.75');
 await page.locator('#dispatchEditReturnTime').fill('12:30');
 await expect(page.locator('#dispatchEditOurEstimate')).toHaveValue('$483.01');
 await page.locator('#dispatchEditSourceDetails > summary').click();
 await expect(page.locator('#dispatchEditEmail')).toHaveValue('rider@example.com');
});
test('mobile editor fits the screen and clearly marks mock trips',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await openEditor(page,'MOCK');
 await expect(page.locator('#dispatchEditMockBadge')).toBeVisible();
 const box=await page.locator('#dispatchTripEditorPanel').boundingBox();
 expect(box.x).toBeGreaterThanOrEqual(0);
 expect(box.x+box.width).toBeLessThanOrEqual(390);
 const overflowing=await page.locator('#dispatchTripEditorPanel').evaluate(panel=>Array.from(panel.querySelectorAll('input,select,button')).filter(el=>el.getClientRects().length&&el.getBoundingClientRect().right>panel.getBoundingClientRect().right+1).map(el=>el.id));
 expect(overflowing).toEqual([]);
 await page.locator('#dispatchTripEditorPanel').screenshot({path:'output/dispatch-editor-mobile.png'});
});
