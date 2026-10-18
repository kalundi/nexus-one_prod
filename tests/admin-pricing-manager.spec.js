const {test,expect}=require('@playwright/test');
async function openPricing(page,role='ADMIN'){
 let saved;
 let settings={pricing:{wheelchair:{label:'Wheelchair',base:98,includedMiles:8,perMile:4.1,waitPer15:18.75},ambulatory:{label:'Ambulatory',base:75,includedMiles:5,perMile:3.55,waitPer15:12.5}},organization:{name:'Nexus',phone:'8885550101',email:'staff@example.com',website:'https://example.com'},activeServices:['WHEELCHAIR'],fareRules:{waitingPolicyVersion:2,freeWaitMinutes:15,minimumFare:0,fuelSurchargePerMile:0,fuelPricingMode:'MANUAL',fuelIndexSource:'EIA',fuelIndexPricePerGallon:0,fuelBaselinePricePerGallon:3.25,fuelEfficiencyMpg:10,fuelOperationalBufferPct:20,afterHoursSurchargePct:30,weekendSurchargePct:30,holidaySurchargePct:30,deadheadRatePct:50,shortNoticeHours:24,shortNoticeSurchargePct:30,cardProcessingFeePct:3,trafficOverageFeePerHour:0,trafficOverageGraceMinutes:0,cancellationFee:30,noShowFee:50,cancellationWindowHours:24,cancellationLeadHours:72,maxBookingDistanceMiles:125,insuranceCostPerTrip:23,telemetryRefreshSeconds:20,servicePolicies:{wheelchair:{freeWaitMinutes:15,trafficOverageFeePerHour:25,afterHoursSurchargePct:30,weekendSurchargePct:30,holidaySurchargePct:30,cancellationFee:40,noShowFee:60},ambulatory:{freeWaitMinutes:15,trafficOverageFeePerHour:20,afterHoursSurchargePct:30,weekendSurchargePct:30,holidaySurchargePct:30,cancellationFee:35,noShowFee:50}}}};
 for(const [service,label] of [['stretcher','Stretcher'],['bariatric','Bariatric'],['bls','BLS Ambulance'],['als1','ALS I Ambulance'],['als2','ALS II Ambulance'],['facility_transfer_critical','Critical-care ambulance transfer']]){
  settings.pricing[service]={label,base:100,includedMiles:5,perMile:4,waitPer15:20};
  settings.fareRules.servicePolicies[service]={speedReductionMph:0};
 }
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
 await expect(page.locator('[data-premium-summary="weekendSurchargePct"]')).toHaveText('30');
 await expect(page.locator('[data-premium-summary="holidaySurchargePct"]')).toHaveText('30');
 await expect(page.locator('#pricingSection')).toContainText('Each passenger leg receives one applicable premium');
 await page.locator('#freeWaitMinutes').fill('20');
 await expect(page.locator('[data-service-policy="wheelchair"] [data-field="freeWaitMinutes"]')).toHaveValue('20');
 await page.locator('[data-service-policy="wheelchair"] [data-field="freeWaitMinutes"]').fill('30');
 await page.locator('#afterHoursSurchargePct').fill('10');
 await expect(page.locator('[data-service-policy="wheelchair"] [data-field="afterHoursSurchargePct"]')).toHaveValue('10');
 await page.locator('#deadheadRatePct').fill('25');await page.locator('#shortNoticeHours').fill('12');await page.locator('#shortNoticeSurchargePct').fill('40');await page.locator('#cardProcessingFeePct').fill('4');
 await page.locator('[data-key="wheelchair"] [data-field="waitPer15"]').fill('20');
 await page.locator('[data-service-policy="wheelchair"] [data-field="trafficOverageFeePerHour"]').fill('0');
 await page.locator('#pricingSection details').filter({has:page.locator('#serviceTravelRows')}).locator('summary').click();
 await expect(page.locator('[data-service-policy="wheelchair"] [data-field="speedReductionMph"]')).toHaveValue('10');
 await expect(page.locator('[data-service-policy="stretcher"] [data-field="speedReductionMph"]')).toHaveValue('20');
 const capacityReduction=page.locator('[data-service-policy="bariatric"] [data-field="speedReductionMph"]');
 await expect(capacityReduction).toHaveValue('35');await expect(capacityReduction).toHaveAttribute('max','35');
 expect(await capacityReduction.evaluate(input=>input.validity.valid)).toBe(true);
 for(const service of ['bls','als1','als2','facility_transfer_critical'])await expect(page.locator(`[data-service-policy="${service}"] [data-field="speedReductionMph"]`)).toHaveValue('25');
 await page.locator('#minimumPlanningSpeedMph').fill('8');
 await page.locator('#cruisingReferenceSpeedMph').fill('60');
 await page.locator('[data-service-policy="wheelchair"] [data-field="speedReductionMph"]').fill('7');
 await page.locator('[data-service-policy="wheelchair"] [data-field="transitionBufferMinutes"]').fill('20');
 await page.locator('#savePricing').click();
 await expect(page.locator('#pricingSavedMsg')).toContainText('Rates and fare rules saved');
 const saved=mock.getSaved();
 expect(saved.pricing.wheelchair.waitPer15).toBe(20);
 expect(saved.fareRules).toMatchObject({waitingPolicyVersion:2,freeWaitMinutes:20,deadheadRatePct:25,shortNoticeHours:12,shortNoticeSurchargePct:40,cardProcessingFeePct:4,insuranceCostPerTrip:23,fuelIndexSource:'EIA'});
 expect(saved.fareRules.servicePolicies.wheelchair).toMatchObject({freeWaitMinutes:30,afterHoursSurchargePct:10,trafficOverageFeePerHour:0});
 expect(saved.fareRules.minimumPlanningSpeedMph).toBe(8);
 expect(saved.fareRules.servicePolicies.wheelchair).toMatchObject({speedReductionMph:7,transitionBufferMinutes:20});
 expect(saved.fareRules.serviceTravelPolicyVersion).toBe(4);expect(saved.fareRules.serviceSpeedModel).toBe('CRUISING_CEILING');expect(saved.fareRules.cruisingReferenceSpeedMph).toBe(60);
 expect(saved.fareRules.servicePolicies.bariatric.speedReductionMph).toBe(35);
 expect(saved.fareRules.servicePolicies.stretcher.speedReductionMph).toBe(20);
 for(const service of ['bls','als1','als2','facility_transfer_critical'])expect(saved.fareRules.servicePolicies[service].speedReductionMph).toBe(25);
 expect(saved.organization).toBeUndefined();
 await page.reload();
 await expect(page.locator('#cardProcessingFeePct')).toHaveValue('4');
 await expect(page.locator('[data-key="wheelchair"]')).toContainText('After 30 min');
 await expect(page.locator('[data-service-policy="wheelchair"] [data-field="speedReductionMph"]')).toHaveValue('7');
 await expect(page.locator('[data-service-policy="bariatric"] [data-field="speedReductionMph"]')).toHaveValue('35');
 await page.locator('#pricingSection').screenshot({path:'output/admin-pricing-manager.png'});
});

test('schedule premium wording follows saved settings and future edits',async({page})=>{
 const mock=await openPricing(page);
 await expect(page.locator('#pricingSection')).toContainText('Weekend and federal holiday premiums are +30% and +30% per passenger leg');
 await page.locator('#weekendSurchargePct').fill('25');
 await page.locator('#holidaySurchargePct').fill('40');
 await expect(page.locator('[data-premium-summary="weekendSurchargePct"]')).toHaveText('25');
 await expect(page.locator('[data-premium-summary="holidaySurchargePct"]')).toHaveText('40');
 await page.locator('#savePricing').click();
 await expect(page.locator('#pricingSavedMsg')).toContainText('Rates and fare rules saved');
 expect(mock.getSaved().fareRules).toMatchObject({weekendSurchargePct:25,holidaySurchargePct:40});
 await page.reload();
 await expect(page.locator('#pricingSection')).toContainText('Weekend and federal holiday premiums are +25% and +40% per passenger leg');
});
test('dispatchers can inspect pricing but cannot change its variables',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await openPricing(page,'DISPATCHER');
 await expect(page.locator('#savePricing')).toBeDisabled();
 await expect(page.locator('#deadheadRatePct')).toBeDisabled();
 await expect(page.locator('[data-key="wheelchair"] [data-field="base"]')).toBeDisabled();
 await expect(page.locator('[data-service-policy="wheelchair"] [data-field="freeWaitMinutes"]')).toBeDisabled();
 await expect(page.locator('[data-service-policy="wheelchair"] [data-field="speedReductionMph"]')).toBeDisabled();
 const overflow=await page.locator('#pricingSection').evaluate(section=>Array.from(section.querySelectorAll('.pricingFieldGrid input,.pricingFieldGrid select')).filter(input=>input.getClientRects().length&&input.getBoundingClientRect().right>section.getBoundingClientRect().right+1).map(input=>input.id));
 expect(overflow).toEqual([]);
});

function recentAnalysis(days=90){
 return {days,generatedAt:'2026-10-10T20:00:00Z',candidateTrips:35,verifiedLegs:64,excludedLegs:2,truncated:false,services:[
  {service:'wheelchair',label:'Wheelchair',careFocus:'Lift or ramp access, wheelchair securement and occupant restraints',speedReductionMph:10,observedAverageMph:days===30?32:40,boardingMedianMinutes:15,handoffMedianMinutes:8,boardingSamples:62,handoffSamples:60,tripCount:33,legCount:64,evidenceStatus:'REVIEW_READY'},
  {service:'ambulatory',label:'Ambulatory',careFocus:'Boarding assistance and seatbelt checks',speedReductionMph:0,observedAverageMph:null,boardingMedianMinutes:null,handoffMedianMinutes:null,boardingSamples:0,handoffSamples:0,tripCount:0,legCount:0,evidenceStatus:'NO_DATA'}
 ]};
}
test('recent service analysis separates driving and care time without changing pricing',async({page})=>{
 const mock=await openPricing(page);
 const periods=[];
 await page.route('**/api/admin/service-travel-analysis?*',route=>{
  const days=Number(new URL(route.request().url()).searchParams.get('days'));periods.push(days);
  expect(route.request().headers().authorization).toBe('Bearer pricing-test');
  return route.fulfill({status:200,json:{analysis:recentAnalysis(days)}});
 });
 await page.locator('#recentServiceAnalysis > summary').click();
 const wheelchair=page.locator('#serviceAnalysisRows tr').filter({hasText:'Wheelchair'});
 await expect(wheelchair).toContainText('40.0 mph');
 await expect(wheelchair).toContainText('15.0 min');
 await expect(wheelchair).toContainText('8.0 min');
 await expect(wheelchair).toContainText('33 trips / 64 legs');
  await expect(wheelchair).toContainText('55 mph cruising ceiling');
 await expect(page.locator('#serviceAnalysisStatus')).toContainText('35 completed trips reviewed');
 await expect(page.locator('#serviceAnalysisRows tr').filter({hasText:'Ambulatory'})).toContainText('No verified data');
 await page.locator('#serviceAnalysisDays').selectOption('30');
 await expect(wheelchair).toContainText('32.0 mph');
 expect(periods).toEqual([90,30]);
 expect(mock.getSaved()).toBeUndefined();
 expect(mock.getSettings().fareRules.servicePolicies.wheelchair.speedReductionMph).toBeUndefined();
});
test('dispatch can read mobile service analysis and recover from an unavailable report',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 const mock=await openPricing(page,'DISPATCHER');
 let requests=0;
 await page.route('**/api/admin/service-travel-analysis?*',route=>++requests===1?route.fulfill({status:503,json:{error:'Unavailable'}}):route.fulfill({status:200,json:{analysis:recentAnalysis()}}));
 await page.locator('#recentServiceAnalysis > summary').click();
 await expect(page.locator('#serviceAnalysisStatus')).toContainText('Select Refresh analysis to retry');
 await expect(page.locator('#serviceAnalysisRows tr')).toHaveCount(0);
 await page.locator('#refreshServiceAnalysis').click();
 await expect(page.locator('#serviceAnalysisRows tr')).toHaveCount(2);
 await expect(page.locator('#savePricing')).toBeDisabled();
 const overflow=await page.locator('#recentServiceAnalysis').evaluate(panel=>{
  const wrapper=panel.querySelector('.tableWrap'),section=panel.closest('#pricingSection');
  return {panel:panel.getBoundingClientRect().right>section.getBoundingClientRect().right+1,wrapper:wrapper.getBoundingClientRect().right>section.getBoundingClientRect().right+1,scroll:getComputedStyle(wrapper).overflowX};
 });
 expect(overflow.panel).toBe(false);expect(overflow.wrapper).toBe(false);expect(['auto','scroll']).toContain(overflow.scroll);
 expect(mock.getSaved()).toBeUndefined();
 await page.locator('#recentServiceAnalysis').screenshot({path:'output/service-care-analysis-mobile.png'});
});
