'use strict';
// Read-only step guidance. Does not impersonate users or invoke privileged APIs.
// Dispatch actions still require existing staff proposal/confirm workflows.
const WORKFLOWS=Object.freeze([
 {id:'dispatch-trip-assignment',roles:['ADMIN','DISPATCHER'],intent:/\b(?:how (?:do|can) (?:i|we)|help me|guide me)\b.{0,80}\b(?:assign|dispatch)\b.{0,30}\b(?:trip|driver|vehicle)\b/i,
  answer:'To assign a trip, open the Dispatch board, select the booking and verify the service level, driver credentials, vehicle compatibility and schedule. Use the existing assignment confirmation process; Nex must not bypass those checks.',
  page:'/dispatch.html'},
 {id:'driver-availability',roles:['DRIVER'],intent:/\b(?:how (?:do|can) i|help me|guide me)\b.{0,70}\b(?:availability|open shift|shifts?|schedule)\b/i,
  answer:'Open DriveFlex to review available shifts and your schedule. Only accept shifts you are eligible to perform; dispatch confirms trip assignments.',
  page:'/driveflex-dispatch.html'},
 {id:'facility-booking',roles:['FACILITY'],intent:/\b(?:how (?:do|can) (?:i|we)|help me|guide me)\b.{0,70}\b(?:book|request|schedule)\b.{0,30}\b(?:trip|ride|transportation)\b/i,
  answer:'Use the Nexus booking app to enter the transportation service, pickup and destination, requested time and accessibility requirements. Submit the request; Nexus confirms availability before the trip is scheduled.',
  page:'/booking-app.html'},
 {id:'admin-knowledge-review',roles:['ADMIN'],intent:/\b(?:how (?:do|can) i|help me|guide me)\b.{0,75}\b(?:approve|review|publish)\b.{0,30}\b(?:nex|knowledge|faq|recommendation)\b/i,
  answer:'Open Nex Insights, review the recommendation, verify the cited public source, preview the draft and approve it. Publishing still requires a reviewed GitHub change and successful deployment.',
  page:'/nex-insights.html'}
]);
function guidance(question,role){
 const userRole=String(role||'').toUpperCase(),q=String(question||'').slice(0,500);
 if(!q || !userRole)return null;
 const match=WORKFLOWS.find(x=>x.intent.test(q)&&x.roles.includes(userRole));
 return match?{id:match.id,answer:match.answer,page:match.page,requiresConfirmation:true}:null;
}
module.exports={WORKFLOWS,guidance};
