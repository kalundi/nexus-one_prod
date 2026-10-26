const {test}=require('node:test'),assert=require('node:assert/strict');
const Email=require('../netlify/functions/_shared/email.cjs');
test('Postmark transport uses server credentials, preserves attachments and rejects unconfirmed sends',async t=>{
 const keys=['POSTMARK_SERVER_TOKEN','POSTMARK_FROM_EMAIL','EMAIL_FROM','POSTMARK_MESSAGE_STREAM','POSTMARK_BROADCAST_MESSAGE_STREAM'],saved=Object.fromEntries(keys.map(k=>[k,process.env[k]])),originalFetch=global.fetch;
 try{
  for(const key of keys)delete process.env[key];
  let calls=[];global.fetch=async(url,options)=>{calls.push({url,...options});return Response.json({ErrorCode:0,MessageID:'message-123'});};
  assert.equal((await Email.sendEmail('a@example.com','Test','<p>Test</p>')).status,'skipped');assert.equal(calls.length,0);
  process.env.POSTMARK_SERVER_TOKEN='fixture-server-token';process.env.EMAIL_FROM='dispatch@nexusmt.com';
  await t.test('transactional messages and broker attachments',async()=>{
   const result=await Email.sendEmail(['a@example.com','b@example.com','a@example.com'],'Invoice','<p>Invoice</p>',{replyTo:'facility@example.com',attachments:[{filename:'invoice.pdf',type:'application/pdf',content:'cGRm'}]});
   assert.equal(result.status,'sent');assert.equal(result.messageId,'message-123');assert.equal(calls.length,1);
   assert.equal(calls[0].url,'https://api.postmarkapp.com/email');assert.equal(calls[0].headers['X-Postmark-Server-Token'],'fixture-server-token');assert.equal(calls[0].headers.authorization,undefined);
   const body=JSON.parse(calls[0].body);assert.equal(body.To,'a@example.com,b@example.com');assert.equal(body.From,'Nexus Medical Transit <dispatch@nexusmt.com>');assert.equal(body.MessageStream,'outbound');assert.equal(body.ReplyTo,'facility@example.com');assert.deepEqual(body.Attachments,[{Name:'invoice.pdf',Content:'cGRm',ContentType:'application/pdf'}]);assert.doesNotMatch(body.HtmlBody,/unsubscribe/);
  });
  await t.test('marketing requires an explicit Broadcast stream and unsubscribe link',async()=>{
   assert.equal((await Email.sendEmail('a@example.com','Outreach','<p>Hello</p>',{broadcast:true})).status,'skipped');assert.equal(calls.length,1);
   process.env.POSTMARK_BROADCAST_MESSAGE_STREAM='broadcasts';await Email.sendEmail('a@example.com','Outreach','<p>Hello</p>',{broadcast:true});
   const body=JSON.parse(calls[1].body);assert.equal(body.MessageStream,'broadcasts');assert.match(body.HtmlBody,/\{\{\{ pm:unsubscribe \}\}\}/);
  });
  await t.test('HTTP errors, Postmark error codes and malformed responses cannot claim success',async()=>{
   for(const [status,body] of [[401,{ErrorCode:10,Message:'private response'}],[422,{ErrorCode:400,Message:'private response'}],[200,{ErrorCode:406,Message:'private response'}],[200,{}]]){
    global.fetch=async()=>Response.json(body,{status});
    await assert.rejects(Email.sendEmail('a@example.com','Test','Test'),error=>{assert.equal(error.providerStatus,status);assert.doesNotMatch(error.message,/fixture-server-token|private response/);return true;});
   }
  });
 }finally{global.fetch=originalFetch;for(const key of keys){if(saved[key]===undefined)delete process.env[key];else process.env[key]=saved[key];}}
});
