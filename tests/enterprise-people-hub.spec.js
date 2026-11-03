const {test,expect}=require('@playwright/test');
const LINKED='11111111-1111-4111-8111-111111111111',UNLINKED='22222222-2222-4222-8222-222222222222';
const NAMES={[LINKED]:'Linked Driver',[UNLINKED]:'Directory Only Person'};

async function install(page,{meRole='ADMIN'}={}){
 await page.addInitScript(()=>sessionStorage.setItem('nexusAccessToken','fixture'));
 const captured={patched:[],created:[],decided:[],resent:0};
 const user={id:'user-1',userCode:'N1001',email:'driver@example.com',name:'Linked Driver',phone:'+12405550111',role:'DRIVER',accessRole:'DRIVER',scopeId:'driver-scope-0',demoOnly:false,loginUrl:'',functions:[],roles:['DRIVER','PATIENT'],active:true,employeeActive:true,createdAt:'2026-10-01T12:00:00.000Z'};
 const requests=[
  {id:'req-1',userId:'user-9',email:'hopeful@example.com',name:'Hopeful Driver',phone:'',role:'DRIVER',status:'PENDING',scopeId:null,requestedAt:'2026-11-01T10:00:00.000Z',reviewedAt:null},
  {id:'req-2',userId:'user-8',email:'manager@example.com',name:'Hopeful Manager',phone:'',role:'FACILITY',status:'PENDING',scopeId:null,requestedAt:'2026-11-01T11:00:00.000Z',reviewedAt:null},
  {id:'req-3',userId:'user-7',email:'biller@example.com',name:'Hopeful Biller',phone:'',role:'BILLING',status:'PENDING',scopeId:null,requestedAt:'2026-11-01T12:00:00.000Z',reviewedAt:null}
 ];
 const detail=id=>({actor:{id,kind:'PERSON',display_name:NAMES[id],active:true},classifications:[{category:'EMPLOYEE',subtype:'DRIVER',source:'USER'}],relationships:[],records:id===LINKED?[{source:'USER',record_id:'user-1'}]:[],management:{relationshipCount:0,sources:id===LINKED?[{source:'USER',record_id:'user-1',name:'Linked Driver'}]:[],canRemove:id!==LINKED,blockers:id===LINKED?['This actor is kept in step with a live user account, so it would be created again if it were removed. Deactivate it instead.']:[]}});
 await page.route('https://**',r=>r.abort());
 await page.route('**/api/**',route=>{
  const url=new URL(route.request().url()),path=url.pathname,method=route.request().method();
  const body=method==='GET'?null:JSON.parse(route.request().postData()||'{}');
  let json={},status=200;
  if(path==='/api/auth/me')json={user:{id:'admin-1',role:meRole,email:'admin@example.com',roles:[meRole]}};
  else if(path==='/api/admin/actors/types')json={types:[{category:'EMPLOYEE',subtype:'DRIVER',kind:'PERSON'}],relationships:{}};
  else if(path==='/api/admin/actors'&&method==='GET')json={actors:[LINKED,UNLINKED].map(id=>({id,display_name:NAMES[id],active:true,classifications:[{category:'EMPLOYEE',subtype:'DRIVER'}]})),hasMore:false};
  else if(path.startsWith('/api/admin/actors/'))json=detail(path.split('/')[4]);
  else if(path==='/api/admin/users'&&method==='GET')json={users:[user],functions:{}};
  else if(path==='/api/admin/users'&&method==='POST'){captured.created.push(body);json={user:{id:'user-2',email:body.email,userCode:'N2002',facilityName:body.role==='FACILITY'?'Care Facility A':null},tempPassword:'Temp-1234',tempPasswordExpiresAt:new Date(Date.now()+2*60*60*1000).toISOString(),emailDeliveryStatus:'sent'};status=201;}
  else if(path==='/api/admin/users/user-1/resend-credentials'){captured.resent++;json={emailDeliveryStatus:'sent'};}
  else if(path==='/api/admin/users/user-1'&&method==='PATCH'){captured.patched.push(body);if(body.role){user.role=body.role;user.accessRole=body.role;}if(body.active!==undefined)user.active=body.active;if(body.scopeId!==undefined)user.scopeId=body.scopeId;json={user};}
  else if(path==='/api/admin/role-requests'&&method==='GET')json={requests};
  else if(path.startsWith('/api/admin/role-requests/')){const id=path.split('/')[4];captured.decided.push({id,body});const found=requests.find(r=>r.id===id);if(found)found.status=body.decision;json={request:found};}
  else if(path==='/api/facilities')json={facilities:[{facility_code:'FC-A',name:'Care Facility A',address:'100 Facility Lane',active:true}]};
  return route.fulfill({status,json});
 });
 return captured;
}

test('account section manages the linked account: role, access, credentials',async({page})=>{
 const captured=await install(page);
 await page.goto('/enterprise.html');await expect(page.locator('#workspace')).toBeVisible();
 await page.locator('#actorList button',{hasText:'Linked Driver'}).click();
 const section=page.locator('#accountSection');
 await expect(section).toBeVisible();
 await expect(section).toContainText('driver@example.com');
 await expect(section).toContainText('N1001');
 await expect(section).toContainText('Active');
 await section.locator('select').first().selectOption('BILLING');
 await section.getByRole('button',{name:'Save role'}).click();
 await expect.poll(()=>captured.patched.length).toBe(1);
 expect(captured.patched[0]).toEqual({role:'BILLING'});
 await expect(section).toContainText('Billing');
 await section.getByRole('button',{name:'Deactivate account access'}).click();
 await expect(section.locator('.confirmBox')).toContainText('closes only the sign-in account');
 await section.locator('.confirmBox').getByRole('button',{name:'Deactivate account access'}).click();
 await expect.poll(()=>captured.patched.length).toBe(2);
 expect(captured.patched[1]).toEqual({active:false});
 await expect(section).toContainText('Inactive — this person cannot sign in');
 await expect(section.getByRole('button',{name:'Deactivate actor'})).toHaveCount(0);
 await section.getByRole('button',{name:'Resend temporary password'}).click();
 await section.locator('.confirmBox').getByRole('button',{name:'Resend temporary password'}).click();
 await expect.poll(()=>captured.resent).toBe(1);
 await expect(section).toContainText('Temporary login emailed. It expires in two hours.');
});

test('create account from an unlinked actor posts the existing create shape and shows the password once',async({page})=>{
 const captured=await install(page);
 await page.goto('/enterprise.html');await expect(page.locator('#workspace')).toBeVisible();
 await page.locator('#actorList button',{hasText:'Directory Only Person'}).click();
 const section=page.locator('#accountSection');
 await expect(section).toContainText('No sign-in account is linked to this directory entry.');
 await section.getByRole('button',{name:'Create account'}).click();
 await expect(page.locator('#userDialog')).toBeVisible();
 await expect(page.locator('#userForm input[name="name"]')).toHaveValue('Directory Only Person');
 await page.locator('#userForm input[name="email"]').fill('new@example.com');
 await page.locator('#userForm input[name="phone"]').fill('+12405550199');
 await page.locator('#userRole').selectOption('DRIVER');
 await page.getByRole('button',{name:'Create user'}).click();
 await expect.poll(()=>captured.created.length).toBe(1);
 expect(captured.created[0]).toEqual({email:'new@example.com',phone:'+1 (240) 555-0199',name:'Directory Only Person',role:'DRIVER'});
 await expect(section.locator('.accountMsg')).toContainText('User new@example.com created. Nexus ID: N2002.');
 await expect(section.locator('.accountMsg')).toContainText('Temporary password: Temp-1234.');
 await expect(section.locator('.accountMsg')).toContainText('User must change it on first sign-in.');
 await page.locator('#actorList button',{hasText:'Linked Driver'}).click();
 await page.locator('#actorList button',{hasText:'Directory Only Person'}).click();
 await expect(page.locator('#details')).not.toContainText('Temp-1234');
});

test('access requests approve and reject with the required scopes',async({page})=>{
 const captured=await install(page);
 await page.goto('/enterprise.html');await expect(page.locator('#workspace')).toBeVisible();
 await expect(page.locator('#hubRequests')).toContainText('(3 pending)');
 await page.locator('#hubRequests').click();
 const driverRow=page.locator('#requestRows tr',{hasText:'Hopeful Driver'});
 await expect(driverRow).toBeVisible();
 await driverRow.locator('input').fill('driver-scope-9');
 await driverRow.getByRole('button',{name:'Approve'}).click();
 await expect.poll(()=>captured.decided.length).toBe(1);
 expect(captured.decided[0]).toEqual({id:'req-1',body:{decision:'APPROVED',scopeId:'driver-scope-9'}});
 await expect(page.locator('#requestsMsg')).toContainText('Role request approved.');
 const facilityRow=page.locator('#requestRows tr',{hasText:'Hopeful Manager'});
 await facilityRow.locator('select').selectOption('FC-A');
 await facilityRow.getByRole('button',{name:'Approve'}).click();
 await expect.poll(()=>captured.decided.length).toBe(2);
 expect(captured.decided[1]).toEqual({id:'req-2',body:{decision:'APPROVED',scopeId:'FC-A'}});
 const billingRow=page.locator('#requestRows tr',{hasText:'Hopeful Biller'});
 await billingRow.getByRole('button',{name:'Reject'}).click();
 await expect.poll(()=>captured.decided.length).toBe(3);
 expect(captured.decided[2]).toEqual({id:'req-3',body:{decision:'REJECTED',scopeId:''}});
});

test('add user from the hub creates a facility account with its assigned facility',async({page})=>{
 const captured=await install(page);
 await page.goto('/enterprise.html');await expect(page.locator('#workspace')).toBeVisible();
 await page.locator('#addUserBtn').click();
 await expect(page.locator('#userDialog')).toBeVisible();
 await expect(page.locator('#userDialogTitle')).toHaveText('Add user');
 await page.locator('#userForm input[name="name"]').fill('New Manager');
 await page.locator('#userForm input[name="email"]').fill('mgr2@example.com');
 await page.locator('#userForm input[name="phone"]').fill('+12405550198');
 await page.locator('#userRole').selectOption('FACILITY');
 await expect(page.locator('#userFacilityField')).toBeVisible();
 await page.locator('#userFacility').selectOption('FC-A');
 await page.getByRole('button',{name:'Create user'}).click();
 await expect.poll(()=>captured.created.length).toBe(1);
 expect(captured.created[0]).toEqual({email:'mgr2@example.com',phone:'+1 (240) 555-0198',name:'New Manager',role:'FACILITY',scopeId:'FC-A'});
 await expect(page.locator('#hubResult')).toContainText('User mgr2@example.com created. Nexus ID: N2002.');
 await expect(page.locator('#hubResult')).toContainText('Assigned facility: Care Facility A.');
});

test('non-administrators never see account controls',async({page})=>{
 await install(page,{meRole:'DISPATCHER'});
 await page.goto('/enterprise.html');
 await page.waitForTimeout(1500);
 await expect(page.locator('#accountSection')).toHaveCount(0);
 await expect(page.locator('#workspace')).toBeHidden();
});
