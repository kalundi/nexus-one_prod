const {test,expect}=require('@playwright/test');
const BLOCKED='22222222-2222-4222-8222-222222222222',ORPHAN='33333333-3333-4333-8333-333333333333';
for(const width of [1280,390])test(`administrator manages actor lifecycle at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:1000});
 await page.addInitScript(()=>sessionStorage.setItem('nexusAccessToken','fixture'));
 const state={[BLOCKED]:{active:true,removed:false},[ORPHAN]:{active:true,removed:false}};
 const names={[BLOCKED]:'Blocked Fixture',[ORPHAN]:'Orphan Fixture'};
 const detail=id=>{
  const base={actor:{id,kind:'PERSON',display_name:names[id],active:state[id].active},classifications:[{category:'CONTACT',subtype:'NURSE',source:'MANUAL'}]};
  if(id===BLOCKED)return {...base,relationships:[{subject_name:'Blocked Fixture',relationship:'CONTACT_FOR',object_name:'Facility A'},{subject_name:'Facility A',relationship:'SERVES',object_name:'Blocked Fixture'}],records:[{source:'USER',record_id:'user-1'}],management:{relationshipCount:2,sources:[{source:'USER',record_id:'user-1',name:'Blocked Fixture'}],canRemove:false,blockers:['This actor has 2 relationships recorded, so it cannot be removed. Deactivate it instead.','This actor is kept in step with a live user account, so it would be created again if it were removed. Deactivate it instead.']}};
  return {...base,relationships:[],records:[],management:{relationshipCount:0,sources:[],canRemove:true,blockers:[]}};
 };
 await page.route('https://**',r=>r.abort());
 await page.route('**/api/**',route=>{
  const url=new URL(route.request().url()),path=url.pathname,method=route.request().method();let json={},status=200;
  if(path==='/api/auth/me')json={user:{role:'ADMIN',email:'admin@example.com'}};
  else if(path==='/api/admin/actors/types')json={types:[{category:'CONTACT',subtype:'NURSE',kind:'PERSON'},{category:'CONTACT',subtype:'SCHEDULER',kind:'PERSON'},{category:'FACILITY',subtype:'HOSPITAL',kind:'ENTITY'}],relationships:{CONTACT_FOR:['CONTACT',['FACILITY','ORGANIZATION']]}};
  else if(path==='/api/admin/actors'&&method==='GET'){
   const q=(url.searchParams.get('q')||'').toLowerCase(),statusFilter=url.searchParams.get('status')||'active';
   json={actors:Object.keys(names).filter(id=>!state[id].removed&&names[id].toLowerCase().includes(q)&&(statusFilter==='all'||state[id].active===(statusFilter==='active'))).map(id=>({id,display_name:names[id],active:state[id].active,classifications:[{category:'CONTACT',subtype:'NURSE'}]})),hasMore:false};
  }
  else if(path.startsWith('/api/admin/actors/')){
   const parts=path.split('/'),id=parts[4],action=parts[5];
   if(state[id]?.removed){status=404;json={error:'Actor not found.'};}
   else if(method==='GET')json=detail(id);
   else if(action==='deactivate'){state[id].active=false;json={actor:{id,active:false},changed:true};}
   else if(action==='reactivate'){state[id].active=true;json={actor:{id,active:true},changed:true};}
   else if(action==='remove'){state[id].removed=true;json={removed:true,actor:{id,display_name:names[id]}};}
   else json={};
  }
  return route.fulfill({status,json});
 });
 await page.goto('/enterprise.html');await expect(page.locator('#workspace')).toBeVisible();
 await expect(page.locator('#actorList')).toContainText('Blocked Fixture');
 await expect(page.locator('#actorList')).toContainText('Orphan Fixture');
 await page.locator('#actorList button',{hasText:'Blocked Fixture'}).click();
 await expect(page.locator('#details h2')).toHaveText('Blocked Fixture');
 await expect(page.locator('#details')).toContainText('Manage this actor');
 await expect(page.locator('#details')).toContainText('This actor has 2 relationships recorded.');
 await expect(page.locator('#details')).toContainText('It is kept in step with User account.');
 const removeButton=page.getByRole('button',{name:'Remove actor permanently'});
 await expect(removeButton).toBeDisabled();
 await expect(page.locator('#removeReason')).toContainText('cannot be removed. Deactivate it instead.');
 await page.getByRole('button',{name:'Deactivate actor'}).click();
 await expect(page.locator('.confirmBox')).toContainText('Deactivate Blocked Fixture?');
 await page.locator('.confirmBox').getByRole('button',{name:'Deactivate',exact:true}).click();
 await expect(page.locator('#details')).toContainText('Person · Inactive');
 await expect(page.getByRole('button',{name:'Reactivate actor'})).toBeVisible();
 await expect(page.locator('#actorList')).not.toContainText('Blocked Fixture');
 await page.locator('#status').selectOption('inactive');
 await expect(page.locator('#actorList')).toContainText('Blocked Fixture');
 await expect(page.locator('#actorList')).toContainText('Inactive');
 await page.locator('#actorList button',{hasText:'Blocked Fixture'}).click();
 await page.getByRole('button',{name:'Reactivate actor'}).click();
 await expect(page.locator('.confirmBox')).toContainText('Reactivate Blocked Fixture?');
 await page.locator('.confirmBox').getByRole('button',{name:'Reactivate',exact:true}).click();
 await expect(page.locator('#details')).toContainText('Person · Active');
 await page.locator('#status').selectOption('active');
 await page.locator('#actorList button',{hasText:'Orphan Fixture'}).click();
 await expect(page.locator('#details h2')).toHaveText('Orphan Fixture');
 await expect(page.getByRole('button',{name:'Remove actor permanently'})).toBeEnabled();
 await page.getByRole('button',{name:'Remove actor permanently'}).click();
 await expect(page.locator('.confirmBox')).toContainText('Permanently remove Orphan Fixture?');
 await page.locator('.confirmBox').getByRole('button',{name:'Permanently remove'}).click();
 await expect(page.locator('#notice')).toContainText('Removed Orphan Fixture.');
 await expect(page.locator('#actorList')).not.toContainText('Orphan Fixture');
 const overflow=await page.evaluate(()=>[...document.querySelectorAll('body *')].filter(e=>e.getBoundingClientRect().right>innerWidth+1).map(e=>({tag:e.tagName,class:e.className,width:e.getBoundingClientRect().width})));expect(overflow).toEqual([]);
 await page.screenshot({path:`output/enterprise-directory-manage-${width}.png`,fullPage:true});
});
