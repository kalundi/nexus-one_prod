const {query}=require('./_shared/db.cjs');
const {createAutomation}=require('./_shared/outreach-automation.cjs');
const automation=createAutomation({query});
exports.handler=async()=>{
 try{return {statusCode:200,body:JSON.stringify(await automation.run())};}
 catch(error){console.error('[OUTREACH_AUTOMATION] Database operation failed');return {statusCode:500,body:JSON.stringify({error:'Outreach could not complete. Check the campaign dashboard.'})};}
};
