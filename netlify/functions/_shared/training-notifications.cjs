const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function sendTrainingEmail(to,subject,html){
 if(!process.env.SENDGRID_API_KEY||!process.env.SENDGRID_FROM_EMAIL)return {status:'skipped'};
 const response=await fetch('https://api.sendgrid.com/v3/mail/send',{method:'POST',signal:AbortSignal.timeout(15000),headers:{authorization:`Bearer ${process.env.SENDGRID_API_KEY}`,'content-type':'application/json'},body:JSON.stringify({personalizations:[{to:to.map(email=>({email}))}],from:{email:process.env.SENDGRID_FROM_EMAIL,name:'Nexus Academy'},subject,content:[{type:'text/html',value:html}]})});
 if(!response.ok)throw Error(`Training email failed (${response.status})`);
 return {status:'sent'};
}
async function notifyTrainingAdmins({query,sendEmail=sendTrainingEmail,assignmentId=null}){
 const admins=await query("SELECT DISTINCT email FROM users WHERE active=true AND email IS NOT NULL AND (role='ADMIN' OR EXISTS(SELECT 1 FROM user_role_requests r WHERE r.user_id=users.id AND r.role='ADMIN' AND r.status='APPROVED'))");
 const recipients=admins.rows.map(r=>r.email).filter(Boolean);if(!recipients.length)return;
 const rows=await query(`SELECT a.id FROM training_assignments a WHERE a.acknowledged_at IS NOT NULL AND a.requires_verification=true AND a.verified_at IS NULL
 AND ($1::uuid IS NULL OR a.id=$1) AND (a.notification_sent_at IS NULL OR (a.due_at<=now()+interval '3 days' AND (a.reminder_sent_at IS NULL OR a.reminder_sent_at<now()-interval '1 day'))) ORDER BY a.due_at LIMIT 100`,[assignmentId]);
 for(const item of rows.rows){
  const claimed=await query(`UPDATE training_assignments SET notification_claimed_at=now() WHERE id=$1 AND verified_at IS NULL
   AND (notification_claimed_at IS NULL OR notification_claimed_at<now()-interval '5 minutes')
   AND (notification_sent_at IS NULL OR (due_at<=now()+interval '3 days' AND (reminder_sent_at IS NULL OR reminder_sent_at<now()-interval '1 day'))) RETURNING *`,[item.id]);
  const a=claimed.rows[0];if(!a)continue;
  try{
   const detail=(await query('SELECT m.title,u.display_name FROM training_materials m JOIN users u ON u.id=$2 WHERE m.id=$1',[a.material_id,a.user_id])).rows[0];
   const overdue=new Date(a.due_at)<new Date();
   const subject=a.notification_sent_at?(overdue?'Overdue training approval':'Training approval due soon'):'Training submission ready for approval';
   const result=await sendEmail(recipients,subject,`<h2>${subject}</h2><p>${escape(detail.display_name)} submitted ${escape(detail.title)}.</p><p>Approval deadline: ${escape(new Date(a.due_at).toISOString())}. Please review the acknowledgment and supporting documents before the deadline.</p><p><a href="https://nexusmt.com/training.html#reviewQueue">Open the secure review queue</a></p>`);
   if(result?.status==='sent')await query(`UPDATE training_assignments SET notification_sent_at=COALESCE(notification_sent_at,now()),reminder_sent_at=now() WHERE id=$1`,[a.id]);
  }catch(error){console.error('[TRAINING_NOTIFICATION]',error.message)}
  finally{await query('UPDATE training_assignments SET notification_claimed_at=NULL WHERE id=$1',[a.id])}
 }
}
module.exports={notifyTrainingAdmins,sendTrainingEmail};
