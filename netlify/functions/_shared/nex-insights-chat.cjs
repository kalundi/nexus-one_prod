'use strict';
// Bridge authenticated staff chat to existing aggregate Nex Insights.
// No raw conversations, credentials, user-supplied SQL, or publication rights.
const Analytics=require('./nex-intent-insights.cjs');
const INSIGHTS_RE=/\b(?:nex|chatbot|chat bot|visitor assistant|customer question|unanswered question|conversation insights?|chat analytics|bot analytics)\b/i;
const METRICS_RE=/\b(?:analytics?|insights?|questions?|unanswered|statistics|stats|trends?|topics?|patterns?|performance|report|how many|count|summary)\b/i;
function isInsightsQuery(text){
 const q=String(text||'').trim().slice(0,500);
 return (INSIGHTS_RE.test(q)&&METRICS_RE.test(q)) ||
   /\b(?:nex|chatbot|chat bot)\b.{0,32}\b(?:doing|performing)\b/i.test(q);
}
function daysFromQuestion(text){
 const q=String(text||'');
 const match=q.match(/\b(?:last|past|previous|over)\s+(\d{1,3})\s+days?\b/i);
 if(match)return Math.max(1,Math.min(90,Number(match[1])));
 if(/\b(?:today|24 hours?)\b/i.test(q))return 1;
 if(/\b(?:this|last|past)\s+week\b/i.test(q))return 7;
 if(/\b(?:this|last|past)\s+(?:month|30 days)\b/i.test(q))return 30;
 return 30;
}
async function answer(user,question,queryFn){
 if(!isInsightsQuery(question))return null;
 if(user?.role!=='ADMIN'){
   return "Nex customer-conversation analytics are restricted to Nexus administrators. I can still help with functions permitted for your role.";
 }
 const days=daysFromQuestion(question);
 const readiness=await Analytics.readiness(queryFn);
 if(!readiness.databaseReady)return "Nex analytics are not ready: the analytics database migration is missing. Ask an administrator to check the production deployment.";
 if(!readiness.writePermissionReady)return "Nex analytics are not ready: the service database account lacks INSERT permission. Review the Nexus database configuration.";
 const data=await Analytics.report(queryFn,days);
 const total=Number(data.summary?.total||0);
 const unanswered=Number(data.summary?.unanswered||0);
 const emergencies=Number(data.summary?.emergencies||0);
 const top=(data.intents||[]).filter(x=>x.intent!=='other').slice(0,4)
    .map(x=>String(x.intent)+': '+Number(x.count)).join('; ');
 return "Over the past "+days+" day"+(days===1?'':'s')+", Nex analyzed "+total+" question"+(total===1?'':'s')+
   ", including "+unanswered+" unanswered and "+emergencies+" emergency-routing question"+(emergencies===1?'':'s')+"."+
   (top?" Common categories: "+top+".":"")+
   " These are question counts, not unique visitors or confirmed bookings. Open Nex Insights in Admin Apps for review-only AI recommendations.";
}
module.exports={isInsightsQuery,daysFromQuestion,answer};
