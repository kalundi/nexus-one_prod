const {test,expect}=require('@playwright/test');
async function openUsers(page,{mobile=false}={}){
 if(mobile)await page.setViewportSize({width:390,height:844});
 const user={id:'test-admin',userCode:'N4827',displayName:'Test Administrator',role:'ADMIN',email:'admin@test.test'};
 let users=[{id:'test-driver',userCode:'N1934',email:'driver@test.test',name:'Bankole Olubanji Afe',phone:'+12405550101',role:'DRIVER',roles:['DRIVER','PATIENT'],scopeId:'legacy-driver',functions:['DRIVING'],active:true,createdAt:'2026-08-09T12:00:00Z'},{id:'test-patient',userCode:'N7628',name:'Anthony Muthoka',email:'patient@test.test',phone:'+12405550102',role:'PATIENT',functions:[],active:true,createdAt:'2026-10-10T12:00:00Z'}];
 let schedules=[1,2,3,4,5].map(day=>({shift_id:`shift-${day}`,employee_id:'employee-1',user_code:'N1934',display_name:'Bankole Olubanji Afe',email:'driver@test.test',weekday_iso:day,start_time:'06:00:00',end_time:'15:00:00',effective_start_date:'2026-08-09',effective_end_date:null,active:true,account_active:true}));
 const patches=[],schedulePosts=[],toggles=[],errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(u=>{sessionStorage.setItem('nexusAccessToken','users-test');sessionStorage.setItem('nexusUser',JSON.stringify(u));localStorage.removeItem('nexusAdmin.userSection.activeModule');},user);
 await page.route('**/*',async route=>{
  const url=new URL(route.request().url());if(!['localhost','127.0.0.1'].includes(url.hostname))return route.abort();if(!url.pathname.startsWith('/api/'))return route.continue();
  const path=url.pathname,method=route.request().method();let body={settings:{},requests:[],bookings:[],entries:[],vehicles:[],trips:[]};
  if(path==='/api/auth/me')body={user};
  if(path==='/api/admin/users'&&method==='GET')body={users,functions:{DRIVING:'Driving',PATIENT_CARE:'Patient care',DISPATCH:'Dispatch'}};
  if(path.startsWith('/api/admin/users/')&&method==='PATCH'){const payload=route.request().postDataJSON();patches.push(payload);const id=path.split('/').pop();users=users.map(u=>u.id===id?{...u,...payload}:u);schedules=schedules.map(s=>({...s,account_active:users[0].active}));body={user:users.find(u=>u.id===id)};}
  if(path==='/api/admin/driver-schedule'&&method==='GET')body={schedules:schedules.filter(s=>url.searchParams.get('activeOnly')==='false'||s.active)};
  if(path==='/api/admin/driver-schedule'&&method==='POST'){
   const payload=route.request().postDataJSON();schedulePosts.push(payload);const saved=payload.weekdays.map(day=>({...schedules[0],shift_id:`saved-${schedulePosts.length}-${day}`,weekday_iso:day,start_time:payload.startTime+':00',end_time:payload.endTime+':00',effective_start_date:payload.effectiveStartDate,effective_end_date:payload.effectiveEndDate||null,active:true}));schedules=[...schedules.filter(s=>!payload.shiftIds?.includes(s.shift_id)),...saved];body={schedule:{created:saved.map(s=>({id:s.shift_id}))}};
  }
  if(path==='/api/admin/driver-schedule'&&method==='PATCH'){const payload=route.request().postDataJSON();toggles.push(payload);schedules=schedules.map(s=>payload.shiftIds.includes(s.shift_id)?{...s,active:payload.active}:s);body={ok:true};}
  return route.fulfill({status:200,json:body});
 });
 await page.goto('/admin.html#userSection');await expect(page.locator('html')).toHaveAttribute('data-auth-state','authorized');await expect(page.locator('#userSection')).toBeVisible({timeout:10000});await expect(page.locator('#userTableBody tr')).toHaveCount(2);
 return {patches,schedulePosts,toggles,errors};
}
test('directory searches by memorable ID and edits roles/functions with one save',async({page})=>{
 const f=await openUsers(page);await expect(page.locator('#userDirectoryModule')).toBeVisible();await expect(page.locator('#createUserModule')).toBeHidden();
 await page.locator('#userSearch').fill('N1934');await expect(page.locator('#userTableBody tr')).toHaveCount(1);
 await page.getByRole('button',{name:'Manage',exact:true}).click();await expect(page.locator('#userAccountIdentity')).toContainText('N1934');
 await page.locator('#editUserName').fill('Bankole Afe');await page.locator('#editUserFunctions input[value="PATIENT_CARE"]').check();await page.locator('#saveUserAccount').click();
 await expect(page.locator('#userAccountMsg')).toContainText('Account updated');expect(f.patches).toHaveLength(1);expect(f.patches[0]).toMatchObject({name:'Bankole Afe',functions:['DRIVING','PATIENT_CARE']});
 await page.locator('#toggleUserAccount').click();await expect(page.locator('#toggleUserAccount')).toHaveText('Activate account');await expect(page.locator('#userAccountIdentity')).toContainText('N1934');
 await page.locator('#closeUserAccount').click();await expect(page.locator('#userTableBody')).toContainText('Inactive');expect(f.errors).toEqual([]);
 await page.locator('#userSearch').fill('');await page.locator('#userStatusFilter').selectOption('active');await expect(page.locator('#userTableBody')).toContainText('Anthony Muthoka');await expect(page.locator('#userTableBody')).not.toContainText('Bankole Afe');
});
test('weekly schedules group weekdays and support edit, deactivate and reactivate',async({page})=>{
 const f=await openUsers(page);await page.locator('[data-user-module-open="driverSchedulePanel"]').click();
 const row=page.locator('#driverScheduleRows tr');await expect(row).toHaveCount(1);await expect(row).toContainText('Mon, Tue, Wed, Thu, Fri');await expect(row).toContainText('N1934');
 await row.getByRole('button',{name:'Edit',exact:true}).click();await expect(page.locator('#scheduleStartTime')).toHaveValue('06:00');await expect(page.locator('#scheduleDriverEmail')).toHaveValue('driver@test.test');
 await page.locator('#scheduleEndTime').fill('18:00');await page.locator('#scheduleEffectiveDate').fill('2026-10-19');await page.locator('#scheduleWeekdayGroup input[value="5"]').uncheck();await page.locator('#saveDriverScheduleBtn').click();
 await expect(page.locator('#saveDriverScheduleMsg')).toContainText('Schedule saved');expect(f.schedulePosts).toHaveLength(1);expect(f.schedulePosts[0]).toMatchObject({endTime:'18:00',effectiveStartDate:'2026-10-19',weekdays:[1,2,3,4],shiftIds:['shift-1','shift-2','shift-3','shift-4','shift-5']});
 await row.getByRole('button',{name:'Deactivate',exact:true}).click();await expect(page.locator('#saveDriverScheduleMsg')).toContainText('deactivated');await expect(page.locator('#driverScheduleRows')).toContainText('No schedules');
 await page.locator('#showInactiveSchedules').check();await expect(row).toContainText('Inactive');await row.getByRole('button',{name:'Activate',exact:true}).click();await expect(row).toContainText('Upcoming');expect(f.toggles.map(t=>t.active)).toEqual([false,true]);expect(f.errors).toEqual([]);
 await page.locator('#userSection').screenshot({path:'output/admin-user-schedules-desktop.png'});
});
test('mobile people, account editor and schedules fit the screen with readable weekdays',async({page})=>{
 const f=await openUsers(page,{mobile:true});await page.locator('#userSection').screenshot({path:'output/admin-users-mobile.png'});
 expect(await page.locator('#userDirectoryModule').evaluate(e=>e.scrollWidth<=e.clientWidth+1)).toBe(true);
 await page.locator('#userTableBody [data-manage-user="test-driver"]').click();await expect(page.locator('#userAccountDialog')).toBeVisible();
 const box=await page.locator('#userAccountDialog').boundingBox();expect(box.x).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(391);
 await page.locator('#userAccountDialog').screenshot({path:'output/admin-user-editor-mobile.png'});
 await page.locator('#userAccountSchedule').click();await expect(page.locator('#driverSchedulePanel')).toBeVisible();
 const layout=await page.locator('#driverSchedulePanel').evaluate(e=>({fits:e.scrollWidth<=e.clientWidth+1,width:e.clientWidth,scroll:e.scrollWidth,overflow:[...e.querySelectorAll('*')].filter(n=>n.getClientRects().length&&n.getBoundingClientRect().right>e.getBoundingClientRect().right+1).map(n=>({tag:n.tagName,id:n.id,cls:n.className,width:n.getBoundingClientRect().width}))}));expect(layout.fits,JSON.stringify(layout)).toBe(true);
 for(const label of await page.locator('#scheduleWeekdayGroup label').all()){expect(await label.evaluate(e=>e.scrollWidth<=e.clientWidth+1)).toBe(true);}
 await page.locator('#driverScheduleRows button[data-edit-schedule]').click();await expect(page.locator('#scheduleEffectiveDate')).toHaveValue('2026-08-09');
 await page.locator('#userSection').screenshot({path:'output/admin-user-schedules-mobile.png'});expect(f.errors).toEqual([]);
});
test('a failed account save keeps entered values and allows retry',async({page})=>{
 const f=await openUsers(page);await page.locator('#userTableBody [data-manage-user="test-driver"]').click();let fail=true;
 await page.route('**/api/admin/users/test-driver',route=>{if(fail){fail=false;return route.fulfill({status:500,json:{error:'Unable to save right now'}});}return route.fallback();});
 await page.locator('#editUserName').fill('Revised name');await page.locator('#saveUserAccount').click();await expect(page.locator('#userAccountMsg')).toContainText('Unable to save right now');await expect(page.locator('#editUserName')).toHaveValue('Revised name');await expect(page.locator('#saveUserAccount')).toBeEnabled();
 await page.locator('#saveUserAccount').click();await expect(page.locator('#userAccountMsg')).toContainText('Account updated');expect(f.patches).toHaveLength(1);
});
for(const mobile of [false,true])test(`separate weekday and weekend schedules can be added, edited and deactivated independently (${mobile?'mobile':'desktop'})`,async({page})=>{
 const f=await openUsers(page,{mobile});await page.locator('[data-user-module-open="driverSchedulePanel"]').click();
 await page.getByRole('button',{name:'Add schedule',exact:true}).click();await page.locator('#scheduleDriverEmail').selectOption('driver@test.test');
 await page.locator('#scheduleStartTime').fill('10:00');await page.locator('#scheduleEndTime').fill('16:00');await page.locator('#scheduleEffectiveDate').fill('2026-10-01');
 for(const day of [1,2,3,4,5])await page.locator(`#scheduleWeekdayGroup input[value="${day}"]`).uncheck();
 for(const day of [6,7])await page.locator(`#scheduleWeekdayGroup input[value="${day}"]`).check();
 await page.locator('#saveDriverScheduleBtn').click();await expect(page.locator('#saveDriverScheduleMsg')).toContainText('Schedule saved');
 const rows=page.locator('#driverScheduleRows tr'),weekday=rows.filter({hasText:'Mon, Tue, Wed, Thu, Fri'}),weekend=rows.filter({hasText:'Sat, Sun'});
 await expect(rows).toHaveCount(2);await expect(weekday).toContainText('6:00 AM');await expect(weekday).toContainText('3:00 PM');await expect(weekend).toContainText('10:00 AM');await expect(weekend).toContainText('4:00 PM');
 expect(f.schedulePosts[0]).toMatchObject({shiftIds:[],weekdays:[6,7],startTime:'10:00',endTime:'16:00'});
 await weekend.getByRole('button',{name:'Edit',exact:true}).click();await page.locator('#scheduleEndTime').fill('17:00');await page.locator('#saveDriverScheduleBtn').click();await expect(weekend).toContainText('5:00 PM');await expect(weekday).toContainText('3:00 PM');
 expect(f.schedulePosts[1].shiftIds).toEqual(['saved-1-6','saved-1-7']);
 await weekend.getByRole('button',{name:'Deactivate',exact:true}).click();await expect(rows).toHaveCount(1);await expect(weekday).toContainText('Active');
 await page.locator('#showInactiveSchedules').check();await expect(rows).toHaveCount(2);await expect(weekend).toContainText('Inactive');
 await weekend.getByRole('button',{name:'Activate',exact:true}).click();await expect(weekend).toContainText('Active');await expect(weekday).toContainText('Active');
 expect(f.toggles.every(t=>t.shiftIds.every(id=>id.startsWith('saved-2-')))).toBe(true);expect(f.errors).toEqual([]);
 expect(await page.locator('#driverSchedulePanel').evaluate(e=>e.scrollWidth<=e.clientWidth+1)).toBe(true);
 await page.locator('#driverSchedulePanel').screenshot({path:`output/admin-multiple-schedules-${mobile?'mobile':'desktop'}.png`});
});
