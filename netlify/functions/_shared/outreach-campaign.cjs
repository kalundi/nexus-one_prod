function normalizeEmail(value){
 return String(value ?? '').trim().toLowerCase();
}

function buildDailyOutreachBatch(recipients, alreadySentEmails = [], limit = 25){
 const sent = new Set((Array.isArray(alreadySentEmails) ? alreadySentEmails : []).map(normalizeEmail).filter(Boolean));
 return (Array.isArray(recipients) ? recipients : [])
  .filter((recipient)=>{
   if(recipient?.optOut===true)return false;
   const email=normalizeEmail(recipient?.email);
   return Boolean(email) && !sent.has(email);
  })
  .slice(0, limit);
}

module.exports={buildDailyOutreachBatch};
