const {test,expect}=require('@playwright/test');
const assignment={id:'22222222-2222-4222-8222-222222222222',title:'Exposure Control',description:'Read the policy before acknowledging.',kind:'POLICY',version:'2026.1',cycle:'Onboarding',due_at:'2026-10-01T23:59:59Z',status:'ASSIGNED'};
async function mock(page,role='DRIVER'){
 const rows=[{...assignment}],user={id:'11111111-1111-4111-8111-111111111111',role,displayName:'Training User',email:'training@example.test'};
 await page.addInitScript(()=>sessionStorage.setItem('nexusAccessToken','test-session'));
 await page.route('**/api/**',async route=>{const path=new URL(route.request().url()).pathname;let data={};
  if(path==='/api/auth/me')data={user};
  else if(path==='/api/training')data={assignments:rows,isAdmin:role==='ADMIN',acknowledgment:'I confirm I have read the policy and understand my responsibilities.'};
  else if(path.endsWith('/open'))data={resourceUrl:'https://example.test/policy'};
  else if(path.endsWith('/acknowledge')){const body=route.request().postDataJSON();expect(body.accepted).toBe(true);expect(body.name).toBe('Training User');rows[0].acknowledged_name=body.name;rows[0].acknowledged_at=new Date().toISOString();rows[0].status='COMPLETE';data={acknowledgment:{id:assignment.id}};}
  else if(path.endsWith('/admin/materials'))data={materials:[{id:assignment.id,title:'Exposure Control',version:'2026.1'}]};
  else if(path.endsWith('/admin/staff'))data={staff:[{id:user.id,display_name:'Training User',role:'DRIVER'}]};
  else if(path.endsWith('/admin/report'))data={records:[]};
  else if(path.endsWith('/admin/contract'))data={catalog:{sources:{},optionalLinks:[]},subjects:[],checks:[],history:[]};
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
 });return rows;
}
test('driver can review and explicitly acknowledge, with no admin controls on mobile',async({page})=>{
 await page.setViewportSize({width:390,height:844});await mock(page);await page.goto('/training.html');
 await expect(page.getByRole('heading',{name:'My assignments'})).toBeVisible();await expect(page.locator('#administration')).toBeHidden();
 await page.getByRole('button',{name:'Open assignment'}).click();await expect(page.getByRole('link',{name:/Open assigned reading/})).toBeVisible();
 await page.locator('#ackForm [name=name]').fill('Training User');await page.locator('#ackForm [name=accepted]').check();await page.getByRole('button',{name:'Record acknowledgment'}).click();
 await expect(page.locator('#recorded')).toContainText('recorded');await page.getByRole('button',{name:'Close material'}).click();await expect(page.locator('#assignmentList')).toContainText('complete');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:'output/training-mobile.png',fullPage:true});
});
test('admin sees profile-based contract checklist and no false readiness with empty profiles',async({page})=>{
 await mock(page,'ADMIN');await page.goto('/training.html');await expect(page.getByRole('heading',{name:'Manage staff training'})).toBeVisible();
 await expect(page.locator('#contractWorkspace')).toBeVisible();await expect(page.locator('#contractMessage')).toContainText('No readiness conclusion');
 await page.getByText('Add a company, driver, attendant or vehicle profile',{exact:true}).click();
 await expect(page.locator('#subjectForm [name=scope]')).toBeVisible();await expect(page.locator('#subjectForm [name=levels]')).toHaveCount(4);
 await page.screenshot({path:'output/training-admin.png',fullPage:true});
});
test('patient cannot enter the staff training portal',async({page})=>{
 await mock(page,'PATIENT');await page.goto('/training.html');await expect(page.getByRole('heading',{name:'Authorization required'})).toBeVisible();await expect(page.locator('#workspace')).toHaveCount(0);
});
test('failed acknowledgment leaves material uncompleted and shows error',async({page})=>{
 await mock(page);await page.route('**/api/training/assignments/*/acknowledge',route=>route.fulfill({status:500,contentType:'application/json',body:JSON.stringify({error:'Unable to save acknowledgment'})}));
 await page.goto('/training.html');await page.getByRole('button',{name:'Open assignment'}).click();await page.locator('#ackForm [name=name]').fill('Training User');await page.locator('#ackForm [name=accepted]').check();await page.getByRole('button',{name:'Record acknowledgment'}).click();
 await expect(page.locator('#ackForm .formStatus')).toContainText('Unable to save');await expect(page.locator('#ackForm')).toBeVisible();await expect(page.locator('#assignmentList')).not.toContainText('Acknowledged');
});
