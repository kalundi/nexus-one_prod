const {test,expect}=require('@playwright/test');
const facility={id:'FC-A',name:'Care Facility A',address:'100 Facility Lane, Annapolis, MD'};
const trip={reference:'PROD-1001',name:'Alex Passenger',service:'wheelchair',pickup:facility.address,destination:'200 Hospital Road, Annapolis, MD',trip_date:'2026-10-28',trip_time:'08:00:00',appointment_time:'09:00:00',status:'SCHEDULED',payment_status:'DEPOSIT_PAID',driver_name:'Assigned Driver',vehicle_unit:'N100',trip_type:'ROUND_TRIP',return_trip_date:'2026-10-28',return_trip_time:'12:00:00',unread:1};
async function fixture(page,{staff=false,empty=false}={}){
 const captured={messages:[],locations:[],scope:[],tripParams:[],reportParams:[],reportScope:[]};let messages=[];
 await page.addInitScript(()=>sessionStorage.setItem('nexusAccessToken','production-manager-session'));
 await page.route('https://**',r=>r.abort());
 await page.route('**/api/**',async route=>{const url=new URL(route.request().url()),path=url.pathname;let json={};
  if(path==='/api/auth/me')json={user:{id:'manager',role:staff?'DISPATCHER':'FACILITY',scopeId:facility.id,displayName:'Facility Manager',email:'manager@example.com',phone:'2405550100'}};
  if(path==='/api/facility-portal/context')json={facilities:staff?[facility,{id:'FC-B',name:'Care B',address:'Other address'}]:[facility],manager:!staff,today:'2026-10-28'};
  if(path==='/api/facility-portal/trips'){captured.scope.push(url.searchParams.get('facility'));captured.tripParams.push({from:url.searchParams.get('from'),to:url.searchParams.get('to'),ranges:url.searchParams.get('ranges'),dates:url.searchParams.get('dates')});json={facility,trips:empty?[]:[trip],page:0,hasMore:false,summary:{total:empty?0:1,pending:empty?0:1,active:0,complete:0},updatedAt:new Date().toISOString()};}
  if(path==='/api/facility-portal/reports'){captured.reportScope.push(url.searchParams.get('facility'));captured.reportParams.push({from:url.searchParams.get('from'),to:url.searchParams.get('to')});json=empty?{facility,from:'2026-10-01',to:'2026-10-31',totals:{trips:0,completed:0,cancelled:0,pending:0,active:0,completionRate:0,cancellationRate:0},daily:[],byStatus:[],byServiceType:[],byDayOfWeek:[],byHourOfDay:[],topDestinations:[],leadTimeDays:[],updatedAt:new Date().toISOString()}:{facility,from:'2026-10-01',to:'2026-10-31',totals:{trips:3,completed:2,cancelled:0,pending:1,active:0,completionRate:66.7,cancellationRate:0},daily:[{date:'2026-10-01',count:1},{date:'2026-10-02',count:2}],byStatus:[{status:'COMPLETED',count:2},{status:'REQUESTED',count:1}],byServiceType:[{service:'wheelchair',count:3}],byDayOfWeek:[{day:0,count:0},{day:1,count:1},{day:2,count:0},{day:3,count:2},{day:4,count:0},{day:5,count:0},{day:6,count:0}],byHourOfDay:Array.from({length:24},(_,hour)=>({hour,count:hour===8?3:0})),topDestinations:[{name:'Annapolis',count:3}],leadTimeDays:[{bucket:'0',count:1},{bucket:'1',count:0},{bucket:'2',count:2},{bucket:'3-7',count:0},{bucket:'8-14',count:0},{bucket:'15+',count:0}],updatedAt:new Date().toISOString()};}
  if(path==='/api/facility-portal/locations')json={locations:empty?[]:[{address:trip.destination,visits:4,last_visit:'2026-10-27'}],basis:'Completed bookings, all time.'};
  if(path.startsWith('/api/facility-portal/communications/')){
   if(route.request().method()==='POST'){const body=route.request().postDataJSON();captured.messages.push(body);messages.push({id:'message',body:body.message,author_name:'Facility Manager',author_role:'FACILITY',created_at:new Date().toISOString()});json={message:'Saved'};}
   else json={messages,activity:[{id:'history',status:'SCHEDULED',created_at:new Date().toISOString()}],through:new Date().toISOString()};
  }
  if(path==='/api/integrations/config')json={googleMapsEnabled:false};
  if(path==='/api/settings/public')json={organization:{yardAddress:'Company yard'},pricing:{ambulatory:{base:75,includedMiles:5,perMile:3.55,waitPer15:12.5}},fareRules:{smartTiming:{enabled:true},waitingPolicyVersion:2,freeWaitMinutes:15}};
  if(path==='/api/booking/facilities')json={facilities:[facility]};
  return route.fulfill({json});
 });
 return captured;
}
for(const width of [1440,390])test(`production manager works across board, routes, inbox and evolving locations at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:1000});const errors=[];page.on('pageerror',e=>errors.push(e.message));const captured=await fixture(page);
 await page.goto('/facility.html');await expect(page.locator('#tripRows')).toContainText('Alex Passenger');await expect(page.locator('#facilityName')).toHaveText(facility.name);await expect(page.locator('#facilitySelectLabel')).toBeHidden();
 await expect(page.locator('#serviceTimeframe')).toBeVisible();await expect(page.locator('#serviceDateButton')).toHaveText('Wed, Oct 28, 2026');await expect(page.locator('#serviceCalendarPop')).toBeHidden();await expect(page.locator('#serviceRange')).toHaveText('Wed, Oct 28, 2026');expect(captured.tripParams.at(-1)).toEqual({from:'2026-10-28',to:'2026-10-28',ranges:null,dates:null});
 await page.locator('#serviceDateButton').click();await expect(page.locator('#serviceCalendarPop')).toBeVisible();await page.locator('[data-date="2026-10-30"]').click();await expect(page.locator('#serviceCalendarPop')).toBeHidden();await expect(page.locator('#serviceDateButton')).toHaveText('Fri, Oct 30, 2026');await expect(page.locator('#serviceRange')).toHaveText('Fri, Oct 30, 2026');await expect(page.locator('#tripCount')).toHaveText('1');expect(captured.tripParams.at(-1)).toEqual({from:'2026-10-30',to:'2026-10-30',ranges:null,dates:null});
 await expect(page.locator('#tripRows')).toContainText('Deposit Paid');await expect(page.locator('#tripRows')).toContainText('Assigned Driver');
 await page.screenshot({path:`output/facility-production-board-${width}.png`,fullPage:true});
 await page.locator('#tripSearch').fill('no match');await expect(page.locator('#tripRows')).toContainText('No trips match');await page.locator('#tripSearch').fill('');
 await page.locator('[data-route]').click();await expect(page.locator('#routesView')).toBeVisible();await expect(page.locator('#routeDetails')).toContainText(trip.destination);await expect(page.locator('#mapStatus')).toContainText('unavailable');
 await page.locator('#routeLeg').selectOption('return');await expect(page.locator('#directionsLink')).toHaveAttribute('href',/origin=200\+Hospital/);await expect(page.locator('#routeDetails')).toContainText('Return pickup: 2026-10-28 12:00 ET');
 await page.locator('nav [data-view="communications"]').click();await expect(page.locator('#messages')).toContainText('No messages yet');await page.locator('#messageText').fill('Please use entrance B.');await page.locator('#sendMessage').click();await expect(page.locator('#messages')).toContainText('Please use entrance B.');expect(captured.messages).toHaveLength(1);expect(captured.messages[0].requestId).toMatch(/^[a-f0-9-]{36}$/);await expect(page.locator('#tripActivity')).toContainText('Scheduled');
 await page.locator('nav [data-view="locations"]').click();await expect(page.locator('#locationList')).toContainText('4 completed bookings');await page.locator('[data-location]').click();await expect(page.locator('#bookingDialog')).toBeVisible();await expect(page.locator('#locationsView')).toBeVisible();await expect(page.locator('#facilityBookingFrame')).toHaveAttribute('src',/productionFacilityPortal=1/);
 await expect(page.frameLocator('#facilityBookingFrame').locator('#destination')).toHaveValue(trip.destination);
 await expect(page.frameLocator('#facilityBookingFrame').locator('#bookingFacilityId')).toHaveValue(facility.id);
 await page.screenshot({path:`output/facility-production-${width}.png`,fullPage:true});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);expect(captured.scope.every(id=>id==='FC-A')).toBe(true);expect(errors).toEqual([]);
});
test('manager cannot open another facility URL or load its dashboard data',async({page})=>{
 await fixture(page);let requests=0;page.on('request',r=>{if(r.url().includes('/api/facility-portal/')||r.url().includes('/api/portal/trips'))requests++;});
 await page.goto('/facility.html?facility=FC-B');await expect(page.getByRole('heading',{name:'Authorization required'})).toBeVisible();await expect(page.getByText('Your manager account does not have access to this facility.')).toBeVisible();expect(requests).toBe(0);await expect(page.locator('#tripRows')).toHaveCount(0);
});
test('manager scope stays assigned even if the hidden selector is tampered with',async({page})=>{
 const captured=await fixture(page);await page.goto('/facility.html?facility=FC-A');await expect(page.locator('#tripRows')).toContainText(trip.reference);
 await page.evaluate(()=>{const select=document.getElementById('facilitySelect');select.add(new Option('Other facility','FC-B'));select.value='FC-B';select.dispatchEvent(new Event('change'));});
 await expect(page.locator('#facilityName')).toHaveText(facility.name);await expect(page.locator('#tripRows')).toContainText(trip.reference);expect(captured.scope.every(id=>id==='FC-A')).toBe(true);
});
test('unauthenticated facility links require login and preserve the facility destination',async({page})=>{
 await page.route('**/api/**',r=>r.fulfill({json:{}}));await page.goto('/facility.html?facility=FC-A');await expect(page).toHaveURL(/livecare\.html\?login=1&redirect=%2Ffacility\.html%3Ffacility%3DFC-A/);
});
test('shared Nexus header and footer use the ride sign and open an accessible popup',async({page})=>{
 await fixture(page);await page.goto('/facility.html');await expect(page.locator('#tripRows')).toContainText(trip.reference);await expect(page.locator('.footerUnified .footerBrandCompact')).toBeVisible();await expect(page.locator('.footerSocial a[aria-label="X"]')).toHaveCount(1);
 const button=page.locator('header [data-view="booking"]');await expect(button).toHaveClass(/bookRideSign/);await expect(page.locator('#facilityBookingFrame')).toHaveAttribute('src','about:blank');await button.click();await expect(page.getByRole('dialog',{name:'Book a Ride'})).toBeVisible();await expect(page.locator('#boardView')).toBeVisible();await expect(page.locator('#bookingFacilityName')).toHaveText(facility.name);await expect(page.locator('#closeBookingDialog')).toBeFocused();
 await page.locator('#closeBookingDialog').click();await expect(page.locator('#bookingDialog')).not.toBeVisible();await expect(button).toBeFocused();await button.click();await page.keyboard.press('Escape');await expect(page.locator('#bookingDialog')).not.toBeVisible();await expect(button).toBeFocused();
});
test('empty production accounts show empty operations and no fictional locations',async({page})=>{
 await fixture(page,{empty:true});await page.goto('/facility.html');await expect(page.locator('#tripRows')).toContainText('No trips match');await page.locator('nav [data-view="locations"]').click();await expect(page.locator('#locationStatus')).toContainText('No completed transportation history');await expect(page.locator('#locationList')).toBeEmpty();await page.locator('nav [data-view="communications"]').click();await expect(page.locator('#messageStatus')).toContainText('Choose a service date');
});
test('dispatch must select a facility and can use the same shared inbox',async({page})=>{
 const captured=await fixture(page,{staff:true});await page.goto('/facility.html');await expect(page.locator('#facilitySelectLabel')).toBeVisible();await expect(page.locator('#notice')).toContainText('Select a facility');expect(captured.scope).toHaveLength(0);await page.locator('#facilitySelect').selectOption('FC-A');await expect(page.locator('#tripRows')).toContainText(trip.reference);await page.locator('nav [data-view="communications"]').click();await expect(page.locator('#messageRecipient')).toHaveText('the facility manager');
});
test('expired access clears loaded passenger data',async({page})=>{
 await fixture(page);await page.goto('/facility.html');await expect(page.locator('#tripRows')).toContainText(trip.name);await page.route('**/api/facility-portal/trips?**',r=>r.fulfill({status:401,json:{error:'Session expired'}}));await page.locator('#refresh').click();await expect(page.locator('#tripRows')).toBeEmpty();await expect(page.locator('#facilityBookingFrame')).toHaveAttribute('src','about:blank');await expect(page.locator('#notice')).toContainText('Your access has expired');
});
test('route map calculates real booking addresses and reverses the return leg',async({page})=>{
 await fixture(page);
 await page.addInitScript(()=>{window.routeRequests=[];window.google={maps:{TravelMode:{DRIVING:'DRIVING'},Map:class{},DirectionsRenderer:class{setMap(){}setDirections(result){window.displayedRoute=result;}},DirectionsService:class{route(input,callback){window.routeRequests.push(input);callback({routes:[{copyrights:'Map provider attribution',warnings:['Road warning']}]},'OK');}}}};});
 await page.goto('/facility.html');await expect(page.locator('#tripRows')).toContainText(trip.reference);await page.locator('[data-route]').click();await expect(page.locator('#mapStatus')).toHaveText('Planned outbound road route.');
 expect(await page.evaluate(()=>window.routeRequests[0])).toEqual({origin:trip.pickup,destination:trip.destination,travelMode:'DRIVING'});await expect(page.locator('#mapAttribution')).toContainText('Road warning');
 await page.locator('#routeLeg').selectOption('return');await expect(page.locator('#mapStatus')).toHaveText('Planned return road route.');expect(await page.evaluate(()=>window.routeRequests.at(-1).origin)).toBe(trip.destination);
 await page.locator('nav [data-view="board"]').click();await page.locator('[data-route]').click();await expect(page.locator('#mapStatus')).toContainText('Planned return');
});
test('manager picks one date from a pop-up calendar and switches timeframe',async({page})=>{
 const captured=await fixture(page);await page.goto('/facility.html');await expect(page.locator('#tripRows')).toContainText(trip.reference);
 const day=iso=>page.locator(`[data-date="${iso}"]`),pop=page.locator('#serviceCalendarPop'),button=page.locator('#serviceDateButton');
 // On load the calendar takes no space: the pop-up is hidden, and the
 // board already shows today through the from/to range.
 await expect(pop).toBeHidden();await expect(page.locator('#calGrid')).toBeHidden();
 await expect(button).toHaveText('Wed, Oct 28, 2026');await expect(button).toHaveAttribute('aria-expanded','false');
 expect(captured.tripParams.at(-1)).toEqual({from:'2026-10-28',to:'2026-10-28',ranges:null,dates:null});
 // Clicking the date control opens the pop-up on the anchor's month,
 // with the anchor day marked and today named in its label.
 await button.click();await expect(pop).toBeVisible();await expect(button).toHaveAttribute('aria-expanded','true');
 await expect(page.locator('#calMonth')).toHaveText('October 2026');
 await expect(day('2026-10-28')).toHaveAttribute('aria-pressed','true');
 await expect(day('2026-10-28')).toHaveAttribute('aria-label','Wednesday, October 28, 2026, today');
 await expect(day('2026-10-30')).toHaveAttribute('aria-pressed','false');
 // Escape closes the pop-up without changing the date.
 await page.keyboard.press('Escape');await expect(pop).toBeHidden();await expect(button).toBeFocused();
 await expect(button).toHaveText('Wed, Oct 28, 2026');expect(captured.tripParams.at(-1).from).toBe('2026-10-28');
 // An outside click also closes it without changing the date.
 await button.click();await expect(pop).toBeVisible();await page.locator('#viewTitle').click();await expect(pop).toBeHidden();await expect(button).toHaveText('Wed, Oct 28, 2026');
 // Picking a day closes the pop-up, updates the control and the summary
 // line, and reloads the board for that day.
 await button.click();await day('2026-10-30').click();
 await expect(pop).toBeHidden();await expect(button).toBeFocused();await expect(button).toHaveText('Fri, Oct 30, 2026');
 await expect(page.locator('#serviceRange')).toHaveText('Fri, Oct 30, 2026');
 await expect.poll(()=>captured.tripParams.at(-1)).toEqual({from:'2026-10-30',to:'2026-10-30',ranges:null,dates:null});
 // Month navigation inside the pop-up reaches other months; picking a
 // day there moves the anchor.
 await button.click();await page.locator('#calNext').click();await expect(page.locator('#calMonth')).toHaveText('November 2026');
 await day('2026-11-16').click();await expect(pop).toBeHidden();await expect(button).toHaveText('Mon, Nov 16, 2026');
 await expect.poll(()=>captured.tripParams.at(-1)).toEqual({from:'2026-11-16',to:'2026-11-16',ranges:null,dates:null});
 // Switching the timeframe re-resolves the same anchor: Week is the
 // Sunday-Saturday span, Month the calendar month, and the summary line
 // words the range from -> to. The pop-up stays closed throughout.
 await page.locator('#serviceTimeframe').selectOption('week');
 await expect(page.locator('#serviceRange')).toHaveText('Sun, Nov 15 → Sat, Nov 21, 2026');
 await expect.poll(()=>captured.tripParams.at(-1)).toEqual({from:'2026-11-15',to:'2026-11-21',ranges:null,dates:null});
 await page.locator('#serviceTimeframe').selectOption('month');
 await expect(page.locator('#serviceRange')).toHaveText('Nov 1 → Nov 30, 2026');
 await expect.poll(()=>captured.tripParams.at(-1)).toEqual({from:'2026-11-01',to:'2026-11-30',ranges:null,dates:null});
 await expect(pop).toBeHidden();
});
for(const width of [1440,390])test(`Ask Nex is mirrored to the right edge without covering the calendar controls at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:1000});const captured=await fixture(page);await page.goto('/facility.html');await expect(page.locator('#tripRows')).toContainText(trip.reference);expect(captured.tripParams.at(-1)).toEqual({from:'2026-10-28',to:'2026-10-28',ranges:null,dates:null});
 const tab=page.locator('#nvaTab'),panel=page.locator('#nvaPanel');
 await page.locator('#serviceDateButton').click();const controls=page.locator('#serviceCalendarPop');await expect(controls).toBeVisible();
 await expect(tab).toBeVisible();await expect(tab).toHaveAttribute('data-nva-side','right');await expect(panel).toHaveAttribute('data-nva-side','right');
 const tabBox=await tab.boundingBox(),controlsBox=await controls.boundingBox(),accessBox=await page.locator('.access').boundingBox();
 const overlaps=(a,b)=>!(a.x+a.width<=b.x||a.x>=b.x+b.width||a.y+a.height<=b.y||a.y>=b.y+b.height);
 expect(Math.abs(tabBox.x+tabBox.width-width)).toBeLessThanOrEqual(2);
 expect(overlaps(tabBox,controlsBox)).toBe(false);
 expect(overlaps(tabBox,accessBox)).toBe(false);
 expect(controlsBox.x).toBeGreaterThanOrEqual(0);expect(controlsBox.x+controlsBox.width).toBeLessThanOrEqual(width);
 await tab.click();await expect(panel).toBeVisible();
 await expect.poll(async()=>{const b=await panel.boundingBox();return Math.abs(b.x+b.width-width);}).toBeLessThanOrEqual(2);
 const panelBox=await panel.boundingBox();const expectedWidth=Math.min(380,width-70);
 expect(Math.abs(panelBox.width-expectedWidth)).toBeLessThanOrEqual(2);expect(Math.abs(panelBox.x+panelBox.width-width)).toBeLessThanOrEqual(2);
 await expect(panel.locator('#nvaInput')).toBeFocused();
 await page.locator('.nvaClose').click();await expect(panel).toBeHidden();await expect(tab).toBeFocused();
});
test('Ask Nex closes on an outside tap and after 15 idle seconds, preserving the conversation',async({page})=>{
 await page.clock.install();const captured=await fixture(page);await page.goto('/facility.html');await expect(page.locator('#tripRows')).toContainText(trip.reference);expect(captured.tripParams).toHaveLength(1);
 const tab=page.locator('#nvaTab'),panel=page.locator('#nvaPanel');
 await tab.click();await expect(panel).toBeVisible();await page.clock.fastForward(60);
 await panel.locator('#nvaInput').fill('How much does a ride cost?');await panel.locator('#nvaSend').click();await expect(panel.locator('#nvaLog')).toContainText('Where should we pick you up?');
 await page.mouse.click(20,950);await expect(panel).toBeHidden();await expect(tab).toBeFocused();
 await tab.click();await expect(panel).toBeVisible();await expect(panel.locator('#nvaLog')).toContainText('Where should we pick you up?');
 // The fake clock also drifts with real elapsed time, so the idle
 // assertions use wide margins: 10s forward is safely inside the
 // 15-second window, and 20s+ total since opening can only still be
 // open if typing reset the timer.
 await page.clock.fastForward(10000);await expect(panel).toBeVisible();
 await panel.locator('#nvaInput').fill('1');await page.clock.fastForward(10000);await expect(panel).toBeVisible();
 // A draft sitting in the focused composer suspends idle closing
 // entirely: even 20 more seconds with no keystrokes leaves the
 // panel open. (Before the fix, the timer fired here, mid-message.)
 await page.clock.fastForward(20000);await expect(panel).toBeVisible();
 // Idle closing resumes once the draft is cleared and focus leaves
 // the composer (here: moved to the Send button, still in the panel).
 await panel.locator('#nvaInput').fill('');await page.evaluate(()=>document.getElementById('nvaSend').focus());
 await page.clock.fastForward(20000);await expect(panel).toBeHidden();await expect(tab).toBeFocused();
 await tab.click();await expect(panel).toBeVisible();await expect(panel.locator('#nvaLog')).toContainText('Where should we pick you up?');
});
test('Ask Nex never closes while a message is being composed (idle-close regression)',async({page})=>{
 await page.clock.install();await fixture(page);
 // Shorten the idle window to 3s through the widget's own config so
 // the regression legs run fast: serve facility.html with
 // idleCloseMs added to its NEXUS_VISITOR_ASSISTANT config.
 const fs=require('fs');
 const html=fs.readFileSync('facility.html','utf8').replace("side:'right'","side:'right',idleCloseMs:3000");
 expect(html).toContain('idleCloseMs:3000');
 await page.route('**/facility.html',route=>route.fulfill({body:html,contentType:'text/html'}));
 await page.goto('/facility.html');await expect(page.locator('#tripRows')).toContainText(trip.reference);
 const tab=page.locator('#nvaTab'),panel=page.locator('#nvaPanel'),input=panel.locator('#nvaInput');
 await tab.click();await expect(panel).toBeVisible();await page.clock.fastForward(60);
 // (c) Pressing into the composer is a press inside the widget, not
 // an outside press: the panel stays open.
 await input.click();await expect(panel).toBeVisible();
 // (a) Typing with pauses: each pause is shorter than the idle
 // window, but total time at the keyboard runs far past it.
 for(const chunk of ['What ','does ','a ride ','cost ','from ','here?']){
  await page.keyboard.type(chunk);await page.clock.fastForward(2000);await expect(panel).toHaveClass(/\bopen\b/);
 }
 // (b) Now stop touching anything, draft still in the box and the
 // composer still focused: ten idle windows pass and the panel must
 // still be open with the draft intact. (Pre-fix, the idle timer
 // fired during this pause and closed the panel mid-message; the
 // open-class check is used because closing removes it at once,
 // while the visibility transition lags behind it.)
 await page.clock.fastForward(30000);await expect(panel).toHaveClass(/\bopen\b/);await expect(panel).toBeVisible();
 await expect(input).toBeFocused();await expect(input).toHaveValue('What does a ride cost from here?');
 // (d) Once the draft is cleared and focus leaves the composer,
 // idle closing resumes: the panel closes and focus returns to the
 // Ask Nex tab.
 await input.fill('');await page.evaluate(()=>document.getElementById('nvaSend').focus());
 await page.clock.fastForward(10000);await expect(panel).toBeHidden();await expect(tab).toBeFocused();
 // (e) A genuine outside tap still closes immediately.
 await tab.click();await expect(panel).toBeVisible();
 await page.mouse.click(20,950);await expect(panel).toBeHidden();
});
test('reporting tab shows facility charts and refetches when the timeframe changes',async({page})=>{
 const captured=await fixture(page);await page.goto('/facility.html');await expect(page.locator('#tripRows')).toContainText(trip.reference);
 await page.locator('nav [data-view="reports"]').click();
 await expect(page.locator('#reportsView')).toBeVisible();await expect(page.locator('#viewTitle')).toHaveText('Reporting');
 await expect(page.locator('#repTotalTrips')).toHaveText('3');await expect(page.locator('#repCompletionRate')).toHaveText('66.7%');
 await expect(page.locator('#reportsView svg.repSvg')).toHaveCount(7);
 await expect(page.locator('#repDaily table.repSrOnly')).toContainText('2026-10-02');
 await expect(page.locator('#repDest')).toContainText('Annapolis');
 // The default view is the context month containing the fixture's today.
 expect(captured.reportParams.at(-1)).toEqual({from:'2026-10-01',to:'2026-10-31'});
 expect(captured.reportScope.every(id=>id==='FC-A')).toBe(true);
 // Switching timeframe re-resolves the range from the same anchor date.
 await page.locator('#repTimeframe').selectOption('week');
 expect(captured.reportParams.at(-1)).toEqual({from:'2026-10-25',to:'2026-10-31'});
 await expect(page.locator('#repRangeLabel')).toContainText('2026-10-25');
 // Leaving the tab restores the trip board.
 await page.locator('nav [data-view="board"]').click();
 await expect(page.locator('#reportsView')).toBeHidden();await expect(page.locator('#boardView')).toBeVisible();await expect(page.locator('#viewTitle')).toHaveText('Trip board');
});
test('reporting tab shows a clean empty state when the range has no trips',async({page})=>{
 await fixture(page,{empty:true});await page.goto('/facility.html');await expect(page.locator('#tripRows')).toContainText('No trips match');
 await page.locator('nav [data-view="reports"]').click();
 await expect(page.locator('#reportsView')).toBeVisible();await expect(page.locator('#repEmpty')).toBeVisible();await expect(page.locator('#repCharts')).toBeHidden();
});
