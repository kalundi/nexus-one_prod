const {test,expect}=require('@playwright/test'),fs=require('node:fs');
const roles=require('../nexus-ems-roles.js');
test('all twelve EMS roles appear in create, manage and filter controls',async({page})=>{
 await page.goto('/404.html');await page.setContent('<select id="newRole"></select><select id="editUserRole"></select><select id="userRoleFilter"><option value="">All roles</option></select>');await page.addScriptTag({path:'nexus-ems-roles.js'});
 const source=fs.readFileSync('admin-users.js','utf8');await page.addScriptTag({content:source.slice(0,source.indexOf(' const isDriver='))+'})();'});
 for(const [role,label] of Object.entries(roles))for(const id of ['newRole','editUserRole','userRoleFilter'])await expect(page.locator('#'+id+' option[value="'+role+'"]')).toHaveText(label);
});
for(const role of ['EMT','PARAMEDIC','MEDICAL_DIRECTOR'])test(`${role} can open assigned training without admin access`,async({page})=>{
 await page.addInitScript(()=>sessionStorage.setItem('nexusAccessToken','ems-fixture'));
 await page.route('**/api/**',r=>{const path=new URL(r.request().url()).pathname;return r.fulfill({json:path==='/api/auth/me'?{user:{id:'ems',role:roles.access[role].role,titleRole:role,accessRole:roles.access[role].role,roles:[role,'PATIENT'],displayName:'EMS Staff'}}:path==='/api/training'?{assignments:[],acknowledgment:'Acknowledgment',isAdmin:false}:{}});});
 await page.goto('/training.html');await expect(page.locator('#workspace')).toBeVisible();await expect(page.locator('#administration')).toBeHidden();await expect(page.locator('#assignmentList')).toContainText('No training has been assigned');
});
test('crew sign-in accepts an EMS role and routes it to its mapped workspace',async({page})=>{
 const user={id:'ems',role:'DRIVER',titleRole:'PARAMEDIC',accessRole:'DRIVER',workspaceUrl:'/driver-app.html',roles:['PARAMEDIC','PATIENT'],displayName:'EMS Staff'};
 await page.route('**/api/**',r=>r.fulfill({json:new URL(r.request().url()).pathname==='/api/auth/me'?{user}:{assignments:[],acknowledgment:'Acknowledgment',isAdmin:false}}));
 await page.goto('/404.html');await page.setContent('<form id="staffLogin"><input id="expectedRole" value="DRIVER"><input id="identifier" value="ems@example.test"><input id="password" value="fixture"><p id="staffError"></p><button id="staffSubmit"><span>Sign in</span></button></form>');
 const handler=fs.readFileSync('js/app.js','utf8').split('\n').find(line=>line.includes("$('#staffLogin').addEventListener"));
 await page.addScriptTag({content:`(()=>{const $=s=>document.querySelector(s);let forceShowAccessGateway=false;const request=async()=>(${JSON.stringify({token:'ems-fixture',user})});${handler}})();`});
 await page.locator('#staffSubmit').click();await expect(page).toHaveURL(/\/driver-app\.html$/);
});
