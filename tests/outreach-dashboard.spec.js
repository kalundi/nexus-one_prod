const {test,expect}=require('@playwright/test');
const audience=require('../data/montgomery-tier-a-outreach-pilot.json');
const {OUTREACH_CAMPAIGN:campaign}=require('../netlify/functions/_shared/outreach-content.cjs');
for(const mobile of [false,true])test(`outreach dashboard shows the full automatic audience, provider blocker and pause/resume on ${mobile?'mobile':'desktop'}`,async({page})=>{
 if(mobile)await page.setViewportSize({width:390,height:844});
 const calls=[];let enabled=true,error='POSTMARK_BROADCAST_MESSAGE_STREAM is missing.';
 await page.addInitScript(()=>{sessionStorage.setItem('nexusAccessToken','outreach-ui-test');sessionStorage.setItem('nexusUser',JSON.stringify({id:'test-admin',role:'ADMIN',email:'admin@example.test'}));});
 const data=()=>({campaign:{...campaign,status:!enabled?'PAUSED':error?'BLOCKED':'AUTOMATIC'},eligibleCount:262,recipients:audience.recipients.map((r,i)=>({...r,sequence:i+1,status:i<25?'SENT':'READY',followUpStatus:'PENDING',followUpDue:i<25?'2026-10-29':null})),delivery:{postmark:error?'not-configured':'configured'},previewHtml:'<p>Initial outreach preview</p>',followUpPreviewHtml:'<p>Follow-up preview</p>',automation:{enabled,error,initialSent:25,followUpsSent:0,lastRunAt:'2026-10-27T13:30:00Z',nextCheckAt:'2026-10-27T13:31:00Z'}});
 await page.route('**/api/**',async route=>{
  const request=route.request(),path=new URL(request.url()).pathname;
  if(path==='/api/auth/me')return route.fulfill({json:{user:{id:'test-admin',role:'ADMIN',email:'admin@example.test'}}});
  if(path.startsWith('/api/admin/outreach-campaigns/pilot')){
   calls.push({path,method:request.method()});
   if(path.endsWith('/automation'))enabled=request.postDataJSON().enabled;
   if(path.endsWith('/check')){error='';return route.fulfill({json:{ok:true}});}
   return route.fulfill({json:data()});
  }
  const fallback=path.includes('platform-settings')?{settings:{pricing:{},fareRules:{},fareBreakdown:{}},pricing:{},fareRules:{}}:path.includes('users')?{users:[]}:path.includes('audit')?{audit:[]}:path.includes('shifts')?{shifts:[]}:path.includes('applications')?{applications:[]}:path.includes('bookings')?{bookings:[]}:{};
  return route.fulfill({json:fallback});
 });
 await page.goto('/admin.html#outreachSection');
 await expect(page.locator('#outreachSection')).toBeVisible();await expect(page.locator('#adminFocusTitle')).toHaveText('Outreach campaigns');
 await expect(page.locator('#outreachRecipientRows tr')).toHaveCount(262);await expect(page.locator('#outreachStatus')).toHaveText('BLOCKED');
 await expect(page.locator('#outreachAutomationSummary')).toContainText('Initial emails sent: 25');await expect(page.locator('#outreachAutomationError')).toContainText('BROADCAST');
 await page.locator('#toggleOutreachAutomation').click();await expect(page.locator('#outreachStatus')).toHaveText('PAUSED');await expect(page.locator('#toggleOutreachAutomation')).toHaveText('Resume automatic outreach');
 await page.locator('#checkOutreachConnections').click();await expect(page.locator('#outreachAutomationError')).toBeHidden();
 await page.locator('#toggleOutreachAutomation').click();await expect(page.locator('#outreachStatus')).toHaveText('AUTOMATIC');
 expect(calls.some(c=>c.path.endsWith('/send')||c.path.endsWith('/test'))).toBe(false);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 await page.locator('#outreachSection').evaluate(element=>scrollTo(0,element.offsetTop-100));
 await page.screenshot({path:`output/outreach-dashboard-${mobile?'mobile':'desktop'}.png`});
});
