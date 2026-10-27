const crypto=require('node:crypto');
function failureMessage(code,status){
 if(code===21610)return 'SMS was blocked because this number opted out. The recipient must opt back in before another test.';
 if(code===21608)return 'Twilio only permits verified recipients on this account. Check the trial or primary compliance profile restriction in Twilio.';
 if(code===30032)return 'Twilio blocked delivery because the toll-free sending number has not been approved for SMS verification.';
 if(status===401||status===403)return 'Twilio rejected authentication. Check TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN.';
 return 'Twilio could not complete the SMS request. Check the provider error code in Twilio Messaging Logs before retrying.';
}
function createHandler({requireUser,bearer,parseBody,json,sendSms,getSmsStatus,audit}){
 return async(event,p,method)=>{
  if(p.slice(0,3).join('/')!=='admin/integrations/test-sms')return null;
  const user=await requireUser(bearer(event),['ADMIN']);
  if(method==='GET'&&p.length===4){
   const id=p[3];if(!/^SM[a-f0-9]{32}$/i.test(id))return json(400,{error:'Invalid SMS message reference.'});
   try{const result=await getSmsStatus(id);return json(200,{provider:'Twilio',...result,...(result.errorCode?{error:failureMessage(result.errorCode)}:{})});}
   catch(error){return json(502,{error:failureMessage(Number(error.code),Number(error.statusCode)),providerCode:Number(error.code)||null});}
  }
  if(method!=='POST'||p.length!==3)return json(405,{error:'Use POST to send a test, or GET with its message reference to check delivery.'});
  const recipient=String(parseBody(event).recipient||'').trim();
  if(!/^\+[1-9]\d{7,14}$/.test(recipient))return json(400,{error:'Enter one mobile number with its country code, such as +12025550123.'});
  const testId=crypto.randomUUID();
  try{
   const result=await sendSms(recipient,`Nexus Medical Transit SMS connection test. No trip was booked or changed. Ref: ${testId}. Reply STOP to opt out.`);
   if(result?.status==='blocked-opt-out')return json(409,{accepted:false,error:failureMessage(21610),providerCode:21610});
   if(result?.status!=='sent'||!result?.id)return json(503,{accepted:false,error:'SMS sending is unavailable. Check the three TWILIO production Functions variables.'});
   try{await audit('COMMUNICATION_TEST',testId,'SMS_ACCEPTED',{by:user.id,to:recipient,providerMessageId:result.id});}catch{console.warn('[SMS_TEST_AUDIT] Could not record test result');}
   return json(202,{accepted:true,provider:'Twilio',recipient,testId,messageId:result.id,deliveryConfirmed:false,message:'Twilio accepted the test. Check its message status to confirm delivery.'});
  }catch(error){const code=Number(error.code)||null,status=Number(error.statusCode)||null;return json(502,{accepted:false,provider:'Twilio',providerCode:code,providerStatus:status,error:failureMessage(code,status)});}
 };
}
module.exports={createHandler};
