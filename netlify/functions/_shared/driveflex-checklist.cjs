// Applicant-facing guidance; MTM contracting thread reviewed October 14, 2026.
// The six training items match the checklist supplied by Nexus.
const requirements=[
 ['fbi','FBI Background Check','Ask Nexus recruiting for the approved fingerprinting provider and instructions before booking a screening. The accepted report must be reviewed by Nexus.'],
 ['health','Health Attestation','Request the driver health-attestation form from Nexus. Complete the required attestation with the appropriate provider; upload the signed form, not your medical history.'],
 ['social-security','Social Security Card','Upload a legible copy here only. If you need a replacement, use the Social Security Administration’s official service. Do not email your card.',false,'https://www.ssa.gov/number-card'],
 ['background','Background Check','Ask Nexus for its approved screening invitation. Nexus confirms the appropriate vendor and current contract criteria; do not purchase an unrelated report.'],
 ['dc-driver','DC Driver Training certificate','Upload a current accepted certificate, or request Nexus training. Nexus will confirm the DC course and completion requirements.',true],
 ['annual-drug','Annual Drug Screen','Ask Nexus to arrange the annual screening with an accepted laboratory. This is separate from the initial drug screen; Nexus will review whether an existing result meets the requirement.'],
 ['dds','DDS Training','Nexus can coordinate this training. The MTM onboarding email lists virtual Wednesday/Friday 10 a.m. sessions; confirm the current schedule with Nexus before attending.',true],
 ['sex-offender','National Sex Offender Search','Nexus can help coordinate the required national search and identity verification. Submit the accepted result for review.'],
 ['defensive-driving','Defensive Driving Certification','Upload your current accepted certificate or request Nexus training.',true],
 ['fwa','Fraud, Waste, and Abuse Training','MTM’s email directs drivers to Questbase for FWA training. Complete the course and its final test, then upload the completion record. Nexus can help you access training.',true,'https://auth.questbase.com/#/account/mtm'],
 ['drug','Drug Screen','Request a pre-employment screening referral from Nexus. Use the approved laboratory and upload the accepted result.'],
 ['first-aid','First Aid Training','Upload your current certificate or request Nexus training. Nexus will confirm the accepted course and any practical assessment.',true],
 ['cpr','CPR Training','Upload your current certificate or request Nexus training. Completion must meet the accepted course and hands-on requirements.',true],
 ['driving-record','Driving Record','Request an official driving record from the DMV/MVA that issued your license. Ask Nexus which record period and issue date are required.'],
 ['license',"Driver’s License",'Upload a clear copy of your valid driver’s license. Nexus will verify driving privileges, expiration, and the requirements for the trips you want to serve.']
].map(([key,title,hint,training=false,url=null])=>({key,title,hint,training,url}));
function summarize(records,now=new Date()){
 const today=now.toISOString().slice(0,10);
 const items=requirements.map(r=>{const c=records.find(c=>c.requirement_key===r.key);const expiry=c?.expires_on?String(c.expires_on instanceof Date?c.expires_on.toISOString():c.expires_on).slice(0,10):null;
  const expired=expiry&&expiry<today;return {...r,status:expired?'EXPIRED':c?.status||'MISSING',fileName:c?.file_name||null,expiresOn:expiry,note:c?.review_note||'',updatedAt:c?.updated_at||null};});
 const approved=items.filter(i=>['APPROVED','EXEMPT'].includes(i.status)).length;
 const submitted=items.filter(i=>['PENDING','APPROVED','EXEMPT'].includes(i.status)).length;
 return {items,approved,submitted,total:items.length,ready:approved===items.length,readyForReview:submitted===items.length};
}
module.exports={requirements,summarize};
