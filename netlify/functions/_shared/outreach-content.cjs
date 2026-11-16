const clean=value=>String(value??'').trim();
const OUTREACH_CAMPAIGN={
 id:'montgomery-tier-a-pilot-2026',status:'APPROVED',sendEnabled:true,
 name:'Montgomery County Tier A outreach',subject:'Medical transportation support for your patients',
 fromName:'Fletcher Kalundi',fromEmail:'fletcher@nexusmt.com',replyTo:'fletcher@nexusmt.com',
 testRecipient:'kalundi@gmail.com',timezone:'America/New_York',sendWindow:'Tuesday-Thursday, 9:30-10:30 AM',
 followUpBusinessDays:5,
 message:`Hello [Contact Name],\n\nI’m reaching out on behalf of Nexus Medical Transit, a licensed medical transportation provider serving Montgomery County and the DMV area.\n\nWe provide reliable wheelchair, stretcher and non-emergency medical transportation for healthcare facilities and their patients, including scheduled appointments, discharges and recurring treatments.\n\nI would appreciate the opportunity to introduce Nexus and learn how your facility currently handles transportation requests.\n\nWould you be available for a brief call next week?`,
 followUpMessage:`Hello [Contact Name],\n\nI wanted to follow up on my note about medical transportation support from Nexus Medical Transit. We help healthcare facilities coordinate reliable wheelchair, stretcher and non-emergency transportation for appointments, discharges and recurring treatments.\n\nIf transportation support is relevant for [Facility Name], I would be glad to arrange a brief introductory call.\n\nThank you for your time.`,
 signature:`Fletcher Kalundi\nChief Accessibility Officer\nNexus Medical Transit, LLC\n888-639-5766\nfletcher@nexusmt.com\nwww.nexusmt.com\nWMATC Certificate No. 4152`,
 complianceFooter:`Advertisement · Nexus Medical Transit, LLC · 22505 Gateway Center Dr, Clarksburg, MD 20871\nTo stop receiving marketing emails, reply “unsubscribe.”`
};
const SIGNATURE_CARD_CID='nexus-signature-card';
// Second broadcast round to the same approved audience: the emergency-plan
// agreement message. It carries its own campaign id so its per-recipient
// delivery state stays separate from the pilot campaign. It has no follow-up
// message (single broadcast), sends any day of the week inside the same
// 9:30-10:30 AM Eastern hour, starts enabled (owner-approved broadcast), and
// signs with the owner's graphic signature card (inline cid attachment; see
// outreach-signature-image.cjs) instead of the plain-text signature block.
const EMERGENCY_PLAN_ROUND={
 id:'montgomery-tier-a-emergency-plan-2026',status:'APPROVED',sendEnabled:true,startEnabled:true,
 name:'Emergency-plan agreement broadcast',subject:'Your dedicated transportation partner — with an agreement on file for your emergency plan',
 fromName:OUTREACH_CAMPAIGN.fromName,fromEmail:OUTREACH_CAMPAIGN.fromEmail,replyTo:OUTREACH_CAMPAIGN.replyTo,
 testRecipient:OUTREACH_CAMPAIGN.testRecipient,timezone:OUTREACH_CAMPAIGN.timezone,sendWindow:'Any day, 9:30-10:30 AM',
 sendDays:['Sun','Mon','Tue','Wed','Thu','Fri','Sat'],
 headerLine:'Nexus Medical Transit — your dedicated transportation partner',
 message:`Hello [Contact Name],\n\nMaryland's emergency-planning rules ask every nursing home and assisted living program to name the transportation sources in its disaster plan — and to keep a documented agreement with each one on file (COMAR 10.07.02.40 for nursing homes; COMAR 10.07.14.47 for assisted living). OHCQ reminded all licensed facilities of these duties this past July.\n\nNexus Medical Transit can become your dedicated transportation partner and put that agreement in place with you. Sign a transportation services agreement with us and your plan can list Nexus as a transportation source for emergency evacuation support — with the signed agreement on file for your next survey.\n\nThe same agreement covers your everyday transport as well: ambulatory, wheelchair, stretcher and bariatric transport; dialysis; hospital discharges; interfacility transfers; and BLS ambulance transport. We operate 24 hours a day across Maryland, DC and Northern Virginia, with early-morning pickups for scheduled procedures. One number reaches dispatch around the clock: (888) 639-5766 (ambulance line: (888) 760-4990). Facilities can also book online at mynexusride.com.\n\nReply to this email and I will send the agreement for your review — no volume commitment, no exclusivity. If you already have transportation sources documented, we are glad to be an additional one on file.`,
 followUpMessage:null,
 signatureImage:true,
 signatureTextFallback:`Fletcher Kalundi\nChief Accessibility Officer (CAO)\nNexus Medical Transit, LLC\nBook a Ride: (888) 639-5766\nfletcher@nexusmt.com`,
 signature:OUTREACH_CAMPAIGN.signature,
 complianceFooter:OUTREACH_CAMPAIGN.complianceFooter
};
const escapeEmailHtml=value=>clean(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
function outreachHtml(contactName,facilityName,followUp=false,def=OUTREACH_CAMPAIGN){
 const template=followUp&&def.followUpMessage?def.followUpMessage:def.message;
 const body=template.replaceAll('[Contact Name]',clean(contactName)||'there').replaceAll('[Facility Name]',clean(facilityName)||'your facility');
 const header=def.headerLine?`<p style="font-size:20px;font-weight:bold;color:#0b3d5c;margin:0 0 16px">${escapeEmailHtml(def.headerLine)}</p>`:'';
 const paragraphs=body.split(/\n{2,}/).map(line=>`<p>${escapeEmailHtml(line)}</p>`).join('');
 const signature=def.signatureImage
  ?`<p style="margin:0 0 6px"><img src="cid:${SIGNATURE_CARD_CID}" width="560" alt="Fletcher Kalundi, Chief Accessibility Officer (CAO), Nexus Medical Transit LLC. Book a Ride: (888) 639-5766. Email: fletcher@nexusmt.com" style="display:block;max-width:100%;height:auto;border:0"></p><p style="margin:0">${def.signatureTextFallback.split('\n').map(escapeEmailHtml).join('<br>')}</p>`
  :def.signature.split('\n').map(escapeEmailHtml).join('<br>');
 const signatureBlock=def.signatureImage?signature:`<p>${signature}</p>`;
 const footer=def.complianceFooter.split('\n').map(escapeEmailHtml).join('<br>');
 const socialLinks=[
  {label:'Facebook',icon:'f',url:'https://www.facebook.com/profile.php?id=61581462908206',color:'#1877f2'},
  {label:'Instagram',icon:'◎',url:'https://www.instagram.com/nexus_m_t/',color:'#c13584'},
  {label:'YouTube',icon:'▶',url:'https://www.youtube.com/@nexus_m_t',color:'#ff0000'},
  {label:'TikTok',icon:'♪',url:'https://www.tiktok.com/@nexus_m_t',color:'#111111'},
  {label:'X',icon:'X',url:'https://x.com/nexus_m_t',color:'#111111'},
  {label:'Bluesky',icon:'☁',url:'https://bsky.app/profile/nexusmt.bsky.social',color:'#1185fe'}
 ];
 const social=socialLinks.map(item=>`<a href="${item.url}" aria-label="Nexus Medical Transit on ${item.label}" style="display:inline-block;width:30px;height:30px;margin:0 5px;border-radius:50%;background:${item.color};color:#ffffff;text-align:center;text-decoration:none;font:bold 16px/30px Arial,sans-serif">${item.icon}</a>`).join('');
 return `<div style="font-family:Arial,sans-serif;max-width:640px;margin:auto;color:#153247;line-height:1.55">${header}${paragraphs}${signatureBlock}<hr style="border:0;border-top:1px solid #d7e2e9;margin:24px 0"><div style="margin:0 0 14px" aria-label="Follow Nexus Medical Transit">${social}</div><p style="font-size:12px;color:#52677a">${footer}</p></div>`;
}

module.exports={OUTREACH_CAMPAIGN,EMERGENCY_PLAN_ROUND,SIGNATURE_CARD_CID,outreachHtml};
