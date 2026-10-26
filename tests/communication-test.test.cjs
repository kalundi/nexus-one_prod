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

test('Teams test is administrator-only and sends a fixed message without patient data',async()=>{
 const calls=[],audits=[];const handler=createHandler({requireUser:async(token,roles)=>{assert.deepEqual(roles,['ADMIN']);if(token!=='admin')throw Error('Forbidden');return {id:'admin'};},bearer:e=>e.token,json:(statusCode,body)=>({statusCode,body}),sendTeamsAlert:async(...args)=>{calls.push(args);return {status:'sent',provider:'Power Automate',code:202};},audit:async(...args)=>audits.push(args)});
 await assert.rejects(handler({token:'driver'},['admin','integrations','test-teams'],'POST'),/Forbidden/);assert.equal(calls.length,0);
 const result=await handler({token:'admin',body:{text:'Do not relay this content'}},['admin','integrations','test-teams'],'POST');assert.equal(result.statusCode,202);assert.equal(result.body.accepted,true);assert.equal(result.body.deliveryConfirmed,false);assert.equal(calls.length,1);assert.match(calls[0][0],/No patient information/);assert.doesNotMatch(calls[0][0],/Do not relay/);assert.equal(audits.length,1);
});

test('Teams test reports a rejected or missing webhook without claiming delivery',async()=>{
 for(const delivery of [{status:'skipped',error:'Not configured'},{status:'failed',code:401,error:'Webhook authorization rejected'}]){
  const handler=createHandler({requireUser:async()=>({id:'admin'}),bearer:()=>'',json:(statusCode,body)=>({statusCode,body}),sendTeamsAlert:async()=>delivery,audit:async()=>{}});
  const result=await handler({},['admin','integrations','test-teams'],'POST');assert.equal(result.body.accepted,false);assert.equal(result.body.deliveryConfirmed,false);assert.ok(result.statusCode>=500);
 }
});
