const {test,expect}=require('@playwright/test');
async function openPricing(page,role='ADMIN'){
 let saved;
 let settings={pricing:{wheelchair:{label:'Wheelchair',base:98,includedMiles:8,perMile:4.1,waitPer15:18.75},ambulatory:{label:'Ambulatory',base:75,includedMiles:5,perMile:3.55,waitPer15:12.5}},organization:{name:'Nexus',phone:'8885550101',email:'staff@example.com',website:'https://example.com'},activeServices:['WHEELCHAIR'],fareRules:{waitingPolicyVersion:2,freeWaitMinutes:15,minimumFare:0,fuelSurchargePerMile:0,fuelPricingMode:'MANUAL',fuelIndexSource:'EIA',fuelIndexPricePerGallon:0,fuelBaselinePricePerGallon:3.25,fuelEfficiencyMpg:10,fuelOperationalBufferPct:20,afterHoursSurchargePct:30,weekendSurchargePct:30,holidaySurchargePct:30,deadheadRatePct:50,shortNoticeHours:24,shortNoticeSurchargePct:30,cardProcessingFeePct:3,trafficOverageFeePerHour:0,trafficOverageGraceMinutes:0,cancellationFee:30,noShowFee:50,cancellationWindowHours:24,cancellationLeadHours:72,maxBookingDistanceMiles:125,insuranceCostPerTrip:23,telemetryRefreshSeconds:20,servicePolicies:{wheelchair:{freeWaitMinutes:15,trafficOverageFeePerHour:25,afterHoursSurchargePct:30,weekendSurchargePct:30,holidaySurchargePct:30,cancellationFee:40,noShowFee:60},ambulatory:{freeWaitMinutes:15,trafficOverageFeePerHour:20,afterHoursSurchargePct:30,weekendSurchargePct:30,holidaySurchargePct:30,cancellationFee:35,noShowFee:50}}}};
 await page.addInitScript(role=>{sessionStorage.setItem('nexusAccessToken','pricing-test');sessionStorage.setItem('nexusUser',JSON.stringify({role,email:'staff@example.com'}));},role);
 await page.route('**/api/**',route=>{
  const path=new URL(route.request().url()).pathname;
  if(path==='/api/admin/settings'&&route.request().method()==='PATCH'){
   saved=route.request().postDataJSON();settings={...settings,...saved};
  }
  const body=path==='/api/auth/me'?{user:{role,email:'staff@example.com'}}:path==='/api/admin/settings'?{settings}:path==='/api/admin/users'?{users:[]}:path==='/api/admin/audit'?{logs:[]}:path==='/api/portal/trips'?{trips:[]}:{};
  return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
 });
 await page.goto('/admin.html#pricingSection');
 await expect(page.locator('#pricingRows [data-key="wheelchair"]')).toContainText('After 15 min');
 return {getSaved:()=>saved,getSettings:()=>settings};
}
test('pricing manager saves all active fare variables and preserves unrelated settings',async({page})=>{
 const mock=await openPricing(page);
 for(const id of ['minimumFare','fuelSurchargePerMile','freeWaitMinutes','deadheadRatePct','shortNoticeHours','shortNoticeSurchargePct','cardProcessingFeePct','afterHoursSurchargePct','weekendSurchargePct','holidaySurchargePct','trafficOverageFeePerHour','trafficOverageGraceMinutes']){
  await expect(page.locator(`#pricingSection #${id}`)).toBeVisible();
  await expect(page.locator(`#settingsSection #${id}`)).toHaveCount(0);
 }
 await expect(page.locator('#pricingSection')).toContainText('both legs before savings');
 await page.locator('#freeWaitMinutes').fill('20');
 await expect(page.locator('[data-service-policy="wheelchair"] [data-field="freeWaitMinutes"]')).toHaveValue('20');
 await page.locator('[data-service-policy="wheelchair"] [data-field="freeWaitMinutes"]').fill('30');
 await page.locator('#afterHoursSurchargePct').fill('10');
 await expect(page.locator('[data-service-policy="wheelchair"] [data-field="afterHoursSurchargePct"]')).toHaveValue('10');
 await page.locator('#deadheadRatePct').fill('25');await page.locator('#shortNoticeHours').fill('12');await page.locator('#shortNoticeSurchargePct').fill('40');await page.locator('#cardProcessingFeePct').fill('4');
 await page.locator('[data-key="wheelchair"] [data-field="waitPer15"]').fill('20');
 await page.locator('[data-service-policy="wheelchair"] [data-field="trafficOverageFeePerHour"]').fill('0');
 await page.locator('#savePricing').click();
 await expect(page.locator('#pricingSavedMsg')).toContainText('Rates and fare rules saved');
 const saved=mock.getSaved();
 expect(saved.pricing.wheelchair.waitPer15).toBe(20);
 expect(saved.fareRules).toMatchObject({waitingPolicyVersion:2,freeWaitMinutes:20,deadheadRatePct:25,shortNoticeHours:12,shortNoticeSurchargePct:40,cardProcessingFeePct:4,insuranceCostPerTrip:23,fuelIndexSource:'EIA'});
 expect(saved.fareRules.servicePolicies.wheelchair).toMatchObject({freeWaitMinutes:30,afterHoursSurchargePct:10,trafficOverageFeePerHour:0});
 expect(saved.organization).toBeUndefined();
 await page.reload();
 await expect(page.locator('#cardProcessingFeePct')).toHaveValue('4');
 await expect(page.locator('[data-key="wheelchair"]')).toContainText('After 30 min');
 await page.locator('#pricingSection').screenshot({path:'output/admin-pricing-manager.png'});
});
test('dispatchers can inspect pricing but cannot change its variables',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await openPricing(page,'DISPATCHER');
 await expect(page.locator('#savePricing')).toBeDisabled();
 await expect(page.locator('#deadheadRatePct')).toBeDisabled();
 await expect(page.locator('[data-key="wheelchair"] [data-field="base"]')).toBeDisabled();
 await expect(page.locator('[data-service-policy="wheelchair"] [data-field="freeWaitMinutes"]')).toBeDisabled();
 const overflow=await page.locator('#pricingSection').evaluate(section=>Array.from(section.querySelectorAll('.pricingFieldGrid input,.pricingFieldGrid select')).filter(input=>input.getClientRects().length&&input.getBoundingClientRect().right>section.getBoundingClientRect().right+1).map(input=>input.id));
 expect(overflow).toEqual([]);
});
