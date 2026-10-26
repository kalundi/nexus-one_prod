const {test}=require('node:test'),assert=require('node:assert/strict');
const {createHandler}=require('../netlify/functions/_shared/communication-test.cjs');
function fixture(sendEmail){const calls=[];return {calls,handler:createHandler({requireUser:async(token,roles)=>{assert.equal(token,'admin');assert.deepEqual(roles,['ADMIN']);return {id:'administrator'};},bearer:e=>e.token,parseBody:e=>e.body,json:(statusCode,body)=>({statusCode,body}),sendEmail:async(...args)=>{calls.push(args);return sendEmail(...args);},audit:async()=>{}})};}
test('system test sends once only to the explicitly supplied address and reports acceptance rather than delivery',async()=>{
 const {handler,calls}=fixture(async()=>({status:'sent'}));const result=await handler({token:'admin',body:{recipient:' fletcher@nexusmt.com '}},['admin','integrations','test-email'],'POST');
 assert.equal(result.statusCode,202);assert.equal(result.body.accepted,true);assert.equal(calls.length,1);assert.equal(calls[0][0],'fletcher@nexusmt.com');assert.equal(calls[0][1],'Nexus system communication test');assert.match(result.body.message,/not yet confirmed/);
});
test('test rejects multiple recipients and reports missing configuration without claiming a send',async()=>{
 const {handler,calls}=fixture(async()=>({status:'skipped'}));assert.equal((await handler({token:'admin',body:{recipient:'a@example.com,b@example.com'}},['admin','integrations','test-email'],'POST')).statusCode,400);assert.equal(calls.length,0);
 assert.equal((await handler({token:'admin',body:{recipient:'fletcher@nexusmt.com'}},['admin','integrations','test-email'],'POST')).statusCode,503);
});
test('test reports provider authentication failure without exposing credentials',async()=>{
 const {handler}=fixture(async()=>{throw Object.assign(Error('private provider details'),{providerStatus:401});});const result=await handler({token:'admin',body:{recipient:'fletcher@nexusmt.com'}},['admin','integrations','test-email'],'POST');
 assert.equal(result.statusCode,502);assert.equal(result.body.providerStatus,401);assert.match(result.body.error,/POSTMARK_SERVER_TOKEN/);assert.doesNotMatch(JSON.stringify(result.body),/private provider details/);
});
