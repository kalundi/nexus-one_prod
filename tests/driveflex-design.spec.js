const {test,expect}=require('@playwright/test');
const fs=require('node:fs');
for(const width of [390,1440])test(`shared site design and shift publishing at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:1000});
 const user={id:'dispatch-user',role:'DISPATCHER',email:'dispatcher@example.test',mustChangePassword:false};
 await page.addInitScript(u=>{sessionStorage.setItem('nexusAccessToken','test-token');sessionStorage.setItem('nexusUser',JSON.stringify(u));},user);
 await page.route('**/api/auth/me',r=>r.fulfill({json:{user}}));
 await page.route('**/api/driveflex/shifts/requests',r=>r.fulfill({json:{requests:[]}}));
 let submitted;
 await page.route('**/api/driveflex/shifts',r=>{submitted=r.request().postDataJSON();return r.fulfill({status:201,json:{shift:{id:'test-shift'}}});});
 // Match the production rewrite while keeping the nested URL in the browser.
 await page.route('**/driveflex/dispatch',r=>r.fulfill({contentType:'text/html',body:fs.readFileSync('driveflex-dispatch.html','utf8')}));
 await page.goto('/driveflex/dispatch');
 await expect(page.locator('header .logo')).toBeVisible();
 await expect(page.locator('.footerBrandCompact')).toBeVisible();
 await expect.poll(()=>page.locator('.footerLogo').evaluate(img=>img.complete&&img.naturalWidth>0)).toBe(true);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
 for(const input of await page.locator('#publish input, #publish select').all()){
   const box=await input.boundingBox();expect(box.x).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(width);
 }
 await page.screenshot({path:`output/driveflex-design-${width}.png`,fullPage:true});
 await page.getByLabel('Start',{exact:true}).fill('2030-12-01T09:00');
 await page.getByLabel('End',{exact:true}).fill('2030-12-01T13:00');
 await page.getByLabel('Service area',{exact:true}).fill('Montgomery County');
 await page.getByRole('button',{name:/Publish shift/}).click();
 await expect.poll(()=>submitted?.operatingArea).toBe('Montgomery County');
 expect(submitted.serviceLevel).toBe('AMBULATORY');
});
