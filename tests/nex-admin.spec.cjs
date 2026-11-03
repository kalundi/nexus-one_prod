'use strict';
const {test,expect}=require('@playwright/test');

// All API calls in this suite are mocked. This verifies UI and access routing,
// not a claim that production Netlify or its migrations are healthy.
async function mount(page,{role='ADMIN',authenticated=true,dbReady=true}={}){
 const calls=[];
 let reviews=[{id:12,created_at:'2026-11-03T12:00:00Z',period_days:7,suggestion:'Review wheelchair FAQ coverage against the published site.',status:'pending'}];
 let drafts=[];
 if(authenticated)await page.addInitScript(()=>sessionStorage.setItem('nexusAccessToken','synthetic-test-token'));
 await page.route('**/api/auth/me',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({user:{id:123,role,roles:[role],displayName:'Test user'}})}));
 await page.route('**/api/portal/trips',r=>r.fulfill({status:200,contentType:'application/json',body:'{"trips":[]}'}));
 await page.route('**/.netlify/functions/nex-insights**',async r=>{
   const req=r.request(),url=new URL(req.url()),method=req.method();calls.push({path:url.pathname,query:url.search,method});
   if(role!=='ADMIN')return r.fulfill({status:403,contentType:'application/json',body:'{"error":"Access denied"}'});
   if(url.searchParams.has('readiness'))return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({
     databaseReady:dbReady,writePermissionReady:dbReady,aiConfigured:true,eventCount:14,lastRecordedAt:'2026-11-03T12:00:00Z'
   })});
   if(method==='PATCH'){
     const payload=req.postDataJSON(),item=reviews.find(x=>String(x.id)===String(payload.id));
     if(!item)return r.fulfill({status:409,contentType:'application/json',body:'{"error":"Review not found"}'});
     item.status=payload.status;
     return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({review:item})});
   }
   if(method==='POST')return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({
     status:'review-required',suggestions:'Improve service-area FAQ using approved sources.',
     review:{id:13,created_at:'2026-11-03T13:00:00Z',period_days:30,status:'pending',suggestion:'Improve service-area FAQ using approved sources.'}
   })});
   if(url.searchParams.has('reviews'))return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({reviews})});
   return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({
     days:Number(url.searchParams.get('days')||30),summary:{total:14,unanswered:3,emergencies:1},
     intents:[{intent:'booking',count:8}],gaps:[{terms:['wheelchair'],count:3}],terms:[{term:'wheelchair',count:6}]
   })});
 });
 await page.route('**/.netlify/functions/nex-knowledge-drafts**',async r=>{
   const req=r.request(),method=req.method(),url=new URL(req.url());calls.push({path:url.pathname,query:url.search,method});
   if(role!=='ADMIN')return r.fulfill({status:403,contentType:'application/json',body:'{"error":"Access denied"}'});
   const base={id:42,review_id:12,question:'Can Nexus provide wheelchair transportation for appointments?',answer:'Nexus provides wheelchair transportation for appointments. Contact the Nexus team for assistance.',source:'wheelchair-transportation.html',state:'draft',revision:1};
   if(method==='GET')return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({drafts,sources:['wheelchair-transportation.html']})});
   if(method==='POST'){
     const payload=req.postDataJSON();
     if(payload.action==='preview')return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({preview:payload,note:'Preview only; verify source manually.'})});
     drafts=[{...base,...payload}];
     return r.fulfill({status:201,contentType:'application/json',body:JSON.stringify({draft:drafts[0]})});
   }
   if(method==='PATCH'){
     const payload=req.postDataJSON();
     drafts=drafts.map(d=>({...d,state:payload.action==='approve'?'approved':d.state,revision:d.revision+1}));
     return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({draft:drafts[0],published:false})});
   }
   return r.fulfill({status:405,body:'{}'});
 });
 return {calls};
}

test('administrator sees real dashboard sections with mocked aggregate counts',async({page})=>{
 const {calls}=await mount(page);
 await page.goto('/nex-insights.html');
 await expect(page.getByRole('heading',{name:'Nex Conversation Intelligence'})).toBeVisible();
 await expect(page.locator('#databaseStatus')).toContainText('analytics table available');
 await expect(page.locator('#writeStatus')).toContainText('INSERT permission available');
 await expect(page.locator('#total')).toHaveText('14');
 await expect(page.locator('#reviewItems')).toContainText('#12');
 await expect(page.locator('#knowledgeSource option')).toHaveCount(1);
 expect(calls.some(c=>c.query.includes('readiness=1'))).toBe(true);
});

test('reviewing a recommendation changes status without publishing knowledge',async({page})=>{
 const {calls}=await mount(page);
 await page.goto('/nex-insights.html');
 await expect(page.getByText('#12 · pending', {exact:false})).toBeVisible();
 await page.getByRole('button',{name:'Mark reviewed'}).click();
 await expect(page.getByText('#12 · reviewed', {exact:false})).toBeVisible();
 expect(calls.some(x=>x.method==='PATCH'&&x.path.endsWith('/nex-insights'))).toBe(true);
 expect(calls.some(x=>x.path.includes('approved-knowledge'))).toBe(false);
});

test('FAQ editor requires preview before saving, and approval is a separate action',async({page})=>{
 const {calls}=await mount(page);
 await page.goto('/nex-insights.html');
 await expect(page.locator('#knowledgeSource option')).toHaveCount(1);
 await page.locator('#knowledgeReviewId').fill('12');
 await page.locator('#knowledgeQuestion').fill('Can Nexus provide wheelchair transportation for appointments?');
 await page.locator('#knowledgeAnswer').fill('Nexus provides wheelchair transportation for appointments. Contact the Nexus team for assistance.');
 await page.getByRole('button',{name:'Save draft'}).click();
 await expect(page.locator('#knowledgeStatus')).toContainText('Preview and validate');
 await page.getByRole('button',{name:'Preview and validate'}).click();
 await expect(page.locator('#knowledgePreviewArea')).toContainText('Editorial answer preview');
 await page.getByRole('button',{name:'Save draft'}).click();
 await expect(page.locator('#knowledgeDraftList')).toContainText('Draft #42');
 expect(calls.filter(c=>c.path.endsWith('/nex-knowledge-drafts')&&c.method==='POST')).toHaveLength(2);
 expect(calls.some(c=>c.method==='PATCH'&&c.path.endsWith('/nex-knowledge-drafts'))).toBe(false);
});

test('signed-out visitors are redirected instead of seeing admin content',async({page})=>{
 await mount(page,{authenticated:false});
 await page.goto('/nex-insights.html');
 await expect(page).toHaveURL(/\/livecare\.html\?login=1/);
});

test('dispatcher is denied the admin dashboard regardless of frontend data requests',async({page})=>{
 await mount(page,{role:'DISPATCHER'});
 await page.goto('/nex-insights.html');
 await expect(page.getByRole('heading',{name:'Authorization required'})).toBeVisible();
 await expect(page.getByText('account does not have permission',{exact:false})).toBeVisible();
 await expect(page.getByText('Questions analyzed')).toHaveCount(0);
});
