const {test,expect}=require('@playwright/test'),fs=require('node:fs');
const client=fs.readFileSync('admin-app.js','utf8');
async function setup(page){
 const captured=[];await page.route('**/api/facilities',r=>r.fulfill({json:{facilities:[{facility_code:'FC-A',name:'Care Facility A',address:'100 Facility Lane',active:true},{facility_code:'FC-X',name:'Closed facility',active:false}]}}));
 await page.goto('/404.html');
 await page.setContent('<div class="formField"><select id="newRole"><option value="PATIENT">Patient</option><option value="FACILITY">Facility manager</option></select></div><input id="newEmail" value="manager@example.test"><input id="newPhone" value="+12405550100"><input id="newName" value="Manager"><button id="createUserBtn">Create user</button><p id="createUserMsg" hidden></p><form id="userAccountForm"><select id="editUserRole"><option>FACILITY</option><option>PATIENT</option></select><div class="formField"><input id="editUserScope" value="FC-A"></div></form>');
 await page.evaluate(()=>{sessionStorage.setItem('nexusAccessToken','fixture-admin');window.token=()=> 'fixture-admin';window.loadUsers=()=>{};window.showMsg=(el,text)=>{el.hidden=false;el.textContent=text;};});
 await page.route('**/api/admin/users',r=>{captured.push(r.request().postDataJSON());return r.fulfill({json:{user:{email:'manager@example.test',userCode:'N1001',facilityName:'Care Facility A'},tempPassword:'fixture-only',warning:'Local test'}});});
 await page.addScriptTag({path:'admin-facility-access.js'});
 const start=client.indexOf("document.getElementById('createUserBtn').addEventListener");const end=client.indexOf('// Pricing',start);await page.addScriptTag({content:client.slice(start,end)});
 return captured;
}
for(const width of [1280,390])test(`facility required when creating and editing manager access at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:900});const captured=await setup(page);await page.locator('#newRole').selectOption('FACILITY');await expect(page.locator('#newUserFacility option')).toHaveCount(2);await page.locator('#createUserBtn').click();expect(captured).toHaveLength(0);await expect(page.locator('#createUserMsg')).toContainText('Select the facility');await page.locator('#newUserFacility').selectOption('FC-A');await page.locator('#createUserBtn').click();await expect.poll(()=>captured.length).toBe(1);expect(captured[0].scopeId).toBe('FC-A');await expect(page.locator('#createUserMsg')).toContainText('Assigned facility: Care Facility A');
 await page.evaluate(()=>window.NexusAdminFacilityAccess.syncEdit(false));await expect(page.locator('#editUserFacility')).toHaveValue('FC-A');await expect(page.locator('#editUserScope')).toBeHidden();expect(await page.evaluate(()=>window.NexusAdminFacilityAccess.editScope())).toBe('FC-A');
});
test('approval requires selecting an active facility and supports cancellation',async({page})=>{
 await setup(page);await page.evaluate(()=>{window.chosen=null;window.NexusAdminFacilityAccess.choose().then(v=>window.chosen=v);});await expect(page.getByRole('dialog')).toBeVisible();await page.getByRole('button',{name:'Approve selected facility'}).click();expect(await page.evaluate(()=>window.chosen)).toBe(null);await page.locator('#approveUserFacility').selectOption('FC-A');await page.getByRole('button',{name:'Approve selected facility'}).click();await expect.poll(()=>page.evaluate(()=>window.chosen)).toBe('FC-A');
 await page.evaluate(()=>{window.NexusAdminFacilityAccess.choose().then(v=>window.chosen=v);});await page.getByRole('button',{name:'Cancel',exact:true}).click();await expect.poll(()=>page.evaluate(()=>window.chosen)).toBe('');
});
