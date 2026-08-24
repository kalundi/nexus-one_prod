const {test,expect}=require('@playwright/test');

const pages=[
 {path:'/__deploy_temp/index.html'},
 {path:'/livecare.html'},
 {path:'/keymark.html',role:'ADMIN'},
 {path:'/facility.html',role:'FACILITY'},
 {path:'/dispatch.html',role:'DISPATCHER'},
 {path:'/admin.html',role:'ADMIN'}
];

for(const width of [320,375,390,414,428,440]){
 test(`responsive system keeps representative pages contained at ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:900});
  for(const entry of pages){
   await page.unrouteAll({behavior:'ignoreErrors'});
   await page.addInitScript(role=>{
    if(role)sessionStorage.setItem('nexusAccessToken','responsive-test-token');
    else sessionStorage.removeItem('nexusAccessToken');
   },entry.role||null);
   if(entry.role){
    await page.route('**/api/auth/me',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({user:{id:'responsive-user',displayName:'Responsive Test',role:entry.role}})}));
   }
   await page.goto(entry.path,{waitUntil:'domcontentloaded'});
   await page.waitForTimeout(450);
   const result=await page.evaluate(()=>({
    viewport:document.documentElement.clientWidth,
    scrollWidth:document.documentElement.scrollWidth,
    responsiveLoaded:Array.from(document.styleSheets).some(sheet=>String(sheet.href||'').includes('/responsive.css')),
    clipped:Array.from(document.querySelectorAll('header,main,footer')).filter(element=>{const box=element.getBoundingClientRect();return box.left < -1 || box.right > document.documentElement.clientWidth + 1}).map(element=>({tag:element.tagName,className:element.className,left:element.getBoundingClientRect().left,right:element.getBoundingClientRect().right}))
   }));
   expect(result.responsiveLoaded,`${entry.path} did not load responsive.css`).toBeTruthy();
   expect(result.scrollWidth,`${entry.path} overflows at ${width}px`).toBeLessThanOrEqual(result.viewport+1);
   expect(result.clipped,`${entry.path} clips a major region at ${width}px`).toEqual([]);
  }
 });
}

test('homepage mobile booking CTA has one accessible icon label',async({page})=>{
 await page.setViewportSize({width:320,height:800});
 await page.goto('/__deploy_temp/index.html',{waitUntil:'domcontentloaded'});
 await page.waitForTimeout(700);
 const cta=page.locator('header .navBookRide').first();
 await expect(cta).toBeVisible();
 const label=await cta.evaluate(element=>({
  text:element.textContent.replace(/\s+/g,' ').trim(),
  after:getComputedStyle(element,'::after').content,
  afterImage:getComputedStyle(element,'::after').backgroundImage,
  spanAfter:getComputedStyle(element.querySelector('span'),'::after').content,
  spanSize:parseFloat(getComputedStyle(element.querySelector('span')).fontSize)
 }));
 expect(label.text).toBe('Book a Ride');
 expect(['none','normal','""']).toContain(label.after);
 expect(['none','normal','""']).toContain(label.spanAfter);
 expect(label.afterImage).toContain('svg');
 expect(label.spanSize).toBe(0);
 await expect(cta).toHaveAccessibleName(/Book a Ride/i);
});

for(const width of [320,375,428,440]){
 test(`mobile navigation icons share one row at ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:850});
  await page.goto('/__deploy_temp/index.html',{waitUntil:'domcontentloaded'});
  await page.waitForTimeout(800);
  const header=page.locator('header.nexusAdaptiveMobileHeader');
  await expect(header).toBeVisible();
  const items=header.locator('.brand:visible, .nexusCompactLanguage:visible, .headerLanguage:visible, .navBookRide:visible, .nexusSharedBook:visible, .nexusAccountButton:visible, .nexusNavSignUp:visible, .menuBtn:visible, .mobileNavToggle:visible');
  const boxes=await items.evaluateAll(elements=>elements.map(element=>{const box=element.getBoundingClientRect();return {left:box.left,right:box.right,center:box.top+box.height/2}}));
  expect(boxes.length).toBe(6);
  expect(Math.max(...boxes.map(box=>box.center))-Math.min(...boxes.map(box=>box.center))).toBeLessThanOrEqual(2);
  boxes.forEach(box=>{expect(box.left).toBeGreaterThanOrEqual(0);expect(box.right).toBeLessThanOrEqual(width+.5)});
  await expect(header.locator('[data-nexus-language]')).toHaveAccessibleName(/Language|Select language/i);
  await expect(header.locator('.navBookRide,.nexusSharedBook').first()).toHaveAccessibleName(/Book a Ride/i);
  await expect(header.locator('.nexusAccountButton')).toHaveAccessibleName(/Sign In/i);
  await expect(header.locator('.nexusNavSignUp')).toHaveAccessibleName(/Sign Up/i);
 });
}
