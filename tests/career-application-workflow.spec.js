const { test, expect } = require('@playwright/test');

test('submit application explains incomplete required fields', async ({ page }) => {
  await page.goto('/career-application.html');
  await page.getByRole('button', { name: 'Submit application' }).click();
  await expect(page.locator('#careerApplicationStatus')).toContainText('Please complete the required fields');
  await expect(page.locator('[name="first-name"]')).toBeFocused();
  await expect(page.locator('[name="first-name"]')).toHaveAttribute('aria-invalid', 'true');
});

test('applicant submits to the Nexus careers API and receives a reference', async ({ page }) => {
  let submitted;
  await page.route('**/api/careers/applications', async route => {
    submitted = route.request().postDataJSON();
    await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ received: true, applicationId: 'APP-1001' }) });
  });
  await page.goto('/career-application.html');
  await page.locator('[name="first-name"]').fill('Jordan');
  await page.locator('[name="last-name"]').fill('Lee');
  await page.locator('[name="email"]').fill('jordan@example.com');
  await page.locator('[name="phone"]').fill('+1 202 555 0144');
  await page.locator('[name="city"]').fill('Rockville');
  await page.locator('[name="state"]').selectOption({ label: 'Maryland' });
  await page.locator('[name="position"]').selectOption('driver');
  await page.locator('[name="employment-preference"]').selectOption({ label: 'Full-time' });
  await page.locator('[name="authorized-to-work"]').check();
  await page.locator('[name="experience-years"]').selectOption({ index: 2 });
  await page.locator('[name="interest"]').fill('I want to help patients reach essential care safely.');
  await page.locator('[name="certification"]').check();
  await page.getByRole('button', { name: 'Submit application' }).click();
  await expect(page.locator('#careerApplicationStatus')).toContainText('APP-1001');
  expect(submitted.firstName).toBe('Jordan');
  expect(submitted.authorizedToWork).toBe(true);
  expect(submitted.certification).toBe(true);
});

test('administrator reviews an applicant and sends a tracked email response', async ({ page }) => {
  const application = { id: 'app-1', first_name: 'Jordan', last_name: 'Lee', email: 'jordan@example.com', phone: '+12025550144', city: 'Rockville', state: 'Maryland', position: 'driver', employment_preference: 'Full-time', experience_years: '1–2 years', interest: 'Patient service matters.', status: 'NEW', created_at: '2026-08-24T12:00:00Z', resume_name: 'jordan-resume.pdf' };
  let reviewPayload, responsePayload;
  await page.addInitScript(() => { sessionStorage.setItem('nexusAccessToken', 'admin-token'); sessionStorage.setItem('nexusUser', JSON.stringify({ id: 'admin-1', role: 'ADMIN', displayName: 'Administrator' })); });
  await page.route('**/api/auth/me', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ user: { id: 'admin-1', role: 'ADMIN', displayName: 'Administrator' } }) }));
  await page.route('**/api/admin/career-applications', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ applications: [application] }) }));
  await page.route('**/api/admin/career-applications/app-1', async route => { reviewPayload = route.request().postDataJSON(); await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ application: { ...application, status: reviewPayload.status } }) }); });
  await page.route('**/api/admin/career-applications/app-1/response', async route => { responsePayload = route.request().postDataJSON(); await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ sent: true }) }); });
  await page.goto('/admin.html', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /Career applicants/ }).click();
  await page.getByRole('button', { name: /Jordan Lee/ }).click();
  await expect(page.locator('#applicantDetail')).toContainText('jordan@example.com');
  await page.locator('#applicantReviewStatus').selectOption('INTERVIEW');
  await page.locator('#applicantInternalNotes').fill('Strong driving background.');
  await page.getByRole('button', { name: 'Save review' }).click();
  expect(reviewPayload.status).toBe('INTERVIEW');
  await page.locator('#applicantResponseMessage').fill('We would like to schedule an interview.');
  await page.getByRole('button', { name: 'Send email response' }).click();
  expect(responsePayload.message).toContain('schedule an interview');
  await expect(page.locator('#applicantActionMessage')).toContainText('Email response sent.');
});

async function openApplicant(page){
 const application={id:'app-1',first_name:'Jordan',last_name:'Lee',email:'jordan@example.com',phone:'+12025550144',city:'Rockville',state:'Maryland',position:'driver',status:'NEW',created_at:'2026-10-12T12:00:00Z'};
 await page.addInitScript(()=>{sessionStorage.setItem('nexusAccessToken','applicant-test');sessionStorage.setItem('nexusUser',JSON.stringify({id:'admin-test',role:'ADMIN',displayName:'Admin'}));});
 await page.route('**/api/**',route=>{const path=new URL(route.request().url()).pathname;let body={settings:{},users:[],requests:[],bookings:[],entries:[],vehicles:[],trips:[]};if(path==='/api/auth/me')body={user:{id:'admin-test',role:'ADMIN',displayName:'Admin'}};if(path==='/api/admin/career-applications')body={applications:[application]};if(path==='/api/admin/career-applications/app-1')body={application};return route.fulfill({status:200,json:body});});
 await page.goto('/admin.html#applicantsSection');await page.getByRole('button',{name:/Jordan Lee/}).click();await expect(page.locator('#applicantResponseMessage')).toBeVisible();
 await page.locator('#applicantResponseSubject').fill('Interview invitation');await page.locator('#applicantResponseMessage').fill('Please tell us when you are available.');
}
test('an unauthorized email connection retains the draft through review updates and allows retry',async({page})=>{
 await openApplicant(page);let calls=0;
 await page.route('**/api/admin/career-applications/app-1/response',route=>{calls++;return route.fulfill({status:calls===1?503:200,json:calls===1?{sent:false,code:'EMAIL_CONNECTION_UNAUTHORIZED',error:'Email was not sent. The Postmark connection is no longer authorized.'}:{sent:true,recordSaved:true}});});
 await page.getByRole('button',{name:'Send email response',exact:true}).click();await expect(page.locator('#applicantActionMessage')).toContainText('no longer authorized');await expect(page.locator('#applicantActionMessage')).toContainText('Your draft is retained');await expect(page.locator('#applicantResponseSubject')).toHaveValue('Interview invitation');
 await page.getByRole('button',{name:'Save review',exact:true}).click();await expect(page.locator('#applicantResponseMessage')).toHaveValue('Please tell us when you are available.');
 await page.getByRole('button',{name:'Send email response',exact:true}).click();await expect(page.locator('#applicantActionMessage')).toContainText('Email response sent.');await expect(page.locator('#applicantResponseMessage')).toHaveValue('');expect(calls).toBe(2);
});
test('an in-flight response blocks repeated clicks and preserves the message after failure',async({page})=>{
 await openApplicant(page);let calls=0,release;const waiting=new Promise(resolve=>release=resolve);
 await page.route('**/api/admin/career-applications/app-1/response',async route=>{calls++;await waiting;return route.fulfill({status:503,json:{sent:false,error:'Email was not sent. The Postmark connection is no longer authorized.'}});});
 const button=page.locator('#sendApplicantResponse');await button.click();await expect(button).toBeDisabled();await expect(page.locator('#applicantResponseMessage')).toHaveAttribute('readonly','');
 await button.evaluate(el=>el.dispatchEvent(new MouseEvent('click',{bubbles:true})));expect(calls).toBe(1);release();
 await expect(button).toBeEnabled();await expect(page.locator('#applicantResponseMessage')).toHaveValue('Please tell us when you are available.');expect(calls).toBe(1);
});
test('a transport failure keeps the draft and does not claim that email was sent',async({page})=>{
 await openApplicant(page);await page.route('**/api/admin/career-applications/app-1/response',route=>route.abort());
 await page.getByRole('button',{name:'Send email response',exact:true}).click();await expect(page.locator('#applicantActionMessage')).toContainText('Sending could not be confirmed');await expect(page.locator('#applicantResponseMessage')).toHaveValue('Please tell us when you are available.');await expect(page.locator('#sendApplicantResponse')).toBeEnabled();
});
test('an accepted email with a recording warning remains sent and clears the draft',async({page})=>{
 await openApplicant(page);let calls=0;await page.route('**/api/admin/career-applications/app-1/response',route=>{calls++;return route.fulfill({status:200,json:{sent:true,recordSaved:false,warning:'Email was sent, but its response record could not be saved. Do not resend this message.'}});});
 await page.getByRole('button',{name:'Send email response',exact:true}).click();await expect(page.locator('#applicantActionMessage')).toContainText('Do not resend');await expect(page.locator('#applicantResponseMessage')).toHaveValue('');await page.getByRole('button',{name:'Send email response',exact:true}).click();expect(calls).toBe(1);
});

test('DriveFlex applicant submits referral, availability and vehicle preferences', async ({page}) => {
 let submitted;
 await page.route('**/api/careers/applications', async route => {
  submitted=route.request().postDataJSON();
  await route.fulfill({status:201,contentType:'application/json',body:JSON.stringify({received:true,applicationId:'DF-100'})});
 });
 await page.goto('/career-application.html?position=driveflex-driver');
 await expect(page.locator('#driveflexFields')).toBeVisible();
 await page.locator('[name="first-name"]').fill('Casey');
 await page.locator('[name="last-name"]').fill('Taylor');
 await page.locator('[name="email"]').fill('casey@example.com');
 await page.locator('[name="phone"]').fill('3015550100');
 await page.locator('[name="city"]').fill('Clarksburg');
 await page.locator('[name="state"]').selectOption({label:'Maryland'});
 await page.locator('[name="employment-preference"]').selectOption({label:'Part-time'});
 await page.locator('[name="authorized-to-work"]').check();
 await page.locator('[name="experience-years"]').selectOption({index:2});
 await page.locator('[name="driveflex-vehicle"]').selectOption('nexus-fleet');
 await page.locator('[name="driveflex-service"]').selectOption('wheelchair');
 await page.locator('[name="driveflex-area"]').selectOption('montgomery');
 await page.locator('[name="driveflex-referral"]').fill('NEXUS-123');
 await page.locator('[name="interest"]').fill('Flexible patient transportation');
 await page.locator('[name="certification"]').check();
 await page.getByRole('button',{name:'Submit application'}).click();
 await expect(page.locator('#careerApplicationStatus')).toContainText('DF-100');
 expect(submitted.position).toBe('driveflex-driver');
 expect(submitted.driveflex.referralCode).toBe('NEXUS-123');
 expect(submitted.driveflex.preferredArea).toBe('montgomery');
});

test('DriveFlex carrier intake requires carrier business name', async ({page}) => {
 await page.goto('/career-application.html?position=driveflex-carrier');
 await expect(page.locator('#driveflexFields')).toBeVisible();
 await expect(page.locator('[name="driveflex-carrier-name"]')).toHaveAttribute('required','');
 await page.locator('#position').selectOption('driver');
 await expect(page.locator('#driveflexFields')).toBeHidden();
 await expect(page.locator('[name="driveflex-carrier-name"]')).not.toHaveAttribute('required','');
});
