const {test}=require('node:test'),assert=require('node:assert/strict');
const Teams=require('../netlify/functions/_shared/teams.cjs');
test('Teams transport handles Power Automate, legacy cards and safe failures',async t=>{
 const originalFetch=global.fetch,saved=process.env.TEAMS_WEBHOOK_URL;let calls=[];
 try{
  global.fetch=async(url,options)=>{calls.push({url,...options});return new Response(null,{status:202});};
  delete process.env.TEAMS_WEBHOOK_URL;assert.equal((await Teams.sendTeamsAlert('Test')).status,'skipped');assert.equal(calls.length,0);
  for(const endpoint of ['https://example.environment.api.powerplatform.com/powerautomate/automations/direct/flow/triggers/manual/paths/invoke?sig=private','https://prod.example.logic.azure.com/workflows/flow/triggers/manual/paths/invoke?sig=private']){
   process.env.TEAMS_WEBHOOK_URL=endpoint;const result=await Teams.sendTeamsAlert('Connection test','Nexus test');assert.equal(result.accepted,true);assert.equal(result.deliveryConfirmed,false);assert.equal(result.provider,'Power Automate');
   const body=JSON.parse(calls.at(-1).body);assert.equal(body.type,'message');assert.equal(body.attachments[0].contentUrl,null);assert.equal(body.attachments[0].contentType,'application/vnd.microsoft.card.adaptive');assert.equal(body.attachments[0].content.body[1].text,'Connection test');assert.ok(calls.at(-1).signal);
  }
  process.env.TEAMS_WEBHOOK_URL='https://example.webhook.office.com/webhook/actual';await Teams.sendTeamsAlert('Legacy text','Legacy title');assert.equal(JSON.parse(calls.at(-1).body)['@type'],'MessageCard');
  await t.test('rejection codes and transport failures never expose the credential URL or retry automatically',async()=>{
   for(const status of [401,403,404,410,429,500]){global.fetch=async()=>new Response(null,{status});const result=await Teams.sendTeamsAlert('Test');assert.equal(result.status,'failed');assert.equal(result.code,status);assert.doesNotMatch(JSON.stringify(result),/sig=|example.webhook/);}
   let count=0;global.fetch=async()=>{count++;throw Error(process.env.TEAMS_WEBHOOK_URL);};const result=await Teams.sendTeamsAlert('Test');assert.equal(result.status,'failed');assert.equal(count,1);assert.doesNotMatch(JSON.stringify(result),/example.webhook/);
  });
 }finally{global.fetch=originalFetch;if(saved===undefined)delete process.env.TEAMS_WEBHOOK_URL;else process.env.TEAMS_WEBHOOK_URL=saved;}
});
