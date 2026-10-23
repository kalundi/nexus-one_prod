const {test,expect}=require('@playwright/test');
const fs=require('node:fs');
const trip={id:'trip-one',pickup_area:'Rockville',destination_area:'Bethesda',service_level:'AMBULATORY',start_at:'2030-12-01T14:00:00Z',end_at:'2030-12-01T16:00:00Z',payout_cents:7500,status:'OPEN'};
async function setup(page,role){
 await page.route('**/driveflex',r=>r.fulfill({contentType:'text/html',body:fs.readFileSync('driveflex.html','utf8')}));
 await page.route('**/driveflex/apply',r=>r.fulfill({contentType:'text/html',body:fs.readFileSync('driveflex.html','utf8')}));
 await page.route('**/driveflex/manage',r=>r.fulfill({contentType:'text/html',body:fs.readFileSync('driveflex.html','utf8')}));
 if(role){await page.addInitScript(()=>sessionStorage.setItem('nexusAccessToken','test-token'));await page.route('**/api/auth/me',r=>r.fulfill({json:{user:{id:'driver',role}}}));}
}
for(const width of [390,1440])test(`marketplace filters and request lifecycle at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:1000});await setup(page,'DRIVER');let requests=[];
 await page.route('**/api/driveflex/trips',r=>r.fulfill({json:{trips:[trip]}}));
 await page.route('**/api/driveflex/trips/mine',r=>r.fulfill({json:{requests}}));
 await page.route('**/api/driveflex/trips/trip-one/request',r=>{requests=[{...trip,request_status:'REQUESTED',agreed_payout_cents:7500}];return r.fulfill({json:{message:'Request received.'}});});
 await page.route('**/api/driveflex/trips/trip-one/withdraw',r=>{requests=[{...trip,request_status:'WITHDRAWN',agreed_payout_cents:7500}];return r.fulfill({json:{message:'Request withdrawn.'}});});
 await page.goto('/driveflex');await expect(page.getByLabel('Dashboard overview')).toBeVisible();
 await page.getByLabel('Area',{exact:true}).fill('Silver Spring');await expect(page.getByText('No matching trips right now.')).toBeVisible();
 await page.getByLabel('Area',{exact:true}).fill('Rockville');await page.getByRole('button',{name:'Request this trip'}).click();
 await expect(page.locator('#message')).toHaveText('Request received.');await expect(page.getByLabel('Area',{exact:true})).toHaveValue('Rockville');
 await page.getByRole('button',{name:'Withdraw request'}).first().click();await expect(page.getByRole('button',{name:'Request this trip'})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.evaluate(()=>{document.activeElement?.blur();window.scrollTo(0,0);});
 await page.screenshot({path:`output/driveflex-marketplace-${width}.png`,fullPage:true});
});
test('failed driver request history does not present misleading request buttons',async({page})=>{
 await setup(page,'DRIVER');await page.route('**/api/driveflex/trips',r=>r.fulfill({json:{trips:[trip]}}));
 await page.route('**/api/driveflex/trips/mine',r=>r.fulfill({status:503,json:{error:'Request history unavailable.'}}));
 await page.goto('/driveflex');await expect(page.locator('#message')).toHaveText('Request history unavailable.');await expect(page.getByRole('button',{name:'Request this trip'})).toHaveCount(0);
 await page.route('**/api/driveflex/trips/mine',r=>r.fulfill({json:{requests:[]}}));await page.getByRole('button',{name:'Try again'}).click();await expect(page.getByRole('button',{name:'Request this trip'})).toBeVisible();
});
test('private applicant link is removed and checklist can be locked',async({page})=>{
 await setup(page);await page.route('**/api/driveflex/applicant',r=>r.fulfill({json:{application:{id:'application-one',firstName:'Alex',status:'IN_PROGRESS'},items:[],approved:0,total:15,submitted:0,ready:false,readyForReview:false}}));
 await page.goto('/driveflex/apply#access='+'a'.repeat(64));await expect(page.getByText('Welcome, Alex')).toBeVisible();await expect(page).toHaveURL(/\/driveflex\/apply$/);
 await page.getByRole('button',{name:'Lock my application'}).click();await expect(page.getByRole('heading',{name:'Pick up where you left off'})).toBeVisible();
});
test('dispatcher can publish a trip with a fixed payout',async({page})=>{
 await setup(page,'DISPATCHER');let posted;
 await page.route('**/api/driveflex/manage/trips',r=>{if(r.request().method()==='POST'){posted=r.request().postDataJSON();return r.fulfill({json:{message:'Trip published.'}});}return r.fulfill({json:{trips:[],requests:[]}});});
 await page.goto('/driveflex/manage');await page.getByLabel('Booking reference').fill('NMT-TEST');await page.getByLabel('Fixed driver payout ($)').fill('75.50');await page.getByLabel('Pickup city / county').fill('Rockville');await page.getByLabel('Destination city / county').fill('Bethesda');await page.getByLabel('Start',{exact:true}).fill('2030-12-01T09:00');await page.getByLabel('End',{exact:true}).fill('2030-12-01T11:00');await page.getByRole('button',{name:'Publish trip & payout'}).click();
 await expect(page.locator('#message')).toHaveText('Trip published.');expect(posted.payout).toBe('75.50');expect(posted.serviceLevel).toBe('AMBULATORY');await expect(page.getByRole('link',{name:'Applicant review'})).toHaveCount(0);
});
