const {test,expect}=require('@playwright/test');
const {canPatientSeeDriverLocation,distanceMiles}=require('../netlify/functions/_shared/patient-driver-location.cjs');
const fs=require('fs');
const path=require('path');

function localSchedule(minutesFromNow){
 const value=new Date(Date.now()+minutesFromNow*60000),pad=n=>String(n).padStart(2,'0');
 return {date:`${value.getFullYear()}-${pad(value.getMonth()+1)}-${pad(value.getDate())}`,time:`${pad(value.getHours())}:${pad(value.getMinutes())}`};
}

test('location gate requires both an activated trip and the one-hour window',()=>{
 const within=localSchedule(45),later=localSchedule(61);
 expect(canPatientSeeDriverLocation({...within,status:'ASSIGNED'})).toBe(false);
 expect(canPatientSeeDriverLocation({...later,status:'EN_ROUTE'})).toBe(false);
 expect(canPatientSeeDriverLocation({...within,status:'EN_ROUTE'})).toBe(true);
 expect(distanceMiles(39.083,-77.152,39.083,-77.152)).toBeCloseTo(0,5);
});

test('driver GPS posts the active booking reference to the server location endpoint',()=>{
 const source=fs.readFileSync(path.join(__dirname,'..','driver-app.js'),'utf8');
 expect(source).toContain("fetch('/api/gps/positions'");
 expect(source).toContain('bookingReference:routeAuto.tripRef||activeRef||null');
});

test('patient sees only an eligible assigned driver location',async({page})=>{
 const schedule=localSchedule(30),user={id:'patient-location',displayName:'Pat Rider',email:'pat@example.com',role:'PATIENT'};
 const ride={reference:'NMT-LOC-1',...schedule,status:'en-route',statusLabel:'Driver en route',pickup:'100 Main Street',destination:'200 Medical Drive',service:'AMBULATORY',driverName:'Alex',vehicleUnit:'NMT-7',driverLocationVisible:true,driverLocation:{latitude:39.083,longitude:-77.152,distanceToPickupMiles:2.4}};
 await page.addInitScript(()=>sessionStorage.setItem('nexusAccessToken','patient-location-token'));
 await page.route('**/api/auth/me',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({user})}));
 await page.route('**/api/patient/dashboard',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({user,nextRide:ride,recentRides:[ride]})}));
 await page.goto('/livecare.html',{waitUntil:'domcontentloaded'});
 await expect(page.locator('#patientDriverLocation')).toContainText('2.4 miles away');
 await expect(page.getByRole('link',{name:'View your assigned driver location on a map'})).toHaveAttribute('href',/39\.083%2C-77\.152/);
});

test('patient location card stays absent when the server gate is closed',async({page})=>{
 const schedule=localSchedule(30),user={id:'patient-location',displayName:'Pat Rider',email:'pat@example.com',role:'PATIENT'};
 const ride={reference:'NMT-LOC-2',...schedule,status:'assigned',pickup:'100 Main Street',destination:'200 Medical Drive',driverLocationVisible:false};
 await page.addInitScript(()=>sessionStorage.setItem('nexusAccessToken','patient-location-token'));
 await page.route('**/api/auth/me',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({user})}));
 await page.route('**/api/patient/dashboard',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({user,nextRide:ride,recentRides:[ride]})}));
 await page.goto('/livecare.html',{waitUntil:'domcontentloaded'});
 await expect(page.locator('#patientDriverLocation')).toHaveCount(0);
});

test('booking page does not request fleet locations or expose yard routing',()=>{
 const source=fs.readFileSync(path.join(__dirname,'..','booking-app.js'),'utf8');
 const patientSource=fs.readFileSync(path.join(__dirname,'..','build6-patient.js'),'utf8');
 expect(source).not.toContain("fetch('/api/fleet/live'");
 expect(patientSource).not.toContain("fetch('/api/fleet/live'");
 expect(source).not.toContain('Yard->Pickup');
});

test('installed patient app uses the synchronized trip location',async({page})=>{
 const schedule=localSchedule(25),user={id:'patient-app',displayName:'Pat Rider',email:'pat@example.com',role:'PATIENT'};
 const ride={reference:'NMT-APP-1',...schedule,status:'en-route',pickup:'100 Main Street',destination:'200 Medical Drive',service:'AMBULATORY',driverLocationVisible:true,driverLocation:{latitude:39.083,longitude:-77.152,distanceToPickupMiles:1.7}};
 await page.addInitScript(()=>sessionStorage.setItem('nexusAccessToken','patient-app-token'));
 await page.route('**/api/auth/me',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({user})}));
 await page.route('**/api/patient/dashboard',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({user,nextRide:ride,recentRides:[ride]})}));
 await page.route('**/api/patient/preferences',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({preferences:{}})}));
 await page.goto('/patient.html',{waitUntil:'domcontentloaded'});
 await expect(page.locator('#liveRouteEta')).toHaveText('1.7 mi away');
 await expect(page.locator('#liveRouteHeadline')).toContainText('Driver is on the way');
});
