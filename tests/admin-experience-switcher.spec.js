const {test,expect}=require('@playwright/test');
const destinations={ADMIN:'/admin.html',DISPATCHER:'/dispatch.html',DRIVER:'/driver-app.html',FACILITY:'/facility.html',BILLING:'/billing.html',QA:'/qa.html',EXECUTIVE:'/executive.html',PATIENT:'/patient.html',CARETAKER:'/caretaker.html',STAFF:'/training.html'};
async function session(page,{roles=Object.keys(destinations),role='ADMIN',failSwitch=false}={}){
 let current=role,fail=failSwitch;
 await page.addInitScript(()=>sessionStorage.setItem('nexusAccessToken','experience-test-token'));
 await page.route('**/*',async route=>{
  const url=new URL(route.request().url());
  if(url.hostname!=='127.0.0.1'&&url.hostname!=='localhost')return route.abort();
  if(!url.pathname.startsWith('/api/'))return route.continue();
  const user=()=>({id:'experience-test-user',email:'experience@example.test',displayName:'Test Administrator',role:current,roles,scopeId:null});
  let body={trips:[],bookings:[],vehicles:[],assignments:[],documents:[],materials:[],patients:[],plans:[],preferences:{},settings:{},pricing:{}};
  if(url.pathname==='/api/auth/me')body={user:user()};
  if(url.pathname==='/api/auth/switch-role'){
   if(fail){fail=false;return route.abort();}
   const next=route.request().postDataJSON().role;
   if(!roles.includes(next))return route.fulfill({status:403,json:{error:'That role is not approved for this account'}});
   current=next;body={user:user()};
  }
  return route.fulfill({status:200,json:body});
 });
 return ()=>current;
}
const menuButton=page=>page.locator('#nexusAccountMount>.nexusAccountButton');
test('admin account menu displays all ten experiences and closes with Escape or an outside click',async({page})=>{
 await session(page);await page.goto('/dispatch.html');await menuButton(page).click();
 const menu=page.locator('#nexusAccountMount .nexusAccountMenu');
 await expect(menu.locator('[data-nexus-experience-role]')).toHaveCount(10);
 await expect(menu.getByRole('button',{name:'Admin (current)',exact:true})).toBeDisabled();
 await expect(menu.getByRole('button',{name:'Quality assurance',exact:true})).toBeVisible();
 await page.keyboard.press('Escape');await expect(menu).toBeHidden();await expect(menuButton(page)).toBeFocused();
 await menuButton(page).click();await page.locator('body').click({position:{x:10,y:200}});await expect(menu).toBeHidden();
});
for(const [role,path] of Object.entries(destinations).filter(([role])=>role!=='ADMIN'))test(`admin switches to ${role} and can return to Admin`,async({page})=>{
 await session(page);await page.goto('/dispatch.html');await menuButton(page).click();
 await page.locator(`#nexusAccountMount [data-nexus-experience-role="${role}"]`).click();
 await expect(page).toHaveURL(new RegExp(path.replace('.','\\.')+'$'));
 const native=['PATIENT','DRIVER','STAFF','CARETAKER'].includes(role);
 const account=native?page.locator('#nexusNativeExperienceMount>button'):menuButton(page);
 await account.click();
 const mount=page.locator(native?'#nexusNativeExperienceMount':'#nexusAccountMount');
 await expect(mount.locator('[data-nexus-experience-role]')).toHaveCount(10);
 await expect(mount.locator(`[data-nexus-experience-role="${role}"]`)).toBeDisabled();
 await mount.locator('[data-nexus-experience-role="ADMIN"]').click();await expect(page).toHaveURL(/\/admin\.html$/);
 await expect.poll(()=>page.evaluate(()=>JSON.parse(sessionStorage.getItem('nexusUser')).role)).toBe('ADMIN');
});
test('non-admin accounts see only their approved experiences',async({page})=>{
 await session(page,{role:'DISPATCHER',roles:['DISPATCHER','PATIENT']});await page.goto('/dispatch.html');await menuButton(page).click();
 const menu=page.locator('#nexusAccountMount .nexusAccountMenu');
 await expect(menu.locator('[data-nexus-experience-role]')).toHaveCount(2);
 await expect(menu.locator('[data-nexus-experience-role="ADMIN"]')).toHaveCount(0);
});
test('a failed switch retains the current session and permits retry',async({page})=>{
 const current=await session(page,{failSwitch:true});await page.goto('/dispatch.html');await menuButton(page).click();
 const target=page.locator('#nexusAccountMount [data-nexus-experience-role="DRIVER"]');await target.click();
 await expect(page.locator('#nexusAccountMount .nexusExperienceError')).toBeVisible();
 expect(current()).toBe('ADMIN');await expect(target).toBeEnabled();await expect(page).toHaveURL(/\/dispatch\.html$/);
 await target.click();await expect(page).toHaveURL(/\/driver-app\.html$/);
});
test('the complete experience menu scrolls within a small mobile screen',async({page})=>{
 await page.setViewportSize({width:375,height:620});await session(page);await page.goto('/dispatch.html');await menuButton(page).click();
 const menu=page.locator('#nexusAccountMount .nexusAccountMenu');
 await menu.locator('[data-nexus-experience-role="STAFF"]').scrollIntoViewIfNeeded();
 const box=await menu.boundingBox();expect(box.x).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(375);expect(box.y+box.height).toBeLessThanOrEqual(620);
 expect(await menu.evaluate(node=>node.scrollHeight>node.clientHeight)).toBe(true);
 const unobstructed=await menu.locator('[data-nexus-experience-role="BILLING"]').evaluate(button=>{
  const box=button.getBoundingClientRect(),hit=document.elementFromPoint(box.right-25,box.top+box.height/2);
  const stack=[];for(let parent=button;parent;parent=parent.parentElement){const style=getComputedStyle(parent);stack.push({tag:parent.tagName,id:parent.id,className:parent.className,position:style.position,zIndex:style.zIndex});}
  return {clear:button.contains(hit),hit:hit?.outerHTML?.slice(0,300),hitZ:hit?getComputedStyle(hit).zIndex:null,stack};
 });expect(unobstructed.clear,JSON.stringify(unobstructed)).toBe(true);
 await page.screenshot({path:'output/admin-experiences-mobile.png'});
});
