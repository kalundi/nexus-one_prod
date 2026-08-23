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
