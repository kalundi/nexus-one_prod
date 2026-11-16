const {query}=require('./_shared/db.cjs');
const {createAutomation}=require('./_shared/outreach-automation.cjs');
const {WEDNESDAY_AGREEMENT_BROADCAST}=require('./_shared/outreach-content.cjs');
const automation=createAutomation({query,campaignDef:WEDNESDAY_AGREEMENT_BROADCAST});
exports.handler=async()=>{
 try{return {statusCode:200,body:JSON.stringify(await automation.run())};}
 catch(error){console.error('[OUTREACH_WEDNESDAY] Database operation failed');return {statusCode:500,body:JSON.stringify({error:'Outreach Wednesday broadcast could not complete. Check the campaign dashboard.'})};}
};
