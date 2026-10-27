const {test}=require('node:test'),assert=require('node:assert/strict');
const {createHandler}=require('../netlify/functions/_shared/sms-test.cjs');
const {getSmsStatus}=require('../netlify/functions/_shared/sms-consent.cjs');
const messageId='SM'+'a'.repeat(32);
function fixture(result={status:'sent',id:messageId},error){const sends=[],lookups=[];return {sends,lookups,handler:createHandler({requireUser:async(token,roles)=>{assert.deepEqual(roles,['ADMIN']);if(token!=='admin')throw Error('Forbidden');return {id:'admin'};},bearer:e=>e.token,parseBody:e=>e.body||{},json:(statusCode,body)=>({statusCode,body}),audit:async()=>{},sendSms:async(...args)=>{sends.push(args);if(error)throw error;return result;},getSmsStatus:async id=>{lookups.push(id);return {messageId:id,status:'delivered',deliveryConfirmed:true};}})};}
const request=(f,recipient='+12025550123')=>f.handler({token:'admin',body:{recipient,text:'Do not relay this'}},['admin','integrations','test-sms'],'POST');
test('SMS test requires ADMIN, one international number, and a fixed non-booking message',async()=>{
 const f=fixture();await assert.rejects(f.handler({token:'driver'},['admin','integrations','test-sms'],'POST'),/Forbidden/);assert.equal(f.sends.length,0);
 for(const phone of ['2025550123','+12025550123,+12025550124','name@example.com',''])assert.equal((await request(f,phone)).statusCode,400);
 assert.equal(f.sends.length,0);const result=await request(f);assert.equal(result.statusCode,202);assert.equal(result.body.accepted,true);assert.equal(result.body.deliveryConfirmed,false);assert.equal(f.sends.length,1);assert.equal(f.sends[0][0],'+12025550123');assert.match(f.sends[0][1],/No trip was booked or changed/);assert.match(f.sends[0][1],/STOP/);assert.doesNotMatch(f.sends[0][1],/Do not relay/);
});
test('SMS test respects opt-out and missing configuration without claiming a send',async()=>{
 const blocked=await request(fixture({status:'blocked-opt-out'}));assert.equal(blocked.statusCode,409);assert.equal(blocked.body.accepted,false);
 assert.equal((await request(fixture({status:'skipped'}))).statusCode,503);
});
test('Twilio rejection details are actionable without exposing raw provider responses',async()=>{
 for(const [code,status] of [[20003,401],[21608,400],[21610,400],[30032,400]]){
  const f=fixture(null,Object.assign(Error('PRIVATE_PROVIDER_RESPONSE'),{code,statusCode:status})),result=await request(f);assert.equal(result.statusCode,502);assert.equal(result.body.accepted,false);assert.equal(result.body.providerCode,code);assert.doesNotMatch(JSON.stringify(result.body),/PRIVATE_PROVIDER_RESPONSE/);assert.equal(f.sends.length,1);
 }
});
test('delivery polling reads message status without sending another SMS',async()=>{
 const f=fixture();assert.equal((await f.handler({token:'admin'},['admin','integrations','test-sms','bad-id'],'GET')).statusCode,400);
 const result=await f.handler({token:'admin'},['admin','integrations','test-sms',messageId],'GET');assert.equal(result.body.deliveryConfirmed,true);assert.deepEqual(f.lookups,[messageId]);assert.equal(f.sends.length,0);
});
test('Twilio status lookup keeps credentials and message content on the server',async()=>{
 const originalFetch=global.fetch,sid=process.env.TWILIO_ACCOUNT_SID,token=process.env.TWILIO_AUTH_TOKEN;
 process.env.TWILIO_ACCOUNT_SID='AC-fixture';process.env.TWILIO_AUTH_TOKEN='fixture-secret';let calls=0;
 try{
  global.fetch=async(url,options)=>{calls++;assert.match(url,new RegExp('/Messages/'+messageId+'\\.json$'));assert.match(options.headers.authorization,/^Basic /);assert.ok(options.signal);return Response.json({sid:messageId,status:'delivered',body:'Private message content',error_code:null});};
  const result=await getSmsStatus(messageId);assert.equal(result.deliveryConfirmed,true);assert.doesNotMatch(JSON.stringify(result),/Private message|fixture-secret/);
  await assert.rejects(getSmsStatus('../unexpected'));assert.equal(calls,1);
  global.fetch=async()=>Response.json({status:'undelivered',error_code:30032});const failed=await getSmsStatus(messageId);assert.equal(failed.deliveryConfirmed,false);assert.equal(failed.errorCode,30032);
 }finally{global.fetch=originalFetch;if(sid===undefined)delete process.env.TWILIO_ACCOUNT_SID;else process.env.TWILIO_ACCOUNT_SID=sid;if(token===undefined)delete process.env.TWILIO_AUTH_TOKEN;else process.env.TWILIO_AUTH_TOKEN=token;}
});
