'use strict';
// Every authenticated Nex role inherits public website questions in addition
// to role-scoped tools. Only authenticated operational intents use staff data.
// This classifier must never grant staff permissions or accept caller-supplied roles.
const SAFETY=/\b(?:911|medical emergency|heart attack|stroke|not breathing|unconscious|unresponsive|chest pain|overdose|choking|seizure|severe bleeding)\b/i;
const STAFF_SIGNALS=[
 /\b(?:board|dispatch|unassigned|duty roster|on duty|on shift|open shifts?|my shifts?|my schedule|my trips?|my rides?|assigned|assignment|assign|unassign|auto.assign)\b/i,
 /\b(?:employees?|drivers? (?:on|working|scheduled|assigned)|fleet|vehicles?|units?|gps|payroll|invoice|revenue|admin(?:istration)?|analytics|dashboard|insights|recommendations?|approvals?|pending reviews?)\b/i,
 /\b(?:track (?:my|our|the)|where (?:is|are) (?:my|our|the) (?:ride|driver|van|ambulance)|my driver|my (?:next|upcoming) ride|next pickup)\b/i,
 /\b(?:how many|count|show|list|find|lookup|look up|what's|what is)\b.{0,70}\b(?:trips?|bookings?|patients?|appointments?|drivers?|shifts?|vehicles?)\b/i,
 /\b(?:NMT|MOCK-NMT)-\d{8}-\d{3,}\b/i,
 /\b(?:that|this) (?:trip|driver|assignment)\b/i
];
const PUBLIC_SIGNALS=[
 /\b(?:i need|i want|i'm looking for|looking for|help me with|need help with)\b.{0,80}\b(?:wheelchair|stretcher|ambulatory|bariatric|ride|transport|booking|book|schedule|services|service area|hours|accessibility|quote|estimate)\b/i,
 /\b(?:what|which|where|how|can|do|does|is|are|tell me|explain)\b.{0,90}\b(?:services? (?:do you|does nexus)|transportation services?|service areas?|coverage areas?|areas? (?:do you|does nexus) serve|hours|office hours|operating hours|contact|phone number|website|accessibility|wheelchair|stretcher|bariatric|ambulatory|non.emergency medical|dialysis|hospital discharge|booking process|book a ride|schedule a ride|book online|make a booking|request a ride)\b/i,
 /\b(?:how (?:do|can|does) (?:i|we|you|nexus) (?:book|schedule|request)|how does (?:your|nexus|the) booking work|booking (?:work|process|steps)|book (?:a|my) ride|schedule (?:a|my) ride)\b/i,
 /\b(?:do you (?:offer|provide|serve|cover|operate)|does nexus (?:offer|provide|serve|cover|operate)|where do you (?:operate|serve)|what (?:are|is) your (?:services|hours|coverage|service area))\b/i,
 /\b(?:social media|instagram|youtube|tiktok|facebook|bluesky|videos?|tutorials?)\b/i,
 /\b(?:quote|fare estimate|ride estimate|transportation estimate|rough estimate|how much (?:would|does|will) (?:a|the|my)?\s*(?:ride|trip|transport))\b/i,
 /\b(?:booking|reservation|service|coverage|accessibility|transportation)\b/i
];
function isStaffIntent(question,state){
 const q=String(question||'').trim().slice(0,500);
 if(SAFETY.test(q))return false;
 if(STAFF_SIGNALS.some(re=>re.test(q)))return true;
 // Short follow-ups to privileged results stay scoped to the same staff session.
 if(state && state.intent && !['knowledge'].includes(state.intent) &&
     /^(?:and |what about |how about |for )?(?:today|tomorrow|yesterday|this week|next week|the wheelchair ones|the stretcher ones|that one|those ones|same day)\??$/i.test(q))return true;
 return false;
}
function isPublicIntent(question,state){
 const q=String(question||'').trim().slice(0,500);
 if(!q)return false;
 if(SAFETY.test(q))return true;
 if(isStaffIntent(q,state))return false;
 return PUBLIC_SIGNALS.some(re=>re.test(q)) ||
   // General inquiries that aren't staff operational commands should not
   // fall into the dispatch handler's default board/count response.
   /^(?:what|how|where|when|why|which|can you|could you|do you|does nexus|is nexus|tell me|explain|help me|i want to know)\b/i.test(q);
}
module.exports={isPublicIntent,isStaffIntent};
