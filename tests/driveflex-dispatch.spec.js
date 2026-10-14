const {test,expect}=require('@playwright/test');
test('dispatch review loads pending requests and posts a provisional approval',async({page})=>{
 const user={id:'dispatch-user',role:'DISPATCHER',email:'dispatcher@example.test',mustChangePassword:false};
 await page.addInitScript(u=>{sessionStorage.setItem('nexusAccessToken','test-token');sessionStorage.setItem('nexusUser',JSON.stringify(u));localStorage.setItem('nexusUser',JSON.stringify(u));},user);
 let decision='';
 await page.route('**/api/auth/me',route=>route.fulfill({status:200,json:{user}}));
 await page.route('**/api/driveflex/shifts/requests**',async route=>{
  if(route.request().method()==='POST'){decision=route.request().postDataJSON().decision;return route.fulfill({status:200,json:{request:{id:'request-1',status:decision}}});}
  return route.fulfill({status:200,json:{requests:[{id:'request-1',driver_id:'driver-1',status:decision||'REQUESTED',service_level:'WHEELCHAIR',start_at:'2026-12-01T09:00:00Z',end_at:'2026-12-01T13:00:00Z'}]}});
 });
 page.on('dialog',dialog=>dialog.accept());
 await page.goto('/driveflex-dispatch.html');
 await expect(page.getByText('Driver ID: driver-1',{exact:false})).toBeVisible();
 await page.getByRole('button',{name:'Approve provisionally'}).click();
 await expect.poll(()=>decision).toBe('APPROVED');
});
test('dispatch request page reports authorization failure without showing approvals',async({page})=>{
 await page.addInitScript(()=>{sessionStorage.setItem('nexusAccessToken','test-token');sessionStorage.setItem('nexusUser',JSON.stringify({role:'DRIVER'}));});
 await page.route('**/api/auth/me',route=>route.fulfill({status:200,json:{user:{id:'driver-1',role:'DRIVER'}}}));
 await page.route('**/api/driveflex/shifts/requests',route=>route.fulfill({status:403,json:{error:'Not authorized'}}));
 await page.goto('/driveflex-dispatch.html');
 await expect(page.getByText('Authorization required')).toBeVisible();
 await expect(page.getByRole('button',{name:'Approve provisionally'})).toHaveCount(0);
});
