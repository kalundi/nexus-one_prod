const {test,expect}=require('@playwright/test');
test('driver app uses live schedule changes and displays the permanent user ID',async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.clock.install();let available=false;
 const user={id:'driver-1',userCode:'N4827',email:'driver@test.test',displayName:'Test Driver',role:'DRIVER',mustChangePassword:false};
 await page.addInitScript(u=>{sessionStorage.setItem('nexusAccessToken','driver-schedule-test');sessionStorage.setItem('nexusUser',JSON.stringify(u));localStorage.setItem('nexusUser',JSON.stringify(u));localStorage.setItem('nxDriverShift_v3',JSON.stringify({onDuty:false,vehicleUnit:'SE-254-01',inspectionDone:true,inspectedVehicleUnit:'SE-254-01'}));},user);
 await page.route('**/*',route=>{
  const url=new URL(route.request().url());if(!['127.0.0.1','localhost'].includes(url.hostname))return route.abort();if(!url.pathname.startsWith('/api/'))return route.continue();
  const body=url.pathname==='/api/auth/me'?{user}:url.pathname==='/api/driver/schedule'?{available,userCode:'N4827',shift:available?{startTime:'06:00',endTime:'22:00'}:null}:url.pathname==='/api/driver/assignments'?{assignments:[]}:url.pathname==='/api/fleet/live'?{vehicles:[{unit:'SE-254-01',type:'SEDAN',status:'AVAILABLE'}]}:{};
  return route.fulfill({status:200,json:body});
 });
 await page.goto('/driver-app.html');await expect(page.locator('#driverNexusId')).toContainText('N4827');await expect(page.locator('#btnStartShift')).toBeDisabled();await expect(page.locator('#driverScheduleStatus')).toContainText('No active shift');
 available=true;await page.clock.fastForward(31000);await expect(page.locator('#btnStartShift')).toBeEnabled();await expect(page.locator('#driverScheduleStatus')).toContainText('06:00–22:00');
 available=false;await page.clock.fastForward(31000);await expect(page.locator('#btnStartShift')).toBeDisabled();await expect(page.locator('#driverScheduleStatus')).toContainText('No active shift');
 available=true;await page.clock.fastForward(31000);await page.locator('#btnStartShift').click();await expect(page.locator('#shiftBadge')).toHaveText('On Duty');
 available=false;await page.clock.fastForward(31000);await expect(page.locator('#driverScheduleStatus')).toContainText('No active shift');await expect(page.locator('#shiftBadge')).toHaveText('On Duty');
});
