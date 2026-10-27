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
const escapeEmailHtml=value=>clean(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
function outreachHtml(contactName,facilityName,followUp=false){
 const template=followUp?OUTREACH_CAMPAIGN.followUpMessage:OUTREACH_CAMPAIGN.message;
 const body=template.replaceAll('[Contact Name]',clean(contactName)||'there').replaceAll('[Facility Name]',clean(facilityName)||'your facility');
 const paragraphs=body.split(/\n{2,}/).map(line=>`<p>${escapeEmailHtml(line)}</p>`).join('');
 const signature=OUTREACH_CAMPAIGN.signature.split('\n').map(escapeEmailHtml).join('<br>');
 const footer=OUTREACH_CAMPAIGN.complianceFooter.split('\n').map(escapeEmailHtml).join('<br>');
 const socialLinks=[
  {label:'Facebook',icon:'f',url:'https://www.facebook.com/profile.php?id=61581462908206',color:'#1877f2'},
  {label:'Instagram',icon:'◎',url:'https://www.instagram.com/nexus_m_t/',color:'#c13584'},
  {label:'YouTube',icon:'▶',url:'https://www.youtube.com/@nexus_m_t',color:'#ff0000'},
  {label:'TikTok',icon:'♪',url:'https://www.tiktok.com/@nexus_m_t',color:'#111111'},
  {label:'X',icon:'X',url:'https://x.com/nexus_m_t',color:'#111111'},
  {label:'Bluesky',icon:'☁',url:'https://bsky.app/profile/nexusmt.bsky.social',color:'#1185fe'}
 ];
 const social=socialLinks.map(item=>`<a href="${item.url}" aria-label="Nexus Medical Transit on ${item.label}" style="display:inline-block;width:30px;height:30px;margin:0 5px;border-radius:50%;background:${item.color};color:#ffffff;text-align:center;text-decoration:none;font:bold 16px/30px Arial,sans-serif">${item.icon}</a>`).join('');
 return `<div style="font-family:Arial,sans-serif;max-width:640px;margin:auto;color:#153247;line-height:1.55">${paragraphs}<p>${signature}</p><hr style="border:0;border-top:1px solid #d7e2e9;margin:24px 0"><div style="margin:0 0 14px" aria-label="Follow Nexus Medical Transit">${social}</div><p style="font-size:12px;color:#52677a">${footer}</p></div>`;
}

module.exports={OUTREACH_CAMPAIGN,outreachHtml};
