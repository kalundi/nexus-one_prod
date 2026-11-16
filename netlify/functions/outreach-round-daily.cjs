const {query}=require('./_shared/db.cjs');
const {createAutomation}=require('./_shared/outreach-automation.cjs');
const {EMERGENCY_PLAN_ROUND}=require('./_shared/outreach-content.cjs');
const automation=createAutomation({query,campaignDef:EMERGENCY_PLAN_ROUND});
exports.handler=async()=>{
 try{return {statusCode:200,body:JSON.stringify(await automation.run())};}
 catch(error){console.error('[OUTREACH_ROUND] Database operation failed');return {statusCode:500,body:JSON.stringify({error:'Outreach round could not complete. Check the campaign dashboard.'})};}
};
