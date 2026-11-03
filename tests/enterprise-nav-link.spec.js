const {test,expect}=require('@playwright/test');
async function session(page,{roles=['ADMIN'],role='ADMIN'}={}){
 await page.addInitScript(()=>sessionStorage.setItem('nexusAccessToken','enterprise-nav-test-token'));
 await page.route('**/*',async route=>{
  const url=new URL(route.request().url());
  if(url.hostname!=='127.0.0.1'&&url.hostname!=='localhost')return route.abort();
  if(!url.pathname.startsWith('/api/'))return route.continue();
  const user={id:'enterprise-nav-test-user',email:'enterprise-nav@example.test',displayName:'Test Administrator',role,roles,scopeId:null};
  let body={trips:[],bookings:[],vehicles:[],assignments:[],documents:[],materials:[],patients:[],plans:[],preferences:{},settings:{},pricing:{}};
  if(url.pathname==='/api/auth/me')body={user};
  if(url.pathname==='/api/auth/switch-role'){
   const next=route.request().postDataJSON().role;
   if(!roles.includes(next))return route.fulfill({status:403,json:{error:'That role is not approved for this account'}});
   body={user:{...user,role:next}};
  }
  return route.fulfill({status:200,json:body});
 });
}
test('administrator account menu links to the Enterprise Directory',async({page})=>{
 await session(page);await page.goto('/dispatch.html');
 await page.locator('#nexusAccountMount>.nexusAccountButton').click();
 const link=page.locator('#nexusAccountMount .nexusAccountMenu a[href="/enterprise.html"]');
 await expect(link).toHaveCount(1);
 await expect(link).toHaveText('Enterprise Directory');
});
test('non-administrator account menu has no Enterprise Directory link',async({page})=>{
 await session(page,{roles:['DISPATCHER'],role:'DISPATCHER'});await page.goto('/dispatch.html');
 await page.locator('#nexusAccountMount>.nexusAccountButton').click();
 await expect(page.locator('#nexusAccountMount .nexusAccountMenu')).toBeVisible();
 await expect(page.locator('#nexusAccountMount .nexusAccountMenu a[href="/enterprise.html"]')).toHaveCount(0);
});
test('admin app launcher lists the Enterprise Directory tile',async({page})=>{
 await session(page);await page.goto('/apps.html');
 const tile=page.locator('#appGrid a[href="/enterprise.html"]');
 await expect(tile).toHaveCount(1);
 await expect(tile.locator('strong')).toHaveText('Enterprise Directory');
 await expect(tile.locator('span')).toHaveText('People, facilities, organizations, and business relationships');
});
