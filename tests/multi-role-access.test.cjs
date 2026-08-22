const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('public signup requests a selected role while preserving immediate patient access',()=>{
 const api=read('netlify/functions/api.cjs'),client=read('platform.js');
 assert.match(client,/name="role" required/);
 assert.equal((client.match(/name="role" required/g)||[]).length,1);
 assert.match(client,/role:form\.role\.value/);
 assert.match(api,/requestedRole=String\(b\.role\|\|'PATIENT'\)/);
 assert.match(api,/requestedRole!==\'PATIENT\'/);
 assert.match(api,/VALUES\(\$1,\$2,'PENDING'\)/);
 assert.match(api,/active_role,expires_at/);
 assert.match(api,/await ensureMultiRoleSchema\(\)/);
 assert.match(api,/verifyPassword\(password,String\(u\.password_hash/);
});

test('only approved roles can become the active session role',()=>{
 const api=read('netlify/functions/api.cjs'),auth=read('netlify/functions/_shared/auth.cjs');
 assert.match(api,/p\[1\]===\'switch-role\'/);
 assert.match(api,/u\.available_roles\?\.includes\(nextRole\)/);
 assert.match(api,/UPDATE sessions SET active_role/);
 assert.match(auth,/status='APPROVED'/);
});

test('admin workflow reviews pending role requests',()=>{
 const api=read('netlify/functions/api.cjs'),admin=read('admin-app.js'),html=read('admin.html');
 assert.match(api,/p\[1\]===\'role-requests\'/);
 assert.match(api,/requireUser\(bearer\(event\),\['ADMIN'\]\)/);
 assert.match(admin,/function decideRoleRequest/);
 assert.match(html,/id="roleRequestRows"/);
});
