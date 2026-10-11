const {test,expect}=require('@playwright/test');
const Fare=require('../nexus-fare.js');
const Routes=require('../nexus-route.js');
const settings={pricing:{ambulatory:{base:75,includedMiles:5,perMile:3.55,waitPer15:12}},fareRules:{}};

async function openEditor(page,{roundTrip=false,mobile=false}={}){
 if(mobile)await page.setViewportSize({width:390,height:844});
 await page.addInitScript(()=>sessionStorage.setItem('nexusAccessToken','save-test'));
 let booking={reference:'SAVE-TEST',name:'Test Patient',phone:'2025550101',email:'patient@example.com',status:'SCHEDULED',bookingSource:'BROKER',service:'ambulatory',pickup:'Patient home',destination:'Medical clinic',date:'2030-08-15',time:'10:00',pickupTime:'10:00',appointmentTime:'10:45',createdAt:'2030-08-12T20:00:00Z',tripType:roundTrip?'ROUND_TRIP':'ONE_WAY',returnTripDate:roundTrip?'2030-08-15':null,returnTripTime:roundTrip?'12:00':null,distanceMiles:20,estimatedDuration:'30 min',brokerQuotedRate:105,brokerAcceptedRate:105,notes:'Use the accessible entrance. | Appointment time: 10:45 AM | Check-in time: 9:15 AM'};
 const state={patches:[],reads:0,failNext:false,mismatch:false};
 await page.route('**/api/**',async route=>{
  const path=new URL(route.request().url()).pathname;
  const tripPath='/api/admin/bookings/SAVE-TEST';
  if(path===tripPath&&route.request().method()==='PATCH'){
   const payload=route.request().postDataJSON();state.patches.push(payload);
   if(state.failNext){state.failNext=false;return route.fulfill({status:503,json:{error:'Service unavailable. Try again.'}});}
   const freeNotes=payload.notes.replace(/(?:Appointment\s*time|Check-in\s*time):\s*[0-2]?\d:[0-5]\d(?:\s*(?:AM|PM))?/ig,'').split('|').map(part=>part.trim()).filter(Boolean).join(' | ');
   booking={...booking,...payload,notes:freeNotes+` | Appointment time: ${payload.appointmentTime} | Check-in time: ${payload.checkInTime} | Fare inputs: ${JSON.stringify(payload.fareInputs)}`};
   if(state.mismatch)booking.name='Server did not persist the new name';
  }else if(path===tripPath)state.reads++;
  const enriched={...booking,ourEstimate:Fare.calculateEstimate(booking,settings).discountedTotal};
  const body=path==='/api/auth/me'?{user:{role:'ADMIN',email:'staff@example.com'}}:path==='/api/settings/public'?settings:path===tripPath?{booking:enriched,notifications:{status:'skipped-no-diff'}}:path==='/api/portal/trips'?{trips:[enriched]}:{};
  return route.fulfill({status:200,json:body});
 });
 await page.goto('/dispatch.html',{waitUntil:'domcontentloaded'});
 await page.locator('[data-section-target="tripBoard"]').click();
 if(await page.locator('#tripBoardBody').evaluate(element=>element.hidden))await page.locator('#tripBoardToggle').click();
 await page.locator('#loadTrips').click();
 await expect(page.locator('#tripRows')).toContainText('SAVE-TEST');
 await page.evaluate(()=>window.openTripEditor('SAVE-TEST'));
 return {state,getBooking:()=>booking};
}

for(const mobile of [false,true])test(`one click saves changed round-trip times and notes on ${mobile?'mobile':'desktop'}`,async({page})=>{
 const mock=await openEditor(page,{roundTrip:true,mobile});
 let dialogs=0;page.on('dialog',dialog=>{dialogs++;return dialog.dismiss();});
 await page.locator('#dispatchEditAppointmentTime').fill('11:45');
 await expect(page.locator('#dispatchEditTime')).toHaveValue('11:00');
 await page.locator('#dispatchEditReturnTime').fill('13:30');
 await page.locator('#dispatchEditTripNotes').fill('  Please call on arrival. Use the side entrance.  ');
 const beforeReads=mock.state.reads;
 await page.locator('#dispatchEditSave').click();
 await expect(page.locator('#dispatchEditMsg')).toContainText('updated successfully');
 expect(mock.state.patches).toHaveLength(1);expect(dialogs).toBe(0);
 expect(mock.state.reads).toBe(beforeReads,'the persisted PATCH response is sufficient');
 expect(mock.state.patches[0]).toMatchObject({appointmentTime:'11:45',time:'11:00',pickupTime:'11:00',checkInTime:'10:15',tripType:'ROUND_TRIP',returnTripTime:'13:30'});
 await expect(page.locator('#dispatchEditTime')).toHaveValue('11:00');
 await expect(page.locator('#dispatchEditReturnTime')).toHaveValue('13:30');
 await expect(page.locator('#dispatchEditTripNotes')).toHaveValue(/Please call on arrival\. Use the side entrance\./);
 await expect(page.locator('#dispatchEditSave')).toBeEnabled();
 await page.locator('#dispatchEditClose').click();
 expect(dialogs).toBe(0,'successful save clears the unsaved-change warning');
 await page.evaluate(()=>window.openTripEditor('SAVE-TEST'));
 await expect(page.locator('#dispatchEditTime')).toHaveValue('11:00');
 await expect(page.locator('#dispatchEditReturnTime')).toHaveValue('13:30');
});

test('save waits for a pending route and ignores repeated clicks during preparation',async({page})=>{
 const mock=await openEditor(page);
 const updated={...mock.getBooking(),destination:'New clinic'};
 const routes=Routes.plan(updated,'Company yard').map(segment=>({...segment,miles:segment.kind==='OUTBOUND'?24:6,durationMinutes:segment.kind==='OUTBOUND'?60:10,trafficDurationMinutes:segment.kind==='OUTBOUND'?60:10}));
 const inputs=Routes.inputs(updated,'Company yard',routes);
 await page.evaluate(inputs=>{
  const original=window.NexusDispatchRoutes.refresh;
  const pending=new Promise(resolve=>{window.finishSaveRoute=resolve;});
  window.NexusDispatchRoutes.refresh=async booking=>booking.destination==='New clinic'?{...booking,routeFareInputs:await pending}:original(booking);
  window.saveRouteInputs=inputs;
 },inputs);
 await page.locator('#dispatchEditDestination').fill('New clinic');
 await page.locator('#dispatchEditSave').click();
 await expect(page.locator('#dispatchEditSave')).toHaveText('Saving...');
 await expect(page.locator('#dispatchEditSave')).toBeDisabled();
 await expect(page.locator('#dispatchEditName')).toBeDisabled();
 expect(mock.state.patches).toHaveLength(0);
 await page.locator('#dispatchEditSave').dispatchEvent('click');
 await page.evaluate(()=>window.finishSaveRoute(window.saveRouteInputs));
 await expect(page.locator('#dispatchEditMsg')).toContainText('updated successfully');
 expect(mock.state.patches).toHaveLength(1);
 expect(mock.state.patches[0]).toMatchObject({destination:'New clinic',time:'09:30',pickupTime:'09:30',checkInTime:'08:35'});
 expect(mock.state.patches[0].fareInputs.miles).toBe(24);
 await expect(page.locator('#dispatchEditSave')).toBeEnabled();
 await expect(page.locator('#dispatchEditName')).toBeEnabled();
});

test('a failed save preserves edits and enables a deliberate retry',async({page})=>{
 const mock=await openEditor(page);mock.state.failNext=true;
 await page.locator('#dispatchEditName').fill('Updated Patient');
 await page.locator('#dispatchEditNote').fill('Driver informed of the change.');
 await page.locator('#dispatchEditSave').click();
 await expect(page.locator('#dispatchEditMsg')).toContainText('Service unavailable');
 await expect(page.locator('#dispatchEditName')).toHaveValue('Updated Patient');
 await expect(page.locator('#dispatchEditNote')).toHaveValue('Driver informed of the change.');
 await expect(page.locator('#dispatchEditSave')).toBeEnabled();
 await page.locator('#dispatchEditSave').click();
 await expect(page.locator('#dispatchEditMsg')).toContainText('updated successfully');
 expect(mock.state.patches).toHaveLength(2);
 await expect(page.locator('#dispatchEditNote')).toHaveValue('');
});

test('a real persistence mismatch keeps the dispatcher entries for review',async({page})=>{
 const mock=await openEditor(page);mock.state.mismatch=true;
 await page.locator('#dispatchEditName').fill('Updated Patient');
 await page.locator('#dispatchEditSave').click();
 await expect(page.locator('#dispatchEditMsg')).toContainText('changes were not confirmed: Patient name');
 await expect(page.locator('#dispatchEditMsg')).toContainText('Your entries have been kept');
 await expect(page.locator('#dispatchEditName')).toHaveValue('Updated Patient');
 expect(mock.state.patches).toHaveLength(1);
 await expect(page.locator('#dispatchEditSave')).toBeEnabled();
});

test('will-call return remains pending after one save',async({page})=>{
 const mock=await openEditor(page,{roundTrip:true});
 await page.locator('#dispatchEditReturnTiming').selectOption('WILL_CALL');
 await expect(page.locator('#dispatchEditReturnTime')).toBeDisabled();
 await page.locator('#dispatchEditSave').click();
 await expect(page.locator('#dispatchEditMsg')).toContainText('updated successfully');
 expect(mock.state.patches).toHaveLength(1);
 expect(mock.state.patches[0].returnTripTime).toBeNull();
 await expect(page.locator('#dispatchEditReturnTiming')).toHaveValue('WILL_CALL');
 await expect(page.locator('#dispatchEditReturnTime')).toBeDisabled();
 await expect(page.locator('#dispatchEditSave')).toBeEnabled();
});
