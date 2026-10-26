const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createApplicantResponseHandler}=require('../netlify/functions/_shared/applicant-response.cjs');
const actor={id:'11111111-1111-4111-8111-111111111111',email:'admin@example.com'};
const id='22222222-2222-4222-8222-222222222222';
function setup({sendError,sendResult={status:'sent'},readError,writeError}={}){
 const sends=[],writes=[],audits=[];
 const handler=createApplicantResponseHandler({
  query:async(sql,params)=>{if(sql.startsWith('SELECT')){if(readError)throw readError;return {rows:[{first_name:'Jordan <Lee>',email:'jordan@example.com'}]};}writes.push(params);if(writeError)throw writeError;return {rowCount:1,rows:[]};},
  sendEmail:async(...args)=>{sends.push(args);if(sendError)throw sendError;return sendResult;},
  audit:async(...args)=>audits.push(args)
 });
 return {sends,writes,audits,call:async(body={subject:'Application update',message:'Hello\nPlease bring <documents>.'})=>{const response=await handler(id,body,actor);return {status:response.statusCode,...JSON.parse(response.body)};}};
}
test('an accepted applicant response is escaped, recorded and audited',async()=>{
 const f=setup(),result=await f.call();assert.equal(result.status,200);assert.equal(result.sent,true);assert.equal(result.recordSaved,true);
 assert.deepEqual(f.sends[0][0],['jordan@example.com']);assert.match(f.sends[0][2],/Jordan &lt;Lee&gt;/);assert.match(f.sends[0][2],/Please bring &lt;documents&gt;/);
 assert.deepEqual(f.writes[0],[id,'Hello\nPlease bring <documents>.',actor.id]);assert.equal(f.audits[0][2],'APPLICANT_RESPONSE_SENT');
});
test('invalid Postmark credentials produce a clear error and no sent record',async()=>{
 const f=setup({sendError:Object.assign(new Error('SENSITIVE_MARKER'),{providerStatus:401})}),result=await f.call();
 assert.equal(result.status,503);assert.equal(result.sent,false);assert.equal(result.code,'EMAIL_CONNECTION_UNAUTHORIZED');assert.match(result.error,/no longer authorized/);assert.doesNotMatch(JSON.stringify(result),/SENSITIVE_MARKER/);assert.equal(f.writes.length,0);assert.equal(f.audits.length,0);
});
test('sender rejection, rate limits and provider outages do not mark responses as sent',async()=>{
 for(const status of [403,429,500]){const f=setup({sendError:new Error(`Postmark request failed (${status})`)}),result=await f.call();assert.equal(result.status,503);assert.equal(result.sent,false);assert.equal(f.writes.length,0);}
});
test('a network failure reports uncertain delivery without automatically retrying',async()=>{
 const f=setup({sendError:new TypeError('fetch failed')}),result=await f.call();assert.equal(result.sent,null);assert.equal(result.code,'EMAIL_SEND_UNCONFIRMED');assert.match(result.error,/Check the email account before retrying/);assert.equal(f.sends.length,1);assert.equal(f.writes.length,0);
});
test('an unconfigured mail connection produces an actionable error',async()=>{
 const f=setup({sendResult:{status:'skipped'}}),result=await f.call();assert.equal(result.sent,false);assert.equal(result.code,'EMAIL_NOT_CONFIGURED');assert.equal(f.writes.length,0);
});
test('missing fields and an unavailable applicant record cannot trigger an email',async()=>{
 const f=setup();assert.equal((await f.call({subject:' ',message:' '})).status,400);assert.equal(f.sends.length,0);
 const unavailable=setup({readError:new Error('database unavailable')}),result=await unavailable.call();assert.equal(result.status,503);assert.equal(result.sent,false);assert.equal(unavailable.sends.length,0);
});
test('a recording failure after acceptance remains a sent response with a warning',async()=>{
 const f=setup({writeError:Object.assign(new Error('database unavailable'),{code:'TEST_WRITE_FAILURE'})}),result=await f.call();assert.equal(result.status,200);assert.equal(result.sent,true);assert.equal(result.recordSaved,false);assert.match(result.warning,/Do not resend/);assert.equal(f.sends.length,1);
});
