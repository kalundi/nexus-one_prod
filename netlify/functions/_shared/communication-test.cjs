const crypto=require('node:crypto');
function createHandler({requireUser,bearer,parseBody,json,sendEmail,sendTeamsAlert,audit}){
 return async(event,p,method)=>{
  if(p.join('/')==='admin/integrations/test-teams'){
   if(method!=='POST')return json(405,{error:'Use POST to request a Teams test.'});
   const user=await requireUser(bearer(event),['ADMIN']),id=crypto.randomUUID();
   // A fixed test protects against turning this administrator check into a message relay.
   const result=await sendTeamsAlert(`Nexus system connection test. No patient information or trip changes. Test reference: ${id}`,'Nexus Teams connection test');
   const accepted=result?.status==='sent';
   try{await audit('COMMUNICATION_TEST',id,accepted?'TEAMS_ACCEPTED':'TEAMS_FAILED',{by:user.id,providerStatus:result?.code||null});}catch{console.warn('[TEAMS_TEST_AUDIT] Could not record test result');}
   return json(accepted?202:result?.status==='skipped'?503:502,{accepted,testId:id,provider:result?.provider||'Teams',providerStatus:result?.code||null,deliveryConfirmed:false,...(accepted?{message:'The webhook accepted the test. Confirm the Teams posting action in the flow run history and the destination chat or channel.'}:{error:result?.error||'Teams could not accept the test.'})});
  }
  if(p.join('/')!=='admin/integrations/test-email')return null;
  if(method!=='POST')return json(405,{error:'Use POST to request an email test.'});
  const user=await requireUser(bearer(event),['ADMIN']),body=parseBody(event);
  const recipient=String(body.recipient||'').trim().toLowerCase();
  if(recipient.length>254||!/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(recipient))return json(400,{error:'Enter one valid recipient email address.'});
  const id=crypto.randomUUID(),subject='Nexus system communication test';
  try{
   const result=await sendEmail(recipient,subject,'<h2>Nexus system communication test</h2><p>This is the test email you requested from Nexus Medical Transit.</p><p>No trip was booked or changed.</p><p>Test reference: '+id+'</p>');
   if(result?.status!=='sent')return json(503,{error:'Email sending is unavailable. Check POSTMARK_SERVER_TOKEN and EMAIL_FROM.'});
   await audit('COMMUNICATION_TEST',id,'EMAIL_ACCEPTED',{by:user.id,to:recipient});
   return json(202,{accepted:true,recipient,subject,testId:id,provider:'Postmark',messageId:result.messageId||null,message:'The email service accepted the test. Inbox delivery is not yet confirmed.'});
  }catch(error){
   const providerStatus=Number(error.providerStatus)||null;
   await audit('COMMUNICATION_TEST',id,'EMAIL_FAILED',{by:user.id,to:recipient,providerStatus});
   return json(502,{accepted:false,recipient,provider:'Postmark',providerStatus,providerCode:Number(error.providerCode)||null,error:providerStatus===401?'Postmark rejected authentication. Update POSTMARK_SERVER_TOKEN.':providerStatus===403?'Postmark rejected the request. Check API permissions and the verified EMAIL_FROM sender.':providerStatus===422?'Postmark rejected the sender or message. Verify EMAIL_FROM and the Message Stream in Postmark.':'The email service could not accept the test message.'});
  }
 };
}
module.exports={createHandler};
