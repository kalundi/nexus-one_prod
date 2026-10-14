const {test,expect}=require('@playwright/test');
test('DriveFlex approved shift panel uses server schedule, and never grants shift permission',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 const user={id:'driver-test',role:'DRIVER',email:'driver@test.test',displayName:'Test Driver',mustChangePassword:false};
 await page.addInitScript(u=>{sessionStorage.setItem('nexusAccessToken','testtoken');sessionStorage.setItem('nexusUser',JSON.stringify(u));localStorage.setItem('nexusUser',JSON.stringify(u));},user);
 let available=false,fail=false;
 await page.route('**/api/**',route=>{
  const pathname=new URL(route.request().url()).pathname;
  if(pathname==='/api/driver/schedule'){
   if(fail)return route.fulfill({status:503,json:{error:'unavailable'}});
   return route.fulfill({status:200,json:{available,shift:available?{startTime:'09:00',endTime:'14:00'}:null}});
  }
  if(pathname==='/api/auth/me')return route.fulfill({status:200,json:{user}});
  if(pathname==='/api/driver/assignments')return route.fulfill({status:200,json:{assignments:[]}});
  return route.fulfill({status:200,json:{}});
 });
 await page.goto('/driver-app.html');
 const panel=page.locator('#driveflexShiftPanel');
 await expect(panel).toBeVisible();
 await expect(panel.locator('[data-df-status]')).toContainText('do not have an active approved shift');
 available=true;await panel.locator('[data-df-refresh]').click();
 await expect(panel.locator('[data-df-status]')).toContainText('current shift is approved');
 await expect(panel.locator('[data-df-details]')).toContainText('09:00');
 fail=true;await panel.locator('[data-df-refresh]').click();
 await expect(panel.locator('[data-df-status]')).toContainText('Unable to verify');
 await expect(panel.locator('[data-df-details]')).toBeEmpty();
});
