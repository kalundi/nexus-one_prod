const {test,expect}=require('@playwright/test');
const owner={id:'owner-1',displayName:'Caretaker',email:'carer@example.com',phone:'+12405550101',role:'PATIENT'};
const patient={id:'12345678-1234-1234-1234-123456789abc',name:'Pat Example',phone:'+12405550102',relationship:'Family',pickup:'100 Main Street',service:'WHEELCHAIR',notes:'Use side entrance'};
test('caretaker signs in, saves patient and plan, and loads patient details into booking on mobile',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 const patients=[],plans=[];
 await page.route('**/api/**',async route=>{
  const url=new URL(route.request().url()),body=route.request().postDataJSON();let data={};
  if(url.pathname==='/api/auth/login')data={token:'caretaker-test-token',user:owner};
  else if(url.pathname==='/api/auth/me')data={user:owner};
  else if(url.pathname==='/api/caretaker')data={patients,plans};
  else if(url.pathname==='/api/caretaker/patients'){expect(body.consent).toBe(true);patients.push(patient);data={patient};}
  else if(url.pathname==='/api/caretaker/plans'){expect(body.patientId).toBe(patient.id);plans.push({...body,id:'plan-1',name:patient.name,phone:patient.phone,trip_time:body.time,appointment_time:body.appointmentTime});data={plan:plans[0]};}
  else if(url.pathname==='/api/patient/preferences')data={preferences:{mobilityType:'AMBULATORY',defaultPickup:'Caretaker home'}};
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
 });
 await page.goto('/caretaker.html');
 await expect(page.locator('#workspace')).toBeHidden();
 await page.locator('#loginForm [name=email]').fill(owner.email);await page.locator('#loginForm [name=password]').fill('example-password');await page.locator('#loginForm button').click();
 await expect(page.locator('#workspace')).toBeVisible();
 await page.getByText('Add a patient',{exact:true}).click();
 for(const key of ['name','phone','relationship','pickup','notes'])await page.locator(`#patientForm [name=${key}]`).fill(patient[key]);
 await page.locator('#patientForm [name=service]').selectOption('WHEELCHAIR');await page.locator('#patientForm [name=consent]').check();await page.getByRole('button',{name:'Save patient',exact:true}).click();
 await expect(page.locator('#patients')).toContainText(patient.name);
 await expect(page.locator('#planForm [name=pickup]')).toHaveValue(patient.pickup);
 for(const [key,value] of Object.entries({destination:'200 Clinic Road',date:'2099-12-01',time:'09:00',appointmentTime:'10:00'}))await page.locator(`#planForm [name=${key}]`).fill(value);
 await page.getByRole('button',{name:'Save plan',exact:true}).click();await expect(page.locator('#plans')).toContainText('Not booked');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.getByRole('button',{name:'Continue to booking'}).click();
 await expect(page.locator('#name')).toHaveValue(patient.name);await expect(page.locator('#pickup')).toHaveValue(patient.pickup);await expect(page.locator('#destination')).toHaveValue('200 Clinic Road');
 await expect(page.locator('#tripDate')).toHaveValue('2099-12-01');await expect(page.locator('#tripTime')).toHaveValue(/^\d{2}:\d{2}$/);await expect(page.getByText(/Caretaker plan loaded/)).toContainText('Planned pickup: 09:00');await expect(page.locator('#appointmentTime')).toHaveValue('10:00');await expect(page.locator('#service')).toHaveValue('wheelchair');
 await expect(page.locator('#notes')).toHaveValue(patient.notes);
});
test('expired session clears private workspace',async({page})=>{
 await page.addInitScript(()=>sessionStorage.setItem('nexusAccessToken','expired'));
 await page.route('**/api/auth/me',route=>route.fulfill({status:401,contentType:'application/json',body:JSON.stringify({error:'Session expired'})}));
 await page.goto('/caretaker.html');await expect(page.locator('#message')).toContainText('Session expired');await expect(page.locator('#workspace')).toBeHidden();expect(await page.evaluate(()=>sessionStorage.getItem('nexusAccessToken'))).toBeNull();
});
