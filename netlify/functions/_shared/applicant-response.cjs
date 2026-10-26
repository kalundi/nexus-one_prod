const {json}=require('./http.cjs');
const clean=value=>String(value??'').trim();
const escape=value=>clean(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
function sendFailure(error){
 const status=Number(error?.providerStatus)||Number(String(error?.message||'').match(/Postmark request failed \((\d{3})/)?.[1]);
 const providerCode=Number(error?.providerCode)||null;
 const known={
  412:{code:'EMAIL_ACCOUNT_PENDING_APPROVAL',error:'Email was not sent. Postmark is still in test mode while your account awaits approval. It only permits recipients on your sending domain. Complete Request approval in Postmark before emailing external applicants.'},
  413:{code:'EMAIL_ACCOUNT_NOT_APPROVED',error:'Email was not sent. Postmark has not approved this account to send email. Check the account approval status in Postmark before retrying.'},
  406:{code:'EMAIL_RECIPIENT_INACTIVE',error:'Email was not sent. Postmark has suppressed this recipient after a bounce, complaint or unsubscribe. Check the applicant address and Postmark Activity before retrying.'},
  300:{code:'EMAIL_MESSAGE_INVALID',error:'Email was not sent. Postmark could not validate the message. Check the applicant email address, subject and message before retrying.'},
  1235:{code:'EMAIL_STREAM_NOT_FOUND',error:'Email was not sent. The configured Postmark Message Stream does not exist on this server. An administrator must correct the email stream setting.'},
  1236:{code:'EMAIL_STREAM_CANNOT_SEND',error:'Email was not sent. The configured Postmark Message Stream cannot send email. An administrator must select a transactional sending stream.'}
 }[providerCode];
 if(known)return {...known,sent:false,provider:'Postmark',providerStatus:status||null,providerCode};
 if(status===401)return {code:'EMAIL_CONNECTION_UNAUTHORIZED',error:'Email was not sent. The Postmark connection is no longer authorized. An administrator must update the email connection before you retry.',sent:false};
 if(status===403)return {code:'EMAIL_CONNECTION_FORBIDDEN',error:'Email was not sent. Postmark is blocking this sender or its sending permission. An administrator must check the email connection before you retry.',sent:false};
 if(status===429)return {code:'EMAIL_RATE_LIMITED',error:'Email was not sent. The email service is limiting requests. Please wait before retrying.',sent:false};
 if(status>=400)return {code:'EMAIL_REJECTED',error:'Email was not sent. The email service rejected the request. An administrator must check the email connection before you retry.',sent:false};
 return {code:'EMAIL_SEND_UNCONFIRMED',error:'Sending could not be confirmed. Check the email account before retrying to avoid sending the same message twice.',sent:null};
}
function createApplicantResponseHandler({query,sendEmail,audit}){
 return async function respond(id,body,me){
  const subject=clean(body.subject),message=clean(body.message);
  if(!subject||!message)return json(400,{error:'Subject and message are required.',sent:false});
  let applicant;
  try{applicant=(await query('SELECT first_name,last_name,email FROM career_applications WHERE id=$1',[id])).rows[0];}
  catch{return json(503,{error:'Unable to open the applicant record. Email was not sent. Please refresh the applicant and try again.',sent:false});}
  if(!applicant)return json(404,{error:'Application not found.',sent:false});
  let result;
  try{result=await sendEmail([applicant.email],subject,`<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto"><p>Hello ${escape(applicant.first_name)},</p>${message.split(/\n+/).map(line=>`<p>${escape(line)}</p>`).join('')}<p>Nexus Medical Transit<br>(888) 639-5766</p></div>`);}
  catch(error){console.warn('[APPLICANT_EMAIL_REJECTED]',JSON.stringify({provider:'Postmark',providerStatus:Number(error?.providerStatus)||null,providerCode:Number(error?.providerCode)||null}));return json(503,sendFailure(error));}
  if(result?.status!=='sent')return json(503,{code:'EMAIL_NOT_CONFIGURED',error:'Email was not sent. The applicant email connection is not configured. An administrator must connect the email service before you retry.',sent:false});
  try{await query('UPDATE career_applications SET applicant_response=$2,responded_at=now(),reviewed_by=$3,updated_at=now() WHERE id=$1',[id,message,me.id]);}
  catch(error){
   console.error('[APPLICANT_EMAIL_RECORD]',error.code||error.name||'Error');
   return json(200,{sent:true,recordSaved:false,warning:'Email was sent, but its response record could not be saved. Do not resend this message; refresh the applicant record and contact support.'});
  }
  try{await audit('CAREER_APPLICATION',id,'APPLICANT_RESPONSE_SENT',{to:applicant.email,by:me.email,status:result.status});}
  catch(error){console.warn('[APPLICANT_EMAIL_AUDIT]',error.code||error.name||'Error');}
  return json(200,{sent:true,recordSaved:true,emailStatus:{status:result.status}});
 };
}
module.exports={createApplicantResponseHandler,sendFailure};
