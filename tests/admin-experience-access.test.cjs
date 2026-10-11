const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
function authFor(user,approved=[]){
 const module={exports:{}};
 const query=async(sql)=>{
  if(sql.includes('FROM sessions s JOIN users u'))return {rows:[{...user,session_id:'test-session'}]};
  if(sql.includes('FROM user_role_requests'))return {rows:approved};
  throw Error('Unexpected query in access test');
 };
 vm.runInNewContext(fs.readFileSync('netlify/functions/_shared/auth.cjs','utf8'),{module,exports:module.exports,require:name=>name==='./db.cjs'?{query}:name==='./fallback-auth.cjs'?{getFallbackSession:()=>null}:require(name)});
 return module.exports;
}
const roles=['ADMIN','DISPATCHER','DRIVER','FACILITY','BILLING','QA','EXECUTIVE','PATIENT','CARETAKER','STAFF'];
test('an administrator can open every experience without individually assigned roles',async()=>{
 const auth=authFor({id:'admin',role:'ADMIN',scope_id:null});
 const user=await auth.requireUser('test-token',['ADMIN']);
 assert.deepEqual([...user.available_roles].sort(),roles.slice().sort());
 assert.deepEqual([...auth.safeUser(user).roles].sort(),roles.slice().sort());
});
for(const role of roles)test(`administrator retains all experiences after switching to ${role}`,async()=>{
 const auth=authFor({id:'admin',role:'ADMIN',active_role:role,scope_id:'admin-scope'});
 const user=await auth.requireUser('test-token',[role]);
 assert.equal(user.role,role);
 assert.deepEqual([...user.available_roles].sort(),roles.slice().sort());
 if(role!=='ADMIN')assert.equal(user.scope_id,null,'a different experience must not inherit the admin scope');
 if(role!=='ADMIN')await assert.rejects(()=>auth.requireUser('test-token',['ADMIN']),{statusCode:403},'active experience permissions remain enforced');
});
test('approved administrator access grants switching even when patient is the base role',async()=>{
 const auth=authFor({id:'user',role:'PATIENT',active_role:'DISPATCHER'},[{role:'ADMIN'}]);
 const user=await auth.requireUser('test-token',['DISPATCHER']);
 assert.ok(user.available_roles.includes('ADMIN'));assert.equal(user.available_roles.length,10);
});
test('other users cannot gain admin or workforce access by changing the requested session role',async()=>{
 const auth=authFor({id:'patient',role:'PATIENT',active_role:'ADMIN'});
 const user=await auth.requireUser('test-token');
 assert.equal(user.role,'PATIENT');assert.deepEqual([...user.available_roles],['PATIENT']);
 await assert.rejects(()=>auth.requireUser('test-token',['ADMIN']),{statusCode:403});
});
test('individual role scopes are applied and cleared when the experience changes',async()=>{
 const approved=[{role:'FACILITY',scope_id:'facility-123'},{role:'DRIVER',scope_id:'driver-456'}];
 const auth=authFor({id:'admin',role:'ADMIN',active_role:'FACILITY',scope_id:'admin-scope'},approved);
 assert.equal((await auth.requireUser('test-token')).scope_id,'facility-123');
 const patient=authFor({id:'facility',role:'FACILITY',active_role:'PATIENT',scope_id:'facility-123'},approved);
 assert.equal((await patient.requireUser('test-token')).scope_id,null);
});
test('revoking approved admin access removes its extra experiences on the next request',async()=>{
 const auth=authFor({id:'user',role:'PATIENT',active_role:'DRIVER'},[]);
 const user=await auth.requireUser('test-token');
 assert.equal(user.role,'PATIENT');assert.deepEqual([...user.available_roles],['PATIENT']);
 await assert.rejects(()=>auth.requireUser('test-token',['DRIVER']),{statusCode:403});
});
