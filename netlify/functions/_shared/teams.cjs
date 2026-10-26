// The webhook URL contains a credential. Never return or log it.
const webhook=()=>String(process.env.TEAMS_WEBHOOK_URL||'').trim();
function isConfigured(){return Boolean(webhook());}
function provider(){return /environment\.api\.powerplatform\.com|\/powerautomate\/automations\/direct\/|\.logic\.azure\.com\//i.test(webhook())?'Power Automate':'Teams webhook';}
function buildPayload(text,title='Nexus Medical Transit'){
 title=String(title||'Nexus Medical Transit');text=String(text||'');
 if(provider()==='Power Automate')return {type:'message',attachments:[{contentType:'application/vnd.microsoft.card.adaptive',contentUrl:null,content:{'$schema':'http://adaptivecards.io/schemas/adaptive-card.json',type:'AdaptiveCard',version:'1.4',body:[{type:'TextBlock',size:'Medium',weight:'Bolder',text:title,wrap:true},{type:'TextBlock',text,wrap:true}]}}]};
 return {'@type':'MessageCard','@context':'https://schema.org/extensions',themeColor:'#082f49',summary:title,title,text};
}
async function sendTeamsAlert(text,title){
 const url=webhook();
 if(!url)return {status:'skipped',error:'TEAMS_WEBHOOK_URL is not configured'};
 if(/^https:\/\/(?:outlook|.*\.office)\.office\.com\/webhook\/?$/i.test(url))return {status:'failed',error:'The Teams webhook URL is a placeholder. Configure the complete workflow URL.'};
 try{
  const response=await fetch(url,{method:'POST',signal:AbortSignal.timeout(15000),headers:{'content-type':'application/json'},body:JSON.stringify(buildPayload(text,title))});
  if(!response.ok)return {status:'failed',provider:provider(),code:response.status,error:response.status===401||response.status===403?'Teams rejected webhook authorization. Check the workflow trigger authentication and webhook URL.':response.status===404||response.status===410?'The Teams workflow URL is unavailable. Check that the flow is enabled and its URL is current.':response.status===429?'Teams is rate limiting requests. Try again later.':'The Teams webhook rejected the request.'};
  return {status:'sent',accepted:true,provider:provider(),code:response.status,deliveryConfirmed:false};
 }catch(error){return {status:'failed',provider:provider(),error:error?.name==='TimeoutError'||error?.name==='AbortError'?'The Teams webhook timed out. Check the flow run history before retrying.':'Could not confirm the Teams webhook request. Check the flow run history before retrying.'};}
}
module.exports={isConfigured,provider,buildPayload,sendTeamsAlert};
