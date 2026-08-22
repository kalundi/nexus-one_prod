const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('home page loads the unified account navigation',()=>{
 const home=read('__deploy_temp/index.html');
 assert.match(home,/platform\.css\?v=46/);
 assert.match(home,/platform\.js\?v=46/);
});

test('shared account control displays login or authenticated identity',()=>{
 const script=read('platform.js');
 assert.match(script,/\/api\/auth\/me/);
 assert.match(script,/\/api\/auth\/login/);
 assert.match(script,/nexusAccountAvatar/);
 assert.match(script,/Open my workspace/);
 assert.match(script,/data-nexus-logout/);
});

test('protected pages redirect authentication to home navigation',()=>{
 assert.match(read('auth-guard.js'),/\/\?login=1&redirect=/);
 assert.match(read('platform.js'),/\/\?login=1&redirect=/);
});

test('LiveCare replaces role cards with patient-specific live ride metrics',()=>{
 const page=read('livecare.html'),dashboard=read('livecare-patient-dashboard.js');
 assert.match(page,/\.accessGateway,#staffAccess,.livecareLoginBlock/);
 assert.match(page,/Your ride readiness dashboard/);
 assert.match(page,/Driver \+ vehicle/);
 assert.match(page,/Transportation type/);
 assert.match(page,/Track by reference/);
 assert.match(dashboard,/\/api\/portal\/trips/);
 assert.match(dashboard,/\/api\/livecare\//);
 assert.match(dashboard,/setInterval\(load,30000\)/);
});
