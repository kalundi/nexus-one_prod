const {test,expect}=require('@playwright/test');
// Facility scoping moved with people management into the Enterprise Directory
// (enterprise-people-hub). These tests keep the original guarantee — a facility
// manager can never be created or approved without an active assigned
// facility — against the Enterprise hub that now owns the flow.
const LINKED='11111111-1111-4111-8111-111111111111';
async function install(page){
 await page.addInitScript(()=>sessionStorage.setItem('nexusAccessToken','fixture'));
 const captured={created:[],decided:[]};
 const requests=[{id:'req-2',userId:'user-8',email:'manager@example.com',name:'Hopeful Manager',phone:'',role:'FACILITY',status:'PENDING',scopeId:null,requestedAt:'2026-11-01T11:00:00.000Z',reviewedAt:null}];
 await page.route('https://**',r=>r.abort());
 await page.route('**/api/**',route=>{
  const url=new URL(route.request().url()),path=url.pathname,method=route.request().method();
  const body=method==='GET'?null:JSON.parse(route.request().postData()||'{}');
  let json={},status=200;
  if(path==='/api/auth/me')json={user:{id:'admin-1',role:'ADMIN',email:'admin@example.com',roles:['ADMIN']}};
  else if(path==='/api/admin/actors/types')json={types:[{category:'EMPLOYEE',subtype:'DRIVER',kind:'PERSON'}],relationships:{}};
  else if(path==='/api/admin/actors'&&method==='GET')json={actors:[{id:LINKED,display_name:'Linked Driver',active:true,classifications:[{category:'EMPLOYEE',subtype:'DRIVER'}]}],hasMore:false};
  else if(path.startsWith('/api/admin/actors/'))json={actor:{id:LINKED,kind:'PERSON',display_name:'Linked Driver',active:true},classifications:[],relationships:[],records:[],management:{relationshipCount:0,sources:[],canRemove:true,blockers:[]}};
  else if(path==='/api/admin/users'&&method==='GET')json={users:[],functions:{}};
  else if(path==='/api/admin/users'&&method==='POST'){captured.created.push(body);json={user:{id:'user-2',email:body.email,userCode:'N2002',facilityName:'Care Facility A'},tempPassword:'Temp-1234',tempPasswordExpiresAt:new Date(Date.now()+2*60*60*1000).toISOString(),emailDeliveryStatus:'sent'};status=201;}
  else if(path==='/api/admin/role-requests'&&method==='GET')json={requests};
  else if(path.startsWith('/api/admin/role-requests/')){captured.decided.push({id:path.split('/')[4],body});const found=requests.find(r=>r.id===path.split('/')[4]);if(found)found.status=body.decision;json={request:found};}
  else if(path==='/api/facilities')json={facilities:[{facility_code:'FC-A',name:'Care Facility A',address:'100 Facility Lane',active:true},{facility_code:'FC-X',name:'Closed facility',address:'',active:false}]};
  return route.fulfill({status,json});
 });
 return captured;
}

test('creating a facility manager in Enterprise requires selecting the assigned facility',async({page})=>{
 const captured=await install(page);
 await page.goto('/enterprise.html');await expect(page.locator('#workspace')).toBeVisible();
 await page.locator('#addUserBtn').click();
 await page.locator('#userForm input[name="name"]').fill('New Manager');
 await page.locator('#userForm input[name="email"]').fill('mgr@example.com');
 await page.locator('#userForm input[name="phone"]').fill('+12405550100');
 await page.locator('#userRole').selectOption('FACILITY');
 await expect(page.locator('#userFacilityField')).toBeVisible();
 await page.getByRole('button',{name:'Create user'}).click();
 await expect(page.locator('#userFormError')).toContainText('Select the facility');
 expect(captured.created).toHaveLength(0);
 await page.locator('#userFacility').selectOption('FC-A');
 await page.getByRole('button',{name:'Create user'}).click();
 await expect.poll(()=>captured.created.length).toBe(1);
 expect(captured.created[0].scopeId).toBe('FC-A');
 await expect(page.locator('#hubResult')).toContainText('Assigned facility: Care Facility A.');
});

test('approving a facility role request in Enterprise requires selecting the assigned facility',async({page})=>{
 const captured=await install(page);
 await page.goto('/enterprise.html');await expect(page.locator('#workspace')).toBeVisible();
 await page.locator('#hubRequests').click();
 const row=page.locator('#requestRows tr',{hasText:'Hopeful Manager'});
 await expect(row).toBeVisible();
 await row.getByRole('button',{name:'Approve'}).click();
 await expect(page.locator('#requestsMsg')).toContainText('Select the facility');
 expect(captured.decided).toHaveLength(0);
 await row.locator('select').selectOption('FC-A');
 await row.getByRole('button',{name:'Approve'}).click();
 await expect.poll(()=>captured.decided.length).toBe(1);
 expect(captured.decided[0]).toEqual({id:'req-2',body:{decision:'APPROVED',scopeId:'FC-A'}});
});
