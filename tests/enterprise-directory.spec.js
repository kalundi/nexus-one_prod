const {test,expect}=require('@playwright/test');
const ID='11111111-1111-4111-8111-111111111111';
for(const width of [1280,390])test(`administrator directory at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:1000});
 await page.addInitScript(()=>sessionStorage.setItem('nexusAccessToken','fixture'));
 let created=false,classified=false;
 await page.route('https://**',r=>r.abort());
 await page.route('**/api/**',route=>{
  const path=new URL(route.request().url()).pathname,method=route.request().method();let json={};
  if(path==='/api/auth/me')json={user:{role:'ADMIN',email:'admin@example.com'}};
  if(path==='/api/admin/actors/types')json={types:[{category:'CONTACT',subtype:'NURSE',kind:'PERSON'},{category:'CONTACT',subtype:'SCHEDULER',kind:'PERSON'},{category:'FACILITY',subtype:'HOSPITAL',kind:'ENTITY'}],relationships:{CONTACT_FOR:['CONTACT',['FACILITY','ORGANIZATION']]}};
  if(path==='/api/admin/actors'&&method==='GET')json={actors:created?[{id:ID,display_name:'Test Nurse',classifications:[{category:'CONTACT',subtype:'NURSE'}]}]:[],hasMore:false};
  if(path==='/api/admin/actors'&&method==='POST'){expect(route.request().postDataJSON()).toEqual({name:'Test Nurse',kind:'PERSON',category:'CONTACT',subtype:'NURSE'});created=true;json={actor:{id:ID}};}
  if(path==='/api/admin/actors/'+ID)json={actor:{id:ID,kind:'PERSON',display_name:'Test Nurse',active:true},classifications:[{category:'CONTACT',subtype:'NURSE',source:'MANUAL'}],relationships:[],records:[]};
  if(path.endsWith('/classifications')){classified=true;json={classification:{category:'CONTACT',subtype:'SCHEDULER'}};}
  return route.fulfill({json});
 });
 await page.goto('/enterprise.html');await expect(page.locator('#workspace')).toBeVisible();
 await page.locator('#addActor').click();await page.locator('#actorForm input[name=name]').fill('Test Nurse');await page.locator('#actorForm button[type=submit],#actorForm button:not([type])').click();
 await expect(page.locator('#details h2')).toHaveText('Test Nurse');await expect(page.locator('#details')).toContainText('Directory identity only');expect(created).toBe(true);
 await page.locator('#details form').first().locator('select').selectOption('CONTACT:SCHEDULER');await page.getByRole('button',{name:'Add classification',exact:true}).click();await expect.poll(()=>classified).toBe(true);
 const overflow=await page.evaluate(()=>[...document.querySelectorAll('body *')].filter(e=>e.getBoundingClientRect().right>innerWidth+1).map(e=>({tag:e.tagName,class:e.className,width:e.getBoundingClientRect().width})));expect(overflow).toEqual([]);
 const header=await page.locator('body>header').boundingBox(),actions=await page.locator('.globalActions').boundingBox();if(actions)expect(actions.y+actions.height).toBeLessThanOrEqual(header.y+header.height+1);
 await page.screenshot({path:`output/enterprise-directory-${width}.png`,fullPage:true});
});
