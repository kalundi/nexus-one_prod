const {query}=require('./_shared/db.cjs');
const {buildDailyOutreachBatch}=require('./_shared/outreach-campaign.cjs');
const montgomeryOutreachPilot=require('../../data/montgomery-tier-a-outreach-pilot.json');

function sendGridConfigured(){
 return Boolean(process.env.SENDGRID_API_KEY);
}

async function loadSentEmails(){
 const rows=await query(`SELECT lower(email) AS email FROM outreach_deliveries WHERE campaign_id=$1 AND status IN ('SENT','FAILED','SUPPRESSED','ALREADY_RECORDED')`,['montgomery-tier-a-pilot-2026']);
 return rows.rows.map(row=>row.email).filter(Boolean);
}

exports.handler=async ()=>{
 try{
  if(!sendGridConfigured()){
   return {statusCode:200,body:JSON.stringify({processed:0,skipped:'SENDGRID_API_KEY is not configured'})};
  }

  await query(`CREATE TABLE IF NOT EXISTS outreach_suppressions (email text PRIMARY KEY,reason text,created_at timestamptz NOT NULL DEFAULT now(),created_by uuid REFERENCES users(id) ON DELETE SET NULL)`);
  await query(`CREATE TABLE IF NOT EXISTS outreach_deliveries (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),campaign_id text NOT NULL,prospect_id text NOT NULL,email text NOT NULL,facility text,contact_name text,stage text NOT NULL DEFAULT 'INITIAL',status text NOT NULL,provider_status integer,error_message text,sent_at timestamptz,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(campaign_id,email,stage))`);

  const sentEmails=await loadSentEmails();
  const batch=buildDailyOutreachBatch(montgomeryOutreachPilot.recipients, sentEmails, 25);

  if(!batch.length){
   return {statusCode:200,body:JSON.stringify({processed:0,scheduled:0,reason:'No unsent recipients remain in the current batch'})};
  }

  let sent=0;
  for(const recipient of batch){
   const email=String(recipient.email || '').trim().toLowerCase();
   const suppressed=await query('SELECT 1 FROM outreach_suppressions WHERE lower(email)=lower($1) LIMIT 1',[email]);
   if(suppressed.rows[0]){
    await query(`INSERT INTO outreach_deliveries(campaign_id,prospect_id,email,facility,contact_name,stage,status) VALUES($1,$2,$3,$4,$5,'INITIAL','SUPPRESSED') ON CONFLICT(campaign_id,email,stage) DO NOTHING`,['montgomery-tier-a-pilot-2026',recipient.prospectId,email,recipient.facility,recipient.contactName]);
    continue;
   }

   const claimed=await query(`INSERT INTO outreach_deliveries(campaign_id,prospect_id,email,facility,contact_name,stage,status) VALUES($1,$2,$3,$4,$5,'INITIAL','SENDING') ON CONFLICT(campaign_id,email,stage) DO NOTHING RETURNING id`,['montgomery-tier-a-pilot-2026',recipient.prospectId,email,recipient.facility,recipient.contactName]);
   if(!claimed.rows[0])continue;

   try{
    const response=await fetch('https://api.sendgrid.com/v3/mail/send',{method:'POST',headers:{authorization:`Bearer ${process.env.SENDGRID_API_KEY}`,'content-type':'application/json'},body:JSON.stringify({personalizations:[{to:[{email}]}],from:{email:'fletcher@nexusmt.com',name:'Fletcher Kalundi'},reply_to:{email:'fletcher@nexusmt.com',name:'Fletcher Kalundi'},subject:'Medical transportation support for your patients',content:[{type:'text/html',value:`<div style="font-family:Arial,sans-serif;max-width:640px;margin:auto;color:#153247;line-height:1.55"><p>Hello ${recipient.contactName || 'there'},</p><p>I’m reaching out on behalf of Nexus Medical Transit, a licensed medical transportation provider serving Montgomery County and the DMV area.</p><p>We provide reliable wheelchair, stretcher and non-emergency medical transportation for healthcare facilities and their patients, including scheduled appointments, discharges and recurring treatments.</p><p>I would appreciate the opportunity to introduce Nexus and learn how your facility currently handles transportation requests.</p><p>Would you be available for a brief call next week?</p><p>Fletcher Kalundi<br>Chief Accessibility Officer<br>Nexus Medical Transit, LLC<br>888-639-5766<br>fletcher@nexusmt.com<br>www.nexusmt.com<br>WMATC Certificate No. 4152</p><p style="font-size:12px;color:#52677a">Advertisement · Nexus Medical Transit, LLC · 22505 Gateway Center Dr, Clarksburg, MD 20871<br>To stop receiving marketing emails, reply “unsubscribe.”</p></div>`}]} )});
    const body=await response.text();
    if(!response.ok){
      await query(`UPDATE outreach_deliveries SET status='FAILED',provider_status=$2,error_message=$3 WHERE id=$1`,[claimed.rows[0].id,response.status,body.slice(0,500)]); 
      continue;
    }
    await query(`UPDATE outreach_deliveries SET status='SENT',provider_status=$2,sent_at=now(),error_message=NULL WHERE id=$1`,[claimed.rows[0].id,response.status]);
    sent++;
   }catch(error){
    await query(`UPDATE outreach_deliveries SET status='FAILED',error_message=$2 WHERE id=$1`,[claimed.rows[0].id,String(error.message||error).slice(0,500)]);
   }
  }

  return {statusCode:200,body:JSON.stringify({processed:batch.length,scheduled:sent,skipped:batch.length-sent,campaign:'montgomery-tier-a-pilot-2026'})};
 }catch(error){
  console.error('[OUTREACH_CAMPAIGN_DAILY]',error);
  return {statusCode:500,body:JSON.stringify({error:error.message})};
 }
};
